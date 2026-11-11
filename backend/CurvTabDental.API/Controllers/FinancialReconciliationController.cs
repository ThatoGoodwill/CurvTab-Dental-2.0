using System.Data;
using System.Text.Json;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Day-specific instrument evidence and immutable reception handover.
/// No action in this controller creates receipts, transfers or ledger entries.
/// Scheme claims and MedicalAidDaySignoff are entirely separate.
/// </summary>
[ApiController]
[Route("api/billing/financial-reconciliation")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class FinancialReconciliationController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public FinancialReconciliationController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record EvidenceRequest(
        Guid RequestId, Guid SubmissionId, string Instrument, decimal VerifiedReceived,
        string EvidenceReference, string VerificationSource, bool ExternalSettlementConfirmed);

    public sealed record FinancialSignoffRequest(
        Guid RequestId, Guid SubmissionId, bool ExpensesReviewed, bool RefundsReviewed,
        bool LabPayoutsReviewed, string HandoverReason);

    private static DateOnly TodaySa() =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(
            DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Africa/Johannesburg")));

    private static (DateTime Start, DateTime End) Range(DateOnly date)
    {
        var start = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc)
            .AddHours(-2);
        return (start, start.AddDays(1));
    }

    private static bool Money(decimal amount) =>
        amount >= 0 && amount <= 10_000_000m && decimal.Round(amount, 2) == amount;

    private async Task<(decimal Card, decimal Eft, decimal Cash)> Receipts(Guid practiceId, DateOnly date, CancellationToken ct)
    {
        var (start, end) = Range(date);
        var regular = await _db.Payments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.ReceivedAtUtc >= start &&
                x.ReceivedAtUtc < end)
            .GroupBy(x => x.Method)
            .Select(g => new { Method = g.Key, Total = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        var plans = await _db.PlanPayments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.ReceivedAtUtc >= start &&
                x.ReceivedAtUtc < end)
            .GroupBy(x => x.Method)
            .Select(g => new { Method = g.Key, Total = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        decimal Total(string method) => regular.Where(x => x.Method == method).Sum(x => x.Total) +
                                        plans.Where(x => x.Method == method).Sum(x => x.Total);
        return (Total("Card"), Total("EFT"), Total("Cash"));
    }

    private async Task<CashDayCloseSubmission?> FindCount(Guid practiceId, Guid submissionId, CancellationToken ct) =>
        await _db.Set<CashDayCloseSubmission>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId && x.Id == submissionId, ct);

    [HttpGet]
    public async Task<IActionResult> Summary([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (date == default) return BadRequest(new { message = "Choose a business date." });
        Response.Headers.CacheControl = "private, no-store";
        var count = await _db.Set<CashDayCloseSubmission>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.DentalPracticeId == practiceId && x.BusinessDate == date, ct);
        if (count is null)
            return Ok(new { businessDate = date, countSubmitted = false,
                notice = "Blind count required before instrument reconciliation. Expected cash remains hidden." });

        var receipts = await Receipts(practiceId, date, ct);
        var evidence = await _db.Set<CashDayCloseInstrumentEvidence>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.SubmissionId == count.Id)
            .OrderBy(x => x.RecordedAtUtc).ThenBy(x => x.Id)
            .Select(x => new {
                x.Id, x.Instrument, x.LedgerReceived, x.VerifiedReceived,
                x.EvidenceReference, x.VerificationSource,
                x.ExternalSettlementConfirmed, x.RecordedByUserId, x.RecordedAtUtc
            }).ToListAsync(ct);
        var signed = await _db.Set<CashDayCloseFinancialSignoff>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.SubmissionId == count.Id)
            .Select(x => new { x.Id, x.SnapshotJson, x.SignedAtUtc, x.SignedByUserId, x.HandoverReason })
            .FirstOrDefaultAsync(ct);
        var card = evidence.LastOrDefault(x => x.Instrument == "Card");
        var eft = evidence.LastOrDefault(x => x.Instrument == "EFT");
        return Ok(new {
            businessDate = date, countSubmitted = true, submissionId = count.Id,
            countStatus = "Recorded", originalCountedCash = count.CountedCash,
            originalExpectedCash = count.ExpectedCash, originalVariance = count.Variance,
            receipts = new { cash = receipts.Cash, card = receipts.Card, eft = receipts.Eft },
            evidence, latestCard = card, latestEft = eft, financialSignoff = signed,
            canSubmit = signed is null && card is not null && eft is not null &&
                card.ExternalSettlementConfirmed && eft.ExternalSettlementConfirmed &&
                card.VerifiedReceived == receipts.Card && eft.VerifiedReceived == receipts.Eft &&
                card.LedgerReceived == receipts.Card && eft.LedgerReceived == receipts.Eft,
            note = "External evidence is staff-reported until independently verified against the bank/terminal. No payment is posted."
        });
    }

    [HttpPost("evidence")]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> RecordEvidence([FromBody] EvidenceRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        var instrument = request.Instrument?.Trim() ?? "";
        var reference = request.EvidenceReference?.Trim() ?? "";
        var source = request.VerificationSource?.Trim() ?? "";
        if (request.RequestId == Guid.Empty || request.SubmissionId == Guid.Empty ||
            instrument is not ("Card" or "EFT") || !Money(request.VerifiedReceived) ||
            reference.Length is < 3 or > 300 || source.Length is < 3 or > 40 ||
            !request.ExternalSettlementConfirmed)
            return BadRequest(new { message =
                "Attach a specific external terminal/bank reference and confirm cleared settlement evidence." });

        await using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var count = await FindCount(practiceId, request.SubmissionId, ct);
        if (count is null) return NotFound();
        if (await _db.Set<CashDayCloseFinancialSignoff>().AsNoTracking()
                .AnyAsync(x => x.DentalPracticeId == practiceId && x.SubmissionId == count.Id, ct))
            return Conflict(new { message = "Financial sign-off is frozen. Evidence cannot be edited." });

        var retry = await _db.Set<CashDayCloseInstrumentEvidence>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.DentalPracticeId == practiceId && x.RequestId == request.RequestId, ct);
        if (retry is not null)
            return retry.SubmissionId == count.Id && retry.Instrument == instrument &&
                retry.VerifiedReceived == request.VerifiedReceived &&
                retry.EvidenceReference == reference && retry.VerificationSource == source
                ? Ok(new { retry.Id, alreadyRecorded = true })
                : Conflict(new { message = "Request ID was used for different evidence." });

        var receipts = await Receipts(practiceId, count.BusinessDate, ct);
        var value = instrument == "Card" ? receipts.Card : receipts.Eft;
        var item = new CashDayCloseInstrumentEvidence {
            DentalPracticeId = practiceId, SubmissionId = count.Id, RequestId = request.RequestId,
            Instrument = instrument, LedgerReceived = value, VerifiedReceived = request.VerifiedReceived,
            EvidenceReference = reference, VerificationSource = source,
            ExternalSettlementConfirmed = true, RecordedByUserId = actorId
        };
        _db.Set<CashDayCloseInstrumentEvidence>().Add(item);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("BILLING_EXTERNAL_SETTLEMENT_EVIDENCE_RECORDED",
            "CashDayCloseInstrumentEvidence", item.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created($"/api/billing/financial-reconciliation?date={count.BusinessDate:yyyy-MM-dd}",
            new { item.Id, item.Instrument, item.LedgerReceived, item.VerifiedReceived,
                matched = item.LedgerReceived == item.VerifiedReceived,
                notice = "Mismatch remains an exception. No balancing payment was created." });
    }

    [HttpPost("signoff")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> FinancialSignoff([FromBody] FinancialSignoffRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        var reason = request.HandoverReason?.Trim() ?? "";
        if (request.RequestId == Guid.Empty || request.SubmissionId == Guid.Empty ||
            !request.ExpensesReviewed || !request.RefundsReviewed || !request.LabPayoutsReviewed ||
            reason.Length is < 5 or > 1000)
            return BadRequest(new { message = "Review expenses, refunds and lab payouts; include a dated handover explanation." });

        await using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var count = await FindCount(practiceId, request.SubmissionId, ct);
        if (count is null) return NotFound();
        var existing = await _db.Set<CashDayCloseFinancialSignoff>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId &&
                x.SubmissionId == count.Id, ct);
        if (existing is not null)
            return existing.RequestId == request.RequestId
                ? Ok(new { existing.Id, alreadyRecorded = true })
                : Conflict(new { message = "The financial handover has already been signed." });
        // A manager must explicitly approve the physical count or its controlled
        // recount before the final financial close can be signed.
        var managerReview = await _db.Set<CashDayCloseReview>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.SubmissionId == count.Id)
            .OrderByDescending(x => x.ReviewedAtUtc).ThenByDescending(x => x.Id)
            .FirstOrDefaultAsync(ct);
        if (managerReview?.Decision != "Approve")
            return Conflict(new { message = "Practice manager cash-count approval is required before final financial sign-off." });

        var receipts = await Receipts(practiceId, count.BusinessDate, ct);
        if (count.CashReceived != receipts.Cash)
            return Conflict(new { message = "Cash receipts have changed since the original blind count. Manager investigation required." });
        var evidence = await _db.Set<CashDayCloseInstrumentEvidence>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.SubmissionId == count.Id)
            .OrderBy(x => x.RecordedAtUtc).ThenBy(x => x.Id).ToListAsync(ct);
        var card = evidence.LastOrDefault(x => x.Instrument == "Card");
        var eft = evidence.LastOrDefault(x => x.Instrument == "EFT");
        if (card is null || eft is null ||
            !card.ExternalSettlementConfirmed || !eft.ExternalSettlementConfirmed ||
            card.LedgerReceived != receipts.Card || card.VerifiedReceived != receipts.Card ||
            eft.LedgerReceived != receipts.Eft || eft.VerifiedReceived != receipts.Eft)
            return Conflict(new { message = "Card and EFT evidence must each match the current ledger. Record exceptions; do not fabricate payments." });

        var expenses = await _db.Set<PracticeExpense>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.ExpenseDate == count.BusinessDate)
            .Select(x => new { x.Id, x.Category, x.Description, x.Amount, x.Method, x.Reference })
            .OrderBy(x => x.Id).ToListAsync(ct);
        if (expenses.Where(x => x.Method == "Cash").Sum(x => x.Amount) != count.CashExpenses)
            return Conflict(new { message = "Cash expenses have changed since the original blind count. Manager investigation required." });
        var snapshot = JsonSerializer.Serialize(new {
            count.Id, count.BusinessDate, count.OpeningFloat, count.CountedCash,
            count.CashReceived, count.CashExpenses, count.ExpectedCash, count.Variance,
            receipts, totalReceipts = receipts.Cash + receipts.Card + receipts.Eft,
            netMovement = receipts.Cash + receipts.Card + receipts.Eft - expenses.Sum(x => x.Amount),
            expenses, managerReviewId = managerReview.Id,
            cardEvidenceId = card.Id, eftEvidenceId = eft.Id,
            expenseReviewConfirmed = true, refundsReviewed = true, labPayoutsReviewed = true,
            note = "An acknowledged shortage remains in the immutable count and is not a balancing receipt."
        });
        var signoff = new CashDayCloseFinancialSignoff {
            DentalPracticeId = practiceId, SubmissionId = count.Id,
            BusinessDate = count.BusinessDate, RequestId = request.RequestId,
            SnapshotJson = snapshot, HandoverReason = reason, SignedByUserId = actorId
        };
        _db.Set<CashDayCloseFinancialSignoff>().Add(signoff);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("BILLING_FINANCIAL_RECONCILIATION_SIGNED",
            "CashDayCloseFinancialSignoff", signoff.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created($"/api/billing/financial-reconciliation?date={count.BusinessDate:yyyy-MM-dd}",
            new { signoff.Id, signoff.BusinessDate, signoff.SignedAtUtc,
                notice = "Financial sign-off frozen. Medical-aid claims review remains separate and unchanged." });
    }
}
