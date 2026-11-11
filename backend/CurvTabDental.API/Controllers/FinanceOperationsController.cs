using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/operations")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class FinanceOperationsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public FinanceOperationsController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record AddExpenseRequest(
        Guid RequestId,
        DateOnly ExpenseDate,
        string Category,
        string Description,
        decimal Amount,
        string Method,
        string? Reference);

    public sealed record SignoffRequest(
        DateOnly BusinessDate,
        decimal OpeningFloat,
        decimal CountedCash,
        string? Notes);

    private static readonly HashSet<string> Categories =
        new(StringComparer.Ordinal)
        {
            "Dental Supplies",
            "Laboratory",
            "Equipment",
            "Utilities",
            "Maintenance",
            "Rent",
            "Staff Costs",
            "Other"
        };

    private static readonly HashSet<string> Methods =
        new(StringComparer.Ordinal)
        {
            "Cash", "Card", "EFT"
        };

    private static bool ValidMoney(decimal value) =>
        value >= 0m &&
        value <= 10_000_000m &&
        decimal.Round(value, 2) == value;

    private static DateOnly TodaySA() =>
        DateOnly.FromDateTime(DateTime.UtcNow.AddHours(2));

    // South African business days use UTC+02:00.
    private static (DateTime Start, DateTime End) DayRange(
        DateOnly date)
    {
        var start = DateTime.SpecifyKind(
            date.ToDateTime(TimeOnly.MinValue),
            DateTimeKind.Utc).AddHours(-2);

        return (start, start.AddDays(1));
    }

    private async Task<(decimal Receipts, int ReceiptCount,
        decimal Expenses, int ExpenseCount)> CashTotals(
        Guid practiceId, DateOnly date, CancellationToken ct)
    {
        var (start, end) = DayRange(date);

        var receipts = _db.Payments.AsNoTracking()
            .Where(p =>
                p.DentalPracticeId == practiceId &&
                p.Method == "Cash" &&
                p.ReceivedAtUtc >= start &&
                p.ReceivedAtUtc < end);

        var expenses = _db.Set<PracticeExpense>()
            .AsNoTracking()
            .Where(e =>
                e.DentalPracticeId == practiceId &&
                e.ExpenseDate == date &&
                e.Method == "Cash");

        var planReceipts = _db.PlanPayments.AsNoTracking()
            .Where(p =>
                p.DentalPracticeId == practiceId &&
                p.Method == "Cash" &&
                p.ReceivedAtUtc >= start &&
                p.ReceivedAtUtc < end);

        // Orthodontic intake advances are actual receipt-backed cash
        // movements, but are HELD AS PATIENT CREDIT until a future
        // treatment agreement. Count the tender ONCE in daily receipts.
        var orthoAdvances = _db.OrthodonticIntakeAdvanceReceipts.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId &&
                p.Method == "Cash" && p.ReceivedAtUtc >= start && p.ReceivedAtUtc < end);
        var cashReceived =
            (await receipts.SumAsync(p => (decimal?)p.Amount, ct) ?? 0m) +
            (await planReceipts.SumAsync(p => (decimal?)p.Amount, ct) ?? 0m) +
            (await orthoAdvances.SumAsync(p => (decimal?)p.Amount, ct) ?? 0m);
        var receiptCount =
            await receipts.CountAsync(ct) + await planReceipts.CountAsync(ct) +
            await orthoAdvances.CountAsync(ct);

        var cashExpenses =
            await expenses.SumAsync(e => (decimal?)e.Amount, ct) ?? 0m;
        var expenseCount = await expenses.CountAsync(ct);

        return (cashReceived, receiptCount, cashExpenses, expenseCount);
    }

    // GET /api/finance/operations?date=2026-11-04
    [HttpGet]
    public async Task<IActionResult> Summary(
        [FromQuery] DateOnly date, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (date == default)
            return BadRequest(new { message = "Select a business date." });

        var totals = await CashTotals(practiceId, date, ct);

        var expenses = await _db.Set<PracticeExpense>()
            .AsNoTracking()
            .Where(e =>
                e.DentalPracticeId == practiceId &&
                e.ExpenseDate == date)
            .OrderByDescending(e => e.RecordedAtUtc)
            .Select(e => new
            {
                e.Id,
                e.ExpenseDate,
                e.Category,
                e.Description,
                e.Amount,
                e.Method,
                e.Reference,
                e.RecordedByUserId,
                e.RecordedAtUtc
            })
            .Take(500)
            .ToListAsync(ct);

        var signoff = await _db.Set<CashDaySignoff>()
            .AsNoTracking()
            .Where(s =>
                s.DentalPracticeId == practiceId &&
                s.BusinessDate == date)
            .Select(s => new
            {
                s.Id,
                s.BusinessDate,
                s.OpeningFloat,
                s.CashReceived,
                s.CashExpenses,
                s.ExpectedCash,
                s.CountedCash,
                s.Variance,
                s.CashReceiptCount,
                s.CashExpenseCount,
                s.Notes,
                s.SignedByUserId,
                s.SignedAtUtc
            })
            .FirstOrDefaultAsync(ct);

        var changedAfterSignoff =
            signoff is not null &&
            (signoff.CashReceived != totals.Receipts ||
             signoff.CashExpenses != totals.Expenses ||
             signoff.CashReceiptCount != totals.ReceiptCount ||
             signoff.CashExpenseCount != totals.ExpenseCount);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            businessDate = date,
            currency = "ZAR",
            cashReceived = totals.Receipts,
            cashReceiptCount = totals.ReceiptCount,
            cashExpenses = totals.Expenses,
            cashExpenseCount = totals.ExpenseCount,
            expenses,
            signoff,
            changedAfterSignoff,
            note = "Sign-off is a recorded snapshot, not a locked accounting close."
        });
    }

    // POST /api/finance/operations/expenses
    [HttpPost("expenses")]
    // Reception may capture a real verified payment/expense; manager-only cash
    // variance review and accounting adjustments remain separately gated.
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> AddExpense(
        [FromBody] AddExpenseRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (request.RequestId == Guid.Empty ||
            request.ExpenseDate == default ||
            request.ExpenseDate > TodaySA() ||
            !Categories.Contains(request.Category ?? "") ||
            !Methods.Contains(request.Method ?? "") ||
            string.IsNullOrWhiteSpace(request.Description) ||
            request.Description.Length > 250 ||
            !ValidMoney(request.Amount) ||
            request.Amount <= 0m ||
            request.Reference?.Length > 100)
        {
            return BadRequest(new
            {
                message = "Check the date, category, description, " +
                          "payment method and positive two-decimal amount."
            });
        }

        var reference = request.Reference?.Trim();

        if (request.Method is "Card" or "EFT" &&
            string.IsNullOrWhiteSpace(reference))
        {
            return BadRequest(new
            {
                message = "Card and EFT expenses require a reference."
            });
        }

        var existing = await _db.Set<PracticeExpense>()
            .AsNoTracking()
            .FirstOrDefaultAsync(e =>
                e.DentalPracticeId == practiceId &&
                e.RequestId == request.RequestId, ct);

        if (existing is not null)
        {
            if (existing.Amount != request.Amount ||
                existing.ExpenseDate != request.ExpenseDate ||
                existing.Category != request.Category ||
                existing.Description != request.Description.Trim() ||
                existing.Method != request.Method ||
                existing.Reference != reference)
            {
                return Conflict(new
                {
                    message = "This expense request ID has already been used."
                });
            }

            return Ok(new
            {
                existing.Id,
                existing.Amount,
                alreadyRecorded = true
            });
        }

        var expense = new PracticeExpense
        {
            DentalPracticeId = practiceId,
            RequestId = request.RequestId,
            ExpenseDate = request.ExpenseDate,
            Category = request.Category,
            Description = request.Description.Trim(),
            Amount = request.Amount,
            Method = request.Method,
            Reference = reference,
            RecordedByUserId = actorId
        };

        await using var transaction =
            await _db.Database.BeginTransactionAsync(ct);

        _db.Set<PracticeExpense>().Add(expense);
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "PRACTICE_EXPENSE_RECORDED",
            "PracticeExpense",
            expense.Id.ToString(),
            ct: ct);

        await transaction.CommitAsync(ct);

        return Created(
            $"/api/finance/operations?date={expense.ExpenseDate:yyyy-MM-dd}",
            new
            {
                expense.Id,
                expense.Amount,
                alreadyRecorded = false
            });
    }

    // Superseded by the receptionist blind Cash Day Close and separate
    // PracticeAdmin exception reviews. Historical CashDaySignoff records stay readable.
    [HttpPost("signoff")]
    [Authorize(Roles = "PracticeAdmin")]
    public IActionResult LegacySignoffDisabled() =>
        StatusCode(410, new
        {
            message = "Combined cash sign-off is retired. Use Billing > Cash Day Close. Existing snapshots remain immutable."
        });

}
