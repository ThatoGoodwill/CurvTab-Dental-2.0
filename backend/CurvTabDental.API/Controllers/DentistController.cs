
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/dentist")]
[Authorize(Roles = "Dentist")]
public class DentistController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public DentistController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    // ========================================
    // START CONSULTATION
    // POST /api/dentist/appointments/{id}/start-consultation
    //
    // Called -> InConsultation
    // ========================================

    [HttpPost("appointments/{id:guid}/start-consultation")]
    public async Task<IActionResult> StartConsultation(
        Guid id,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var startedAt = DateTime.UtcNow;

        var patientId = await _db.Appointments.AsNoTracking()
            .Where(a => a.Id == id && a.DentalPracticeId == practiceId &&
                        a.Status == "Called")
            .Select(a => (Guid?)a.PatientId)
            .FirstOrDefaultAsync(ct);
        if (patientId is null)
            return Conflict(new { message = "Appointment must be Called before consultation can start." });

        // Either both the status and the consultation are saved, or neither is.
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        // Atomic update ensures that only an appointment
        // belonging to this practice with status "Called"
        // can enter consultation.
        var updated = await _db.Set<Appointment>()
            .Where(a =>
                a.Id == id &&
                a.DentalPracticeId == practiceId &&
                a.Status == "Called")
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(
                    a => a.Status,
                    "InConsultation"
                )
                .SetProperty(
                    a => a.ConsultationStartedAtUtc,
                    (DateTime?)startedAt
                ), ct);

        if (updated == 0)
        {
            return Conflict(new
            {
                message =
                    "Appointment must be Called before consultation can start."
            });
        }

        _db.Consultations.Add(new Consultation
        {
            DentalPracticeId = practiceId,
            AppointmentId = id,
            PatientId = patientId.Value,
            DentistUserId = _current.UserId
        });
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        await _audit.WriteAsync(
            "CONSULTATION_STARTED",
            "Appointment",
            id.ToString(),
            ct: ct
        );

        return Ok(new
        {
            id,
            status = "InConsultation",
            consultationStartedAtUtc = startedAt
        });
    }

    // ========================================
    // DAILY PATIENTS
    // GET /api/dentist/daily-patients
    //
    // Lists patients whose consultations started
    // inside the selected date range.
    // ========================================

    [HttpGet("daily-patients")]
    public async Task<IActionResult> DailyPatients(
        [FromQuery] DateTimeOffset fromUtc,
        [FromQuery] DateTimeOffset toUtc,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (!ValidDateRange(fromUtc, toUtc))
        {
            return BadRequest(new
            {
                message = "Select a valid date range up to 31 days."
            });
        }

        var from = fromUtc.UtcDateTime;
        var to = toUtc.UtcDateTime;

        // Filter Appointment entities before DTO projection.
        // This avoids the previous EF Core translation error.
        var appointments = _db.Set<Appointment>()
            .AsNoTracking()
            .Where(a =>
                a.DentalPracticeId == practiceId &&
                a.ConsultationStartedAtUtc.HasValue &&
                a.ConsultationStartedAtUtc >= from &&
                a.ConsultationStartedAtUtc < to)
            .OrderByDescending(a =>
                a.ConsultationStartedAtUtc)
            .Take(500);

        var patients = await (
            from a in appointments
            join p in _db.Patients.AsNoTracking()
                on a.PatientId equals p.Id
            where p.DentalPracticeId == practiceId &&
                !_db.OrthodonticIntakes.Any(i => i.PatientId == p.Id &&
                    i.DentalPracticeId == practiceId && i.ClosedAtUtc == null &&
                    i.ReferralAuthorUserId != _current.UserId)
            select new
            {
                appointmentId = a.Id,
                patientId = p.Id,
                patientName =
                    p.FirstName + " " + p.LastName,
                appointmentStartUtc = a.StartUtc,
                consultationStartedAtUtc =
                    a.ConsultationStartedAtUtc,
                consultationEndedAtUtc =
                    a.ConsultationEndedAtUtc,
                status = a.Status,
                reason = a.Reason
            }
        ).ToListAsync(ct);

        return Ok(patients);
    }

    // ========================================
    // DENTIST DASHBOARD
    // GET /api/dentist/dashboard
    //
    // Provides live statistics for the selected
    // local day, converted to UTC by the frontend.
    // ========================================

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(
        [FromQuery] DateTimeOffset fromUtc,
        [FromQuery] DateTimeOffset toUtc,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (!ValidDateRange(fromUtc, toUtc))
        {
            return BadRequest(new
            {
                message = "Select a valid date range up to 31 days."
            });
        }

        var from = fromUtc.UtcDateTime;
        var to = toUtc.UtcDateTime;

        var appointments = _db.Set<Appointment>()
            .AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId);

        // Count appointments scheduled for this date.
        var scheduled = await appointments.CountAsync(
            a => a.Status == "Scheduled" &&
                 a.StartUtc >= from &&
                 a.StartUtc < to,
            ct);

        // Patients checked in and still waiting.
        var waiting = await appointments.CountAsync(
            a => a.Status == "Waiting" &&
                 a.CheckedInAtUtc >= from &&
                 a.CheckedInAtUtc < to,
            ct);

        // Patients called but not yet in consultation.
        var called = await appointments.CountAsync(
            a => a.Status == "Called" &&
                 a.CalledAtUtc >= from &&
                 a.CalledAtUtc < to,
            ct);

        // Consultations currently running.
        var inConsultation = await appointments.CountAsync(
            a => a.Status == "InConsultation" &&
                 a.ConsultationStartedAtUtc >= from &&
                 a.ConsultationStartedAtUtc < to,
            ct);

        // All consultations started during this date.
        // Includes visits later completed or checked out.
        var attendedToday = await appointments.CountAsync(
            a => a.ConsultationStartedAtUtc >= from &&
                 a.ConsultationStartedAtUtc < to,
            ct);

        return Ok(new
        {
            scheduled,
            waiting,
            called,
            inConsultation,
            attendedToday
        });
    }

    private static bool ValidDateRange(
        DateTimeOffset from,
        DateTimeOffset to)
    {
        return from != default &&
               to != default &&
               to > from &&
               to - from <= TimeSpan.FromDays(31);
    }
}
