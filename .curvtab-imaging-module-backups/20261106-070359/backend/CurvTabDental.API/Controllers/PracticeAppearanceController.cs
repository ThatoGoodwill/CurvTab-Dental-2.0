using System.Text.RegularExpressions;
using System.Text.Json;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/practice/appearance")]
[Authorize(Roles = "PracticeAdmin,Dentist,Receptionist,Finance,LabTechnician")]
public sealed class PracticeAppearanceController : ControllerBase
{
    private static readonly string[] DefaultModules = [
        "Patients", "Appointments", "Daily Patients", "Consultations",
        "Checkout & Payments", "Dental Charting", "Orthodontics"
    ];
    private static readonly HashSet<string> AllowedModules = new(DefaultModules, StringComparer.Ordinal);

    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PracticeAppearanceController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record AppearanceUpdate(
        string DisplayName,
        string Tagline,
        string PrimaryColor,
        string AccentColor,
        string LayoutPreset,
        string NavigationMode,
        string[] EnabledModules,
        string? LogoUrl = null,
        string? BadgeUrl = null,
        string? LoginBackgroundUrl = null);

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var row = await _db.Set<PracticeAppearance>()
            .AsNoTracking().SingleOrDefaultAsync(x => x.DentalPracticeId == practiceId, ct);
        if (row is not null) return Ok(ToDto(row));

        var practice = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId && p.IsActive)
            .Select(p => new { p.Name }).SingleOrDefaultAsync(ct);
        if (practice is null) return NotFound();
        return Ok(new AppearanceUpdate(practice.Name, "", "#126CE5", "#14B8A6", "Classic", "Sidebar", DefaultModules));
    }

    [HttpPut]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Put([FromBody] AppearanceUpdate request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var name = request.DisplayName?.Trim() ?? "";
        var tagline = request.Tagline?.Trim() ?? "";
        var primary = request.PrimaryColor?.Trim() ?? "";
        var accent = request.AccentColor?.Trim() ?? "";
        var preset = request.LayoutPreset?.Trim() ?? "";

        if (name.Length is < 2 or > 100 || tagline.Length > 160)
            return BadRequest(new { message = "Name must be 2–100 characters; tagline max 160." });
        if (!Regex.IsMatch(primary, "^#[0-9A-Fa-f]{6}$") ||
            !Regex.IsMatch(accent, "^#[0-9A-Fa-f]{6}$"))
            return BadRequest(new { message = "Use 6-digit hex colours." });
        if (preset is not ("Classic" or "Compact" or "Clinical"))
            return BadRequest(new { message = "Choose a supported layout preset." });
        if (request.NavigationMode is not ("Sidebar" or "Topbar"))
            return BadRequest(new { message = "Choose Sidebar or Topbar navigation." });
        if (request.EnabledModules is null || request.EnabledModules.Any(m => !AllowedModules.Contains(m)))
            return BadRequest(new { message = "Invalid module selection." });
        if (request.EnabledModules.Distinct(StringComparer.Ordinal).Count() != request.EnabledModules.Length)
            return BadRequest(new { message = "Duplicate modules are not allowed." });

        var practiceExists = await _db.DentalPractices.AnyAsync(p => p.Id == practiceId && p.IsActive, ct);
        if (!practiceExists) return NotFound();

        var row = await _db.Set<PracticeAppearance>()
            .SingleOrDefaultAsync(p => p.DentalPracticeId == practiceId, ct);
        if (row is null)
        {
            row = new PracticeAppearance { DentalPracticeId = practiceId };
            _db.Set<PracticeAppearance>().Add(row);
        }
        row.DisplayName = name;
        row.Tagline = tagline;
        row.PrimaryColor = primary.ToUpperInvariant();
        row.AccentColor = accent.ToUpperInvariant();
        row.LayoutPreset = preset;
        row.NavigationMode = request.NavigationMode;
        row.EnabledModulesJson = JsonSerializer.Serialize(request.EnabledModules);
        row.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("PRACTICE_APPEARANCE_UPDATED", "PracticeAppearance", practiceId.ToString(), ct: ct);
        return Ok(ToDto(row));
    }

    private static AppearanceUpdate ToDto(PracticeAppearance row) => new(
        row.DisplayName, row.Tagline, row.PrimaryColor, row.AccentColor, row.LayoutPreset,
        row.NavigationMode is "Topbar" ? "Topbar" : "Sidebar",
        ReadModules(row.EnabledModulesJson), row.LogoUrl, row.BadgeUrl, row.LoginBackgroundUrl);

    private static string[] ReadModules(string? json)
    {
        try
        {
            var modules = JsonSerializer.Deserialize<string[]>(json ?? "") ?? DefaultModules;
            return modules.Where(m => AllowedModules.Contains(m)).Distinct(StringComparer.Ordinal).ToArray();
        }
        catch (JsonException) { return DefaultModules; }
    }
}
