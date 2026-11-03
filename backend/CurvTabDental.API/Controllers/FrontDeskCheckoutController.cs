using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Reception receives amounts and statuses, never confidential clinical notes.
[ApiController]
[Route("api/frontdesk")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class FrontDeskCheckoutController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public FrontDeskCheckoutController(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    // GET /api/frontdesk/checkout-ready
    // Read-only preview. Actual payments / receipts come in the checkout phase.
    [HttpGet("checkout-ready")]
    public async Task<IActionResult> CheckoutReady(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        var appointments = _db.Appointments.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId &&
                        a.Status == "AwaitingCheckout")
            .OrderBy(a => a.ConsultationEndedAtUtc)
            .Take(100);

        var waiting = await (
            from a in appointments
            join p in _db.Patients.AsNoTracking() on a.PatientId equals p.Id
            where p.DentalPracticeId == practiceId
            select new { appointmentId = a.Id, patientId = p.Id,
                patientName = p.FirstName + " " + p.LastName,
                completedAtUtc = a.ConsultationEndedAtUtc }
        ).ToListAsync(ct);

        var appointmentIds = waiting.Select(x => x.appointmentId).ToList();
        var consultations = await _db.Consultations.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.IsFinalized &&
                        appointmentIds.Contains(c.AppointmentId))
            .Select(c => new { c.Id, c.AppointmentId })
            .ToListAsync(ct);
        var consultationIds = consultations.Select(c => c.Id).ToList();
        var charges = await _db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId &&
                        consultationIds.Contains(c.ConsultationId))
            .Select(c => new { c.ConsultationId, c.Amount })
            .ToListAsync(ct);
        var totals = charges.GroupBy(c => c.ConsultationId)
            .ToDictionary(g => g.Key, g => g.Sum(c => c.Amount));
        var consultationByAppointment = consultations
            .ToDictionary(c => c.AppointmentId, c => c.Id);

        return Ok(waiting
            .Where(v => consultationByAppointment.ContainsKey(v.appointmentId))
            .Select(v => new
            {
                v.appointmentId,
                v.patientId,
                v.patientName,
                status = "AwaitingCheckout",
                v.completedAtUtc,
                amountDue = totals.GetValueOrDefault(
                    consultationByAppointment[v.appointmentId], 0m),
                currency = "ZAR"
            })
            .ToList());
    }
}
