using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/invoices")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class InvoicesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public InvoicesController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record AllocatePaymentRequest(
        Guid PaymentId,
        decimal Amount);

    private static bool ValidAmount(decimal value) =>
        value > 0m &&
        value <= 10_000_000m &&
        decimal.Round(value, 2) == value;


    [HttpGet("eligible-consultations")]
    public async Task<IActionResult> EligibleConsultations(
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var invoicedIds = _db.Set<Invoice>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId)
            .Select(x => x.ConsultationId);

        var rows = await (
            from c in _db.Consultations.AsNoTracking()
            join p in _db.Patients.AsNoTracking()
                on c.PatientId equals p.Id
            where c.DentalPracticeId == practiceId
                && p.DentalPracticeId == practiceId
                && c.IsFinalized
                && !invoicedIds.Contains(c.Id)
            select new
            {
                consultationId = c.Id,
                c.PatientId,
                patientName = p.FirstName + " " + p.LastName,
                c.AppointmentId
            }
        ).Take(100).ToListAsync(ct);

        var ids = rows.Select(x => x.consultationId).ToArray();

        var totals = await _db.ConsultationCharges.AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                ids.Contains(x.ConsultationId))
            .GroupBy(x => x.ConsultationId)
            .Select(g => new
            {
                ConsultationId = g.Key,
                Total = g.Sum(x => x.Amount),
                Count = g.Count()
            })
            .ToListAsync(ct);

        var byId = totals.ToDictionary(x => x.ConsultationId);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(rows
            .Where(x => byId.ContainsKey(x.consultationId))
            .Select(x => new
            {
                x.consultationId,
                x.PatientId,
                x.patientName,
                x.AppointmentId,
                chargeCount = byId[x.consultationId].Count,
                amount = byId[x.consultationId].Total
            }));
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid? patientId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var query = _db.Set<Invoice>().AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId);

        if (patientId.HasValue)
            query = query.Where(x => x.PatientId == patientId.Value);

        var invoices = await query
            .OrderByDescending(x => x.IssuedAtUtc)
            .ThenByDescending(x => x.Id)
            .Take(100)
            .Select(x => new
            {
                x.Id,
                x.PatientId,
                x.AppointmentId,
                x.ConsultationId,
                x.InvoiceNumber,
                x.TotalAmount,
                x.Currency,
                x.IssuedAtUtc
            })
            .ToListAsync(ct);

        var invoiceIds = invoices.Select(x => x.Id).ToArray();

        var allocations = await _db.Set<PaymentAllocation>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                invoiceIds.Contains(x.InvoiceId) &&
                !_db.Set<PaymentAllocationReversal>().Any(r =>
                    r.DentalPracticeId == practiceId &&
                    r.AllocationId == x.Id))
            .GroupBy(x => x.InvoiceId)
            .Select(g => new
            {
                InvoiceId = g.Key,
                Amount = g.Sum(x => x.Amount)
            })
            .ToListAsync(ct);

        var allocated = allocations.ToDictionary(
            x => x.InvoiceId, x => x.Amount);

        // CT_PHASE6G_INTEGRATED
        var creditRows = await _db.Set<InvoiceCreditNote>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                        invoiceIds.Contains(x.InvoiceId))
            .GroupBy(x => x.InvoiceId)
            .Select(g => new {
                InvoiceId = g.Key,
                Amount = g.Sum(x => x.Amount)
            })
            .ToListAsync(ct);

        var credits = creditRows.ToDictionary(
            x => x.InvoiceId, x => x.Amount);

        // CT_PHASE7E3_SCHEME_BALANCES
        var schemeRows = await _db.Set<MedicalAidInvoiceAllocation>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                invoiceIds.Contains(x.InvoiceId))
            .GroupBy(x => x.InvoiceId)
            .Select(g => new
            {
                InvoiceId = g.Key,
                Amount = g.Sum(x => x.Amount)
            })
            .ToListAsync(ct);

        var schemePaid = schemeRows.ToDictionary(
            x => x.InvoiceId, x => x.Amount);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(invoices.Select(x => new
        {
            x.Id,
            x.PatientId,
            x.AppointmentId,
            x.ConsultationId,
            x.InvoiceNumber,
            x.TotalAmount,
            x.Currency,
            x.IssuedAtUtc,
            allocatedAmount = allocated.GetValueOrDefault(x.Id),
            schemePaidAmount = schemePaid.GetValueOrDefault(x.Id),
            creditedAmount = credits.GetValueOrDefault(x.Id),
            netAmount = x.TotalAmount - credits.GetValueOrDefault(x.Id),
            balance = x.TotalAmount
                      - credits.GetValueOrDefault(x.Id)
                      - allocated.GetValueOrDefault(x.Id)
                      - schemePaid.GetValueOrDefault(x.Id)
        }));
    }

    [HttpGet("{invoiceId:guid}")]
    public async Task<IActionResult> Details(
        Guid invoiceId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var invoice = await _db.Set<Invoice>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == invoiceId &&
                x.DentalPracticeId == practiceId, ct);

        if (invoice is null)
            return NotFound();

        var lines = await _db.Set<InvoiceLine>()
            .AsNoTracking()
            .Where(x =>
                x.InvoiceId == invoiceId &&
                x.DentalPracticeId == practiceId)
            .OrderBy(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.Description,
                x.Amount,
                x.SourceConsultationChargeId
            })
            .ToListAsync(ct);

        var allocations = await _db.Set<PaymentAllocation>()
            .AsNoTracking()
            .Where(x =>
                x.InvoiceId == invoiceId &&
                x.DentalPracticeId == practiceId)
            .OrderBy(x => x.AllocatedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.PaymentId,
                x.Amount,
                x.AllocatedByUserId,
                x.AllocatedAtUtc
            })
            .ToListAsync(ct);

        var reversedIds = await _db.Set<PaymentAllocationReversal>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                        allocations.Select(a => a.Id)
                            .Contains(x.AllocationId))
            .Select(x => x.AllocationId)
            .ToListAsync(ct);

        var reversedSet = reversedIds.ToHashSet();

        var creditsTotal = await _db.Set<InvoiceCreditNote>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                        x.InvoiceId == invoiceId)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var schemePaidTotal =
            await _db.Set<MedicalAidInvoiceAllocation>()
                .AsNoTracking()
                .Where(x =>
                    x.DentalPracticeId == practiceId &&
                    x.InvoiceId == invoiceId)
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var payments = await _db.Payments.AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.AppointmentId == invoice.AppointmentId)
            .OrderBy(x => x.ReceivedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.ReceiptNumber,
                x.Amount,
                x.Method,
                x.ReceivedAtUtc
            })
            .ToListAsync(ct);

        // A receipt may have allocations elsewhere, so calculate
        // its available amount instead of assuming the full amount.
        var availableIds = payments.Select(x => x.Id).ToArray();

        var otherAllocations = await _db.Set<PaymentAllocation>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                availableIds.Contains(x.PaymentId) &&
                !_db.Set<PaymentAllocationReversal>().Any(r =>
                    r.DentalPracticeId == practiceId &&
                    r.AllocationId == x.Id))
            .GroupBy(x => x.PaymentId)
            .Select(g => new
            {
                PaymentId = g.Key,
                Amount = g.Sum(x => x.Amount)
            })
            .ToListAsync(ct);

        var used = otherAllocations.ToDictionary(
            x => x.PaymentId, x => x.Amount);

        var allocatedTotal = allocations
            .Where(x => !reversedSet.Contains(x.Id))
            .Sum(x => x.Amount);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            invoice.Id,
            invoice.PatientId,
            invoice.AppointmentId,
            invoice.ConsultationId,
            invoice.InvoiceNumber,
            invoice.Currency,
            invoice.TotalAmount,
            invoice.IssuedAtUtc,
            invoice.IssuedByUserId,
            allocatedAmount = allocatedTotal,
            schemePaidAmount = schemePaidTotal,
            creditedAmount = creditsTotal,
            netAmount = invoice.TotalAmount - creditsTotal,
            balance = invoice.TotalAmount
                      - creditsTotal
                      - allocatedTotal
                      - schemePaidTotal,
            lines,
            allocations = allocations.Select(x => new {
                x.Id, x.PaymentId, x.Amount,
                x.AllocatedByUserId, x.AllocatedAtUtc,
                isReversed = reversedSet.Contains(x.Id)
            }),
            availablePayments = payments.Select(x => new
            {
                paymentId = x.Id,
                x.ReceiptNumber,
                x.Method,
                x.ReceivedAtUtc,
                availableAmount = x.Amount - used.GetValueOrDefault(x.Id)
            }).Where(x => x.availableAmount > 0m)
        });
    }

    // Creates one invoice for a finalised consultation.
    // Reuses the original consultation charges.
    [HttpPost("from-consultation/{consultationId:guid}")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> IssueFromConsultation(
        Guid consultationId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        // Serialise invoice creation for the same consultation.
        var consultation = await _db.Consultations
            .FromSqlInterpolated(
                $"SELECT * FROM \"Consultations\" WHERE \"Id\" = {consultationId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (consultation is null)
            return NotFound();

        if (!consultation.IsFinalized)
            return Conflict(new
            {
                message = "The consultation must be finalised first."
            });

        var appointment = await _db.Appointments
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == consultation.AppointmentId &&
                x.PatientId == consultation.PatientId &&
                x.DentalPracticeId == practiceId, ct);

        if (appointment is null)
            return Conflict(new
            {
                message = "Consultation appointment is invalid."
            });

        var existing = await _db.Set<Invoice>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.ConsultationId == consultationId, ct);

        if (existing is not null)
            return Conflict(new
            {
                message = "This consultation has already been invoiced.",
                invoiceId = existing.Id
            });

        var charges = await _db.ConsultationCharges
            .AsNoTracking()
            .Where(x =>
                x.ConsultationId == consultationId &&
                x.DentalPracticeId == practiceId)
            .Select(x => new
            {
                x.Id,
                x.Description,
                x.Amount
            })
            .ToListAsync(ct);

        if (charges.Count == 0 ||
            charges.Any(x =>
                !ValidAmount(x.Amount) ||
                string.IsNullOrWhiteSpace(x.Description)))
        {
            return Conflict(new
            {
                message = "Consultation charges are missing or invalid."
            });
        }

        var total = charges.Sum(x => x.Amount);

        if (!ValidAmount(total))
            return Conflict(new
            {
                message = "Invoice total is outside the allowed range."
            });

        var now = DateTime.UtcNow;
        var invoice = new Invoice
        {
            DentalPracticeId = practiceId,
            PatientId = consultation.PatientId,
            AppointmentId = consultation.AppointmentId,
            ConsultationId = consultationId,
            IssuedByUserId = actorId,
            IssuedAtUtc = now,
            TotalAmount = total,
            InvoiceNumber =
                $"INV-{now:yyyyMMdd}-{Guid.NewGuid():N}"
        };

        // The invoice number is shortened to 64 characters
        // by the bounded format above.
        invoice.InvoiceNumber =
            invoice.InvoiceNumber[..Math.Min(
                invoice.InvoiceNumber.Length, 64)];

        var lines = charges.Select(x => new InvoiceLine
        {
            DentalPracticeId = practiceId,
            InvoiceId = invoice.Id,
            SourceConsultationChargeId = x.Id,
            Description = x.Description,
            Amount = x.Amount
        }).ToList();

        _db.Set<Invoice>().Add(invoice);
        _db.Set<InvoiceLine>().AddRange(lines);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "INVOICE_ISSUED",
            "Invoice",
            invoice.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            $"/api/finance/invoices/{invoice.Id}",
            new
            {
                invoice.Id,
                invoice.InvoiceNumber,
                invoice.TotalAmount,
                invoice.PatientId,
                invoice.ConsultationId,
                lineCount = lines.Count
            });
    }

    // Allocates an existing receipt; never creates a Payment.
    [HttpPost("{invoiceId:guid}/allocations")]
    public async Task<IActionResult> Allocate(
        Guid invoiceId,
        [FromBody] AllocatePaymentRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (request.PaymentId == Guid.Empty ||
            !ValidAmount(request.Amount))
            return BadRequest(new
            {
                message = "Provide an existing receipt and valid amount."
            });

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        // Lock the payment row, so competing allocations
        // cannot spend the same receipt twice.
        var payment = await _db.Payments
            .FromSqlInterpolated(
                $"SELECT * FROM \"Payments\" WHERE \"Id\" = {request.PaymentId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (payment is null)
            return NotFound(new
            {
                message = "Payment receipt not found."
            });

        var invoice = await _db.Set<Invoice>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"Invoice\" WHERE \"Id\" = {invoiceId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (invoice is null)
            return NotFound(new
            {
                message = "Invoice not found."
            });

        if (invoice.AppointmentId != payment.AppointmentId)
            return Conflict(new
            {
                message = "This receipt belongs to a different appointment."
            });

        var alreadyLinked = await _db.Set<PaymentAllocation>()
            .AsNoTracking()
            .AnyAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoiceId &&
                x.PaymentId == payment.Id, ct);

        if (alreadyLinked)
            return Conflict(new
            {
                message = "This receipt is already linked to the invoice."
            });

        var paymentUsed = await _db.Set<PaymentAllocation>()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.PaymentId == payment.Id &&
                !_db.Set<PaymentAllocationReversal>().Any(r =>
                    r.DentalPracticeId == practiceId &&
                    r.AllocationId == x.Id))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var invoicePaid = await _db.Set<PaymentAllocation>()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoiceId &&
                !_db.Set<PaymentAllocationReversal>().Any(r =>
                    r.DentalPracticeId == practiceId &&
                    r.AllocationId == x.Id))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var credited = await _db.Set<InvoiceCreditNote>()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoiceId)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        if (request.Amount > payment.Amount - paymentUsed)
            return Conflict(new
            {
                message = "Allocation exceeds the receipt's available amount."
            });

        if (request.Amount >
            invoice.TotalAmount - credited - invoicePaid)
            return Conflict(new
            {
                message = "Allocation exceeds the invoice's remaining balance."
            });

        var allocation = new PaymentAllocation
        {
            DentalPracticeId = practiceId,
            InvoiceId = invoice.Id,
            PaymentId = payment.Id,
            Amount = request.Amount,
            AllocatedByUserId = actorId
        };

        _db.Set<PaymentAllocation>().Add(allocation);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "PAYMENT_ALLOCATED",
            "PaymentAllocation",
            allocation.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            $"/api/finance/invoices/{invoiceId}",
            new
            {
                allocation.Id,
                allocation.PaymentId,
                allocation.InvoiceId,
                allocation.Amount,
                remainingBalance =
                    invoice.TotalAmount - credited - invoicePaid - allocation.Amount
            });
    }
}
