#!/usr/bin/env python3
"""CurvTab Dental 2.0: additive Phase 2 clinical backend installer.
Run from repository root: python3 curvtab_phase2_backend.py
No migrations, database or frontend are modified by this script.
"""
from pathlib import Path
from datetime import datetime, timezone
import shutil
import sys

ROOT = Path.cwd()
API = ROOT / 'backend/CurvTabDental.API'
DOMAIN = ROOT / 'backend/CurvTabDental.Domain/Entities'
DB = ROOT / 'backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs'
DENTIST = API / 'Controllers/DentistController.cs'

for path in (DB, DENTIST):
    if not path.is_file():
        sys.exit(f'ERROR: Cannot find {path}. Run from the CurvTab-Dental-2.0 repository root.')

FILES = {}
FILES[DOMAIN / 'Consultation.cs'] = r'''using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// One clinical encounter for an existing appointment.
// Clinical fields are never returned by the front-desk checkout endpoint.
public sealed class Consultation : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid AppointmentId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? DentistUserId { get; set; }

    public string? ChiefComplaint { get; set; }
    public string? Symptoms { get; set; }
    public string? ExaminationFindings { get; set; }
    public string? Diagnosis { get; set; }
    public string? TreatmentPerformed { get; set; }
    public string? TreatmentPlan { get; set; }
    public string? PrescriptionNotes { get; set; }
    public string? FollowUpAdvice { get; set; }

    // Dentist must explicitly confirm the charges, even for a no-charge visit.
    public bool ChargesConfirmed { get; set; }
    public bool IsFinalized { get; set; }
    public DateTime? FinalizedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
'''

FILES[DOMAIN / 'PatientMedicalHistory.cs'] = r'''using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// One editable medical-history summary per patient per practice.
public sealed class PatientMedicalHistory : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public string? Allergies { get; set; }
    public string? CurrentMedications { get; set; }
    public string? MedicalConditions { get; set; }
    public string? DentalHistory { get; set; }
    public string? AdditionalNotes { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? UpdatedByUserId { get; set; }
}
'''

FILES[DOMAIN / 'ConsultationCharge.cs'] = r'''using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Dentist-entered treatment charges; not proof of payment.
public sealed class ConsultationCharge : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid ConsultationId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}
'''

FILES[API / 'Controllers/ConsultationsController.cs'] = r'''using CurvTabDental.Application.Abstractions;
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

    public ConsultationsController(
        DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record MedicalHistoryRequest(
        string? Allergies,
        string? CurrentMedications,
        string? MedicalConditions,
        string? DentalHistory,
        string? AdditionalNotes);

    public record ChargeRequest(string Description, decimal Amount);

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
                .Select(c => new ChargeView(c.Id, c.Description, c.Amount))
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

    private record ChargeView(Guid Id, string Description, decimal Amount);

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
        _db.ConsultationCharges.RemoveRange(previousCharges);
        foreach (var charge in incoming)
        {
            _db.ConsultationCharges.Add(new ConsultationCharge
            {
                DentalPracticeId = practiceId,
                ConsultationId = consultation.Id,
                Description = charge.Description.Trim(),
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
            return BadRequest(new { message = "Confirm the treatment charges, even if the amount is R0.00." });

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
        return Ok(new { appointmentId, consultationId = consultation.Id,
            status = "AwaitingCheckout", completedAtUtc = changedAt });
    }

    private Task<bool> PatientExists(Guid patientId, Guid practiceId, CancellationToken ct) =>
        _db.Patients.AnyAsync(p => p.Id == patientId &&
                                   p.DentalPracticeId == practiceId && !p.IsArchived, ct);

    private static string? Clean(string? text) =>
        string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
'''

FILES[API / 'Controllers/FrontDeskCheckoutController.cs'] = r'''using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Reception receives amounts and statuses, never confidential clinical notes.
[ApiController]
[Route("api/frontdesk")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class FrontDeskCheckoutController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public FrontDeskCheckoutController(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    // GET /api/frontdesk/checkout-ready
    // Read-only preview. Actual payments / receipts come in the checkout phase.
    [HttpGet("checkout-ready")]
    public async Task<IActionResult> CheckoutReady(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        var appointments = _db.Appointments.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId &&
                        a.Status == "AwaitingCheckout")
            .OrderBy(a => a.ConsultationEndedAtUtc)
            .Take(100);

        var waiting = await (
            from a in appointments
            join p in _db.Patients.AsNoTracking() on a.PatientId equals p.Id
            where p.DentalPracticeId == practiceId
            select new { appointmentId = a.Id, patientId = p.Id,
                patientName = p.FirstName + " " + p.LastName,
                completedAtUtc = a.ConsultationEndedAtUtc }
        ).ToListAsync(ct);

        var appointmentIds = waiting.Select(x => x.appointmentId).ToList();
        var consultations = await _db.Consultations.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.IsFinalized &&
                        appointmentIds.Contains(c.AppointmentId))
            .Select(c => new { c.Id, c.AppointmentId })
            .ToListAsync(ct);
        var consultationIds = consultations.Select(c => c.Id).ToList();
        var charges = await _db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId &&
                        consultationIds.Contains(c.ConsultationId))
            .Select(c => new { c.ConsultationId, c.Amount })
            .ToListAsync(ct);
        var totals = charges.GroupBy(c => c.ConsultationId)
            .ToDictionary(g => g.Key, g => g.Sum(c => c.Amount));
        var consultationByAppointment = consultations
            .ToDictionary(c => c.AppointmentId, c => c.Id);

        return Ok(waiting
            .Where(v => consultationByAppointment.ContainsKey(v.appointmentId))
            .Select(v => new
            {
                v.appointmentId,
                v.patientId,
                v.patientName,
                status = "AwaitingCheckout",
                v.completedAtUtc,
                amountDue = totals.GetValueOrDefault(
                    consultationByAppointment[v.appointmentId], 0m),
                currency = "ZAR"
            })
            .ToList());
    }
}
'''

# Locate exactly one existing appointment model section and insert new EF models just
# before the pre-existing Patient configuration. Avoid rewriting patient/Identity tables.
db_original = DB.read_text(encoding='utf-8')
dentist_original = DENTIST.read_text(encoding='utf-8')

if 'DbSet<Consultation> Consultations' in db_original:
    sys.exit('ERROR: Phase 2 appears already installed in DentalDbContext.cs. No files changed.')
if '[HttpPost("appointments/{id:guid}/start-consultation")]' not in dentist_original:
    sys.exit('ERROR: DentistController.cs start endpoint not found. No files changed.')

DB_SETS_ANCHOR = '    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();'
DB_SETS_PATCH = '''    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<Consultation> Consultations => Set<Consultation>();
    public DbSet<PatientMedicalHistory> PatientMedicalHistories => Set<PatientMedicalHistory>();
    public DbSet<ConsultationCharge> ConsultationCharges => Set<ConsultationCharge>();'''

DB_CONFIG_ANCHOR = '        modelBuilder.Entity<Patient>(entity =>'
DB_CONFIG_PATCH = r'''        // Phase 2: confidential clinical encounter, one per appointment.
        modelBuilder.Entity<Consultation>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasQueryFilter(c => c.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(c => new { c.DentalPracticeId, c.AppointmentId }).IsUnique();
            entity.HasIndex(c => new { c.DentalPracticeId, c.PatientId });
            entity.HasOne<Appointment>().WithMany().HasForeignKey(c => c.AppointmentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Patient>().WithMany().HasForeignKey(c => c.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(c => c.ChiefComplaint).HasMaxLength(6000);
            entity.Property(c => c.Symptoms).HasMaxLength(6000);
            entity.Property(c => c.ExaminationFindings).HasMaxLength(6000);
            entity.Property(c => c.Diagnosis).HasMaxLength(6000);
            entity.Property(c => c.TreatmentPerformed).HasMaxLength(6000);
            entity.Property(c => c.TreatmentPlan).HasMaxLength(6000);
            entity.Property(c => c.PrescriptionNotes).HasMaxLength(6000);
            entity.Property(c => c.FollowUpAdvice).HasMaxLength(6000);
        });

        modelBuilder.Entity<PatientMedicalHistory>(entity =>
        {
            entity.HasKey(h => h.Id);
            entity.HasQueryFilter(h => h.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(h => new { h.DentalPracticeId, h.PatientId }).IsUnique();
            entity.HasOne<Patient>().WithMany().HasForeignKey(h => h.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(h => h.Allergies).HasMaxLength(4000);
            entity.Property(h => h.CurrentMedications).HasMaxLength(4000);
            entity.Property(h => h.MedicalConditions).HasMaxLength(4000);
            entity.Property(h => h.DentalHistory).HasMaxLength(4000);
            entity.Property(h => h.AdditionalNotes).HasMaxLength(4000);
        });

        // Charges are what the Dentist asks reception to collect, not payments.
        modelBuilder.Entity<ConsultationCharge>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasQueryFilter(c => c.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(c => new { c.DentalPracticeId, c.ConsultationId });
            entity.HasOne<Consultation>().WithMany().HasForeignKey(c => c.ConsultationId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(c => c.Description).IsRequired().HasMaxLength(200);
            entity.Property(c => c.Amount).HasPrecision(12, 2);
        });

        modelBuilder.Entity<Patient>(entity =>'''

# Keep existing Start Consultation endpoint path and return shape, but insert
# a matching Consultation row in the SAME transaction as the status transition.
START_ANCHOR = '        var startedAt = DateTime.UtcNow;'
START_PATCH = '''        var startedAt = DateTime.UtcNow;

        var patientId = await _db.Appointments.AsNoTracking()
            .Where(a => a.Id == id && a.DentalPracticeId == practiceId &&
                        a.Status == "Called")
            .Select(a => (Guid?)a.PatientId)
            .FirstOrDefaultAsync(ct);
        if (patientId is null)
            return Conflict(new { message = "Appointment must be Called before consultation can start." });

        // Either both the status and the consultation are saved, or neither is.
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);'''

AUDIT_ANCHOR = '''        await _audit.WriteAsync(
            "CONSULTATION_STARTED",'''
AUDIT_PATCH = '''        _db.Consultations.Add(new Consultation
        {
            DentalPracticeId = practiceId,
            AppointmentId = id,
            PatientId = patientId.Value,
            DentistUserId = _current.UserId
        });
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        await _audit.WriteAsync(
            "CONSULTATION_STARTED",'''


def replace_once(source, old, new, name):
    count = source.count(old)
    if count != 1:
        sys.exit(f'ERROR: Expected one {name} anchor, found {count}. No files changed.')
    return source.replace(old, new, 1)

# Validate every anchor and target before making ANY changes.
db_new = replace_once(db_original, DB_SETS_ANCHOR, DB_SETS_PATCH, 'DbSet')
db_new = replace_once(db_new, DB_CONFIG_ANCHOR, DB_CONFIG_PATCH, 'Patient configuration')
dentist_new = replace_once(dentist_original, START_ANCHOR, START_PATCH, 'StartConsultation time')
dentist_new = replace_once(dentist_new, AUDIT_ANCHOR, AUDIT_PATCH, 'StartConsultation audit')

existing = [p for p in FILES if p.exists()]
if existing:
    sys.exit('ERROR: Refusing to overwrite existing files: ' + ', '.join(map(str, existing)))

backup = ROOT / '.phase2_backups' / datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(DB, backup / 'DentalDbContext.cs')
shutil.copy2(DENTIST, backup / 'DentistController.cs')

for path, contents in FILES.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding='utf-8')
DB.write_text(db_new, encoding='utf-8')
DENTIST.write_text(dentist_new, encoding='utf-8')
print('Phase 2 backend source files installed. No database changes made yet.')
print(f'Backups: {backup}')
print('NEXT: dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj')
print('Then create and apply ONE additive EF migration after PostgreSQL is healthy.')
