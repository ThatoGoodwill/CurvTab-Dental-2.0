using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/dentist/orthodontics/cases")]
[Authorize(Roles = "Dentist")]
public sealed class OrthodonticCaseDashboardController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public OrthodonticCaseDashboardController(
        DentalDbContext db,
        ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var cases = await (
            from c in _db.OrthodonticCases.AsNoTracking()
            join intake in _db.OrthodonticIntakes.AsNoTracking()
                on c.PatientId equals intake.PatientId
            join p in _db.Patients.AsNoTracking()
                on c.PatientId equals p.Id
            where c.DentalPracticeId == practiceId
               && intake.DentalPracticeId == practiceId
               && intake.AssignedOrthodontistUserId == _current.UserId
               && intake.ClosedAtUtc == null
               && p.DentalPracticeId == practiceId
               && !p.IsArchived
            orderby c.CreatedAtUtc descending
            select new
            {
                c.Id,
                c.PatientId,
                PatientName = p.FirstName + " " + p.LastName,
                c.Title,
                c.ApplianceType,
                c.Status,
                c.CreatedAtUtc,
                c.NextReviewDate
            }
        ).Take(200).ToListAsync(ct);

        return Ok(cases);
    }
}
