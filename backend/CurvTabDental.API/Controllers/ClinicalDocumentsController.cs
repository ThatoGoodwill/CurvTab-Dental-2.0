using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/dentist/clinical-documents/patients/{patientId:guid}")]
[Authorize(Roles = "Dentist")]
public sealed class ClinicalDocumentsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    public ClinicalDocumentsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    { _db = db; _current = current; _audit = audit; }

    public record IssuePrescriptionRequest(Guid ConsultationId, string? PractitionerRegistrationNumber,
        string? MedicationName, string? Strength, string? Dosage, string? Route,
        string? Frequency, string? Duration, string? Quantity, string? Instructions,
        string? ClinicalIndication, bool ClinicianConfirmed);
    public record IssueCertificateRequest(Guid ConsultationId, string? PractitionerRegistrationNumber,
        DateOnly FromDate, DateOnly ThroughDate, string? WorkCapacityStatement,
        string? ClinicalJustification, string? PatientOrRepresentativeName,
        bool ClinicianConfirmed);

    private static bool Text(string? value, int min, int max) =>
        value is not null && value.Trim().Length >= min && value.Trim().Length <= max;

    private async Task<(Consultation? encounter, string? practitioner)> FindAuthorisedEncounter(
        Guid patientId, Guid consultationId, Guid practiceId, Guid userId, CancellationToken ct)
    {
        var encounter = await _db.Consultations.AsNoTracking().FirstOrDefaultAsync(c =>
            c.Id == consultationId && c.PatientId == patientId &&
            c.DentalPracticeId == practiceId && c.DentistUserId == userId, ct);
        if (encounter is null) return (null, null);
        var liveVisit = await _db.Appointments.AsNoTracking().AnyAsync(a =>
            a.Id == encounter.AppointmentId && a.DentalPracticeId == practiceId &&
            a.PatientId == patientId && (a.Status == "InConsultation" ||
                a.Status == "AwaitingCheckout" || a.Status == "CheckedOut"), ct);
        if (!liveVisit) return (null, null);
        var clinicianName = await _db.Users.AsNoTracking()
            .Where(u => u.Id == userId && u.DentalPracticeId == practiceId && u.IsActive)
            .Select(u => u.FullName).FirstOrDefaultAsync(ct);
        return (string.IsNullOrWhiteSpace(clinicianName) ? null : encounter, clinicianName);
    }

    [HttpGet("prescriptions")]
    public async Task<IActionResult> Prescriptions(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await _db.Patients.AsNoTracking().AnyAsync(p =>
            p.Id == patientId && p.DentalPracticeId == practiceId && !p.IsArchived, ct)) return NotFound();
        var rows = await _db.ClinicalPrescriptions.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId)
            .OrderByDescending(p => p.AuthorizedAtUtc).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(rows);
    }

    [HttpPost("prescriptions")]
    public async Task<IActionResult> IssuePrescription(Guid patientId,
        [FromBody] IssuePrescriptionRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        if (!request.ClinicianConfirmed || request.ConsultationId == Guid.Empty ||
            !Text(request.PractitionerRegistrationNumber, 3, 60) ||
            !Text(request.MedicationName, 2, 200) ||
            !Text(request.Strength, 1, 100) || !Text(request.Dosage, 2, 300) ||
            !Text(request.Route, 2, 100) || !Text(request.Frequency, 2, 200) ||
            !Text(request.Duration, 2, 200) || !Text(request.Quantity, 1, 100) ||
            !Text(request.Instructions, 4, 2000) || !Text(request.ClinicalIndication, 4, 2000))
            return BadRequest(new { message = "Clinician confirmation, registration number and complete medication instructions are required. No automatic drug or dose is provided." });
        var (encounter, practitioner) = await FindAuthorisedEncounter(
            patientId, request.ConsultationId, practiceId, actorId, ct);
        if (encounter is null || practitioner is null)
            return Conflict(new { message = "Save the patient's active clinical encounter under your own dentist login before authorizing a prescription." });
        var doc = new ClinicalPrescription {
            DentalPracticeId = practiceId, PatientId = patientId,
            ConsultationId = encounter.Id, AppointmentId = encounter.AppointmentId,
            PrescriberUserId = actorId, PractitionerName = practitioner,
            PractitionerRegistrationNumber = request.PractitionerRegistrationNumber!.Trim(),
            MedicationName = request.MedicationName!.Trim(), Strength = request.Strength!.Trim(),
            Dosage = request.Dosage!.Trim(), Route = request.Route!.Trim(),
            Frequency = request.Frequency!.Trim(), Duration = request.Duration!.Trim(),
            Quantity = request.Quantity!.Trim(), Instructions = request.Instructions!.Trim(),
            ClinicalIndication = request.ClinicalIndication!.Trim()
        };
        _db.ClinicalPrescriptions.Add(doc);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("CLINICIAN_PRESCRIPTION_AUTHORISED", "ClinicalPrescription", doc.Id.ToString(), ct: ct);
        return Created($"/api/dentist/clinical-documents/patients/{patientId}/prescriptions", new {
            doc.Id, doc.PatientId, doc.ConsultationId, doc.PrescriberUserId, doc.AuthorizedAtUtc
        });
    }

    [HttpGet("certificates")]
    public async Task<IActionResult> Certificates(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await _db.Patients.AsNoTracking().AnyAsync(p =>
            p.Id == patientId && p.DentalPracticeId == practiceId && !p.IsArchived, ct)) return NotFound();
        var docs = await _db.ClinicalMedicalCertificates.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.PatientId == patientId)
            .OrderByDescending(c => c.AuthorizedAtUtc).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(docs);
    }

    [HttpPost("certificates")]
    public async Task<IActionResult> IssueCertificate(Guid patientId,
        [FromBody] IssueCertificateRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        if (!request.ClinicianConfirmed || request.ConsultationId == Guid.Empty ||
            request.FromDate == default || request.ThroughDate == default ||
            request.FromDate > request.ThroughDate ||
            request.ThroughDate.DayNumber - request.FromDate.DayNumber > 90 ||
            !Text(request.PractitionerRegistrationNumber, 3, 60) ||
            !Text(request.WorkCapacityStatement, 8, 1000) ||
            !Text(request.ClinicalJustification, 8, 4000) ||
            !Text(request.PatientOrRepresentativeName, 2, 200))
            return BadRequest(new { message = "A clinically justified date range (up to 90 days), patient name, prescriber details and explicit authorization are required." });
        var (encounter, practitioner) = await FindAuthorisedEncounter(
            patientId, request.ConsultationId, practiceId, actorId, ct);
        if (encounter is null || practitioner is null)
            return Conflict(new { message = "Only the authenticated dentist responsible for this patient's saved consultation may issue a certificate." });
        var doc = new ClinicalMedicalCertificate {
            DentalPracticeId = practiceId, PatientId = patientId,
            ConsultationId = encounter.Id, AppointmentId = encounter.AppointmentId,
            PractitionerUserId = actorId, PractitionerName = practitioner,
            PractitionerRegistrationNumber = request.PractitionerRegistrationNumber!.Trim(),
            FromDate = request.FromDate, ThroughDate = request.ThroughDate,
            WorkCapacityStatement = request.WorkCapacityStatement!.Trim(),
            ClinicalJustification = request.ClinicalJustification!.Trim(),
            PatientOrRepresentativeName = request.PatientOrRepresentativeName!.Trim()
        };
        _db.ClinicalMedicalCertificates.Add(doc);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("CLINICIAN_CERTIFICATE_AUTHORISED", "ClinicalMedicalCertificate", doc.Id.ToString(), ct: ct);
        return Created($"/api/dentist/clinical-documents/patients/{patientId}/certificates", new {
            doc.Id, doc.PatientId, doc.ConsultationId, doc.PractitionerUserId, doc.AuthorizedAtUtc
        });
    }
}
