using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Patient + consultation scoped, immutable dentist-issued clinical documents.
// Never expose these confidential records to the reception or lab roles.
[ApiController]
[Route("api/dentist/patients/{patientId:guid}/clinical-documents")]
[Authorize(Roles = "Dentist")]
public sealed class ClinicalDocumentsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public ClinicalDocumentsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    { _db = db; _current = current; _audit = audit; }

    public sealed record IssuePrescription(
        Guid RequestId, Guid ConsultationId, bool MedicalHistoryReviewed,
        string Medication, string Dose, string Route, string Frequency,
        string Duration, string Quantity, string Directions, string ClinicalRationale);
    public sealed record IssueCertificate(
        Guid RequestId, Guid ConsultationId, DateOnly FromDate,
        DateOnly ToDate, string ClinicalJustification, string WorkAdvice);

    private static bool Has(string? text, int max) =>
        !string.IsNullOrWhiteSpace(text) && text.Trim().Length <= max;

    private async Task<Consultation?> MyConsultation(Guid patientId, Guid consultationId,
        Guid practiceId, Guid dentistId, CancellationToken ct) =>
        await _db.Consultations.AsNoTracking().FirstOrDefaultAsync(c =>
            c.Id == consultationId && c.PatientId == patientId &&
            c.DentalPracticeId == practiceId && c.DentistUserId == dentistId, ct);

    [HttpGet]
    public async Task<IActionResult> List(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await _db.Patients.AsNoTracking().AnyAsync(p =>
            p.Id == patientId && p.DentalPracticeId == practiceId && !p.IsArchived, ct))
            return NotFound();

        var patient = await _db.Patients.AsNoTracking()
            .Where(p => p.Id == patientId && p.DentalPracticeId == practiceId)
            .Select(p => new { p.Id, name = p.FirstName + " " + p.LastName })
            .FirstAsync(ct);
        var practiceName = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId).Select(p => p.Name).FirstOrDefaultAsync(ct);
        var consultations = await _db.Consultations.AsNoTracking()
            .Where(c => c.PatientId == patientId && c.DentalPracticeId == practiceId &&
                c.DentistUserId != null)
            .OrderByDescending(c => c.CreatedAtUtc)
            .Select(c => new { c.Id, c.AppointmentId, c.CreatedAtUtc, c.DentistUserId, c.IsFinalized })
            .ToListAsync(ct);
        var prescriptions = await _db.ClinicalPrescriptions.AsNoTracking()
            .Where(p => p.PatientId == patientId && p.DentalPracticeId == practiceId)
            .OrderByDescending(p => p.IssuedAtUtc).ToListAsync(ct);
        var certificates = await _db.PatientMedicalCertificates.AsNoTracking()
            .Where(p => p.PatientId == patientId && p.DentalPracticeId == practiceId)
            .OrderByDescending(p => p.IssuedAtUtc).ToListAsync(ct);
        var clinicianIds = consultations.Where(c => c.DentistUserId.HasValue)
            .Select(c => c.DentistUserId!.Value)
            .Concat(prescriptions.Select(p => p.DentistUserId))
            .Concat(certificates.Select(c => c.DentistUserId)).Distinct().ToList();
        var clinicians = await _db.Users.AsNoTracking()
            .Where(u => u.DentalPracticeId == practiceId && clinicianIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName }).ToListAsync(ct);
        string Name(Guid id) => clinicians.FirstOrDefault(c => c.Id == id)?.FullName ?? "Treating dentist";
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new {
            patient,
            practiceName,
            consultations = consultations.Select(c => new {
                c.Id, c.AppointmentId, c.CreatedAtUtc, c.IsFinalized,
                dentistName = c.DentistUserId.HasValue ? Name(c.DentistUserId.Value) : "Dentist"
            }),
            prescriptions = prescriptions.Select(p => new {
                p.Id, p.ConsultationId, p.DentistUserId,
                dentistName = Name(p.DentistUserId),
                p.Medication, p.Dose, p.Route, p.Frequency, p.Duration,
                p.Quantity, p.Directions, p.ClinicalRationale,
                p.MedicalHistoryReviewed, p.IssuedAtUtc
            }),
            certificates = certificates.Select(c => new {
                c.Id, c.ConsultationId, c.DentistUserId,
                dentistName = Name(c.DentistUserId),
                c.FromDate, c.ToDate, c.ClinicalJustification, c.WorkAdvice, c.IssuedAtUtc
            })
        });
    }

    [HttpPost("prescriptions")]
    public async Task<IActionResult> Prescribe(Guid patientId,
        [FromBody] IssuePrescription request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid dentistId) return Unauthorized();
        if (request.RequestId == Guid.Empty || !request.MedicalHistoryReviewed ||
            !Has(request.Medication, 200) || !Has(request.Dose, 200) ||
            !Has(request.Route, 120) || !Has(request.Frequency, 200) ||
            !Has(request.Duration, 200) || !Has(request.Quantity, 200) ||
            !Has(request.Directions, 2000) || !Has(request.ClinicalRationale, 3000))
            return BadRequest(new { message = "The treating dentist must review medical history and supply complete, clinically assessed prescribing information." });
        if (await MyConsultation(patientId, request.ConsultationId, practiceId, dentistId, ct) is null)
            return NotFound(new { message = "An authenticated treating dentist's consultation is required." });
        var previous = await _db.ClinicalPrescriptions.AsNoTracking()
            .FirstOrDefaultAsync(p => p.DentalPracticeId == practiceId && p.RequestId == request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.PatientId != patientId || previous.ConsultationId != request.ConsultationId)
                return Conflict(new { message = "This prescription request ID was already used for a different encounter." });
            return Ok(new { previous.Id, alreadyIssued = true });
        }
        var prescription = new ClinicalPrescription {
            DentalPracticeId = practiceId, PatientId = patientId,
            ConsultationId = request.ConsultationId, DentistUserId = dentistId,
            RequestId = request.RequestId, Medication = request.Medication.Trim(),
            Dose = request.Dose.Trim(), Route = request.Route.Trim(),
            Frequency = request.Frequency.Trim(), Duration = request.Duration.Trim(),
            Quantity = request.Quantity.Trim(), Directions = request.Directions.Trim(),
            ClinicalRationale = request.ClinicalRationale.Trim(),
            MedicalHistoryReviewed = true
        };
        _db.ClinicalPrescriptions.Add(prescription);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("CLINICAL_PRESCRIPTION_ISSUED", "ClinicalPrescription",
            prescription.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/clinical-documents",
            new { prescription.Id, prescription.IssuedAtUtc, alreadyIssued = false });
    }

    [HttpPost("certificates")]
    public async Task<IActionResult> Certify(Guid patientId,
        [FromBody] IssueCertificate request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid dentistId) return Unauthorized();
        if (request.RequestId == Guid.Empty || request.FromDate == default ||
            request.ToDate < request.FromDate ||
            request.ToDate.DayNumber - request.FromDate.DayNumber > 60 ||
            !Has(request.ClinicalJustification, 3000) || !Has(request.WorkAdvice, 2000))
            return BadRequest(new { message = "Select clinically justified dates (up to 60 days) and document the work advice and reason." });
        if (await MyConsultation(patientId, request.ConsultationId, practiceId, dentistId, ct) is null)
            return NotFound(new { message = "An authenticated treating dentist's consultation is required." });
        var previous = await _db.PatientMedicalCertificates.AsNoTracking()
            .FirstOrDefaultAsync(c => c.DentalPracticeId == practiceId && c.RequestId == request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.PatientId != patientId || previous.ConsultationId != request.ConsultationId)
                return Conflict(new { message = "This certificate request ID was already used for a different encounter." });
            return Ok(new { previous.Id, alreadyIssued = true });
        }
        var certificate = new PatientMedicalCertificate {
            DentalPracticeId = practiceId, PatientId = patientId,
            ConsultationId = request.ConsultationId, DentistUserId = dentistId,
            RequestId = request.RequestId, FromDate = request.FromDate,
            ToDate = request.ToDate,
            ClinicalJustification = request.ClinicalJustification.Trim(),
            WorkAdvice = request.WorkAdvice.Trim()
        };
        _db.PatientMedicalCertificates.Add(certificate);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("MEDICAL_CERTIFICATE_ISSUED",
            "PatientMedicalCertificate", certificate.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/clinical-documents",
            new { certificate.Id, certificate.IssuedAtUtc, alreadyIssued = false });
    }
}
