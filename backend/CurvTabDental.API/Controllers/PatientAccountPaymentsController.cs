
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
[Authorize(Roles = "Receptionist,PracticeAdmin")]
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
                payment.AppointmentId,
                payment.ReceiptNumber,
                payment.Amount,
                payment.Method,
                payment.Reference,
                payment.ReceivedAtUtc
            }
        ).ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";
        return Ok(receipts);
    }
}
