using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/public/practice-branding")]
public sealed class PublicPracticeBrandingController : ControllerBase
{
    private readonly DentalDbContext _db;

    public PublicPracticeBrandingController(DentalDbContext db)
    {
        _db = db;
    }

    [HttpGet("{practiceId:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid practiceId, CancellationToken ct)
    {
        // A practice must exist and be active.
        var practice = await _db.DentalPractices
            .AsNoTracking()
            .Where(p => p.Id == practiceId && p.IsActive)
            .Select(p => new { p.Name })
            .SingleOrDefaultAsync(ct);

        if (practice is null)
            return NotFound();

        // This is an intentionally restricted public lookup.
        // Never return patient, staff or private workspace data.
        var appearance = await _db.Set<PracticeAppearance>()
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId)
            .Select(p => new
            {
                p.DisplayName, p.Tagline, p.PrimaryColor, p.AccentColor, p.LogoUrl, p.BadgeUrl, p.LoginBackgroundUrl
            })
            .SingleOrDefaultAsync(ct);

        Response.Headers.CacheControl = "no-store";

        return Ok(new
        {
            displayName = appearance?.DisplayName ?? practice.Name,
            tagline = appearance?.Tagline ?? "",
            primaryColor = appearance?.PrimaryColor ?? "#126CE5",
            accentColor = appearance?.AccentColor ?? "#14B8A6",
            logoUrl = appearance?.LogoUrl,
            badgeUrl = appearance?.BadgeUrl,
            loginBackgroundUrl = appearance?.LoginBackgroundUrl
        });
    }
}
