using CurvTabDental.API.Notifications;
using Microsoft.AspNetCore.SignalR;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Confidential clinical endpoints. Receptionist role is deliberately excluded.
[ApiController]
[Route("api/dentist")]
[Authorize(Roles = "Dentist")]
public sealed class ConsultationsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    private readonly IHubContext<ClinicNotificationsHub> _notifications;
    private readonly ILogger<ConsultationsController> _logger;

    public ConsultationsController(
        DentalDbContext db, ICurrentUser current, IAuditService audit,
        IHubContext<ClinicNotificationsHub> notifications,
        ILogger<ConsultationsController> logger)
    {
        _db = db;
        _current = current;
        _audit = audit;
        _notifications = notifications;
        _logger = logger;
    }

    public record MedicalHistoryRequest(
        string? Allergies,
        string? CurrentMedications,
        string? MedicalConditions,
        string? DentalHistory,
        string? AdditionalNotes);

    public record ChargeRequest(string Description, decimal Amount, Guid? ProcedurePriceId = null, Guid? TreatmentProcedureId = null);

    public record SaveConsultationRequest(
        string? ChiefComplaint,
        string? Symptoms,
        string? ExaminationFindings,
        string? Diagnosis,
        string? TreatmentPerformed,
        string? TreatmentPlan,
        string? PrescriptionNotes,
        string? FollowUpAdvice,
        bool ChargesConfirmed,
        List<ChargeRequest>? Charges);

    // GET /api/dentist/patients/{patientId}/medical-history
    [HttpGet("patients/{patientId:guid}/medical-history")]
    public async Task<IActionResult> MedicalHistory(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, ct)) return NotFound();

        var history = await _db.PatientMedicalHistories.AsNoTracking()
            .FirstOrDefaultAsync(h => h.DentalPracticeId == practiceId &&
                                      h.PatientId == patientId, ct);

        return Ok(new
        {
            patientId,
            allergies = history?.Allergies,
            currentMedications = history?.CurrentMedications,
            medicalConditions = history?.MedicalConditions,
            dentalHistory = history?.DentalHistory,
            additionalNotes = history?.AdditionalNotes,
            updatedAtUtc = history?.UpdatedAtUtc
        });
    }

    // PUT /api/dentist/patients/{patientId}/medical-history
    [HttpPut("patients/{patientId:guid}/medical-history")]
    public async Task<IActionResult> SaveMedicalHistory(
        Guid patientId, [FromBody] MedicalHistoryRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, ct)) return NotFound();

        var fields = new[] { request.Allergies, request.CurrentMedications,
            request.MedicalConditions, request.DentalHistory, request.AdditionalNotes };
        if (fields.Any(s => s?.Length > 4000))
            return BadRequest(new { message = "Each medical-history field must be 4000 characters or fewer." });

        var history = await _db.PatientMedicalHistories
            .FirstOrDefaultAsync(h => h.DentalPracticeId == practiceId &&
                                      h.PatientId == patientId, ct);
        if (history is null)
        {
            history = new PatientMedicalHistory
            {
                DentalPracticeId = practiceId,
                PatientId = patientId
            };
            _db.PatientMedicalHistories.Add(history);
        }

        history.Allergies = Clean(request.Allergies);
        history.CurrentMedications = Clean(request.CurrentMedications);
        history.MedicalConditions = Clean(request.MedicalConditions);
        history.DentalHistory = Clean(request.DentalHistory);
        history.AdditionalNotes = Clean(request.AdditionalNotes);
        history.UpdatedAtUtc = DateTime.UtcNow;
        history.UpdatedByUserId = _current.UserId;

        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("MEDICAL_HISTORY_UPDATED", "Patient", patientId.ToString(), ct: ct);
        return NoContent();
    }

    // GET /api/dentist/consultations/by-appointment/{appointmentId}
    [HttpGet("consultations/by-appointment/{appointmentId:guid}")]
    public async Task<IActionResult> GetConsultation(Guid appointmentId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        var appointment = await _db.Appointments.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == appointmentId &&
                                      a.DentalPracticeId == practiceId, ct);
        if (appointment is null) return NotFound();

        var patient = await _db.Patients.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == appointment.PatientId &&
                                      p.DentalPracticeId == practiceId, ct);
        if (patient is null) return NotFound();

        var consultation = await _db.Consultations.AsNoTracking()
            .FirstOrDefaultAsync(c => c.AppointmentId == appointmentId &&
                                      c.DentalPracticeId == practiceId, ct);

        var charges = consultation is null
            ? new List<ChargeView>()
            : await _db.ConsultationCharges.AsNoTracking()
                .Where(c => c.DentalPracticeId == practiceId &&
                            c.ConsultationId == consultation.Id)
                .OrderBy(c => c.Description)
                .Select(c => new ChargeView(c.Id, c.Description, c.Amount, c.TreatmentProcedureId))
                .ToListAsync(ct);

        return Ok(new
        {
            appointmentId,
            patientId = patient.Id,
            patientName = patient.FirstName + " " + patient.LastName,
            appointmentStatus = appointment.Status,
            consultation = consultation is null ? null : new
            {
                consultation.Id,
                consultation.DentistUserId,
                consultation.ChiefComplaint,
                consultation.Symptoms,
                consultation.ExaminationFindings,
                consultation.Diagnosis,
                consultation.TreatmentPerformed,
                consultation.TreatmentPlan,
                consultation.PrescriptionNotes,
                consultation.FollowUpAdvice,
                consultation.ChargesConfirmed,
                consultation.IsFinalized,
                consultation.FinalizedAtUtc,
                consultation.UpdatedAtUtc
            },
            charges,
            amountDue = charges.Sum(c => c.Amount)
        });
    }

    // GET /api/dentist/patients/{patientId}/consultations
    // Historical clinical notes for the authorized practice's Dentist.
    [HttpGet("patients/{patientId:guid}/consultations")]
    public async Task<IActionResult> PatientConsultationHistory(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, ct)) return NotFound();

        var rows = await _db.Consultations.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId &&
                        c.PatientId == patientId)
            .OrderByDescending(c => c.CreatedAtUtc)
            .Take(100)
            .Select(c => new
            {
                c.Id,
                c.AppointmentId,
                c.DentistUserId,
                c.ChiefComplaint,
                c.ExaminationFindings,
                c.Diagnosis,
                c.TreatmentPerformed,
                c.TreatmentPlan,
                c.FollowUpAdvice,
                c.CreatedAtUtc,
                c.FinalizedAtUtc,
                c.IsFinalized
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    private record ChargeView(Guid Id, string Description, decimal Amount, Guid? TreatmentProcedureId);

    // PUT /api/dentist/consultations/by-appointment/{appointmentId}
    // May be called repeatedly while the consultation is in progress.
    [HttpPut("consultations/by-appointment/{appointmentId:guid}")]
    public async Task<IActionResult> SaveConsultation(
        Guid appointmentId, [FromBody] SaveConsultationRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid dentistId) return Unauthorized();

        var appointment = await _db.Appointments.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == appointmentId &&
                                      a.DentalPracticeId == practiceId, ct);
        if (appointment is null) return NotFound();
        if (appointment.Status != "InConsultation")
            return Conflict(new { message = "Only an active consultation may be edited." });

        var fields = new[] { request.ChiefComplaint, request.Symptoms,
            request.ExaminationFindings, request.Diagnosis, request.TreatmentPerformed,
            request.TreatmentPlan, request.PrescriptionNotes, request.FollowUpAdvice };
        if (fields.Any(s => s?.Length > 6000))
            return BadRequest(new { message = "Each clinical field must be 6000 characters or fewer." });

        var incoming = request.Charges ?? new List<ChargeRequest>();
        if (incoming.Count > 50 || incoming.Any(c => c is null ||
                string.IsNullOrWhiteSpace(c.Description) || c.Description.Length > 200 ||
                c.Amount <= 0 || c.Amount > 10000000m ||
                decimal.Round(c.Amount, 2) != c.Amount))
            return BadRequest(new { message = "Each charge needs a description and a positive amount with at most two decimal places (up to R10 million). Maximum 50 charges." });
        if (incoming.Sum(c => c.Amount) > 100000000m)
            return BadRequest(new { message = "Total charges exceed the allowed limit." });

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        var consultation = await _db.Consultations
            .FirstOrDefaultAsync(c => c.DentalPracticeId == practiceId &&
                                      c.AppointmentId == appointmentId, ct);
        if (consultation is null)
        {
            // Also supports visits started before Phase 2 was installed.
            consultation = new Consultation
            {
                DentalPracticeId = practiceId,
                AppointmentId = appointmentId,
                PatientId = appointment.PatientId,
                DentistUserId = dentistId
            };
            _db.Consultations.Add(consultation);
        }
        else if (consultation.IsFinalized)
            return Conflict(new { message = "Finalized notes cannot be overwritten." });
        else if (consultation.DentistUserId.HasValue &&
                 consultation.DentistUserId != dentistId)
            return Forbid();

        consultation.DentistUserId ??= dentistId;
        consultation.ChiefComplaint = Clean(request.ChiefComplaint);
        consultation.Symptoms = Clean(request.Symptoms);
        consultation.ExaminationFindings = Clean(request.ExaminationFindings);
        consultation.Diagnosis = Clean(request.Diagnosis);
        consultation.TreatmentPerformed = Clean(request.TreatmentPerformed);
        consultation.TreatmentPlan = Clean(request.TreatmentPlan);
        consultation.PrescriptionNotes = Clean(request.PrescriptionNotes);
        consultation.FollowUpAdvice = Clean(request.FollowUpAdvice);
        consultation.ChargesConfirmed = request.ChargesConfirmed;
        consultation.UpdatedAtUtc = DateTime.UtcNow;

        // Replace the current draft charges with the latest submitted list.
        // The enclosing database transaction keeps this change atomic.
        var previousCharges = await _db.ConsultationCharges
            .Where(c => c.DentalPracticeId == practiceId &&
                        c.ConsultationId == consultation.Id)
            .ToListAsync(ct);
        // New clinical charges must use the configured practice procedure list.
        // An unchanged historical draft line may still be saved, but it cannot
        // be used to invent or reprice a charge through an API request.
        var verifiedCharges = new List<(string Description, decimal Amount, Guid? TreatmentProcedureId)>();
        // Reuse the existing clinical procedure identifiers, never invent a charge
        // by name match or by a treatment-plan estimate alone.
        var linkedIds = incoming.Where(c => c.TreatmentProcedureId.HasValue)
            .Select(c => c.TreatmentProcedureId!.Value).ToArray();
        if (linkedIds.Distinct().Count() != linkedIds.Length)
            return Conflict(new { message = "A completed procedure can only be charged once per consultation." });

        // Consume historical entries one-by-one: resubmitting a duplicate cannot
        // multiply an unpriced charge that originally existed only once.
        var remainingHistorical = previousCharges.ToList();
        foreach (var charge in incoming)
        {
            if (charge.TreatmentProcedureId is Guid treatmentProcedureId)
            {
                var procedure = await _db.PatientTreatmentProcedures.AsNoTracking()
                    .FirstOrDefaultAsync(p => p.Id == treatmentProcedureId &&
                        p.DentalPracticeId == practiceId &&
                        p.PatientId == appointment.PatientId &&
                        p.Status == "Completed", ct);
                if (procedure is null || !procedure.EstimatedCost.HasValue || procedure.EstimatedCost.Value <= 0)
                    return Conflict(new { message = "Select an actual completed, priced procedure linked to this patient." });
                var agreement = await _db.PatientTreatmentPlans.AsNoTracking()
                    .AnyAsync(p => p.Id == procedure.TreatmentPlanId &&
                        p.PatientId == appointment.PatientId &&
                        p.DentalPracticeId == practiceId &&
                        p.ConsentRecordedAtUtc != null, ct);
                if (!agreement)
                    return Conflict(new { message = "This treatment procedure needs a recorded patient acknowledgement." });
                if (charge.Description.Trim() != procedure.Description || charge.Amount != procedure.EstimatedCost.Value)
                    return Conflict(new { message = "The selected procedure and its approved price no longer match. Refresh the treatment plan." });
                var previouslyBilled = await _db.ConsultationCharges.AsNoTracking()
                    .AnyAsync(c => c.DentalPracticeId == practiceId &&
                        c.TreatmentProcedureId == treatmentProcedureId &&
                        c.ConsultationId != consultation.Id, ct);
                if (previouslyBilled)
                    return Conflict(new { message = "This completed procedure was already linked to another consultation. It cannot be billed again." });
                verifiedCharges.Add((procedure.Description, procedure.EstimatedCost.Value, treatmentProcedureId));
                continue;
            }
            if (charge.ProcedurePriceId is not Guid priceId)
            {
                var matchingIndex = remainingHistorical.FindIndex(c =>
                    c.Description == charge.Description.Trim() && c.Amount == charge.Amount);
                if (matchingIndex < 0)
                    return BadRequest(new { message = "Select each new treatment charge from the practice price list. Manual charge amounts are not accepted." });
                var originalCharge = remainingHistorical[matchingIndex];
                remainingHistorical.RemoveAt(matchingIndex);
                verifiedCharges.Add((charge.Description.Trim(), charge.Amount, originalCharge.TreatmentProcedureId));
                continue;
            }
            var catalogue = await _db.ProcedurePrices.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == priceId &&
                    x.DentalPracticeId == practiceId && x.IsActive, ct);
            if (catalogue is null)
                return Conflict(new { message = "This procedure is not active in the practice price list. Refresh before billing." });
            if (catalogue.Price != charge.Amount)
                return Conflict(new { message = "The approved procedure price changed. Refresh the price list before finalizing." });
            verifiedCharges.Add((catalogue.Name, catalogue.Price, null));
        }
        _db.ConsultationCharges.RemoveRange(previousCharges);
        // Delete prior draft rows before recreating their verified snapshots so
        // the unique clinical-procedure key cannot conflict with itself.
        // The outer transaction still rolls back the whole draft on failure.
        await _db.SaveChangesAsync(ct);
        foreach (var charge in verifiedCharges)
        {
            _db.ConsultationCharges.Add(new ConsultationCharge
            {
                DentalPracticeId = practiceId,
                ConsultationId = consultation.Id,
                TreatmentProcedureId = charge.TreatmentProcedureId,
                Description = charge.Description,
                Amount = charge.Amount
            });
        }

        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        await _audit.WriteAsync("CONSULTATION_DRAFT_SAVED", "Consultation", consultation.Id.ToString(), ct: ct);
        return Ok(new
        {
            consultationId = consultation.Id,
            appointmentId,
            status = "InConsultation",
            amountDue = incoming.Sum(c => c.Amount),
            chargesConfirmed = consultation.ChargesConfirmed
        });
    }

    // POST /api/dentist/consultations/by-appointment/{appointmentId}/finish
    // Updates clinical finalization and the appointment state in ONE transaction.
    [HttpPost("consultations/by-appointment/{appointmentId:guid}/finish")]
    public async Task<IActionResult> FinishConsultation(Guid appointmentId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid dentistId) return Unauthorized();

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        var consultation = await _db.Consultations
            .FirstOrDefaultAsync(c => c.DentalPracticeId == practiceId &&
                                      c.AppointmentId == appointmentId, ct);
        if (consultation is null) return Conflict(new { message = "Save the consultation first." });
        if (consultation.IsFinalized) return Conflict(new { message = "This consultation is already finalized." });
        if (consultation.DentistUserId != dentistId) return Forbid();
        if (string.IsNullOrWhiteSpace(consultation.ChiefComplaint) ||
            string.IsNullOrWhiteSpace(consultation.ExaminationFindings) ||
            string.IsNullOrWhiteSpace(consultation.Diagnosis) ||
            string.IsNullOrWhiteSpace(consultation.TreatmentPerformed))
            return BadRequest(new { message = "Complete the complaint, examination, diagnosis and treatment before finishing." });
        if (!consultation.ChargesConfirmed)
            return BadRequest(new { message = "Confirm the approved treatment charges before finishing." });

        var chargeCount = await _db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.ConsultationId == consultation.Id)
            .CountAsync(ct);
        // A genuine no-charge encounter is possible (e.g. an assessment or review),
        // but an accidental zero-value bill must not silently proceed to reception.
        // Require an explicit no-charge clinical statement; a checkbox alone is insufficient.
        if (chargeCount == 0 &&
            !(consultation.TreatmentPerformed?.Contains("no charge", StringComparison.OrdinalIgnoreCase) == true ||
              consultation.TreatmentPerformed?.Contains("no billable", StringComparison.OrdinalIgnoreCase) == true ||
              consultation.TreatmentPerformed?.Contains("no treatment performed", StringComparison.OrdinalIgnoreCase) == true))
            return Conflict(new { message = "No priced treatment charge was recorded. Add the approved procedure or document 'No charge' with the clinical reason in Treatment performed before finalizing a genuine R0 encounter." });

        // A billed, lab-required treatment cannot be sent to reception before
        // the dentist has recorded its actual linked laboratory prescription.
        // Unrelated future treatment-plan items do not block this visit.
        var chargeDescriptions = await _db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.ConsultationId == consultation.Id)
            .Select(c => c.Description).ToListAsync(ct);
        if (chargeDescriptions.Count > 0)
        {
            var missingPrescription = await (
                from procedure in _db.PatientTreatmentProcedures.AsNoTracking()
                join plan in _db.PatientTreatmentPlans.AsNoTracking()
                    on procedure.TreatmentPlanId equals plan.Id
                where procedure.DentalPracticeId == practiceId &&
                      procedure.PatientId == consultation.PatientId &&
                      procedure.RequiresLab &&
                      procedure.Status != "Cancelled" && procedure.Status != "Declined" &&
                      plan.DentalPracticeId == practiceId &&
                      plan.ConsentRecordedAtUtc != null &&
                      chargeDescriptions.Contains(procedure.Description) &&
                      !_db.Set<LaboratoryOrder>().Any(order =>
                          order.DentalPracticeId == practiceId &&
                          order.PatientId == consultation.PatientId &&
                          order.TreatmentPlanId == plan.Id &&
                          _db.Set<LaboratoryItem>().Any(item =>
                              item.LaboratoryOrderId == order.Id &&
                              item.DentalPracticeId == practiceId &&
                              item.ToothCode == procedure.ToothCode &&
                              item.Procedure == procedure.Description))
                select procedure.Id
            ).AnyAsync(ct);
            if (missingPrescription)
                return Conflict(new { message = "This visit includes a laboratory-required treatment without a linked dentist prescription. Open Laboratory, select the exact approved procedure and tooth, and record the actual lab instructions before finishing the consultation." });
        }

        var changedAt = DateTime.UtcNow;
        var changed = await _db.Appointments
            .Where(a => a.Id == appointmentId &&
                        a.PatientId == consultation.PatientId &&
                        a.DentalPracticeId == practiceId &&
                        a.Status == "InConsultation")
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(a => a.Status, "AwaitingCheckout")
                .SetProperty(a => a.ConsultationEndedAtUtc, (DateTime?)changedAt), ct);

        if (changed != 1)
            return Conflict(new { message = "Appointment is not in consultation or was already completed." });

        consultation.IsFinalized = true;
        consultation.FinalizedAtUtc = changedAt;
        consultation.UpdatedAtUtc = changedAt;
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        await _audit.WriteAsync("CONSULTATION_FINALIZED", "Consultation", consultation.Id.ToString(), ct: ct);
        // The clinical transaction has COMMITTED. Notify Reception in the
        // same practice only; never send private medical notes over the hub.
        try
        {
            await _notifications.Clients.Group(ClinicNotificationsHub.FrontDeskGroup(practiceId))
                .SendAsync("ClinicEvent", new
                {
                    kind = "CheckoutReady",
                    appointmentId,
                    occurredAtUtc = changedAt
                }, ct);
        }
        catch (Exception ex)
        {
            // Notifications are best effort; a failure must not undo treatment.
            _logger.LogWarning(ex, "Checkout push failed for {AppointmentId}", appointmentId);
        }

        return Ok(new { appointmentId, consultationId = consultation.Id,
            status = "AwaitingCheckout", completedAtUtc = changedAt });
    }

    private Task<bool> PatientExists(Guid patientId, Guid practiceId, CancellationToken ct) =>
        _db.Patients.AnyAsync(p => p.Id == patientId &&
                                   p.DentalPracticeId == practiceId && !p.IsArchived, ct);

    private static string? Clean(string? text) =>
        string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
