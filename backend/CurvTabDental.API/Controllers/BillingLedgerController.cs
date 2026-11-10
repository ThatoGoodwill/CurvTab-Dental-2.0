using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/ledger")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class BillingLedgerController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public BillingLedgerController(
        DentalDbContext db,
        ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] DateTimeOffset fromUtc,
        [FromQuery] DateTimeOffset toUtc,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (fromUtc == default ||
            toUtc <= fromUtc ||
            toUtc - fromUtc > TimeSpan.FromDays(31))
        {
            return BadRequest(new
            {
                message = "Select a valid date range of up to 31 days."
            });
        }

        var from = fromUtc.UtcDateTime;
        var to = toUtc.UtcDateTime;

        var payments = _db.Payments
            .AsNoTracking()
            .Where(p =>
                p.DentalPracticeId == practiceId &&
                p.ReceivedAtUtc >= from &&
                p.ReceivedAtUtc < to);

        var planPayments = _db.PlanPayments
            .AsNoTracking()
            .Where(p =>
                p.DentalPracticeId == practiceId &&
                p.ReceivedAtUtc >= from &&
                p.ReceivedAtUtc < to);

        // Calculate complete period totals before limiting displayed rows.
        var visitTotals = await payments
            .GroupBy(p => p.Method)
            .Select(g => new
            {
                Method = g.Key,
                Count = g.Count(),
                Amount = g.Sum(p => p.Amount)
            })
            .ToListAsync(ct);
        var planTotals = await planPayments
            .GroupBy(p => p.Method)
            .Select(g => new
            {
                Method = g.Key,
                Count = g.Count(),
                Amount = g.Sum(p => p.Amount)
            })
            .ToListAsync(ct);

        var totals = visitTotals.Concat(planTotals)
            .GroupBy(x => x.Method)
            .Select(g => new
            {
                Method = g.Key,
                Count = g.Sum(x => x.Count),
                Amount = g.Sum(x => x.Amount)
            })
            .ToList();

        var transactionCount = totals.Sum(x => x.Count);

        var visitRows = await (
            from payment in payments
            join appointment in _db.Appointments.AsNoTracking()
                on payment.AppointmentId equals appointment.Id
            join patient in _db.Patients.AsNoTracking()
                on appointment.PatientId equals patient.Id
            where appointment.DentalPracticeId == practiceId
               && patient.DentalPracticeId == practiceId
            orderby payment.ReceivedAtUtc descending, payment.Id
            select new LedgerRow(
                payment.Id,
                payment.ReceiptNumber,
                payment.Amount,
                payment.Method,
                payment.Reference,
                payment.ReceivedAtUtc,
                payment.ReceivedByUserId,
                (Guid?)payment.AppointmentId,
                patient.Id,
                patient.FirstName + " " + patient.LastName,
                "Visit checkout")
        ).Take(500).ToListAsync(ct);

        var planRows = await (
            from payment in planPayments
            join patient in _db.Patients.AsNoTracking()
                on payment.PatientId equals patient.Id
            where patient.DentalPracticeId == practiceId
            orderby payment.ReceivedAtUtc descending, payment.Id
            select new LedgerRow(
                payment.Id,
                payment.ReceiptNumber,
                payment.Amount,
                payment.Method,
                payment.Reference,
                payment.ReceivedAtUtc,
                payment.ReceivedByUserId,
                (Guid?)null,
                patient.Id,
                patient.FirstName + " " + patient.LastName,
                "Treatment plan")
        ).Take(500).ToListAsync(ct);

        var rows = visitRows.Concat(planRows)
            .OrderByDescending(r => r.ReceivedAtUtc)
            .Take(500)
            .ToList();

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            currency = "ZAR",
            fromUtc = from,
            toUtc = to,
            transactionCount,
            displayedCount = rows.Count,
            totalReceived = totals.Sum(x => x.Amount),
            cashReceived = totals
                .Where(x => x.Method == "Cash")
                .Sum(x => x.Amount),
            cardReceived = totals
                .Where(x => x.Method == "Card")
                .Sum(x => x.Amount),
            eftReceived = totals
                .Where(x => x.Method == "EFT")
                .Sum(x => x.Amount),
            byMethod = totals,
            transactions = rows
        });
    }

    public sealed record LedgerRow(
        Guid PaymentId, string ReceiptNumber, decimal Amount, string Method,
        string? Reference, DateTime ReceivedAtUtc, Guid ReceivedByUserId,
        Guid? AppointmentId, Guid PatientId, string PatientName, string Source);
}
