using CurvTabDental.API.Contracts;
using CurvTabDental.API.Security;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly SignInManager<ApplicationUser> _signIn;
    private readonly DentalDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUser _current;

    public AuthController(
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signIn,
        DentalDbContext db,
        IAuditService audit,
        ICurrentUser current)
    {
        _users = users;
        _signIn = signIn;
        _db = db;
        _audit = audit;
        _current = current;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var user = await _users.FindByEmailAsync(request.Email);
        if (user is null)
        {
            await _audit.WriteAsync("AUTH_LOGIN_FAILED", succeeded: false, detail: "unknown_user", ct: ct);
            return InvalidCredentials();
        }

        var practiceActive = true;
        if (user.DentalPracticeId is Guid practiceId)
        {
            practiceActive = await _db.DentalPractices
                .AsNoTracking()
                .AnyAsync(p => p.Id == practiceId && p.IsActive, ct);
        }

        if (!user.IsActive || !practiceActive)
        {
            await _audit.WriteAsync("AUTH_LOGIN_FAILED", succeeded: false,
                detail: user.IsActive ? "practice_inactive" : "user_inactive",
                practiceId: user.DentalPracticeId, actorUserId: user.Id, ct: ct);
            return InvalidCredentials();
        }

        var result = await _signIn.PasswordSignInAsync(user, request.Password, isPersistent: false, lockoutOnFailure: true);

        if (result.IsLockedOut)
        {
            await _audit.WriteAsync("AUTH_LOGIN_LOCKED", succeeded: false,
                practiceId: user.DentalPracticeId, actorUserId: user.Id, ct: ct);
            return StatusCode(StatusCodes.Status423Locked, new ProblemDetails
            {
                Title = "Account temporarily locked after too many failed attempts. Try again later.",
                Status = StatusCodes.Status423Locked
            });
        }

        if (!result.Succeeded)
        {
            await _audit.WriteAsync("AUTH_LOGIN_FAILED", succeeded: false, detail: "bad_password",
                practiceId: user.DentalPracticeId, actorUserId: user.Id, ct: ct);
            return InvalidCredentials();
        }

        await _audit.WriteAsync("AUTH_LOGIN", practiceId: user.DentalPracticeId, actorUserId: user.Id, ct: ct);
        return Ok(await BuildProfileAsync(user, ct));
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await _audit.WriteAsync("AUTH_LOGOUT", ct: ct);
        await _signIn.SignOutAsync();
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = _current.UserId is Guid id ? await _users.FindByIdAsync(id.ToString()) : null;
        if (user is null) return Unauthorized();
        return Ok(await BuildProfileAsync(user, ct));
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        var user = _current.UserId is Guid id ? await _users.FindByIdAsync(id.ToString()) : null;
        if (user is null) return Unauthorized();

        var result = await _users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            await _audit.WriteAsync("AUTH_PASSWORD_CHANGE_FAILED", succeeded: false, ct: ct);
            return BadRequest(result.ToValidationProblem());
        }

        user.MustChangePassword = false;
        await _users.UpdateAsync(user);
        await _signIn.RefreshSignInAsync(user); // security stamp changed; keep this session alive
        await _audit.WriteAsync("AUTH_PASSWORD_CHANGED", entityType: "User", entityId: user.Id.ToString(), ct: ct);
        return NoContent();
    }

    private IActionResult InvalidCredentials() =>
        Unauthorized(new ProblemDetails { Title = "Invalid credentials.", Status = StatusCodes.Status401Unauthorized });

    private async Task<UserProfileDto> BuildProfileAsync(ApplicationUser user, CancellationToken ct)
    {
        var roles = await _users.GetRolesAsync(user);
        string? practiceName = null;
        if (user.DentalPracticeId is Guid practiceId)
        {
            practiceName = await _db.DentalPractices
                .AsNoTracking()
                .Where(p => p.Id == practiceId)
                .Select(p => p.Name)
                .FirstOrDefaultAsync(ct);
        }

        return new UserProfileDto(
            user.Id,
            user.Email ?? string.Empty,
            user.FullName,
            roles.FirstOrDefault(),
            user.DentalPracticeId,
            practiceName,
            user.MustChangePassword);
    }
}
