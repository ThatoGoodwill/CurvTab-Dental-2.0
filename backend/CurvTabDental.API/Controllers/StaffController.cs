using CurvTabDental.API.Contracts;
using CurvTabDental.API.Security;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Controlled staff provisioning (FR-005). There is no public registration endpoint.
/// A PracticeAdmin manages only users of their OWN practice; another practice's user id returns 404.
/// </summary>
[ApiController]
[Route("api/staff")]
[Authorize(Roles = StaffRoles.PracticeAdmin)]
public class StaffController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public StaffController(DentalDbContext db, UserManager<ApplicationUser> users, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _users = users;
        _current = current;
        _audit = audit;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<StaffDto>>> List(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        var rows = await (
            from u in _db.Users.AsNoTracking()
            where u.DentalPracticeId == practiceId
            join ur in _db.UserRoles on u.Id equals ur.UserId
            join r in _db.Roles on ur.RoleId equals r.Id
            orderby u.FullName
            select new StaffDto(u.Id, u.Email ?? "", u.FullName, r.Name ?? "", u.IsActive, u.MustChangePassword)
        ).ToListAsync(ct);

        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStaffRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        if (!StaffRoles.PracticeStaffAssignable.Contains(request.Role))
        {
            return BadRequest(new ProblemDetails
            {
                Title = $"Role must be one of: {string.Join(", ", StaffRoles.PracticeStaffAssignable)}.",
                Status = 400
            });
        }

        var email = request.Email.Trim();
        if (await _users.FindByEmailAsync(email) is not null)
            return Conflict(new ProblemDetails { Title = "A user with that email already exists.", Status = 409 });

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FullName = request.FullName.Trim(),
            DentalPracticeId = practiceId, // from the signed-in admin, never from the request
            MustChangePassword = true
        };

        var created = await _users.CreateAsync(user, request.TemporaryPassword);
        if (!created.Succeeded) return BadRequest(created.ToValidationProblem());

        var inRole = await _users.AddToRoleAsync(user, request.Role);
        if (!inRole.Succeeded) return BadRequest(inRole.ToValidationProblem());

        await _audit.WriteAsync("STAFF_CREATED", "User", user.Id.ToString(), detail: $"role={request.Role}", ct: ct);

        return Created($"/api/staff/{user.Id}",
            new StaffDto(user.Id, user.Email ?? "", user.FullName, request.Role, user.IsActive, user.MustChangePassword));
    }

    [HttpPatch("{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] SetActiveRequest request, CancellationToken ct)
    {
        if (id == _current.UserId)
            return BadRequest(new ProblemDetails { Title = "You cannot change your own active status.", Status = 400 });

        var target = await FindManageableAsync(id, ct);
        if (target is null) return NotFound();

        target.IsActive = request.IsActive;
        await _users.UpdateAsync(target);
        if (!request.IsActive) await _users.UpdateSecurityStampAsync(target);

        await _audit.WriteAsync(request.IsActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
            "User", id.ToString(), ct: ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        var target = await FindManageableAsync(id, ct);
        if (target is null) return NotFound();

        var token = await _users.GeneratePasswordResetTokenAsync(target);
        var result = await _users.ResetPasswordAsync(target, token, request.TemporaryPassword);
        if (!result.Succeeded) return BadRequest(result.ToValidationProblem());

        target.MustChangePassword = true;
        await _users.UpdateAsync(target);
        await _users.ResetAccessFailedCountAsync(target);
        await _users.SetLockoutEndDateAsync(target, null);

        await _audit.WriteAsync("STAFF_PASSWORD_RESET", "User", id.ToString(), ct: ct);
        return NoContent();
    }

    /// <summary>User must be in the caller's practice AND hold a role a PracticeAdmin may manage.</summary>
    private async Task<ApplicationUser?> FindManageableAsync(Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return null;

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id && u.DentalPracticeId == practiceId, ct);
        if (user is null) return null;

        var roles = await _users.GetRolesAsync(user);
        return roles.Any(r => StaffRoles.PracticeStaffAssignable.Contains(r)) ? user : null;
    }
}
