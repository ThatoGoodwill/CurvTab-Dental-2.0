using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/patient-balances")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class PatientBalancesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public PatientBalancesController(
        DentalDbContext db,
        ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (page < 1 || pageSize < 1 || pageSize > 100)
            return BadRequest(new {
                message = "Choose a valid page and page size (1–100)."
            });

        var term = search?.Trim() ?? "";

        if (term.Length > 100)
            return BadRequest(new {
                message = "Search text must be 100 characters or fewer."
            });

        var patients = _db.Patients.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId);

        if (term.Length > 0)
        {
            var pattern = "%" +
                term.Replace("\\", "\\\\")
                    .Replace("%", "\\%")
                    .Replace("_", "\\_") + "%";

            patients = patients.Where(p =>
                EF.Functions.ILike(p.FirstName, pattern) ||
                EF.Functions.ILike(p.LastName, pattern) ||
                EF.Functions.ILike(
                    p.FirstName + " " + p.LastName, pattern));
        }

        var totalPatients = await patients.CountAsync(ct);

        var skip = (long)(page - 1) * pageSize;

        if (skip > int.MaxValue)
            return BadRequest(new { message = "Page is too large." });

        var selected = await patients
            .OrderBy(p => p.LastName)
            .ThenBy(p => p.FirstName)
            .ThenBy(p => p.Id)
            .Skip((int)skip)
            .Take(pageSize)
            .Select(p => new
            {
                p.Id,
                p.FirstName,
                p.LastName
            })
            .ToListAsync(ct);

        var ids = selected.Select(p => p.Id).ToArray();

        // Group charges before combining with payments.
        // Joining raw charge rows to raw payment rows would
        // multiply amounts for visits with multiple of each.
        var charges = await (
            from charge in _db.ConsultationCharges.AsNoTracking()
            join consultation in _db.Consultations.AsNoTracking()
                on charge.ConsultationId equals consultation.Id
            join appointment in _db.Appointments.AsNoTracking()
                on consultation.AppointmentId equals appointment.Id
            where charge.DentalPracticeId == practiceId
               && consultation.DentalPracticeId == practiceId
               && appointment.DentalPracticeId == practiceId
               && consultation.IsFinalized
               && ids.Contains(appointment.PatientId)
            group charge by appointment.PatientId into g
            select new
            {
                PatientId = g.Key,
                Amount = g.Sum(x => x.Amount)
            }
        ).ToListAsync(ct);

        var payments = await (
            from payment in _db.Payments.AsNoTracking()
            join appointment in _db.Appointments.AsNoTracking()
                on payment.AppointmentId equals appointment.Id
            where payment.DentalPracticeId == practiceId
               && appointment.DentalPracticeId == practiceId
               && ids.Contains(appointment.PatientId)
            group payment by appointment.PatientId into g
            select new
            {
                PatientId = g.Key,
                Amount = g.Sum(x => x.Amount)
            }
        ).ToListAsync(ct);

        var chargedByPatient = charges.ToDictionary(
            x => x.PatientId, x => x.Amount);

        var paidByPatient = payments.ToDictionary(
            x => x.PatientId, x => x.Amount);

        var rows = selected.Select(p =>
        {
            var charged = chargedByPatient.GetValueOrDefault(p.Id);
            var paid = paidByPatient.GetValueOrDefault(p.Id);

            return new
            {
                patientId = p.Id,
                patientName = p.FirstName + " " + p.LastName,
                totalCharges = charged,
                totalPayments = paid,
                balance = charged - paid,
                requiresReview = paid > charged
            };
        }).ToList();

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            currency = "ZAR",
            page,
            pageSize,
            totalPatients,
            displayedPatients = rows.Count,
            displayedCharges = rows.Sum(x => x.totalCharges),
            displayedPayments = rows.Sum(x => x.totalPayments),
            displayedBalance = rows.Sum(x => x.balance),
            patients = rows,
            scope = "Finalized consultation charges and " +
                    "existing appointment payment receipts only.",
            note = "This is not an issued-invoice or " +
                   "complete accounts-receivable ledger."
        });
    }
}
