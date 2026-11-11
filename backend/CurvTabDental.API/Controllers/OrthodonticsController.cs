using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Orthodontic plans and progress notes are clinical information.
[ApiController]
[Route("api/dentist/patients/{patientId:guid}/orthodontics")]
[Authorize(Roles = "Dentist")]
public sealed class OrthodonticsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public OrthodonticsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record CreateCaseRequest(string Title, string ApplianceType, string Goals, DateOnly? NextReviewDate);
    public record ChangeCaseStatusRequest(string Status);
    public record AddProgressRequest(DateOnly VisitDate, string ProgressNotes,
        string? Adjustments, string? NextSteps, DateOnly? NextReviewDate);

    private static readonly HashSet<string> ApplianceTypes = new(StringComparer.Ordinal)
    {
        "Fixed braces", "Clear aligners", "Removable appliance", "Retainer",
        "Functional appliance", "Other"
    };

    // Every patient-specific orthodontic route is assigned-specialist scoped.
    // A general dentist must never open an unrelated orthodontic patient.
    private Task<bool> PatientExists(Guid patientId, Guid practiceId, bool active, CancellationToken ct) =>
        (from patient in _db.Patients.AsNoTracking()
         join intake in _db.OrthodonticIntakes.AsNoTracking()
              on patient.Id equals intake.PatientId
         where patient.Id == patientId && patient.DentalPracticeId == practiceId &&
               intake.DentalPracticeId == practiceId &&
               intake.AssignedOrthodontistUserId == _current.UserId &&
               intake.ClosedAtUtc == null && (!active || !patient.IsArchived)
         select patient.Id).AnyAsync(ct);

    // GET /api/dentist/patients/{patientId}/orthodontics
    [HttpGet]
    public async Task<IActionResult> List(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, false, ct)) return NotFound();

        var cases = await _db.OrthodonticCases.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.PatientId == patientId)
            .OrderByDescending(c => c.CreatedAtUtc)
            .Take(100)
            .Select(c => new
            {
                c.Id, c.PatientId, c.Title, c.ApplianceType, c.Goals,
                c.Status, c.NextReviewDate, c.CreatedByUserId,
                c.CreatedAtUtc, c.CompletedAtUtc
            })
            .ToListAsync(ct);
        return Ok(cases);
    }

    // POST /api/dentist/patients/{patientId}/orthodontics
    [HttpPost]
    public async Task<IActionResult> Create(
        Guid patientId, [FromBody] CreateCaseRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Length > 150 ||
            !ApplianceTypes.Contains(request.ApplianceType ?? "") ||
            string.IsNullOrWhiteSpace(request.Goals) || request.Goals.Length > 4000)
        {
            return BadRequest(new { message = "Provide a case title, valid appliance type and treatment goals." });
        }
        if (!await PatientExists(patientId, practiceId, true, ct)) return NotFound();
        var assessmentStarted = await _db.OrthodonticIntakes.AsNoTracking().AnyAsync(x =>
            x.PatientId == patientId && x.AssignedOrthodontistUserId == userId &&
            x.Status == "ASSESSMENT_IN_PROGRESS" && x.ClosedAtUtc == null, ct);
        if (!assessmentStarted)
            return Conflict(new { message = "Complete the orthodontic intake and begin specialist assessment first. Intake alone never creates treatment." });

        var entity = new OrthodonticCase
        {
            DentalPracticeId = practiceId,
            PatientId = patientId,
            CreatedByUserId = userId,
            Title = request.Title.Trim(),
            ApplianceType = request.ApplianceType,
            Goals = request.Goals.Trim(),
            NextReviewDate = request.NextReviewDate,
            Status = "Planning"
        };
        _db.OrthodonticCases.Add(entity);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHODONTIC_CASE_CREATED", "OrthodonticCase", entity.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/orthodontics/{entity.Id}", new { entity.Id, entity.Status });
    }

    // GET /api/dentist/patients/{patientId}/orthodontics/{caseId}
    [HttpGet("{caseId:guid}")]
    public async Task<IActionResult> Details(Guid patientId, Guid caseId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, false, ct)) return NotFound();

        var entity = await _db.OrthodonticCases.AsNoTracking()
            .Where(c => c.Id == caseId && c.PatientId == patientId && c.DentalPracticeId == practiceId)
            .Select(c => new
            {
                c.Id, c.PatientId, c.Title, c.ApplianceType, c.Goals,
                c.Status, c.NextReviewDate, c.CreatedByUserId,
                c.CreatedAtUtc, c.CompletedAtUtc
            })
            .FirstOrDefaultAsync(ct);
        if (entity is null) return NotFound();

        var notes = await _db.OrthodonticProgressNotes.AsNoTracking()
            .Where(n => n.DentalPracticeId == practiceId && n.OrthodonticCaseId == caseId)
            .OrderByDescending(n => n.VisitDate)
            .ThenByDescending(n => n.RecordedAtUtc)
            .Take(300)
            .Select(n => new
            {
                n.Id, n.VisitDate, n.ProgressNotes, n.Adjustments, n.NextSteps,
                n.NextReviewDate, n.RecordedByUserId, n.RecordedAtUtc
            })
            .ToListAsync(ct);
        return Ok(new { orthodonticCase = entity, progressNotes = notes });
    }

    // PATCH /api/dentist/patients/{patientId}/orthodontics/{caseId}/status
    [HttpPatch("{caseId:guid}/status")]
    public async Task<IActionResult> ChangeStatus(
        Guid patientId, Guid caseId, [FromBody] ChangeCaseStatusRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid) return Unauthorized();
        if (!await PatientExists(patientId, practiceId, true, ct)) return NotFound();

        var existing = await _db.OrthodonticCases.AsNoTracking()
            .Where(c => c.Id == caseId && c.PatientId == patientId && c.DentalPracticeId == practiceId)
            .Select(c => new { c.Status }).FirstOrDefaultAsync(ct);
        if (existing is null) return NotFound();

        var validTransition = existing.Status switch
        {
            "Planning" => request.Status == "Active",
            "Active" => request.Status is "Paused" or "Completed",
            "Paused" => request.Status is "Active" or "Completed",
            _ => false
        };
        if (!validTransition)
            return Conflict(new { message = "Invalid orthodontic case status transition." });

        var now = DateTime.UtcNow;
        var finished = request.Status == "Completed" ? (DateTime?)now : null;
        var changed = await _db.OrthodonticCases
            .Where(c => c.Id == caseId && c.PatientId == patientId &&
                        c.DentalPracticeId == practiceId && c.Status == existing.Status)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(c => c.Status, request.Status)
                .SetProperty(c => c.CompletedAtUtc, finished)
                .SetProperty(c => c.UpdatedAtUtc, now), ct);
        if (changed == 0) return Conflict(new { message = "Case changed; refresh and try again." });

        await _audit.WriteAsync("ORTHODONTIC_CASE_STATUS_CHANGED", "OrthodonticCase", caseId.ToString(), ct: ct);
        return Ok(new { id = caseId, status = request.Status });
    }

    // POST /api/dentist/patients/{patientId}/orthodontics/{caseId}/progress
    [HttpPost("{caseId:guid}/progress")]
    public async Task<IActionResult> AddProgress(
        Guid patientId, Guid caseId, [FromBody] AddProgressRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (request.VisitDate == default ||
            string.IsNullOrWhiteSpace(request.ProgressNotes) || request.ProgressNotes.Length > 4000 ||
            request.Adjustments?.Length > 2000 || request.NextSteps?.Length > 2000)
            return BadRequest(new { message = "A visit date and progress notes are required." });
        if (!await PatientExists(patientId, practiceId, true, ct)) return NotFound();

        var caseEntity = await _db.OrthodonticCases
            .FirstOrDefaultAsync(c => c.Id == caseId && c.PatientId == patientId &&
                c.DentalPracticeId == practiceId, ct);
        if (caseEntity is null) return NotFound();
        if (caseEntity.Status is "Completed" or "Planning")
            return Conflict(new { message = "Start the case before recording progress; completed cases are read-only." });

        var note = new OrthodonticProgressNote
        {
            DentalPracticeId = practiceId,
            OrthodonticCaseId = caseId,
            RecordedByUserId = userId,
            VisitDate = request.VisitDate,
            ProgressNotes = request.ProgressNotes.Trim(),
            Adjustments = string.IsNullOrWhiteSpace(request.Adjustments) ? null : request.Adjustments.Trim(),
            NextSteps = string.IsNullOrWhiteSpace(request.NextSteps) ? null : request.NextSteps.Trim(),
            NextReviewDate = request.NextReviewDate
        };
        _db.OrthodonticProgressNotes.Add(note);
        if (request.NextReviewDate.HasValue)
        {
            caseEntity.NextReviewDate = request.NextReviewDate;
            caseEntity.UpdatedAtUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHODONTIC_PROGRESS_RECORDED", "OrthodonticProgressNote", note.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/orthodontics/{caseId}", new { note.Id, note.VisitDate });
    }
}
