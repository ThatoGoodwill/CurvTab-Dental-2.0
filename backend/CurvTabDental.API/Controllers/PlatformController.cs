using CurvTabDental.API.Contracts;
using CurvTabDental.API.Security;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Platform administration (FR-001). SuperAdmin provisions practices and their first PracticeAdmin.
/// SuperAdmin has NO access to patient data: the Patient query filter returns nothing for a user without a practice.
/// </summary>
[ApiController]
[Route("api/platform")]
[Authorize(Roles = StaffRoles.SuperAdmin)]
public class PlatformController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IAuditService _audit;

    public PlatformController(DentalDbContext db, UserManager<ApplicationUser> users, IAuditService audit)
    {
        _db = db;
        _users = users;
        _audit = audit;
    }

    [HttpGet("practices")]
    public async Task<ActionResult<IReadOnlyList<PlatformPracticeDto>>> ListPractices(CancellationToken ct)
    {
        var rows = await _db.DentalPractices
            .AsNoTracking()
            .OrderBy(p => p.Name)
            .Select(p => new PlatformPracticeDto(
                p.Id, p.Name, p.Email, p.PhoneNumber, p.Address, p.IsActive, p.CreatedAtUtc,
                _db.Users.Count(u => u.DentalPracticeId == p.Id)))
            .ToListAsync(ct);

        return Ok(rows);
    }

    [HttpPost("practices")]
    public async Task<IActionResult> CreatePractice([FromBody] CreatePracticeRequest request, CancellationToken ct)
    {
        var adminEmail = request.AdminEmail.Trim();
        if (await _users.FindByEmailAsync(adminEmail) is not null)
            return Conflict(new ProblemDetails { Title = "A user with that email already exists.", Status = 409 });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var practice = new DentalPractice
        {
            Name = request.Name.Trim(),
            Email = request.Email?.Trim(),
            PhoneNumber = request.PhoneNumber?.Trim(),
            Address = request.Address?.Trim(),
            IsActive = true
        };
        _db.DentalPractices.Add(practice);
        await _db.SaveChangesAsync(ct);

        var admin = new ApplicationUser
        {
            UserName = adminEmail,
            Email = adminEmail,
            EmailConfirmed = true,
            FullName = request.AdminFullName.Trim(),
            DentalPracticeId = practice.Id,
            MustChangePassword = true
        };

        var created = await _users.CreateAsync(admin, request.AdminTemporaryPassword);
        if (!created.Succeeded)
        {
            await tx.RollbackAsync(ct);
            return BadRequest(created.ToValidationProblem());
        }

        var inRole = await _users.AddToRoleAsync(admin, StaffRoles.PracticeAdmin);
        if (!inRole.Succeeded)
        {
            await tx.RollbackAsync(ct);
            return BadRequest(inRole.ToValidationProblem());
        }

        await tx.CommitAsync(ct);

        await _audit.WriteAsync("PRACTICE_CREATED", "Practice", practice.Id.ToString(),
            practiceId: practice.Id, ct: ct);

        var dto = new PracticeDto(practice.Id, practice.Name, practice.Email, practice.PhoneNumber,
            practice.Address, practice.IsActive, practice.CreatedAtUtc);
        return Created($"/api/platform/practices/{practice.Id}", dto);
    }

    // Recovery of an existing first PracticeAdmin is a platform-admin operation.
    // It never creates a second practice, never returns password hashes, and
    // checks BOTH the selected practice and the user's PracticeAdmin role.
    [HttpGet("practices/{id:guid}/administrators")]
    public async Task<IActionResult> ListPracticeAdministrators(Guid id, CancellationToken ct)
    {
        if (!await _db.DentalPractices.AsNoTracking().AnyAsync(x => x.Id == id, ct))
            return NotFound();

        var admins = await (
            from u in _db.Users.AsNoTracking()
            join ur in _db.UserRoles.AsNoTracking() on u.Id equals ur.UserId
            join role in _db.Roles.AsNoTracking() on ur.RoleId equals role.Id
            where u.DentalPracticeId == id && role.Name == StaffRoles.PracticeAdmin
            orderby u.FullName
            select new
            {
                u.Id, u.FullName, u.Email, u.IsActive, u.MustChangePassword
            }).ToListAsync(ct);

        return Ok(admins);
    }

    public sealed record RecoverPracticeAdministratorRequest(string TemporaryPassword);

    [HttpPost("practices/{id:guid}/administrators/{userId:guid}/reset-password")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("login")]
    public async Task<IActionResult> ResetPracticeAdministratorPassword(
        Guid id, Guid userId,
        [FromBody] RecoverPracticeAdministratorRequest request,
        CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.TemporaryPassword) ||
            request.TemporaryPassword.Length > 128)
            return BadRequest(new { title = "A valid temporary password is required." });

        if (!await _db.DentalPractices.AsNoTracking().AnyAsync(x => x.Id == id && x.IsActive, ct))
            return NotFound();

        var user = await _users.FindByIdAsync(userId.ToString());
        if (user is null || user.DentalPracticeId != id ||
            !user.IsActive || !await _users.IsInRoleAsync(user, StaffRoles.PracticeAdmin))
            return NotFound();

        // ASP.NET Identity checks the configured password policy and updates
        // the password hash and security stamp. No direct SQL hash edits.
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var result = await _users.ResetPasswordAsync(user, token, request.TemporaryPassword);
        if (!result.Succeeded)
            return BadRequest(result.ToValidationProblem());

        user.MustChangePassword = true;
        var saved = await _users.UpdateAsync(user);
        if (!saved.Succeeded) return BadRequest(saved.ToValidationProblem());
        await _users.ResetAccessFailedCountAsync(user);
        await _users.SetLockoutEndDateAsync(user, null);
        await _users.UpdateSecurityStampAsync(user);

        await _audit.WriteAsync(
            "PLATFORM_PRACTICE_ADMIN_PASSWORD_RESET", "User", user.Id.ToString(),
            detail: "SuperAdmin recovery; temporary password change required",
            practiceId: id, ct: ct);

        return NoContent();
    }

    /// <summary>Activate / deactivate a practice. History is kept; its staff are signed out on their next request.</summary>
    [HttpPatch("practices/{id:guid}/active")]
    public async Task<IActionResult> SetPracticeActive(Guid id, [FromBody] SetActiveRequest request, CancellationToken ct)
    {
        var practice = await _db.DentalPractices.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (practice is null) return NotFound();

        practice.IsActive = request.IsActive;
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(request.IsActive ? "PRACTICE_ACTIVATED" : "PRACTICE_DEACTIVATED",
            "Practice", id.ToString(), practiceId: id, ct: ct);
        return NoContent();
    }
}
