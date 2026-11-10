using System.Text.Json;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Billing shares the existing receipts and expenses ledger. A claim event is NEVER a receipt.
/// Independent cash-count and medical-aid snapshots have different permissions and tables.
/// </summary>
[ApiController]
[Route("api/billing")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class BillingDailyController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public BillingDailyController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    { _db = db; _current = current; _audit = audit; }

    public sealed record Denomination(decimal Value, int Quantity);
    public sealed record CashCountRequest(Guid RequestId, DateOnly BusinessDate,
        decimal OpeningFloat, List<Denomination> Denominations);
    public sealed record CashEventRequest(Guid RequestId, string Action,
        string Notes, string EvidenceReference);
    public sealed record MedicalSignoffRequest(Guid RequestId, DateOnly BusinessDate,
        bool EncountersAccountedFor, bool ResponsesRecorded,
        bool ExceptionsListed, bool NoCashPostedForClaims, string? Notes);

    private static DateOnly TodaySA() =>
        DateOnly.FromDateTime(DateTime.UtcNow.AddHours(2));

    private static (DateTime Start, DateTime End) UtcRange(DateOnly date)
    {
        var start = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue),
            DateTimeKind.Utc).AddHours(-2);
        return (start, start.AddDays(1));
    }

    private static bool Money(decimal value) =>
        value >= 0m && value <= 10000000m && decimal.Round(value, 2) == value;

    private static readonly decimal[] CashDenominations =
        { 200m, 100m, 50m, 20m, 10m, 5m, 2m, 1m, .50m, .20m, .10m, .05m };

    private sealed record Totals(
        decimal CashReceipts, decimal CardReceipts, decimal EftReceipts,
        decimal SchemeDeposits, decimal CashExpenses, decimal CardExpenses,
        decimal EftExpenses, decimal CashRefunds, decimal CardRefunds,
        decimal EftRefunds, int ReceiptCount, int ExpenseCount, int RefundCount,
        int LaboratoryCashExpenses)
    {
        public decimal ActualReceived =>
            CashReceipts + CardReceipts + EftReceipts + SchemeDeposits;
        public decimal ActualPayouts =>
            CashExpenses + CardExpenses + EftExpenses +
            CashRefunds + CardRefunds + EftRefunds;
    }

    private async Task<Totals> ReadTotals(Guid practiceId, DateOnly date,
        CancellationToken ct)
    {
        var (start, end) = UtcRange(date);
        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId &&
                p.ReceivedAtUtc >= start && p.ReceivedAtUtc < end)
            .GroupBy(p => p.Method)
            .Select(g => new { Method = g.Key, Amount = g.Sum(p => p.Amount), Count = g.Count() })
            .ToListAsync(ct);
        var planPayments = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId &&
                p.ReceivedAtUtc >= start && p.ReceivedAtUtc < end)
            .GroupBy(p => p.Method)
            .Select(g => new { Method = g.Key, Amount = g.Sum(p => p.Amount), Count = g.Count() })
            .ToListAsync(ct);
        var expenses = await _db.Set<PracticeExpense>().AsNoTracking()
            .Where(e => e.DentalPracticeId == practiceId && e.ExpenseDate == date)
            .GroupBy(e => e.Method)
            .Select(g => new { Method = g.Key, Amount = g.Sum(e => e.Amount), Count = g.Count() })
            .ToListAsync(ct);
        var refunds = await _db.Set<BillingPaymentRefund>().AsNoTracking()
            .Where(e => e.DentalPracticeId == practiceId && e.RefundedOn == date)
            .GroupBy(e => e.Method)
            .Select(g => new { Method = g.Key, Amount = g.Sum(e => e.Amount), Count = g.Count() })
            .ToListAsync(ct);
        var schemeDeposits = await _db.Set<MedicalAidBankReceipt>().AsNoTracking()
            .Where(e => e.DentalPracticeId == practiceId && e.ReceivedOn == date)
            .SumAsync(e => (decimal?)e.Amount, ct) ?? 0m;
        var labCount = await _db.Set<PracticeExpense>().AsNoTracking()
            .CountAsync(e => e.DentalPracticeId == practiceId && e.ExpenseDate == date &&
                e.Method == "Cash" && e.Category == "Laboratory", ct);
        decimal receipts(string method) =>
            payments.Where(e => e.Method == method).Sum(e => e.Amount) +
            planPayments.Where(e => e.Method == method).Sum(e => e.Amount);
        decimal outflow(string method) => expenses.Where(e => e.Method == method).Sum(e => e.Amount);
        decimal refunded(string method) => refunds.Where(e => e.Method == method).Sum(e => e.Amount);
        return new Totals(
            receipts("Cash"), receipts("Card"), receipts("EFT"),
            schemeDeposits, outflow("Cash"), outflow("Card"), outflow("EFT"),
            refunded("Cash"), refunded("Card"), refunded("EFT"),
            payments.Sum(x => x.Count) + planPayments.Sum(x => x.Count),
            expenses.Sum(x => x.Count), refunds.Sum(x => x.Count), labCount);
    }

    private sealed record ClaimDay(
        Guid ClaimId, Guid PatientId, string ClaimNumber, string PatientName,
        string SchemeName, decimal Amount, string Status, Guid AttemptId,
        DateTime SubmittedAtUtc, string? ExternalReference);

    private async Task<(List<ClaimDay> Rows, int PatientsTreated, int Pending)>
        ReadClaimDay(Guid practiceId, DateOnly date, CancellationToken ct)
    {
        var (start, end) = UtcRange(date);
        var rows = await (
            from ev in _db.Set<MedicalAidClaimEvent>().AsNoTracking()
            join claim in _db.Set<MedicalAidClaim>().AsNoTracking()
                on ev.ClaimId equals claim.Id
            join patient in _db.Patients.AsNoTracking()
                on claim.PatientId equals patient.Id
            join member in _db.Set<MedicalAidMembership>().AsNoTracking()
                on claim.MembershipId equals member.Id
            where ev.DentalPracticeId == practiceId &&
                  claim.DentalPracticeId == practiceId &&
                  patient.DentalPracticeId == practiceId &&
                  member.DentalPracticeId == practiceId &&
                  ev.ToStatus == "SubmittedExternallyReported" &&
                  ev.PerformedAtUtc >= start && ev.PerformedAtUtc < end
            orderby ev.PerformedAtUtc
            select new ClaimDay(claim.Id, claim.PatientId, claim.ClaimNumber,
                patient.FirstName + " " + patient.LastName, member.SchemeName,
                claim.ClaimedAmount, claim.Status, ev.Id, ev.PerformedAtUtc,
                ev.ExternalReference)
        ).Take(2000).ToListAsync(ct);
        var patientsTreated = await _db.Consultations.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId &&
                c.FinalizedAtUtc != null &&
                c.FinalizedAtUtc >= start && c.FinalizedAtUtc < end)
            .Select(c => c.PatientId).Distinct().CountAsync(ct);
        var pending = await _db.Set<MedicalAidClaim>().AsNoTracking()
            .CountAsync(c => c.DentalPracticeId == practiceId &&
                (c.Status == "RejectedReported" ||
                 c.Status == "CorrectedPendingResubmission" ||
                 (c.Status == "Draft" && c.CreatedAtUtc >= start && c.CreatedAtUtc < end)), ct);
        return (rows, patientsTreated, pending);
    }

    private static object DescribeClaims(List<ClaimDay> rows, int patientsTreated,
        int pending)
    {
        var distinct = rows.GroupBy(x => x.ClaimId)
            .Select(g => g.OrderBy(x => x.SubmittedAtUtc).First()).ToList();
        return new {
            patientsTreated, uniqueClaims = distinct.Count,
            submissionAttempts = rows.Count, submittedValue = distinct.Sum(x => x.Amount),
            actionsPending = pending, submittedClaims = rows,
            note = "Claims are activity only. No cash, card, EFT or bank receipt is posted."
        };
    }

    [HttpGet("daily")]
    public async Task<IActionResult> Daily([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (date == default) return BadRequest(new { message = "Business date is required." });
        var totals = await ReadTotals(id, date, ct);
        var claims = await ReadClaimDay(id, date, ct);
        var cashCount = await _db.Set<BillingCashCount>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.BusinessDate == date)
            .OrderByDescending(x => x.Revision).Select(x => new {
                x.Id, x.Revision, x.SubmittedAtUtc, x.CountedCash, x.Variance
            }).FirstOrDefaultAsync(ct);
        var medical = await _db.Set<BillingMedicalAidDaySignoff>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.BusinessDate == date)
            .Select(x => new { x.Id, x.SignedAtUtc, x.UniqueClaims, x.SubmittedValue })
            .FirstOrDefaultAsync(ct);
        var expenseRows = await _db.Set<PracticeExpense>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.ExpenseDate == date)
            .OrderByDescending(x => x.RecordedAtUtc).Take(100)
            .Select(x => new {
                x.Id, x.Category, x.Description, x.Method, x.Amount,
                x.Reference, x.RecordedAtUtc, x.RecordedByUserId
            }).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new {
            businessDate = date, currency = "ZAR",
            actualReceipts = totals.ActualReceived, actualPayouts = totals.ActualPayouts,
            cashReceived = totals.CashReceipts, cardReceived = totals.CardReceipts,
            eftReceived = totals.EftReceipts, schemeBankDeposits = totals.SchemeDeposits,
            cashExpenses = totals.CashExpenses, nonCashExpenses = totals.CardExpenses + totals.EftExpenses,
            refunds = totals.CashRefunds + totals.CardRefunds + totals.EftRefunds,
            netActualMovements = totals.ActualReceived - totals.ActualPayouts,
            claimsSubmittedValue = ((dynamic)DescribeClaims(claims.Rows, claims.PatientsTreated, claims.Pending)).submittedValue,
            claimActivity = DescribeClaims(claims.Rows, claims.PatientsTreated, claims.Pending),
            expenses = expenseRows, cashDayClose = cashCount, medicalAidDaySignoff = medical,
            note = "Medical aid claims submitted are excluded from all money figures; scheme deposits are counted on receipt date."
        });
    }

    [HttpGet("cash-day-close")]
    public async Task<IActionResult> CashDay([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (date == default) return BadRequest();
        var totals = await ReadTotals(id, date, ct);
        var counts = await _db.Set<BillingCashCount>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.BusinessDate == date)
            .OrderByDescending(x => x.Revision).ToListAsync(ct);
        var countIds = counts.Select(x => x.Id).ToArray();
        var events = await _db.Set<BillingCashCountEvent>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && countIds.Contains(x.CashCountId))
            .OrderBy(x => x.AtUtc).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new {
            businessDate = date, actualCashReceipts = totals.CashReceipts,
            cashExpenses = totals.CashExpenses, cashRefunds = totals.CashRefunds,
            cardReceipts = totals.CardReceipts, eftReceipts = totals.EftReceipts,
            schemeBankDeposits = totals.SchemeDeposits,
            cardExpenses = totals.CardExpenses, eftExpenses = totals.EftExpenses,
            labPayoutsAlreadyRecordedAsExpenses = totals.LaboratoryCashExpenses,
            counts, events,
            note = "The expected drawer cash and variance are only returned after the blind count is submitted. Laboratory expenses already recorded in Finances are not counted twice."
        });
    }

    [HttpPost("cash-day-close/count")]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> SubmitBlindCount([FromBody] CashCountRequest req,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        if (req.RequestId == Guid.Empty || req.BusinessDate == default ||
            req.BusinessDate > TodaySA() || !Money(req.OpeningFloat) ||
            req.Denominations is null || req.Denominations.Count is < 1 or > 12 ||
            req.Denominations.Select(x => x.Value).Distinct().Count() != req.Denominations.Count ||
            req.Denominations.Any(x => !CashDenominations.Contains(x.Value) ||
                x.Quantity < 0 || x.Quantity > 100000))
            return BadRequest(new { message = "Provide a date, opening float and a valid denomination count." });
        var counted = req.Denominations.Sum(x => x.Value * x.Quantity);
        if (!Money(counted)) return BadRequest(new { message = "Counted cash exceeds the permitted amount." });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        // Serialize revisions and idempotency against concurrent reception submissions.
        var practice = await _db.DentalPractices
            .FromSqlInterpolated($"SELECT * FROM \"DentalPractices\" WHERE \"Id\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (practice is null) return NotFound();
        var priorRequest = await _db.Set<BillingCashCount>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.DentalPracticeId == id && x.RequestId == req.RequestId, ct);
        if (priorRequest != null)
            return Ok(new { priorRequest.Id, priorRequest.Revision, priorRequest.CountedCash,
                priorRequest.ExpectedCash, priorRequest.Variance, alreadyRecorded = true });
        var latest = await _db.Set<BillingCashCount>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.BusinessDate == req.BusinessDate)
            .OrderByDescending(x => x.Revision).FirstOrDefaultAsync(ct);
        if (latest != null)
        {
            var reviewed = await _db.Set<BillingCashCountEvent>().AsNoTracking()
                .Where(x => x.CashCountId == latest.Id &&
                    (x.Action == "Approved" || x.Action == "Rejected" || x.Action == "Escalated"))
                .OrderByDescending(x => x.AtUtc).FirstOrDefaultAsync(ct);
            if (reviewed?.Action != "Rejected")
                return Conflict(new { message = "The existing blind count is awaiting review or already closed. Only a rejected count can be recounted without overwriting history." });
        }
        var totals = await ReadTotals(id, req.BusinessDate, ct);
        var expected = req.OpeningFloat + totals.CashReceipts - totals.CashExpenses - totals.CashRefunds;
        var count = new BillingCashCount {
            DentalPracticeId = id, RequestId = req.RequestId,
            BusinessDate = req.BusinessDate, Revision = (latest?.Revision ?? 0) + 1,
            OpeningFloat = req.OpeningFloat, CashReceipts = totals.CashReceipts,
            CashExpenses = totals.CashExpenses, CashRefunds = totals.CashRefunds,
            ExpectedCash = expected, CountedCash = counted,
            Variance = counted - expected,
            DenominationsJson = JsonSerializer.Serialize(req.Denominations),
            SubmittedByUserId = actor
        };
        _db.Set<BillingCashCount>().Add(count);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("BLIND_CASH_COUNT_SUBMITTED", "BillingCashCount", count.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created($"/api/billing/cash-day-close?date={req.BusinessDate:yyyy-MM-dd}",
            new { count.Id, count.Revision, count.CountedCash, count.ExpectedCash,
                count.Variance, count.SubmittedAtUtc,
                status = "SubmittedForManagerReview" });
    }

    [HttpPost("cash-day-close/{countId:guid}/event")]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> CashEvent(Guid countId,
        [FromBody] CashEventRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        var action = req.Action?.Trim() ?? "";
        var notes = req.Notes?.Trim() ?? "";
        var evidence = req.EvidenceReference?.Trim() ?? "";
        if (req.RequestId == Guid.Empty || notes.Length is < 5 or > 1500 ||
            evidence.Length > 300 || !new[] { "Explanation", "Approved", "Rejected", "Escalated" }.Contains(action))
            return BadRequest(new { message = "Invalid review action, reason or evidence." });
        if (action != "Explanation" && _current is not null && !User.IsInRole("PracticeAdmin"))
            return Forbid();
        if (action != "Explanation" && evidence.Length < 3 && action != "Approved")
            return BadRequest(new { message = "Rejection or escalation needs evidence." });
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var count = await _db.Set<BillingCashCount>()
            .FromSqlInterpolated($"SELECT * FROM \"BillingCashCounts\" WHERE \"Id\" = {countId} AND \"DentalPracticeId\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (count is null) return NotFound();
        var previousRequest = await _db.Set<BillingCashCountEvent>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == id && x.RequestId == req.RequestId, ct);
        if (previousRequest != null)
            return previousRequest.CashCountId == countId && previousRequest.Action == action
                ? Ok(new { previousRequest.Id, alreadyRecorded = true }) : Conflict();
        var reviewed = await _db.Set<BillingCashCountEvent>().AsNoTracking()
            .AnyAsync(x => x.CashCountId == countId &&
                (x.Action == "Approved" || x.Action == "Rejected" || x.Action == "Escalated"), ct);
        if (reviewed) return Conflict(new { message = "This count was already reviewed. History cannot be rewritten." });
        if (action == "Explanation" && count.SubmittedByUserId != actor &&
            !User.IsInRole("PracticeAdmin")) return Forbid();
        if (action != "Explanation" && count.Variance != 0m &&
            !await _db.Set<BillingCashCountEvent>().AsNoTracking().AnyAsync(
                x => x.CashCountId == countId && x.Action == "Explanation", ct))
            return Conflict(new { message = "Require a separate documented explanation before reviewing a cash variance." });
        var evt = new BillingCashCountEvent {
            DentalPracticeId = id, CashCountId = countId, RequestId = req.RequestId,
            Action = action, Notes = notes, EvidenceReference = evidence, ActorUserId = actor
        };
        _db.Set<BillingCashCountEvent>().Add(evt);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("CASH_COUNT_" + action.ToUpperInvariant(), "BillingCashCountEvent", evt.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Ok(new { evt.Id, evt.Action, evt.AtUtc });
    }

    [HttpGet("medical-aid-day")]
    public async Task<IActionResult> MedicalDay([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (date == default) return BadRequest();
        var (rows, treated, pending) = await ReadClaimDay(id, date, ct);
        var signed = await _db.Set<BillingMedicalAidDaySignoff>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.DentalPracticeId == id && x.BusinessDate == date, ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new { businessDate = date, activity = DescribeClaims(rows, treated, pending),
            signed = signed is null ? null : new {
                signed.Id, signed.BusinessDate, signed.SignedByUserId, signed.SignedAtUtc,
                signed.UniqueClaims, signed.SubmissionAttempts, signed.SubmittedValue,
                signed.ActionPending, signed.SnapshotJson, signed.Notes
            } });
    }

    [HttpPost("medical-aid-day/signoff")]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> SignMedicalAidDay(
        [FromBody] MedicalSignoffRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        if (req.RequestId == Guid.Empty || req.BusinessDate == default ||
            req.BusinessDate > TodaySA() || !req.EncountersAccountedFor ||
            !req.ResponsesRecorded || !req.ExceptionsListed || !req.NoCashPostedForClaims ||
            (req.Notes?.Length ?? 0) > 1500)
            return BadRequest(new { message = "Complete the four independent medical-aid checklist attestations." });
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var practice = await _db.DentalPractices
            .FromSqlInterpolated($"SELECT * FROM \"DentalPractices\" WHERE \"Id\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (practice is null) return NotFound();
        var previous = await _db.Set<BillingMedicalAidDaySignoff>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == id && x.BusinessDate == req.BusinessDate, ct);
        if (previous != null)
            return previous.RequestId == req.RequestId
                ? Ok(new { previous.Id, alreadySigned = true })
                : Conflict(new { message = "Medical aid activity was already signed for this day; the snapshot remains immutable." });
        var (rows, treated, pending) = await ReadClaimDay(id, req.BusinessDate, ct);
        var unique = rows.GroupBy(x => x.ClaimId)
            .Select(g => g.OrderBy(x => x.SubmittedAtUtc).First()).ToList();
        if (pending > 0 && string.IsNullOrWhiteSpace(req.Notes))
            return BadRequest(new { message = "Document how outstanding claim exceptions will be followed up." });
        var signoff = new BillingMedicalAidDaySignoff {
            DentalPracticeId = id, RequestId = req.RequestId,
            BusinessDate = req.BusinessDate, PatientsTreated = treated,
            UniqueClaims = unique.Count, SubmissionAttempts = rows.Count,
            SubmittedValue = unique.Sum(x => x.Amount), ActionPending = pending,
            SnapshotJson = JsonSerializer.Serialize(new {
                signedOn = req.BusinessDate, submittedClaims = rows,
                checklist = new { req.EncountersAccountedFor, req.ResponsesRecorded,
                    req.ExceptionsListed, req.NoCashPostedForClaims }
            }),
            Notes = req.Notes?.Trim() ?? "", SignedByUserId = actor
        };
        _db.Set<BillingMedicalAidDaySignoff>().Add(signoff);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("MEDICAL_AID_DAY_SIGNED_OFF", "BillingMedicalAidDaySignoff", signoff.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created($"/api/billing/medical-aid-day?date={req.BusinessDate:yyyy-MM-dd}",
            new { signoff.Id, signoff.SignedAtUtc, signoff.UniqueClaims,
                signoff.SubmissionAttempts, signoff.SubmittedValue, status = "Signed" });
    }
}
