using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Two-stage cash close. Reception submits an actual count without receiving
/// the expected cash figure. Only then does the API reveal the reconciliation.
/// Manager review is an independent append-only audit event.
/// Claim submissions never enter cash totals.
/// </summary>
[ApiController]
[Route("api/billing/cash-day-close")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class BillingCashDayCloseController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public BillingCashDayCloseController(DentalDbContext db, ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record BlindCountRequest(
        DateOnly BusinessDate,
        decimal OpeningFloat,
        decimal CountedCash,
        string? Explanation,
        string? EvidenceReference);

    public sealed record ReviewRequest(Guid RequestId, string Decision, string Reason);

    private static DateOnly TodaySa() => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(2));

    private static bool Money(decimal value) =>
        value >= 0m && value <= 10_000_000m && decimal.Round(value, 2) == value;

    private static (DateTime Start, DateTime End) Range(DateOnly businessDate)
    {
        var start = DateTime.SpecifyKind(businessDate.ToDateTime(TimeOnly.MinValue),
            DateTimeKind.Utc).AddHours(-2);
        return (start, start.AddDays(1));
    }

    private async Task<object> ResultFor(Guid practiceId, DateOnly date, CancellationToken ct)
    {
        var saved = await _db.Set<CashDayCloseSubmission>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId &&
                x.BusinessDate == date, ct);
        if (saved is null)
            return new
            {
                businessDate = date, submitted = false, status = "AwaitingBlindCount",
                currency = "ZAR",
                message = "Enter the physical cash count before the server reveals the expected balance. Claim submissions are not cash."
            };

        var (start, end) = Range(date);
        var cardReceived = (await _db.Payments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.Method == "Card" &&
                x.ReceivedAtUtc >= start && x.ReceivedAtUtc < end)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m) +
            (await _db.PlanPayments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.Method == "Card" &&
                x.ReceivedAtUtc >= start && x.ReceivedAtUtc < end)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m);
        var eftReceived = (await _db.Payments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.Method == "EFT" &&
                x.ReceivedAtUtc >= start && x.ReceivedAtUtc < end)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m) +
            (await _db.PlanPayments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.Method == "EFT" &&
                x.ReceivedAtUtc >= start && x.ReceivedAtUtc < end)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m);
        var nonCashOutflows = await _db.Set<PracticeExpense>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.ExpenseDate == date &&
                (x.Method == "Card" || x.Method == "EFT"))
            .GroupBy(x => x.Method)
            .Select(g => new { Method = g.Key, Total = g.Sum(x => x.Amount) })
            .ToListAsync(ct);

        var decisions = await _db.Set<CashDayCloseReview>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.SubmissionId == saved.Id)
            .OrderBy(x => x.ReviewedAtUtc).ThenBy(x => x.Id)
            .Select(x => new
            {
                x.Id, x.Decision, x.Reason, x.ReviewedByUserId, x.ReviewedAtUtc
            }).ToListAsync(ct);

        var lastDecision = decisions.LastOrDefault();
        return new
        {
            businessDate = date, submitted = true,
            status = lastDecision?.Decision == "Approve" ? "Approved" :
                lastDecision?.Decision == "Reject" ? "CorrectionRequired" :
                lastDecision?.Decision == "Escalate" ? "Escalated" : "PendingManagerReview",
            currency = "ZAR",
            cash = new
            {
                saved.Id,
                saved.OpeningFloat, saved.CashReceived, saved.CashExpenses,
                saved.ExpectedCash, saved.CountedCash, saved.Variance,
                saved.Explanation, saved.EvidenceReference,
                saved.SubmittedAtUtc, saved.SubmittedByUserId
            },
            decisions,
            nonCash = new
            {
                cardReceived,
                cardExpenses = nonCashOutflows.Where(x => x.Method == "Card").Sum(x => x.Total),
                eftReceived,
                eftExpenses = nonCashOutflows.Where(x => x.Method == "EFT").Sum(x => x.Total),
                notice = "Card and EFT are reconciled separately and never added to physical cash."
            },
            note = "Immutable original count. The cash expense figure includes only posted Cash PracticeExpense records; verify refunds and laboratory payouts are already represented in authoritative movements before approving."
        };
    }

    // Before submission the expected cash total is deliberately hidden.
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (date == default) return BadRequest(new { message = "Select a business date." });
        Response.Headers.CacheControl = "private, no-store";
        return Ok(await ResultFor(practiceId, date, ct));
    }

    [HttpPost("submit-blind-count")]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> Submit([FromBody] BlindCountRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        if (request.BusinessDate == default || request.BusinessDate > TodaySa() ||
            !Money(request.OpeningFloat) || !Money(request.CountedCash) ||
            request.Explanation?.Length > 1000 || request.EvidenceReference?.Length > 300)
            return BadRequest(new { message = "Check business date, cash amounts, explanation and evidence reference." });

        // Do not overwrite an earlier count. Uniqueness is also enforced in PostgreSQL.
        var existing = await _db.Set<CashDayCloseSubmission>().AsNoTracking()
            .AnyAsync(x => x.DentalPracticeId == practiceId &&
                x.BusinessDate == request.BusinessDate, ct);
        if (existing)
            return Conflict(new { message = "The first blind cash count is immutable. A manager must review any discrepancy." });

        var (start, end) = Range(request.BusinessDate);
        var paymentCash = await _db.Payments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.Method == "Cash" &&
                x.ReceivedAtUtc >= start && x.ReceivedAtUtc < end)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var planCash = await _db.PlanPayments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.Method == "Cash" &&
                x.ReceivedAtUtc >= start && x.ReceivedAtUtc < end)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var cashExpenses = await _db.Set<PracticeExpense>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                x.ExpenseDate == request.BusinessDate && x.Method == "Cash")
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var expected = request.OpeningFloat + paymentCash + planCash - cashExpenses;
        var submission = new CashDayCloseSubmission
        {
            DentalPracticeId = practiceId,
            BusinessDate = request.BusinessDate,
            OpeningFloat = request.OpeningFloat,
            CountedCash = request.CountedCash,
            CashReceived = paymentCash + planCash,
            CashExpenses = cashExpenses,
            ExpectedCash = expected,
            Variance = request.CountedCash - expected,
            Explanation = request.Explanation?.Trim(),
            EvidenceReference = request.EvidenceReference?.Trim(),
            SubmittedByUserId = actorId
        };
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.Set<CashDayCloseSubmission>().Add(submission);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("BILLING_BLIND_CASH_COUNT_SUBMITTED",
            "CashDayCloseSubmission", submission.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Created($"/api/billing/cash-day-close?date={request.BusinessDate:yyyy-MM-dd}",
            await ResultFor(practiceId, request.BusinessDate, ct));
    }

    // Manager decisions can never silently edit the original count.
    [HttpPost("{submissionId:guid}/review")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Review(Guid submissionId, [FromBody] ReviewRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        if (request.RequestId == Guid.Empty ||
            request.Decision is not ("Approve" or "Reject" or "Escalate") ||
            string.IsNullOrWhiteSpace(request.Reason) ||
            request.Reason.Trim().Length is < 5 or > 1000)
            return BadRequest(new { message = "Choose Approve, Reject or Escalate and explain the decision." });
        var submission = await _db.Set<CashDayCloseSubmission>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == submissionId &&
                x.DentalPracticeId == practiceId, ct);
        if (submission is null) return NotFound();

        var retry = await _db.Set<CashDayCloseReview>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);
        if (retry is not null)
            return retry.SubmissionId == submissionId &&
                retry.Decision == request.Decision &&
                retry.Reason == request.Reason.Trim()
                ? Ok(new { retry.Id, alreadyRecorded = true })
                : Conflict(new { message = "Request ID was used for another decision." });

        var last = await _db.Set<CashDayCloseReview>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                x.SubmissionId == submissionId)
            .OrderByDescending(x => x.ReviewedAtUtc).ThenByDescending(x => x.Id)
            .FirstOrDefaultAsync(ct);
        if (last?.Decision == "Approve")
            return Conflict(new { message = "The cash close is approved. It cannot be modified or reapproved." });

        if (request.Decision == "Approve")
        {
            var (from, to) = Range(submission.BusinessDate);
            var liveReceipts =
                (await _db.Payments.AsNoTracking()
                    .Where(x => x.DentalPracticeId == practiceId && x.Method == "Cash" &&
                        x.ReceivedAtUtc >= from && x.ReceivedAtUtc < to)
                    .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m) +
                (await _db.PlanPayments.AsNoTracking()
                    .Where(x => x.DentalPracticeId == practiceId && x.Method == "Cash" &&
                        x.ReceivedAtUtc >= from && x.ReceivedAtUtc < to)
                    .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m);
            var liveExpenses = await _db.Set<PracticeExpense>().AsNoTracking()
                .Where(x => x.DentalPracticeId == practiceId &&
                    x.ExpenseDate == submission.BusinessDate && x.Method == "Cash")
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
            if (liveReceipts != submission.CashReceived ||
                liveExpenses != submission.CashExpenses)
                return Conflict(new
                {
                    message = "Cash movements changed after the blind count. Escalate and record a controlled adjustment before approval."
                });
        }

        var review = new CashDayCloseReview
        {
            DentalPracticeId = practiceId,
            SubmissionId = submissionId,
            RequestId = request.RequestId,
            Decision = request.Decision,
            Reason = request.Reason.Trim(),
            ReviewedByUserId = actorId
        };
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.Set<CashDayCloseReview>().Add(review);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("BILLING_CASH_CLOSE_MANAGER_REVIEW",
            "CashDayCloseReview", review.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Ok(new { review.Id, review.Decision, review.Reason, alreadyRecorded = false });
    }
}
