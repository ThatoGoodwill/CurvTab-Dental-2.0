
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Read-only receipts belonging to one patient in the current practice.
// No clinical notes or card details are returned.
[ApiController]
[Route("api/finance/patients")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class PatientAccountPaymentsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public PatientAccountPaymentsController(
        DentalDbContext db,
        ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet("{patientId:guid}/payments")]
    public async Task<IActionResult> Payments(
        Guid patientId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var patientExists = await _db.Patients
            .AsNoTracking()
            .AnyAsync(p =>
                p.Id == patientId &&
                p.DentalPracticeId == practiceId, ct);

        if (!patientExists)
            return NotFound();

        var receipts = await (
            from payment in _db.Payments.AsNoTracking()
            join appointment in _db.Appointments.AsNoTracking()
                on payment.AppointmentId equals appointment.Id
            where
                payment.DentalPracticeId == practiceId &&
                appointment.DentalPracticeId == practiceId &&
                appointment.PatientId == patientId
            orderby payment.ReceivedAtUtc descending, payment.Id descending
            select new
            {
                paymentId = payment.Id,
                appointmentId = (Guid?)payment.AppointmentId,
                payment.ReceiptNumber,
                payment.Amount,
                payment.Method,
                payment.Reference,
                payment.ReceivedAtUtc,
                source = "Visit checkout"
            }
        ).ToListAsync(ct);

        // Show all actual patient receipts without treating future
        // invoice allocations as a second payment. Intake advances remain
        // unallocated patient credits until a signed treatment agreement.
        var planReceipts = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId)
            .OrderByDescending(p => p.ReceivedAtUtc)
            .Select(p => new
            {
                paymentId = p.Id, appointmentId = (Guid?)null, p.ReceiptNumber,
                p.Amount, p.Method, p.Reference, p.ReceivedAtUtc,
                source = "Treatment plan receipt"
            }).ToListAsync(ct);
        var advanceReceipts = await _db.OrthodonticIntakeAdvanceReceipts.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId)
            .OrderByDescending(p => p.ReceivedAtUtc)
            .Select(p => new
            {
                paymentId = p.Id, appointmentId = (Guid?)null, p.ReceiptNumber,
                p.Amount, p.Method, p.Reference, p.ReceivedAtUtc,
                source = "Orthodontic intake advance (patient credit)"
            }).ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";
        return Ok(receipts.Concat(planReceipts).Concat(advanceReceipts)
            .OrderByDescending(x => x.ReceivedAtUtc));
    }
}
