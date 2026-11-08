using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/dentist/patients/{patientId:guid}/treatment-plans")]
[Authorize(Roles = "Dentist")]
public sealed class PatientTreatmentPlansController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PatientTreatmentPlansController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record CreatePlanRequest(string? Title, string? ClinicalRationale);
    public record AddProcedureRequest(string? Description, string? ToothCode, decimal? EstimatedCost);
    public record UpdatePlanRequest(string? Title, string? ClinicalRationale);
    public record RecordConsentRequest(string? PatientOrRepresentativeName, bool Acknowledged);

    private static bool ValidTooth(string? value) =>
        string.IsNullOrEmpty(value) ||
        (value.Length == 2 &&
            ((value[0] is >= '1' and <= '4' && value[1] is >= '1' and <= '8') ||
             (value[0] is >= '5' and <= '8' && value[1] is >= '1' and <= '5')));

    private async Task<bool> PatientExists(Guid patientId, Guid practiceId, CancellationToken ct) =>
        await _db.Patients.AnyAsync(x => x.Id == patientId && x.DentalPracticeId == practiceId && !x.IsArchived, ct);

    [HttpGet]
    public async Task<IActionResult> List(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, ct)) return NotFound();
        var plans = await _db.PatientTreatmentPlans.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId)
            .OrderByDescending(p => p.CreatedAtUtc)
            .Take(100).ToListAsync(ct);
        var ids = plans.Select(p => p.Id).ToList();
        var procedures = await _db.PatientTreatmentProcedures.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && ids.Contains(p.TreatmentPlanId))
            .OrderBy(p => p.CreatedAtUtc).ToListAsync(ct);
        return Ok(plans.Select(p => new {
            p.Id, p.Title, p.ClinicalRationale, p.Status, p.Revision,
            p.ConsentName, p.ConsentRecordedAtUtc, p.CreatedAtUtc, p.UpdatedAtUtc,
            Procedures = procedures.Where(x => x.TreatmentPlanId == p.Id).Select(x => new {
                x.Id, x.ToothCode, x.Description, x.Status, x.EstimatedCost, x.CreatedAtUtc, x.CompletedAtUtc
            }).ToList()
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid patientId, [FromBody] CreatePlanRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (!await PatientExists(patientId, practiceId, ct)) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Length > 200 || req.ClinicalRationale?.Length > 4000)
            return BadRequest(new { message = "Title required (max 200); rationale max 4000." });
        var plan = new PatientTreatmentPlan {
            DentalPracticeId = practiceId, PatientId = patientId, DentistUserId = userId,
            Title = req.Title.Trim(), ClinicalRationale = req.ClinicalRationale?.Trim()
        };
        _db.PatientTreatmentPlans.Add(plan);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("TREATMENT_PLAN_CREATED", "PatientTreatmentPlan", plan.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/treatment-plans", new { plan.Id });
    }

    [HttpPut("{planId:guid}")]
    public async Task<IActionResult> Revise(Guid patientId, Guid planId, [FromBody] UpdatePlanRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var plan = await _db.PatientTreatmentPlans.FirstOrDefaultAsync(p =>
            p.Id == planId && p.PatientId == patientId && p.DentalPracticeId == practiceId, ct);
        if (plan is null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Length > 200 || req.ClinicalRationale?.Length > 4000)
            return BadRequest(new { message = "Invalid plan fields." });
        if (plan.ConsentRecordedAtUtc != null)
            return Conflict(new { message = "An acknowledged plan is locked. Create a new plan for changes." });
        plan.Title = req.Title.Trim();
        plan.ClinicalRationale = req.ClinicalRationale?.Trim();
        plan.Revision++;
        plan.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("TREATMENT_PLAN_REVISED", "PatientTreatmentPlan", plan.Id.ToString(), ct: ct);
        return NoContent();
    }

    [HttpPost("{planId:guid}/procedures")]
    public async Task<IActionResult> AddProcedure(Guid patientId, Guid planId, [FromBody] AddProcedureRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var plan = await _db.PatientTreatmentPlans.FirstOrDefaultAsync(p =>
            p.Id == planId && p.PatientId == patientId && p.DentalPracticeId == practiceId, ct);
        if (plan is null) return NotFound();
        if (plan.ConsentRecordedAtUtc != null) return Conflict(new { message = "Plan is locked after acknowledgement." });
        if (string.IsNullOrWhiteSpace(req.Description) || req.Description.Length > 1000 ||
            !ValidTooth(req.ToothCode) || req.EstimatedCost is < 0 or > 10000000)
            return BadRequest(new { message = "Invalid description, tooth or amount." });
        var procedure = new PatientTreatmentProcedure {
            DentalPracticeId = practiceId, PatientId = patientId, TreatmentPlanId = plan.Id,
            Description = req.Description.Trim(), ToothCode = string.IsNullOrEmpty(req.ToothCode) ? null : req.ToothCode,
            EstimatedCost = req.EstimatedCost
        };
        _db.PatientTreatmentProcedures.Add(procedure);
        plan.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("TREATMENT_PROCEDURE_ADDED", "PatientTreatmentProcedure", procedure.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/treatment-plans/{planId}/procedures", new { procedure.Id });
    }

    [HttpPost("{planId:guid}/consent")]
    public async Task<IActionResult> RecordAcknowledgement(Guid patientId, Guid planId, [FromBody] RecordConsentRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        var plan = await _db.PatientTreatmentPlans.FirstOrDefaultAsync(p =>
            p.Id == planId && p.PatientId == patientId && p.DentalPracticeId == practiceId, ct);
        if (plan is null) return NotFound();
        if (plan.ConsentRecordedAtUtc != null) return Conflict(new { message = "Acknowledgement already recorded." });
        if (!req.Acknowledged || string.IsNullOrWhiteSpace(req.PatientOrRepresentativeName) ||
            req.PatientOrRepresentativeName.Length > 200)
            return BadRequest(new { message = "Confirmation and name are required." });
        plan.ConsentName = req.PatientOrRepresentativeName.Trim();
        plan.ConsentRecordedByUserId = userId;
        plan.ConsentRecordedAtUtc = DateTime.UtcNow;
        plan.Status = "Acknowledged";
        plan.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("TREATMENT_PLAN_ACKNOWLEDGED", "PatientTreatmentPlan", plan.Id.ToString(), ct: ct);
        return NoContent();
    }
}
