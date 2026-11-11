using System.Text.Json;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Claims activity is strictly operational. No write in this controller
/// creates a Payment, PlanPayment, MedicalAidBankReceipt or financial allocation.
/// </summary>
[ApiController]
[Route("api/billing/medical-aid-day-signoff")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class BillingMedicalAidDaySignoffController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public BillingMedicalAidDaySignoffController(DentalDbContext db,
        ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record SignoffRequest(
        DateOnly BusinessDate,
        bool EncountersAccountedFor,
        bool ResponsesRecorded,
        bool ExceptionsListed,
        bool NoCashReceiptsGenerated);

    private static DateOnly TodaySa() =>
        DateOnly.FromDateTime(DateTime.UtcNow.AddHours(2));

    private static (DateTime Start, DateTime End) DayRange(DateOnly date)
    {
        var start = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue),
            DateTimeKind.Utc).AddHours(-2);
        return (start, start.AddDays(1));
    }

    private async Task<object> Day(Guid practiceId, DateOnly date, CancellationToken ct)
    {
        var saved = await _db.Set<MedicalAidDaySignoff>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId &&
                x.BusinessDate == date, ct);
        if (saved is not null)
        {
            return new
            {
                businessDate = date, signed = true, status = "Signed",
                currency = "ZAR",
                saved.Id, saved.PatientsTreated, saved.UniqueClaims,
                saved.SubmissionAttempts, saved.SubmittedValue,
                saved.ActionsPending, saved.SnapshotJson,
                saved.SignedAtUtc, saved.SignedByUserId,
                note = "Immutable medical-aid claim-activity snapshot. Submitted value is NOT cash received."
            };
        }

        var (start, end) = DayRange(date);
        var events = await _db.Set<MedicalAidClaimEvent>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                x.PerformedAtUtc >= start && x.PerformedAtUtc < end)
            .OrderBy(x => x.PerformedAtUtc).ThenBy(x => x.Id)
            .Select(x => new
            {
                x.Id, x.ClaimId, x.ToStatus, x.FromStatus,
                x.ExternalReference, x.EvidenceReference, x.Reason,
                x.PerformedAtUtc
            }).ToListAsync(ct);

        // Attempts are activity on the day; only FIRST submissions establish
        // original claim value. A later resubmission must never be a new claim.
        var submissions = events.Where(x =>
            x.ToStatus is "SubmittedExternallyReported" or
                "ResubmittedExternallyReported").ToList();
        var originalSubmissions = submissions
            .Where(x => x.ToStatus == "SubmittedExternallyReported").ToList();
        var claimIds = originalSubmissions.Select(x => x.ClaimId).Distinct().ToArray();

        var rows = await (
            from claim in _db.Set<MedicalAidClaim>().AsNoTracking()
            join patient in _db.Patients.AsNoTracking()
                on claim.PatientId equals patient.Id
            join membership in _db.Set<MedicalAidMembership>().AsNoTracking()
                on claim.MembershipId equals membership.Id
            where claim.DentalPracticeId == practiceId &&
                patient.DentalPracticeId == practiceId &&
                membership.DentalPracticeId == practiceId &&
                claimIds.Contains(claim.Id)
            select new
            {
                claim.Id,
                claim.PatientId,
                claim.ClaimNumber,
                claim.ClaimedAmount,
                claim.Status,
                claim.InvoiceId,
                patientName = patient.FirstName + " " + patient.LastName,
                membership.SchemeName
            }).ToListAsync(ct);

        var pending = await _db.Set<MedicalAidClaim>().AsNoTracking()
            .CountAsync(x => x.DentalPracticeId == practiceId &&
                (x.Status == "RejectedReported" ||
                 x.Status == "CorrectionApproved" ||
                 x.Status == "Draft"), ct);

        var treated = await _db.Appointments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                x.StartUtc >= start && x.StartUtc < end &&
                (x.Status == "AwaitingCheckout" || x.Status == "CheckedOut"))
            .Select(x => x.PatientId).Distinct().CountAsync(ct);

        var submittedValue = rows.Sum(x => x.ClaimedAmount);
        var details = rows.OrderBy(x => x.ClaimNumber).Select(x => new
        {
            x.Id, x.PatientId, x.ClaimNumber, x.InvoiceId, x.patientName,
            x.SchemeName, x.Status, x.ClaimedAmount,
            attemptsOnDate = submissions.Count(s => s.ClaimId == x.Id)
        }).ToArray();

        return new
        {
            businessDate = date, signed = false, status = "Open",
            currency = "ZAR",
            patientsTreated = treated,
            uniqueClaims = details.Length,
            submissionAttempts = submissions.Count,
            submittedValue,
            actionsPending = pending,
            claims = details,
            dayEvents = events,
            note = "Unique claims and submitted value reflect original submission events only. Later resubmissions count as activity, never as new claims or receipts."
        };
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (date == default) return BadRequest(new { message = "Select a date." });
        Response.Headers.CacheControl = "private, no-store";
        return Ok(await Day(practiceId, date, ct));
    }

    [HttpPost]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> SignOff([FromBody] SignoffRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        if (request.BusinessDate == default || request.BusinessDate > TodaySa())
            return BadRequest(new { message = "Choose a valid past or current business date." });
        if (!request.EncountersAccountedFor || !request.ResponsesRecorded ||
            !request.ExceptionsListed || !request.NoCashReceiptsGenerated)
            return BadRequest(new { message = "Complete all four pre-sign-off confirmations." });

        await using var tx = await _db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable, ct);

        var existing = await _db.Set<MedicalAidDaySignoff>().AsNoTracking()
            .AnyAsync(x => x.DentalPracticeId == practiceId &&
                x.BusinessDate == request.BusinessDate, ct);
        if (existing)
            return Ok(await Day(practiceId, request.BusinessDate, ct)); // safe retry, never a second snapshot

        // Snapshot the exact computed representation and preserve it regardless
        // of later scheme rejections, corrections or remittance activity.
        var snapshot = await Day(practiceId, request.BusinessDate, ct);
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(snapshot));
        var root = doc.RootElement;
        var signoff = new MedicalAidDaySignoff
        {
            DentalPracticeId = practiceId,
            BusinessDate = request.BusinessDate,
            PatientsTreated = root.GetProperty("patientsTreated").GetInt32(),
            UniqueClaims = root.GetProperty("uniqueClaims").GetInt32(),
            SubmissionAttempts = root.GetProperty("submissionAttempts").GetInt32(),
            SubmittedValue = root.GetProperty("submittedValue").GetDecimal(),
            ActionsPending = root.GetProperty("actionsPending").GetInt32(),
            SnapshotJson = JsonSerializer.Serialize(snapshot),
            SignedByUserId = actorId
        };
        _db.Set<MedicalAidDaySignoff>().Add(signoff);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("MEDICAL_AID_DAILY_ACTIVITY_SIGNED_OFF",
            "MedicalAidDaySignoff", signoff.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Created($"/api/billing/medical-aid-day-signoff?date={request.BusinessDate:yyyy-MM-dd}",
            await Day(practiceId, request.BusinessDate, ct));
    }
}
