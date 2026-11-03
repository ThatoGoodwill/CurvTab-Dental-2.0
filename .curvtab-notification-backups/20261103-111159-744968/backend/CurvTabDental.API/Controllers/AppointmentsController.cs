
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Only authorised practice staff can access appointments.
// All operations are restricted to the authenticated practice.
[ApiController]
[Route("api/appointments")]
[Authorize(Roles = "PracticeAdmin,Receptionist,Dentist")]
public class AppointmentsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public AppointmentsController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    // Request received when reception books an appointment.
    public record CreateAppointmentRequest(
        Guid PatientId,
        DateTimeOffset StartAt,
        DateTimeOffset EndAt,
        string? Reason
    );

    // Appointment information returned to React.
    public record AppointmentDto(
        Guid Id,
        Guid PatientId,
        string PatientName,
        DateTime StartUtc,
        DateTime EndUtc,
        string Status,
        string? Reason,
        DateTime? CheckedInAtUtc
    );

    // ============================================
    // SHARED APPOINTMENT QUERY
    //
    // IMPORTANT FIX:
    // Filter and sort Appointment entities BEFORE
    // projecting them into AppointmentDto.
    //
    // EF Core cannot reliably translate the old
    // expression that filtered new AppointmentDto(...).
    // ============================================

    private IQueryable<AppointmentDto> PracticeAppointments(
        Guid practiceId,
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        bool queueOnly = false)
    {
        IQueryable<Appointment> appointments = _db
            .Set<Appointment>()
            .AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId);

        if (queueOnly)
        {
            // The queue contains checked-in patients
            // waiting for or attending their consultation.
            appointments = appointments
        .Where(a =>
            a.Status == "Waiting" ||
            a.Status == "Called")
        .OrderBy(a => a.CheckedInAtUtc)
        .Take(200);
        }
        else if (fromUtc.HasValue && toUtc.HasValue)
        {
            var start = fromUtc.Value;
            var end = toUtc.Value;

            // Calendar date filtering happens in SQL.
            appointments = appointments
                .Where(a =>
                    a.StartUtc >= start &&
                    a.StartUtc < end)
                .OrderBy(a => a.StartUtc)
                .Take(500);
        }

        // The join also requires the patient to belong
        // to the same dental practice and not be archived.
        //
        // Projection is LAST, after the SQL filters.
        return
            from a in appointments
            join p in _db.Patients.AsNoTracking()
                on a.PatientId equals p.Id
            where p.DentalPracticeId == practiceId
               && !p.IsArchived
            select new AppointmentDto(
                a.Id,
                a.PatientId,
                p.FirstName + " " + p.LastName,
                a.StartUtc,
                a.EndUtc,
                a.Status,
                a.Reason,
                a.CheckedInAtUtc
            );
    }

    // ============================================
    // GET /api/appointments
    //
    // Returns appointments for a selected date range.
    // Used by the React scheduling calendar.
    // ============================================

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] DateTimeOffset? fromUtc,
        [FromQuery] DateTimeOffset? toUtc,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var from = fromUtc?.UtcDateTime
            ?? DateTime.UtcNow.AddDays(-7);

        var to = toUtc?.UtcDateTime
            ?? DateTime.UtcNow.AddDays(30);

        if (
            to <= from ||
            to - from > TimeSpan.FromDays(93)
        )
        {
            return BadRequest(new
            {
                message = "Select a valid date range up to 93 days."
            });
        }

        // Filtering takes place on the Appointment entity
        // before converting the results into DTOs.
        var rows = await PracticeAppointments(
            practiceId,
            fromUtc: from,
            toUtc: to
        ).ToListAsync(ct);

        return Ok(rows);
    }

    // ============================================
    // GET /api/appointments/queue
    //
    // Returns checked-in patients in the live queue.
    // ============================================

    [HttpGet("queue")]
    public async Task<IActionResult> Queue(
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        // FIX: Status filtering happens before DTO projection.
        var rows = await PracticeAppointments(
            practiceId,
            queueOnly: true
        ).ToListAsync(ct);

        return Ok(rows);
    }

    // ============================================
    // POST /api/appointments
    //
    // Receptionists and PracticeAdmin can book
    // appointments for their own practice's patients.
    // ============================================

    [HttpPost]
    [Authorize(Roles = "PracticeAdmin,Receptionist")]
    public async Task<IActionResult> Create(
        [FromBody] CreateAppointmentRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (request.PatientId == Guid.Empty)
        {
            return BadRequest(new
            {
                message = "Select a patient."
            });
        }

        var start = request.StartAt.UtcDateTime;
        var end = request.EndAt.UtcDateTime;

        if (
            end <= start ||
            end - start > TimeSpan.FromHours(4) ||
            end - start < TimeSpan.FromMinutes(5)
        )
        {
            return BadRequest(new
            {
                message =
                    "Appointment duration must be between 5 minutes and 4 hours."
            });
        }

        if (request.Reason?.Length > 500)
        {
            return BadRequest(new
            {
                message = "Reason must be 500 characters or fewer."
            });
        }

        // Never accept the practice ID from the frontend.
        // Use the authenticated user's current practice.
        var patient = await _db.Patients
            .AsNoTracking()
            .FirstOrDefaultAsync(p =>
                p.Id == request.PatientId &&
                p.DentalPracticeId == practiceId &&
                !p.IsArchived,
                ct);

        if (patient is null)
        {
            return NotFound(new
            {
                message = "Patient not found in this practice."
            });
        }

        var appointment = new Appointment
        {
            DentalPracticeId = practiceId,
            PatientId = request.PatientId,
            StartUtc = start,
            EndUtc = end,
            Reason = request.Reason?.Trim(),
            Status = "Scheduled",
            CreatedByUserId = _current.UserId
        };

        _db.Set<Appointment>().Add(appointment);

        // Save the appointment to PostgreSQL.
        await _db.SaveChangesAsync(ct);

        // Record who created the appointment.
        await _audit.WriteAsync(
            "APPOINTMENT_CREATED",
            "Appointment",
            appointment.Id.ToString(),
            ct: ct
        );

        return Created(
            $"/api/appointments/{appointment.Id}",
            new AppointmentDto(
                appointment.Id,
                appointment.PatientId,
                patient.FirstName + " " + patient.LastName,
                appointment.StartUtc,
                appointment.EndUtc,
                appointment.Status,
                appointment.Reason,
                null
            )
        );
    }

    // ============================================
    // POST /api/appointments/{id}/check-in
    //
    // Reception checks in a scheduled patient.
    // Status changes: Scheduled -> Waiting.
    // ============================================

    [HttpPost("{id:guid}/check-in")]
    [Authorize(Roles = "PracticeAdmin,Receptionist")]
    public async Task<IActionResult> CheckIn(
        Guid id,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        // Atomic SQL update: only a Scheduled visit
        // can be checked in, and only once.
        var updated = await _db.Set<Appointment>()
            .Where(a =>
                a.Id == id &&
                a.DentalPracticeId == practiceId &&
                a.Status == "Scheduled")
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(a => a.Status, "Waiting")
                .SetProperty(
                    a => a.CheckedInAtUtc,
                    (DateTime?)DateTime.UtcNow
                ), ct);

        if (updated == 0)
        {
            return Conflict(new
            {
                message =
                    "Appointment was not found or cannot be checked in."
            });
        }

        await _audit.WriteAsync(
            "PATIENT_CHECKED_IN",
            "Appointment",
            id.ToString(),
            ct: ct
        );

        return NoContent();
    }

    // ============================================
    // POST /api/appointments/{id}/call
    //
    // Only Dentist can call waiting patients.
    // Status changes: Waiting -> Called.
    // ============================================

    [HttpPost("{id:guid}/call")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> CallPatient(
        Guid id,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        // Atomic update prevents two simultaneous calls
        // to the same waiting appointment.
        var updated = await _db.Set<Appointment>()
            .Where(a =>
                a.Id == id &&
                a.DentalPracticeId == practiceId &&
                a.Status == "Waiting")
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(a => a.Status, "Called")
                .SetProperty(
                    a => a.CalledAtUtc,
                    (DateTime?)DateTime.UtcNow
                ), ct);

        if (updated == 0)
        {
            return Conflict(new
            {
                message =
                    "Patient is not waiting or has already been called."
            });
        }

        await _audit.WriteAsync(
            "PATIENT_CALLED",
            "Appointment",
            id.ToString(),
            ct: ct
        );

        return NoContent();
    }
}
