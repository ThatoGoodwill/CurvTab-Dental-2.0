using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/ledger")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
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

        // Calculate complete period totals before limiting displayed rows.
        var totals = await payments
            .GroupBy(p => p.Method)
            .Select(g => new
            {
                Method = g.Key,
                Count = g.Count(),
                Amount = g.Sum(p => p.Amount)
            })
            .ToListAsync(ct);

        var transactionCount =
            await payments.CountAsync(ct);

        var rows = await (
            from payment in payments
            join appointment in _db.Appointments.AsNoTracking()
                on payment.AppointmentId equals appointment.Id
            join patient in _db.Patients.AsNoTracking()
                on appointment.PatientId equals patient.Id
            where appointment.DentalPracticeId == practiceId
               && patient.DentalPracticeId == practiceId
            orderby payment.ReceivedAtUtc descending, payment.Id
            select new
            {
                paymentId = payment.Id,
                payment.ReceiptNumber,
                payment.Amount,
                payment.Method,
                payment.Reference,
                payment.ReceivedAtUtc,
                payment.ReceivedByUserId,
                payment.AppointmentId,
                patientId = patient.Id,
                patientName = patient.FirstName + " " + patient.LastName
            }
        ).Take(500).ToListAsync(ct);

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
}
