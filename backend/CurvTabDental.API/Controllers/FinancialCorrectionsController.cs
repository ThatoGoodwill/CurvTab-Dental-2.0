// CT_PHASE7E3_REVERSAL_AWARE
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/invoices/{invoiceId:guid}/corrections")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class FinancialCorrectionsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public FinancialCorrectionsController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record CreateCreditRequest(
        Guid RequestId,
        decimal Amount,
        string Reason);

    public sealed record ReverseAllocationRequest(
        string Reason);

    private static bool ValidReason(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        value.Trim().Length >= 5 &&
        value.Length <= 1000;

    // GET: correction history for this invoice.
    [HttpGet]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> History(
        Guid invoiceId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var exists = await _db.Set<Invoice>()
            .AsNoTracking()
            .AnyAsync(x => x.Id == invoiceId &&
                           x.DentalPracticeId == practiceId, ct);

        if (!exists) return NotFound();

        var credits = await _db.Set<InvoiceCreditNote>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                        x.InvoiceId == invoiceId)
            .OrderByDescending(x => x.IssuedAtUtc)
            .Select(x => new
            {
                x.Id, x.CreditNoteNumber,
                x.Amount, x.Reason,
                x.IssuedByUserId, x.IssuedAtUtc
            })
            .ToListAsync(ct);

        var reversals = await (
            from r in _db.Set<PaymentAllocationReversal>().AsNoTracking()
            join a in _db.Set<PaymentAllocation>().AsNoTracking()
                on r.AllocationId equals a.Id
            where r.DentalPracticeId == practiceId &&
                  a.DentalPracticeId == practiceId &&
                  a.InvoiceId == invoiceId
            orderby r.ReversedAtUtc descending
            select new
            {
                r.Id, r.AllocationId, a.PaymentId,
                a.Amount, r.Reason,
                r.ReversedByUserId, r.ReversedAtUtc
            }
        ).ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new { credits, reversals });
    }

    // Credit notes reduce the net amount owed.
    // They do not refund any payment.
    [HttpPost("credit-notes")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> IssueCredit(
        Guid invoiceId,
        [FromBody] CreateCreditRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (request.RequestId == Guid.Empty ||
            request.Amount <= 0m ||
            request.Amount > 10000000m ||
            decimal.Round(request.Amount, 2) != request.Amount ||
            !ValidReason(request.Reason))
            return BadRequest(new {
                message = "Provide a valid amount, request ID " +
                          "and reason of at least five characters."
            });

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        var invoice = await _db.Set<Invoice>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"Invoice\" WHERE \"Id\" = {invoiceId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (invoice is null) return NotFound();

        var existing = await _db.Set<InvoiceCreditNote>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);

        if (existing is not null)
        {
            if (existing.InvoiceId != invoiceId ||
                existing.Amount != request.Amount ||
                existing.Reason != request.Reason.Trim())
                return Conflict(new {
                    message = "Credit request ID already used differently."
                });

            return Ok(new {
                existing.Id,
                existing.CreditNoteNumber,
                alreadyIssued = true
            });
        }

        var credits = await _db.Set<InvoiceCreditNote>()
            .Where(x => x.InvoiceId == invoiceId &&
                        x.DentalPracticeId == practiceId)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var allocated = await _db.Set<PaymentAllocation>()
            .Where(x => x.InvoiceId == invoiceId &&
                        x.DentalPracticeId == practiceId &&
                        !_db.Set<PaymentAllocationReversal>().Any(r =>
                            r.DentalPracticeId == practiceId &&
                            r.AllocationId == x.Id))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        // CT_PHASE7E3_CREDIT_NOTE_GUARD
        // Credit notes must respect existing scheme allocations too.
        var schemePaid = await _db.Set<MedicalAidInvoiceAllocation>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                !_db.Set<MedicalAidInvoiceAllocationReversal>()
                    .Any(r =>
                        r.DentalPracticeId == practiceId &&
                        r.AllocationId == x.Id) &&
                x.InvoiceId == invoiceId)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var availableCredit =
            invoice.TotalAmount - credits - allocated - schemePaid;

        if (request.Amount > availableCredit)
            return Conflict(new {
                message = "Credit exceeds the remaining invoice balance. " +
                          "Reverse any incorrect allocations first.",
                availableCredit
            });

        var note = new InvoiceCreditNote
        {
            DentalPracticeId = practiceId,
            InvoiceId = invoiceId,
            RequestId = request.RequestId,
            Amount = request.Amount,
            Reason = request.Reason.Trim(),
            IssuedByUserId = actorId,
            CreditNoteNumber =
                $"CN-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid():N}"
        };

        _db.Set<InvoiceCreditNote>().Add(note);
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "INVOICE_CREDIT_NOTE_ISSUED",
            "InvoiceCreditNote",
            note.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            $"/api/finance/invoices/{invoiceId}/corrections",
            new {
                note.Id, note.CreditNoteNumber,
                note.Amount, note.IssuedAtUtc,
                remainingBalance = availableCredit - note.Amount
            });
    }

    // Reverses the entire allocation.
    // Does not change or refund the original Payment.
    [HttpPost("allocations/{allocationId:guid}/reverse")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> ReverseAllocation(
        Guid invoiceId,
        Guid allocationId,
        [FromBody] ReverseAllocationRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (!ValidReason(request.Reason))
            return BadRequest(new {
                message = "A reason of at least five characters is required."
            });

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        var allocation = await _db.Set<PaymentAllocation>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == allocationId &&
                x.InvoiceId == invoiceId &&
                x.DentalPracticeId == practiceId, ct);

        if (allocation is null) return NotFound();

        // Match existing allocation lock order: payment, then invoice.
        var payment = await _db.Payments
            .FromSqlInterpolated(
                $"SELECT * FROM \"Payments\" WHERE \"Id\" = {allocation.PaymentId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (payment is null) return NotFound();

        var invoice = await _db.Set<Invoice>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"Invoice\" WHERE \"Id\" = {invoiceId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (invoice is null) return NotFound();

        var previous = await _db.Set<PaymentAllocationReversal>()
            .AsNoTracking()
            .AnyAsync(x => x.AllocationId == allocationId &&
                           x.DentalPracticeId == practiceId, ct);

        if (previous)
            return Conflict(new {
                message = "This allocation has already been reversed."
            });

        var reversal = new PaymentAllocationReversal
        {
            DentalPracticeId = practiceId,
            AllocationId = allocationId,
            Reason = request.Reason.Trim(),
            ReversedByUserId = actorId
        };

        _db.Set<PaymentAllocationReversal>().Add(reversal);
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "PAYMENT_ALLOCATION_REVERSED",
            "PaymentAllocationReversal",
            reversal.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            $"/api/finance/invoices/{invoiceId}/corrections",
            new {
                reversal.Id,
                reversal.AllocationId,
                reversal.ReversedAtUtc,
                releasedAmount = allocation.Amount
            });
    }
}
