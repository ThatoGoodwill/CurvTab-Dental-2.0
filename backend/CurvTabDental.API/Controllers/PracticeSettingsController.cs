using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Mail;

namespace CurvTabDental.API.Controllers;

// PracticeAdmin can edit ONLY their own dental practice.
[ApiController]
[Route("api/practice/settings")]
[Authorize(Roles = "PracticeAdmin")]
public sealed class PracticeSettingsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PracticeSettingsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record UpdatePracticeSettingsRequest(
        string Name,
        string? Email,
        string? PhoneNumber,
        string? Address);

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var practice = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId && p.IsActive)
            .Select(p => new { p.Id, p.Name, p.Email, p.PhoneNumber, p.Address })
            .SingleOrDefaultAsync(ct);
        return practice is null ? NotFound() : Ok(practice);
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdatePracticeSettingsRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var name = request.Name?.Trim() ?? "";
        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        var phone = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim();
        var address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();

        if (name.Length is < 2 or > 200)
            return BadRequest(new { message = "Practice name must be 2–200 characters." });
        if (email is { Length: > 256 } || (email is not null && !MailAddress.TryCreate(email, out _)))
            return BadRequest(new { message = "Enter a valid practice email (maximum 256 characters)." });
        if (phone is { Length: > 30 })
            return BadRequest(new { message = "Phone number must be 30 characters or fewer." });
        if (address is { Length: > 500 })
            return BadRequest(new { message = "Address must be 500 characters or fewer." });

        var practice = await _db.DentalPractices
            .SingleOrDefaultAsync(p => p.Id == practiceId && p.IsActive, ct);
        if (practice is null) return NotFound();

        practice.Name = name;
        practice.Email = email;
        practice.PhoneNumber = phone;
        practice.Address = address;
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync("PRACTICE_SETTINGS_UPDATED", "DentalPractice", practice.Id.ToString(), ct: ct);

        return Ok(new { practice.Id, practice.Name, practice.Email, practice.PhoneNumber, practice.Address });
    }
}
