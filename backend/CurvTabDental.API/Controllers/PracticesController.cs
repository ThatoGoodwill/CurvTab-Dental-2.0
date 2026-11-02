using CurvTabDental.API.Contracts;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>The caller's OWN practice. The id is never taken from the URL (FR-007).</summary>
[ApiController]
[Route("api/practices")]
public class PracticesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PracticesController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    [HttpGet("mine")]
    [Authorize(Roles = StaffRoles.PatientRead)]
    public async Task<ActionResult<PracticeDto>> GetMine(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        var practice = await _db.DentalPractices.AsNoTracking().FirstOrDefaultAsync(p => p.Id == practiceId, ct);
        if (practice is null) return NotFound();
        return Ok(ToDto(practice));
    }

    [HttpPut("mine")]
    [Authorize(Roles = StaffRoles.PracticeAdmin)]
    public async Task<ActionResult<PracticeDto>> UpdateMine([FromBody] UpdatePracticeRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        var practice = await _db.DentalPractices.FirstOrDefaultAsync(p => p.Id == practiceId, ct);
        if (practice is null) return NotFound();

        practice.Name = request.Name.Trim();
        practice.Email = request.Email?.Trim();
        practice.PhoneNumber = request.PhoneNumber?.Trim();
        practice.Address = request.Address?.Trim();
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync("PRACTICE_UPDATED", "Practice", practice.Id.ToString(), ct: ct);
        return Ok(ToDto(practice));
    }

    private static PracticeDto ToDto(DentalPractice p) =>
        new(p.Id, p.Name, p.Email, p.PhoneNumber, p.Address, p.IsActive, p.CreatedAtUtc);
}
