using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Small, tenant-protected lookup for live notifications. Never exposes
// consultation notes, diagnoses, medical history or payment details.
[ApiController]
[Route("api/clinic-notifications")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Dentist")]
public sealed class ClinicNotificationDetailsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public ClinicNotificationDetailsController(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet("appointments/{id:guid}")]
    public async Task<IActionResult> Appointment(Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        // Both sides of the join must belong to the signed-in practice.
        // Filtering before projection avoids the previous EF translation issue.
        var result = await (
            from a in _db.Appointments.AsNoTracking()
            join p in _db.Patients.AsNoTracking() on a.PatientId equals p.Id
            where a.Id == id && a.DentalPracticeId == practiceId
                && p.DentalPracticeId == practiceId
            select new
            {
                appointmentId = a.Id,
                patientName = p.FirstName + " " + p.LastName,
                startUtc = a.StartUtc,
                status = a.Status
            }
        ).SingleOrDefaultAsync(ct);

        if (result is null) return NotFound();
        return Ok(result);
    }
}
