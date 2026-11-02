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
