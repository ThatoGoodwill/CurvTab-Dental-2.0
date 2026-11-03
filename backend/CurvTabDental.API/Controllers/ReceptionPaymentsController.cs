using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Receptionists see billing amounts and payment records, NOT clinical notes.
// This is a payment ledger and receipt MVP; invoices, medical-aid claims,
// refunds, adjustments and debt policies must be added separately.
[ApiController]
[Route("api/frontdesk/checkouts")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class ReceptionPaymentsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public ReceptionPaymentsController(
        DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record RecordPaymentRequest(
        Guid RequestId, decimal Amount, string Method, string? Reference);

    // GET /api/frontdesk/checkouts/{appointmentId}
    [HttpGet("{appointmentId:guid}")]
    public async Task<IActionResult> Details(Guid appointmentId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var details = await LoadDetails(appointmentId, practiceId, ct);
        return details is null ? NotFound() : Ok(details);
    }

    // GET /api/frontdesk/checkouts/history?fromUtc=...&toUtc=...
    [HttpGet("history")]
    public async Task<IActionResult> History(
        [FromQuery] DateTimeOffset fromUtc,
        [FromQuery] DateTimeOffset toUtc,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (fromUtc == default || toUtc <= fromUtc ||
            toUtc - fromUtc > TimeSpan.FromDays(31))
            return BadRequest(new { message = "Select a valid date range up to 31 days." });

        var from = fromUtc.UtcDateTime;
        var to = toUtc.UtcDateTime;
        var appointments = _db.Appointments.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId &&
                        a.Status == "CheckedOut" &&
                        a.CheckedOutAtUtc >= from && a.CheckedOutAtUtc < to)
            .OrderByDescending(a => a.CheckedOutAtUtc)
            .Take(200);

        var rows = await (
            from a in appointments
            join p in _db.Patients.AsNoTracking() on a.PatientId equals p.Id
            where p.DentalPracticeId == practiceId
            select new
            {
                appointmentId = a.Id,
                patientName = p.FirstName + " " + p.LastName,
                checkedOutAtUtc = a.CheckedOutAtUtc,
                status = a.Status
            }).ToListAsync(ct);

        return Ok(rows);
    }

    // POST /api/frontdesk/checkouts/{appointmentId}/payments
    // All payment operations for one appointment are serialized with FOR UPDATE.
    // RequestId is a stable idempotency key, preventing double charges on retries.
    [HttpPost("{appointmentId:guid}/payments")]
    public async Task<IActionResult> RecordPayment(
        Guid appointmentId, [FromBody] RecordPaymentRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();

        if (request.RequestId == Guid.Empty ||
            request.Amount <= 0m || request.Amount > 10000000m ||
            decimal.Round(request.Amount, 2) != request.Amount)
            return BadRequest(new { message = "Supply a valid payment amount and request ID." });

        var method = request.Method?.Trim() ?? "";
        if (method != "Cash" && method != "Card" && method != "EFT")
            return BadRequest(new { message = "Payment method must be Cash, Card or EFT." });

        var reference = request.Reference?.Trim();
        if (reference?.Length > 100 ||
            ((method == "Card" || method == "EFT") && string.IsNullOrWhiteSpace(reference)))
            return BadRequest(new
            {
                message = "Card and EFT require an external payment reference (never a card number)."
            });

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        // SELECT FOR UPDATE locks this appointment until commit so two cashiers
        // cannot simultaneously record payments against the same remaining balance.
        var appointment = await _db.Appointments
            .FromSqlInterpolated($"SELECT * FROM \"Appointments\" WHERE \"Id\" = {appointmentId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (appointment is null) return NotFound();

        var previous = await _db.Payments.AsNoTracking()
            .FirstOrDefaultAsync(p => p.DentalPracticeId == practiceId &&
                                      p.RequestId == request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.AppointmentId != appointmentId ||
                previous.Amount != request.Amount || previous.Method != method ||
                previous.Reference != reference)
                return Conflict(new { message = "This payment request ID was already used." });
            return Ok(new { paymentId = previous.Id, previous.ReceiptNumber,
                amount = previous.Amount, alreadyRecorded = true });
        }

        if (appointment.Status != "AwaitingCheckout")
            return Conflict(new { message = "This visit is not awaiting checkout." });

        var consultation = await _db.Consultations.AsNoTracking()
            .FirstOrDefaultAsync(c => c.DentalPracticeId == practiceId &&
                                      c.AppointmentId == appointmentId && c.IsFinalized, ct);
        if (consultation is null)
            return Conflict(new { message = "The Dentist must finish the consultation first." });

        var charged = await _db.ConsultationCharges
            .Where(c => c.DentalPracticeId == practiceId &&
                        c.ConsultationId == consultation.Id)
            .SumAsync(c => (decimal?)c.Amount, ct) ?? 0m;
        var paid = await _db.Payments
            .Where(p => p.DentalPracticeId == practiceId &&
                        p.AppointmentId == appointmentId)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var balance = charged - paid;
        if (balance <= 0m || request.Amount > balance)
            return Conflict(new { message = "Payment exceeds the outstanding balance or no amount is due.", balance });

        var paymentId = Guid.NewGuid();
        var receivedAt = DateTime.UtcNow;
        var payment = new Payment
        {
            Id = paymentId,
            DentalPracticeId = practiceId,
            AppointmentId = appointmentId,
            RequestId = request.RequestId,
            Amount = request.Amount,
            Method = method,
            Reference = reference,
            ReceivedAtUtc = receivedAt,
            ReceivedByUserId = actorId,
            ReceiptNumber = $"RCPT-{receivedAt:yyyyMMdd}-{paymentId.ToString("N")[..12].ToUpperInvariant()}"
        };
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("PAYMENT_RECORDED", "Payment", payment.Id.ToString(), ct: ct);
        await transaction.CommitAsync(ct);

        return Created($"/api/frontdesk/payments/{payment.Id}/receipt", new
        {
            paymentId = payment.Id,
            payment.ReceiptNumber,
            amount = payment.Amount,
            balance = balance - payment.Amount,
            alreadyRecorded = false
        });
    }

    // POST /api/frontdesk/checkouts/{appointmentId}/complete
    // Checkout is explicit AFTER receipts are recorded; a R0 visit can
    // also be checked out. Outstanding balances require an approved debt
    // workflow which is not enabled in this initial implementation.
    [HttpPost("{appointmentId:guid}/complete")]
    public async Task<IActionResult> Complete(Guid appointmentId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var appointment = await _db.Appointments
            .FromSqlInterpolated($"SELECT * FROM \"Appointments\" WHERE \"Id\" = {appointmentId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (appointment is null) return NotFound();
        if (appointment.Status != "AwaitingCheckout")
            return Conflict(new { message = "Only an awaiting-checkout visit may be checked out." });

        var consultation = await _db.Consultations.AsNoTracking()
            .FirstOrDefaultAsync(c => c.DentalPracticeId == practiceId &&
                                      c.AppointmentId == appointmentId && c.IsFinalized, ct);
        if (consultation is null)
            return Conflict(new { message = "The Dentist has not finalized this consultation." });

        var charged = await _db.ConsultationCharges
            .Where(c => c.DentalPracticeId == practiceId &&
                        c.ConsultationId == consultation.Id)
            .SumAsync(c => (decimal?)c.Amount, ct) ?? 0m;
        var paid = await _db.Payments
            .Where(p => p.DentalPracticeId == practiceId &&
                        p.AppointmentId == appointmentId)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        if (charged != paid)
            return Conflict(new
            {
                message = "Outstanding balance must be zero to complete checkout.",
                balance = charged - paid
            });

        appointment.Status = "CheckedOut";
        appointment.CheckedOutAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("PATIENT_CHECKED_OUT", "Appointment", appointmentId.ToString(), ct: ct);
        await transaction.CommitAsync(ct);
        return Ok(new { appointmentId, status = "CheckedOut", appointment.CheckedOutAtUtc });
    }

    // GET /api/frontdesk/payments/{paymentId}/receipt
    [HttpGet("/api/frontdesk/payments/{paymentId:guid}/receipt")]
    public async Task<IActionResult> Receipt(Guid paymentId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var payment = await _db.Payments.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == paymentId && p.DentalPracticeId == practiceId, ct);
        if (payment is null) return NotFound();
        var details = await LoadDetails(payment.AppointmentId, practiceId, ct);
        if (details is null) return NotFound();
        var practiceName = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(ct);
        // The receipt reflects the balance immediately after THIS payment,
        // not a later balance after other payments have been received.
        var previouslyPaid = details.Payments
            .TakeWhile(p => p.Id != payment.Id)
            .Sum(p => p.Amount);
        var paidAtReceipt = previouslyPaid + payment.Amount;

        return Ok(new
        {
            payment.ReceiptNumber,
            paymentId = payment.Id,
            payment.AppointmentId,
            practiceName = practiceName ?? "Dental Practice",
            details.PatientName,
            payment.Amount,
            payment.Method,
            payment.Reference,
            payment.ReceivedAtUtc,
            currency = "ZAR",
            amountBilled = details.AmountDue,
            totalPaid = paidAtReceipt,
            balance = details.AmountDue - paidAtReceipt,
            details.Status
        });
    }

    private sealed record PaymentRow(Guid Id, string ReceiptNumber,
        decimal Amount, string Method, string? Reference, DateTime ReceivedAtUtc);
    private sealed record CheckoutDetails(
        Guid AppointmentId, Guid PatientId, string PatientName, string Status,
        DateTime? CompletedAtUtc, DateTime? CheckedOutAtUtc,
        decimal AmountDue, decimal AmountPaid, decimal Balance,
        string Currency, List<PaymentRow> Payments);

    private async Task<CheckoutDetails?> LoadDetails(
        Guid appointmentId, Guid practiceId, CancellationToken ct)
    {
        var appointment = await _db.Appointments.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == appointmentId &&
                                      a.DentalPracticeId == practiceId &&
                                      (a.Status == "AwaitingCheckout" || a.Status == "CheckedOut"), ct);
        if (appointment is null) return null;
        var patient = await _db.Patients.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == appointment.PatientId &&
                                      p.DentalPracticeId == practiceId, ct);
        if (patient is null) return null;
        var consultation = await _db.Consultations.AsNoTracking()
            .FirstOrDefaultAsync(c => c.DentalPracticeId == practiceId &&
                                      c.AppointmentId == appointmentId && c.IsFinalized, ct);
        if (consultation is null) return null;

        var due = await _db.ConsultationCharges
            .Where(c => c.DentalPracticeId == practiceId && c.ConsultationId == consultation.Id)
            .SumAsync(c => (decimal?)c.Amount, ct) ?? 0m;
        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.AppointmentId == appointmentId)
            .OrderBy(p => p.ReceivedAtUtc)
            .ThenBy(p => p.Id)
            .Select(p => new PaymentRow(p.Id, p.ReceiptNumber, p.Amount,
                p.Method, p.Reference, p.ReceivedAtUtc))
            .ToListAsync(ct);
        var paid = payments.Sum(p => p.Amount);
        return new CheckoutDetails(appointment.Id, patient.Id,
            patient.FirstName + " " + patient.LastName, appointment.Status,
            appointment.ConsultationEndedAtUtc, appointment.CheckedOutAtUtc,
            due, paid, due - paid, "ZAR", payments);
    }
}
