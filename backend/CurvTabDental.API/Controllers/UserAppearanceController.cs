using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// The signed-in account's OWN colour theme and workspace layout.
/// Any value left null follows the practice default (see PracticeAppearanceController).
/// A user can only ever read or change their own row: the id comes from the auth cookie, never from the request.
/// </summary>
[ApiController]
[Route("api/me/appearance")]
[Authorize]
public sealed class UserAppearanceController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public UserAppearanceController(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    public sealed record UserAppearanceDto(
        string? ThemeSurface,
        string? LayoutPreset,
        string? NavigationMode);

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Forbid();

        var row = await _db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new UserAppearanceDto(
                u.PreferredThemeSurface, u.PreferredLayoutPreset, u.PreferredNavigationMode))
            .SingleOrDefaultAsync(ct);

        return row is null ? NotFound() : Ok(Normalise(row));
    }

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] UserAppearanceDto request, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Forbid();

        var theme = Clean(request.ThemeSurface, lower: true);
        var preset = Clean(request.LayoutPreset, lower: false);
        var nav = Clean(request.NavigationMode, lower: false);

        if (theme is not null && !PracticeAppearanceController.ThemeSurfaces.Contains(theme))
            return BadRequest(new { message = "Choose a supported colour theme." });
        if (preset is not null && !PracticeAppearanceController.LayoutPresets.Contains(preset))
            return BadRequest(new { message = "Choose a supported layout." });
        if (nav is not null && !PracticeAppearanceController.NavigationModes.Contains(nav))
            return BadRequest(new { message = "Choose a supported navigation style." });

        var user = await _db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return NotFound();

        user.PreferredThemeSurface = theme;
        user.PreferredLayoutPreset = preset;
        user.PreferredNavigationMode = nav;
        await _db.SaveChangesAsync(ct);

        return Ok(new UserAppearanceDto(theme, preset, nav));
    }

    private static string? Clean(string? value, bool lower)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text)) return null;
        return lower ? text.ToLowerInvariant() : text;
    }

    // Never hand the browser a stale value that the server no longer supports.
    private static UserAppearanceDto Normalise(UserAppearanceDto row) => new(
        row.ThemeSurface is not null && PracticeAppearanceController.ThemeSurfaces.Contains(row.ThemeSurface)
            ? row.ThemeSurface : null,
        row.LayoutPreset is not null && PracticeAppearanceController.LayoutPresets.Contains(row.LayoutPreset)
            ? row.LayoutPreset : null,
        row.NavigationMode is not null && PracticeAppearanceController.NavigationModes.Contains(row.NavigationMode)
            ? row.NavigationMode : null);
}
