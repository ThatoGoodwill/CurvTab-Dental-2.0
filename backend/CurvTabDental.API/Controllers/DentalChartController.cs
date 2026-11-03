using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Confidential dental chart; reception cannot access this controller.
[ApiController]
[Route("api/dentist/patients/{patientId:guid}/chart")]
[Authorize(Roles = "Dentist")]
public sealed class DentalChartController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public DentalChartController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record AddChartEntryRequest(
        string ToothCode, string Surface, string Finding, string? Notes,
        Guid? ConsultationId);

    private static readonly HashSet<string> Surfaces = new(StringComparer.Ordinal)
    {
        "Whole Tooth", "Mesial", "Distal", "Occlusal", "Incisal",
        "Buccal", "Lingual", "Palatal"
    };

    private static readonly HashSet<string> Findings = new(StringComparer.Ordinal)
    {
        "Healthy", "Caries suspected", "Restoration present", "Missing",
        "Crown present", "Fracture", "Root canal treated", "Extraction planned",
        "Sealant present", "Monitor", "Other"
    };

    // GET /api/dentist/patients/{patientId}/chart
    [HttpGet]
    public async Task<IActionResult> GetChart(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        if (!await _db.Patients.AsNoTracking().AnyAsync(
                p => p.Id == patientId && p.DentalPracticeId == practiceId, ct))
            return NotFound(new { message = "Patient not found in your practice." });

        var entries = await _db.DentalChartEntries.AsNoTracking()
            .Where(e => e.DentalPracticeId == practiceId && e.PatientId == patientId)
            .OrderByDescending(e => e.RecordedAtUtc)
            .ThenByDescending(e => e.Id)
            .Take(500)
            .Select(e => new
            {
                e.Id, e.PatientId, e.ToothCode, e.Surface, e.Finding,
                e.Notes, e.ConsultationId, e.RecordedByUserId, e.RecordedAtUtc
            })
            .ToListAsync(ct);

        return Ok(entries);
    }

    // POST /api/dentist/patients/{patientId}/chart
    [HttpPost]
    public async Task<IActionResult> AddEntry(
        Guid patientId, [FromBody] AddChartEntryRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (!IsFdiToothCode(request.ToothCode) ||
            !Surfaces.Contains(request.Surface ?? "") ||
            !Findings.Contains(request.Finding ?? "") ||
            request.Notes?.Length > 2000)
        {
            return BadRequest(new { message = "Choose a valid FDI tooth, surface and finding (notes max 2000 characters)." });
        }

        if (!await _db.Patients.AnyAsync(p => p.Id == patientId &&
                p.DentalPracticeId == practiceId && !p.IsArchived, ct))
            return NotFound(new { message = "Active patient not found in this practice." });

        if (request.ConsultationId.HasValue)
        {
            var linked = await _db.Consultations.AsNoTracking().AnyAsync(c =>
                c.Id == request.ConsultationId.Value &&
                c.PatientId == patientId &&
                c.DentalPracticeId == practiceId &&
                c.DentistUserId == userId && !c.IsFinalized, ct);
            if (!linked)
                return BadRequest(new { message = "Only your active consultation for this patient can be linked." });
        }

        var entry = new DentalChartEntry
        {
            DentalPracticeId = practiceId,
            PatientId = patientId,
            RecordedByUserId = userId,
            ToothCode = request.ToothCode,
            Surface = request.Surface,
            Finding = request.Finding,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            ConsultationId = request.ConsultationId,
            RecordedAtUtc = DateTime.UtcNow
        };

        _db.DentalChartEntries.Add(entry);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("DENTAL_CHART_ENTRY_ADDED", "DentalChartEntry", entry.Id.ToString(), ct: ct);

        return Created($"/api/dentist/patients/{patientId}/chart", new
        {
            entry.Id, entry.PatientId, entry.ToothCode, entry.Surface,
            entry.Finding, entry.Notes, entry.ConsultationId,
            entry.RecordedByUserId, entry.RecordedAtUtc
        });
    }

    private static bool IsFdiToothCode(string? value)
    {
        if (value is null || value.Length != 2) return false;
        return (value[0] is >= '1' and <= '4' && value[1] is >= '1' and <= '8') ||
               (value[0] is >= '5' and <= '8' && value[1] is >= '1' and <= '5');
    }
}
