using CurvTabDental.API.Contracts;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Patients of the caller's practice (FR-010, FR-011).
/// Tenant isolation comes from the DbContext query filter: another practice's patient id simply returns 404.
/// </summary>
[ApiController]
[Route("api/patients")]
[Authorize(Roles = StaffRoles.PatientRead)]
public class PatientsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PatientsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<PatientDto>>> Search(
        [FromQuery] string? q,
        [FromQuery] bool includeArchived = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        IQueryable<Patient> query = _db.Patients.AsNoTracking();
        if (!includeArchived) query = query.Where(p => !p.IsArchived);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = "%" + EscapeLike(q.Trim()) + "%";
            query = query.Where(p =>
                EF.Functions.ILike(p.FirstName, pattern) ||
                EF.Functions.ILike(p.LastName, pattern) ||
                (p.PhoneNumber != null && EF.Functions.ILike(p.PhoneNumber, pattern)) ||
                (p.IdNumber != null && EF.Functions.ILike(p.IdNumber, pattern)));
        }

        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderBy(p => p.LastName).ThenBy(p => p.FirstName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var items = rows.Select(p => ToDto(p, _current.Role)).ToList();
        return Ok(new PagedResult<PatientDto>(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PatientDto>> Get(Guid id, CancellationToken ct)
    {
        var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (patient is null) return NotFound();

        await _audit.WriteAsync("PATIENT_VIEWED", "Patient", id.ToString(), ct: ct);
        return Ok(ToDto(patient, _current.Role));
    }

    [HttpPost]
    [Authorize(Roles = StaffRoles.PatientWrite)]
    public async Task<IActionResult> Create(
        [FromBody] PatientRequest request,
        [FromQuery] bool allowDuplicate = false,
        CancellationToken ct = default)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        if (!allowDuplicate)
        {
            var duplicates = await FindDuplicatesAsync(request, excludeId: null, ct);
            if (duplicates.Count > 0) return DuplicateConflict(duplicates);
        }

        var now = DateTime.UtcNow;
        var patient = new Patient
        {
            DentalPracticeId = practiceId, // from the signed-in user, never from the request
            CreatedByUserId = _current.UserId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        Apply(patient, request, now);

        _db.Patients.Add(patient);
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync("PATIENT_CREATED", "Patient", patient.Id.ToString(), ct: ct);
        return CreatedAtAction(nameof(Get), new { id = patient.Id }, ToDto(patient, _current.Role));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = StaffRoles.PatientWrite)]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] PatientRequest request,
        [FromQuery] bool allowDuplicate = false,
        CancellationToken ct = default)
    {
        var patient = await _db.Patients.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (patient is null) return NotFound();

        if (!allowDuplicate)
        {
            var duplicates = await FindDuplicatesAsync(request, excludeId: id, ct);
            if (duplicates.Count > 0) return DuplicateConflict(duplicates);
        }

        Apply(patient, request, DateTime.UtcNow);
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync("PATIENT_UPDATED", "Patient", id.ToString(), ct: ct);
        return Ok(ToDto(patient, _current.Role));
    }

    [HttpPost("{id:guid}/archive")]
    [Authorize(Roles = StaffRoles.PatientWrite)]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        var patient = await _db.Patients.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (patient is null) return NotFound();

        patient.IsArchived = true;
        patient.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync("PATIENT_ARCHIVED", "Patient", id.ToString(), ct: ct);
        return NoContent();
    }

    // ---------- helpers ----------

    private async Task<List<Guid>> FindDuplicatesAsync(PatientRequest r, Guid? excludeId, CancellationToken ct)
    {
        var first = r.FirstName.Trim().ToLower();
        var last = r.LastName.Trim().ToLower();
        var idNumber = string.IsNullOrWhiteSpace(r.IdNumber) ? null : r.IdNumber.Trim();
        var dob = r.DateOfBirth;

        // The query filter already limits this to the caller's practice.
        return await _db.Patients
            .AsNoTracking()
            .Where(p => !p.IsArchived && (excludeId == null || p.Id != excludeId))
            .Where(p =>
                (idNumber != null && p.IdNumber == idNumber) ||
                (dob != null && p.DateOfBirth == dob &&
                 p.FirstName.ToLower() == first && p.LastName.ToLower() == last))
            .Select(p => p.Id)
            .Take(5)
            .ToListAsync(ct);
    }

    private ConflictObjectResult DuplicateConflict(List<Guid> duplicateIds) =>
        Conflict(new
        {
            title = "A patient with the same ID number, or the same name and date of birth, already exists. " +
                    "Resubmit with ?allowDuplicate=true if this is a different person.",
            status = 409,
            code = "POSSIBLE_DUPLICATE",
            duplicatePatientIds = duplicateIds
        });

    private static void Apply(Patient p, PatientRequest r, DateTime now)
    {
        p.Title = Clean(r.Title);
        p.FirstName = r.FirstName.Trim();
        p.LastName = r.LastName.Trim();
        p.DateOfBirth = r.DateOfBirth;
        p.Gender = Clean(r.Gender);
        p.IdNumber = Clean(r.IdNumber);
        p.PhoneNumber = Clean(r.PhoneNumber);
        p.Email = Clean(r.Email);
        p.Address = Clean(r.Address);
        p.EmergencyContactName = Clean(r.EmergencyContactName);
        p.EmergencyContactPhone = Clean(r.EmergencyContactPhone);
        p.PaymentMethod = r.PaymentMethod;
        p.MedicalAidScheme = r.PaymentMethod == "MedicalAid" ? Clean(r.MedicalAidScheme) : null;
        p.MedicalAidOption = r.PaymentMethod == "MedicalAid" ? Clean(r.MedicalAidOption) : null;
        p.MedicalAidMemberNumber = r.PaymentMethod == "MedicalAid" ? Clean(r.MedicalAidMemberNumber) : null;

        if (r.ConsentGiven && p.ConsentRecordedAtUtc is null) p.ConsentRecordedAtUtc = now;
        p.UpdatedAtUtc = now;
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string EscapeLike(string input) =>
        input.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    /// <summary>Minimum-necessary projection by role (SRS section 9).</summary>
    private static PatientDto ToDto(Patient p, string? role)
    {
        var isLab = role == StaffRoles.LabTechnician;
        var isFinance = role == StaffRoles.Finance;

        return new PatientDto(
            p.Id,
            p.Title,
            p.FirstName,
            p.LastName,
            isLab ? null : p.DateOfBirth,
            p.Gender,
            isLab || isFinance ? null : p.IdNumber,
            p.PhoneNumber,
            isLab ? null : p.Email,
            isLab ? null : p.Address,
            isLab || isFinance ? null : p.EmergencyContactName,
            isLab || isFinance ? null : p.EmergencyContactPhone,
            p.PaymentMethod,
            isLab ? null : p.MedicalAidScheme,
            isLab ? null : p.MedicalAidOption,
            isLab ? null : p.MedicalAidMemberNumber,
            p.ConsentRecordedAtUtc != null,
            p.IsArchived,
            p.CreatedAtUtc,
            p.UpdatedAtUtc);
    }
}
