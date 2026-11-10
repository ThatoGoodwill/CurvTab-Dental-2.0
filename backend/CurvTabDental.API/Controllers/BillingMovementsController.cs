using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Reception proposes expenses, a manager posts the single authoritative financial event.
/// Refund declarations are linked to an existing actual patient receipt, never a claim.
/// </summary>
[ApiController]
[Route("api/billing")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class BillingMovementsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    public BillingMovementsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    { _db = db; _current = current; _audit = audit; }

    public sealed record ExpenseRequest(Guid RequestId, DateOnly ExpenseDate,
        string Supplier, string Category, string Description, decimal Amount,
        string Method, string? Reference, string ReceiptReference);
    public sealed record ExpenseDecisionRequest(Guid RequestId, string Decision, string Notes);
    public sealed record RefundRequest(Guid RequestId, Guid PaymentId, DateOnly RefundedOn,
        decimal Amount, string Reason, string EvidenceReference);
    private static DateOnly TodaySA() => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(2));
    private static bool AmountValid(decimal n) =>
        n > 0m && n <= 10000000m && decimal.Round(n, 2) == n;
    private static readonly string[] Methods = { "Cash", "Card", "EFT" };
    private static readonly string[] Categories = {
        "Dental Supplies", "Laboratory", "Equipment", "Utilities",
        "Maintenance", "Rent", "Staff Costs", "Other"
    };

    [HttpGet("expenses")]
    public async Task<IActionResult> Expenses([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (date == default) return BadRequest();
        var requests = await _db.Set<BillingExpenseApprovalRequest>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.ExpenseDate == date)
            .OrderByDescending(x => x.RequestedAtUtc).Take(250).ToListAsync(ct);
        var ids = requests.Select(x => x.Id).ToArray();
        var decisions = await _db.Set<BillingExpenseDecision>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && ids.Contains(x.ExpenseRequestId))
            .ToListAsync(ct);
        var existingExpenses = await _db.Set<PracticeExpense>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.ExpenseDate == date)
            .OrderByDescending(x => x.RecordedAtUtc).Take(250).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new {
            pendingOrDecided = requests.Select(r => new {
                r.Id, r.Supplier, r.ExpenseDate, r.Category, r.Description,
                r.Amount, r.Method, r.Reference, r.ReceiptReference,
                r.RequestedByUserId, r.RequestedAtUtc,
                decision = decisions.FirstOrDefault(d => d.ExpenseRequestId == r.Id)
            }),
            posted = existingExpenses
        });
    }

    [HttpPost("expenses")]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> ProposeExpense([FromBody] ExpenseRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        var supplier = req.Supplier?.Trim() ?? "";
        var desc = req.Description?.Trim() ?? "";
        var reference = req.Reference?.Trim() ?? "";
        var evidence = req.ReceiptReference?.Trim() ?? "";
        if (req.RequestId == Guid.Empty || req.ExpenseDate == default ||
            req.ExpenseDate > TodaySA() || supplier.Length is < 2 or > 120 ||
            desc.Length is < 5 or > 250 || evidence.Length is < 3 or > 300 ||
            !AmountValid(req.Amount) || !Methods.Contains(req.Method) ||
            !Categories.Contains(req.Category) || reference.Length > 100 ||
            (req.Method != "Cash" && reference.Length < 3))
            return BadRequest(new { message = "Supplier, category, amount, date, payment method and receipt evidence are required." });
        var prev = await _db.Set<BillingExpenseApprovalRequest>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == id && x.RequestId == req.RequestId, ct);
        if (prev != null)
            return prev.Amount == req.Amount && prev.Method == req.Method &&
                prev.Description == desc && prev.Supplier == supplier
                ? Ok(new { prev.Id, alreadyRecorded = true })
                : Conflict(new { message = "Expense request ID already used with different details." });
        if (req.Category == "Laboratory" && reference.Length > 0 &&
            await _db.Set<PracticeExpense>().AsNoTracking().AnyAsync(
                x => x.DentalPracticeId == id && x.Category == "Laboratory" &&
                    x.Reference == reference, ct))
            return Conflict(new { message = "A laboratory payout already exists for this reference. Link the existing record rather than duplicate it." });
        var record = new BillingExpenseApprovalRequest {
            DentalPracticeId = id, RequestId = req.RequestId, ExpenseDate = req.ExpenseDate,
            Supplier = supplier, Category = req.Category, Description = desc,
            Method = req.Method, Reference = reference, ReceiptReference = evidence,
            Amount = req.Amount, RequestedByUserId = actor
        };
        _db.Set<BillingExpenseApprovalRequest>().Add(record);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("BILLING_EXPENSE_APPROVAL_REQUESTED", "BillingExpenseApprovalRequest", record.Id.ToString(), ct: ct);
        return Created($"/api/billing/expenses?date={record.ExpenseDate:yyyy-MM-dd}",
            new { record.Id, status = "PendingManagerApproval", actualMoneyPosted = false });
    }

    [HttpPost("expenses/{expenseRequestId:guid}/decision")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> DecideExpense(Guid expenseRequestId,
        [FromBody] ExpenseDecisionRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        var decision = req.Decision?.Trim() ?? "";
        var note = req.Notes?.Trim() ?? "";
        if (req.RequestId == Guid.Empty || !new[] { "Approved", "Rejected" }.Contains(decision) ||
            note.Length is < 5 or > 1000)
            return BadRequest(new { message = "A manager decision and explanation are required." });
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var source = await _db.Set<BillingExpenseApprovalRequest>()
            .FromSqlInterpolated($"SELECT * FROM \"BillingExpenseApprovalRequests\" WHERE \"Id\" = {expenseRequestId} AND \"DentalPracticeId\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (source == null) return NotFound();
        var prior = await _db.Set<BillingExpenseDecision>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == id &&
                (x.ExpenseRequestId == expenseRequestId || x.RequestId == req.RequestId), ct);
        if (prior != null)
            return prior.ExpenseRequestId == expenseRequestId &&
                prior.RequestId == req.RequestId && prior.Decision == decision
                ? Ok(new { prior.Id, alreadyDecided = true })
                : Conflict(new { message = "Expense has already been decided." });
        PracticeExpense? posted = null;
        if (decision == "Approved")
        {
            // Post ONCE into the existing financial expense source, never a second ledger.
            posted = new PracticeExpense {
                DentalPracticeId = id, RequestId = source.RequestId,
                ExpenseDate = source.ExpenseDate, Category = source.Category,
                Description = source.Supplier + " - " + source.Description,
                Amount = source.Amount, Method = source.Method,
                Reference = string.IsNullOrWhiteSpace(source.Reference) ? null : source.Reference,
                RecordedByUserId = actor
            };
            // Existing financial description limit is 250 characters.
            if (posted.Description.Length > 250)
                posted.Description = posted.Description[..250];
            _db.Set<PracticeExpense>().Add(posted);
        }
        var result = new BillingExpenseDecision {
            DentalPracticeId = id, RequestId = req.RequestId,
            ExpenseRequestId = source.Id, Decision = decision, Notes = note,
            PostedExpenseId = posted?.Id, DecidedByUserId = actor
        };
        _db.Set<BillingExpenseDecision>().Add(result);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("BILLING_EXPENSE_" + decision.ToUpperInvariant(),
            "BillingExpenseDecision", result.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Ok(new { result.Id, result.Decision, result.PostedExpenseId,
            financialEventPosted = posted != null });
    }

    [HttpGet("refunds")]
    public async Task<IActionResult> Refunds([FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (date == default) return BadRequest();
        var refunds = await _db.Set<BillingPaymentRefund>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.RefundedOn == date)
            .OrderByDescending(x => x.RecordedAtUtc).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(refunds);
    }

    [HttpPost("refunds")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> RecordActualRefund([FromBody] RefundRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        var reason = req.Reason?.Trim() ?? "";
        var evidence = req.EvidenceReference?.Trim() ?? "";
        if (req.RequestId == Guid.Empty || req.PaymentId == Guid.Empty ||
            req.RefundedOn == default || req.RefundedOn > TodaySA() ||
            !AmountValid(req.Amount) || reason.Length is < 5 or > 1000 ||
            evidence.Length is < 3 or > 300)
            return BadRequest(new { message = "Actual refund evidence, reason, payment and amount are required." });
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var payment = await _db.Payments
            .FromSqlInterpolated($"SELECT * FROM \"Payments\" WHERE \"Id\" = {req.PaymentId} AND \"DentalPracticeId\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (payment == null) return NotFound();
        var previous = await _db.Set<BillingPaymentRefund>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == id && x.RequestId == req.RequestId, ct);
        if (previous != null)
            return previous.PaymentId == req.PaymentId && previous.Amount == req.Amount
                ? Ok(new { previous.Id, alreadyRecorded = true }) : Conflict();
        var already = await _db.Set<BillingPaymentRefund>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.PaymentId == payment.Id)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        if (already + req.Amount > payment.Amount)
            return Conflict(new { message = "Refund exceeds the original receipt after prior refunds." });
        var entity = new BillingPaymentRefund {
            DentalPracticeId = id, RequestId = req.RequestId, PaymentId = payment.Id,
            RefundedOn = req.RefundedOn, Method = payment.Method, Amount = req.Amount,
            Reason = reason, EvidenceReference = evidence, ApprovedByUserId = actor
        };
        _db.Set<BillingPaymentRefund>().Add(entity);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ACTUAL_REFUND_DECLARED", "BillingPaymentRefund", entity.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created($"/api/billing/refunds?date={entity.RefundedOn:yyyy-MM-dd}",
            new { entity.Id, entity.Amount, entity.Method, entity.PaymentId,
                note = "Recorded cash/bank outflow. This does not reverse an invoice allocation or instruct a payment gateway." });
    }
}
