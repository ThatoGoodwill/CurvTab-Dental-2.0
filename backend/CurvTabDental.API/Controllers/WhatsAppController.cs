using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>Phase 8A: opt-in ledger and mock-only reminder queue. Never sends a WhatsApp message.</summary>
[ApiController]
[Route("api/whatsapp")]
[Authorize(Roles = "PracticeAdmin,Receptionist")]
public class WhatsAppController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public WhatsAppController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    [HttpGet("capabilities")]
    public IActionResult Capabilities() => Ok(new { mode = "MockOnly", liveSendingEnabled = false });

    [HttpGet("consents/{patientId:guid}")]
    public async Task<IActionResult> GetConsent(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(
            x => x.Id == patientId && x.DentalPracticeId == practiceId && !x.IsArchived, ct);
        if (patient is null) return NotFound();
        var consent = await _db.WhatsAppConsents.AsNoTracking().FirstOrDefaultAsync(
            x => x.PatientId == patientId && x.DentalPracticeId == practiceId, ct);
        return Ok(new { patientId, optedIn = consent?.GrantedAtUtc is not null && consent.RevokedAtUtc is null,
            grantedAtUtc = consent?.GrantedAtUtc, revokedAtUtc = consent?.RevokedAtUtc });
    }

    public sealed record ConsentRequest(bool OptedIn, string Source);

    [HttpPut("consents/{patientId:guid}")]
    public async Task<IActionResult> SetConsent(Guid patientId, [FromBody] ConsentRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Source) || request.Source.Trim().Length > 100)
            return BadRequest(new { message = "A consent evidence source (max 100 characters) is required." });
        var patient = await _db.Patients.FirstOrDefaultAsync(
            x => x.Id == patientId && x.DentalPracticeId == practiceId && !x.IsArchived, ct);
        if (patient is null) return NotFound();
        if (request.OptedIn && string.IsNullOrWhiteSpace(patient.PhoneNumber))
            return Conflict(new { message = "A patient phone number is required before opt-in." });
        var consent = await _db.WhatsAppConsents.FirstOrDefaultAsync(
            x => x.PatientId == patientId && x.DentalPracticeId == practiceId, ct);
        if (consent is null)
        {
            consent = new WhatsAppConsent { DentalPracticeId = practiceId, PatientId = patientId };
            _db.WhatsAppConsents.Add(consent);
        }
        var now = DateTime.UtcNow;
        consent.Source = request.Source.Trim();
        consent.UpdatedAtUtc = now;
        consent.UpdatedByUserId = _current.UserId;
        if (request.OptedIn) { consent.GrantedAtUtc = now; consent.RevokedAtUtc = null; }
        else { consent.RevokedAtUtc = now; consent.GrantedAtUtc = null; }
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync(request.OptedIn ? "WHATSAPP_OPT_IN_RECORDED" : "WHATSAPP_OPT_OUT_RECORDED",
            "Patient", patientId.ToString(), ct: ct);
        return Ok(new { patientId, optedIn = request.OptedIn });
    }

    [HttpGet("messages")]
    public async Task<IActionResult> Messages(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var items = await _db.WhatsAppOutboundMessages.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId)
            .OrderByDescending(x => x.CreatedAtUtc).Take(100)
            .Select(x => new { x.Id, x.PatientId, x.AppointmentId, x.TemplateKey,
                x.Status, x.AppointmentStartUtc, x.CreatedAtUtc }).ToListAsync(ct);
        return Ok(items); // No phone numbers exposed in list.
    }

    public sealed record QueueReminderRequest(Guid AppointmentId);

    [HttpPost("mock-reminders")]
    public async Task<IActionResult> QueueMockReminder([FromBody] QueueReminderRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var appointment = await _db.Appointments.AsNoTracking().FirstOrDefaultAsync(
            x => x.Id == request.AppointmentId && x.DentalPracticeId == practiceId, ct);
        if (appointment is null) return NotFound();
        if (appointment.Status != "Scheduled" || appointment.StartUtc <= DateTime.UtcNow)
            return Conflict(new { message = "Only future scheduled appointments are eligible." });
        var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(
            x => x.Id == appointment.PatientId && x.DentalPracticeId == practiceId && !x.IsArchived, ct);
        if (patient is null || string.IsNullOrWhiteSpace(patient.PhoneNumber))
            return Conflict(new { message = "Active patient with phone number required." });
        var consent = await _db.WhatsAppConsents.AsNoTracking().FirstOrDefaultAsync(
            x => x.PatientId == patient.Id && x.DentalPracticeId == practiceId, ct);
        if (consent?.GrantedAtUtc is null || consent.RevokedAtUtc is not null)
            return Conflict(new { message = "Explicit WhatsApp consent is required." });
        var exists = await _db.WhatsAppOutboundMessages.AsNoTracking().AnyAsync(
            x => x.AppointmentId == appointment.Id && x.DentalPracticeId == practiceId &&
                 x.TemplateKey == "appointment_reminder_v1", ct);
        if (exists) return Conflict(new { message = "Reminder already queued for this appointment." });
        var message = new WhatsAppOutboundMessage
        {
            DentalPracticeId = practiceId, PatientId = patient.Id, AppointmentId = appointment.Id,
            RecipientNumber = patient.PhoneNumber.Trim(), AppointmentStartUtc = appointment.StartUtc,
            CreatedByUserId = _current.UserId
        };
        _db.WhatsAppOutboundMessages.Add(message);
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException)
        {
            return Conflict(new { message = "Reminder could not be queued or already exists." });
        }
        await _audit.WriteAsync("WHATSAPP_MOCK_REMINDER_QUEUED", "Appointment", appointment.Id.ToString(), ct: ct);
        return Created($"/api/whatsapp/messages", new { message.Id, message.Status, liveSendingEnabled = false });
    }
}
