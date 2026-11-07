using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Practice-scoped, dentist-only orthodontics overview. No schema change required.
/// No financial amounts are inferred from scheduled instalments.
/// </summary>
[ApiController]
[Route("api/dentist/orthodontics/overview")]
[Authorize(Roles = "Dentist")]
public sealed class OrthodonticsOverviewController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public OrthodonticsOverviewController(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        // Both case and patient must be owned by the authenticated practice.
        var query =
            from c in _db.OrthodonticCases.AsNoTracking()
            join p in _db.Patients.AsNoTracking() on c.PatientId equals p.Id
            where c.DentalPracticeId == practiceId
               && p.DentalPracticeId == practiceId
               && !p.IsArchived
            select new
            {
                c.Id,
                c.PatientId,
                PatientName = p.FirstName + " " + p.LastName,
                c.Title,
                c.ApplianceType,
                c.Status,
                c.NextReviewDate,
                c.CreatedAtUtc,
                c.UpdatedAtUtc
            };

        var total = await query.CountAsync(ct);
        var cases = await query
            .OrderByDescending(c => c.CreatedAtUtc)
            .Take(250)
            .ToListAsync(ct);

        var recentActivity = await (
            from n in _db.OrthodonticProgressNotes.AsNoTracking()
            join c in _db.OrthodonticCases.AsNoTracking()
                on n.OrthodonticCaseId equals c.Id
            join p in _db.Patients.AsNoTracking()
                on c.PatientId equals p.Id
            where n.DentalPracticeId == practiceId
               && c.DentalPracticeId == practiceId
               && p.DentalPracticeId == practiceId
               && !p.IsArchived
            orderby n.VisitDate descending, n.RecordedAtUtc descending
            select new
            {
                Id = n.Id,
                CaseId = c.Id,
                c.PatientId,
                PatientName = p.FirstName + " " + p.LastName,
                CaseTitle = c.Title,
                n.VisitDate,
                n.ProgressNotes,
                n.Adjustments
            }
        ).Take(12).ToListAsync(ct);

        return Ok(new
        {
            TotalCases = total,
            IsTruncated = total > cases.Count,
            Cases = cases,
            RecentActivity = recentActivity
        });
    }
}
