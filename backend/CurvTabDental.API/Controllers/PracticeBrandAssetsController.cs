using System.Text.RegularExpressions;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/practice/branding-assets")]
[Authorize(Roles = "PracticeAdmin")]
public sealed class PracticeBrandAssetsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PracticeBrandAssetsController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record BrandingAssetsRequest(
        string? LogoUrl,
        string? BadgeUrl,
        string? LoginBackgroundUrl = null
    );

    private static bool ValidOwnedImage(
        string? url,
        string kind,
        Guid practiceId)
    {
        if (string.IsNullOrEmpty(url))
            return true;

        var prefix =
            $"/api/practice/media/public/{practiceId:D}/";

        if (!url.StartsWith(prefix, StringComparison.Ordinal))
            return false;

        var fileName = url[prefix.Length..];

        if (!Regex.IsMatch(
            fileName,
            $"^{kind}-[a-f0-9]{{32}}\\.(png|jpg|webp)$",
            RegexOptions.CultureInvariant))
            return false;

        var filePath = Path.Combine(
            AppContext.BaseDirectory,
            "practice-media",
            practiceId.ToString("D"),
            fileName
        );

        return System.IO.File.Exists(filePath);
    }

    [HttpPut]
    public async Task<IActionResult> Save(
        [FromBody] BrandingAssetsRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (request is null ||
            !ValidOwnedImage(request.LogoUrl, "logo", practiceId) ||
            !ValidOwnedImage(request.BadgeUrl, "badge", practiceId) ||
            !ValidOwnedImage(request.LoginBackgroundUrl, "loginbg", practiceId))
        {
            return BadRequest(new
            {
                message = "Choose images uploaded to your own practice."
            });
        }

        var practice = await _db.DentalPractices
            .AsNoTracking()
            .Where(p => p.Id == practiceId && p.IsActive)
            .Select(p => new { p.Name })
            .SingleOrDefaultAsync(ct);

        if (practice is null)
            return NotFound();

        var row = await _db.Set<PracticeAppearance>()
            .SingleOrDefaultAsync(
                p => p.DentalPracticeId == practiceId, ct);

        if (row is null)
        {
            row = new PracticeAppearance
            {
                DentalPracticeId = practiceId,
                DisplayName = practice.Name
            };
            _db.Set<PracticeAppearance>().Add(row);
        }

        row.LogoUrl = request.LogoUrl;
        row.BadgeUrl = request.BadgeUrl;
        row.LoginBackgroundUrl = request.LoginBackgroundUrl;
        row.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "PRACTICE_BRANDING_ASSETS_UPDATED",
            "PracticeAppearance",
            practiceId.ToString(),
            ct: ct);

        return Ok(new
        {
            logoUrl = row.LogoUrl,
            badgeUrl = row.BadgeUrl,
            loginBackgroundUrl = row.LoginBackgroundUrl
        });
    }
}
