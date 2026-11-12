using System.Data;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Employee self-service is always bound to the authenticated staff identity.
/// Management actions require PracticeAdmin and verify the target belongs to
/// the current practice. Payslip metadata never creates a payroll payment.
/// </summary>
[ApiController]
[Route("api/employee-workspace")]
[Authorize(Roles = "Receptionist,Dentist,LabTechnician,Finance,PracticeAdmin,Orthodontist")]
public sealed class EmployeeWorkspaceController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public EmployeeWorkspaceController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record LeaveRequest(Guid RequestId, DateOnly StartDate, DateOnly EndDate, string Reason);
    public sealed record AttendanceRequest(Guid RequestId, string Action);
    public sealed record PublishRecordRequest(
        Guid RequestId, Guid EmployeeUserId, string Category, string Title,
        DateOnly? StartDate, DateOnly? EndDate, decimal? Amount, string? DocumentReference,
        string? Notes);
    public sealed record LeaveDecisionRequest(string Decision, string Reason);

    private static DateOnly TodaySa() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Africa/Johannesburg")));

    private static bool ValidRange(DateOnly? start, DateOnly? end) =>
        start is null || end is null || (end >= start && end.Value.DayNumber - start.Value.DayNumber <= 366);

    [HttpGet("me")]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId ||
            _current.UserId is not Guid actorId) return Forbid();

        var me = await _db.Users.AsNoTracking()
            .Where(x => x.Id == actorId && x.DentalPracticeId == practiceId && x.IsActive)
            .Select(x => new { x.Id, x.FullName, x.Email })
            .SingleOrDefaultAsync(ct);
        if (me is null) return Forbid();

        var items = await _db.Set<EmployeeWorkspaceRecord>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.EmployeeUserId == actorId)
            .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
            .Take(300)
            .Select(x => new { x.Id, x.Category, x.Title, x.Status,
                x.StartDate, x.EndDate, x.Amount, x.DocumentReference, x.Notes,
                x.CreatedAtUtc })
            .ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new { employee = me, records = items,
            notice = "Payslip, roster and contract details are available only when management has published verified records. No finance ledger changes originate here." });
    }

    [HttpPost("leave")]
    public async Task<IActionResult> RequestLeave([FromBody] LeaveRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId ||
            _current.UserId is not Guid actorId) return Forbid();
        var reason = request.Reason?.Trim() ?? "";
        if (request.RequestId == Guid.Empty || request.StartDate < TodaySa() ||
            !ValidRange(request.StartDate, request.EndDate) ||
            reason.Length is < 5 or > 1200)
            return BadRequest(new { message = "Enter a valid future leave date range and reason." });

        var existing = await _db.Set<EmployeeWorkspaceRecord>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);
        if (existing is not null)
            return existing.EmployeeUserId == actorId && existing.Category == "Leave" &&
                   existing.StartDate == request.StartDate && existing.EndDate == request.EndDate &&
                   existing.Notes == reason
                ? Ok(new { existing.Id, alreadyRecorded = true })
                : Conflict(new { message = "Request ID was used for another staff record." });

        var record = new EmployeeWorkspaceRecord {
            DentalPracticeId = practiceId, EmployeeUserId = actorId, RequestId = request.RequestId,
            Category = "Leave", Title = "Leave request", Status = "Pending",
            StartDate = request.StartDate, EndDate = request.EndDate,
            Notes = reason, CreatedByUserId = actorId
        };
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.Set<EmployeeWorkspaceRecord>().Add(record);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("EMPLOYEE_LEAVE_REQUESTED",
            "EmployeeWorkspaceRecord", record.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created("/api/employee-workspace/me", new { record.Id, record.Status });
    }

    [HttpPost("attendance")]
    public async Task<IActionResult> RecordAttendance([FromBody] AttendanceRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId ||
            _current.UserId is not Guid actorId) return Forbid();
        var action = request.Action?.Trim();
        if (request.RequestId == Guid.Empty || action is not ("ClockIn" or "ClockOut"))
            return BadRequest(new { message = "Choose ClockIn or ClockOut." });

        await using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var previous = await _db.Set<EmployeeWorkspaceRecord>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);
        if (previous is not null)
            return previous.EmployeeUserId == actorId && previous.Category == "Attendance" &&
                previous.Status == action
                ? Ok(new { previous.Id, alreadyRecorded = true })
                : Conflict(new { message = "Request ID was used for another attendance event." });

        var last = await _db.Set<EmployeeWorkspaceRecord>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.EmployeeUserId == actorId &&
                x.Category == "Attendance")
            .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
            .Select(x => x.Status).FirstOrDefaultAsync(ct);
        if ((action == "ClockOut" && last != "ClockIn") ||
            (action == "ClockIn" && last == "ClockIn"))
            return Conflict(new { message = "Attendance order is invalid. Check the latest recorded event." });

        var now = DateTime.UtcNow;
        var entry = new EmployeeWorkspaceRecord {
            DentalPracticeId = practiceId, EmployeeUserId = actorId, RequestId = request.RequestId,
            Category = "Attendance", Title = action == "ClockIn" ? "Clocked in" : "Clocked out",
            Status = action, StartDate = TodaySa(), CreatedAtUtc = now, CreatedByUserId = actorId
        };
        _db.Set<EmployeeWorkspaceRecord>().Add(entry);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("EMPLOYEE_ATTENDANCE_" + action.ToUpperInvariant(),
            "EmployeeWorkspaceRecord", entry.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created("/api/employee-workspace/me", new { entry.Id, entry.Status, entry.CreatedAtUtc });
    }

    [HttpGet("team")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Team(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var rows = await (
            from record in _db.Set<EmployeeWorkspaceRecord>().AsNoTracking()
            join user in _db.Users.AsNoTracking()
                on record.EmployeeUserId equals user.Id
            where record.DentalPracticeId == practiceId && user.DentalPracticeId == practiceId
            orderby record.CreatedAtUtc descending
            select new { record.Id, record.EmployeeUserId, user.FullName,
                record.Category, record.Title, record.Status,
                record.StartDate, record.EndDate, record.Amount,
                record.DocumentReference, record.Notes, record.CreatedAtUtc }
        ).Take(500).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(rows);
    }

    [HttpPost("publish")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Publish([FromBody] PublishRecordRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId ||
            _current.UserId is not Guid actorId) return Forbid();
        var category = request.Category?.Trim() ?? "";
        var title = request.Title?.Trim() ?? "";
        var reference = request.DocumentReference?.Trim();
        var notes = request.Notes?.Trim();
        if (request.RequestId == Guid.Empty || request.EmployeeUserId == Guid.Empty ||
            category is not ("Roster" or "Payslip" or "Contract") ||
            title.Length is < 3 or > 180 ||
            !ValidRange(request.StartDate, request.EndDate) ||
            request.Amount is < 0m or > 10_000_000m ||
            (request.Amount is not null && decimal.Round(request.Amount.Value, 2) != request.Amount.Value) ||
            reference?.Length > 350 || notes?.Length > 1200 ||
            (category == "Roster" && request.StartDate is null) ||
            (category == "Payslip" && request.Amount is null))
            return BadRequest(new { message = "Check the employee, category, dates, title and published source record." });

        var exists = await _db.Users.AsNoTracking()
            .AnyAsync(x => x.Id == request.EmployeeUserId &&
                x.DentalPracticeId == practiceId && x.IsActive, ct);
        if (!exists) return NotFound();

        var previous = await _db.Set<EmployeeWorkspaceRecord>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);
        if (previous is not null)
            return Conflict(new { message = "This request ID has already been recorded. Do not republish without review." });

        var record = new EmployeeWorkspaceRecord {
            DentalPracticeId = practiceId, EmployeeUserId = request.EmployeeUserId,
            RequestId = request.RequestId, Category = category, Title = title, Status = "Published",
            StartDate = request.StartDate, EndDate = request.EndDate, Amount = request.Amount,
            DocumentReference = reference, Notes = notes, CreatedByUserId = actorId
        };
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.Set<EmployeeWorkspaceRecord>().Add(record);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("EMPLOYEE_PERSONAL_RECORD_PUBLISHED",
            "EmployeeWorkspaceRecord", record.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created("/api/employee-workspace/team", new { record.Id, record.EmployeeUserId, record.Category });
    }

    [HttpPost("leave/{id:guid}/decision")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> DecideLeave(Guid id, [FromBody] LeaveDecisionRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId ||
            _current.UserId is not Guid actorId) return Forbid();
        var decision = request.Decision?.Trim() ?? "";
        var reason = request.Reason?.Trim() ?? "";
        if (decision is not ("Approved" or "Declined") || reason.Length is < 5 or > 1200)
            return BadRequest(new { message = "Choose Approved or Declined and provide a reason." });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var record = await _db.Set<EmployeeWorkspaceRecord>()
            .FromSqlInterpolated($@"SELECT * FROM ""EmployeeWorkspaceRecords""
                WHERE ""Id"" = {id} AND ""DentalPracticeId"" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (record is null || record.Category != "Leave") return NotFound();
        if (record.Status != "Pending")
            return Conflict(new { message = "This leave request has already received a decision." });
        record.Status = decision;
        // The decision reason is in the audit trail; the employee's original reason remains.
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("EMPLOYEE_LEAVE_" + decision.ToUpperInvariant(),
            "EmployeeWorkspaceRecord", record.Id.ToString(), detail: reason, ct: ct);
        await tx.CommitAsync(ct);
        return Ok(new { record.Id, record.Status, decidedByUserId = actorId });
    }
}
