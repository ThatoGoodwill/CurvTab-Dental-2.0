using System.Text.RegularExpressions;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/practice/media")]
public sealed class PracticeMediaController : ControllerBase
{
    private const int MaxBytes = 2_500_000;
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    private static string StorageRoot =>
        Path.Combine(AppContext.BaseDirectory, "practice-media");

    public PracticeMediaController(
        DentalDbContext db,
        ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    public sealed record UploadRequest(
        string Kind,
        string Data
    );

    [HttpPost]
    [Authorize(Roles = "PracticeAdmin")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> Upload(
        [FromBody] UploadRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (request is null ||
            request.Kind is not ("slide" or "logo" or "badge" or "loginbg") ||
            string.IsNullOrWhiteSpace(request.Data) ||
            request.Data.Length > 3_400_000)
            return BadRequest(new { message = "Invalid image upload." });

        var active = await _db.DentalPractices.AsNoTracking()
            .AnyAsync(p => p.Id == practiceId && p.IsActive, ct);

        if (!active) return NotFound();

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(request.Data);
        }
        catch (FormatException)
        {
            return BadRequest(new { message = "Invalid image data." });
        }

        if (bytes.Length == 0 || bytes.Length > MaxBytes)
            return BadRequest(new { message = "Image must be under 2.5 MB." });

        string extension;
        string mime;

        if (bytes.Length >= 8 &&
            bytes.AsSpan(0, 8).SequenceEqual(
                new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
        {
            extension = ".png";
            mime = "image/png";
        }
        else if (bytes.Length >= 3 &&
                 bytes[0] == 255 && bytes[1] == 216 &&
                 bytes[2] == 255)
        {
            extension = ".jpg";
            mime = "image/jpeg";
        }
        else if (bytes.Length >= 12 &&
                 System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" &&
                 System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP")
        {
            extension = ".webp";
            mime = "image/webp";
        }
        else
        {
            return BadRequest(new
            {
                message = "Only valid PNG, JPEG or WebP images are allowed."
            });
        }

        var directory = Path.Combine(StorageRoot, practiceId.ToString("D"));
        Directory.CreateDirectory(directory);

        var file = $"{request.Kind}-{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(directory, file);

        await System.IO.File.WriteAllBytesAsync(fullPath, bytes, ct);

        var url = $"/api/practice/media/public/{practiceId:D}/{file}";

        return Ok(new { url, mime });
    }

    [HttpGet("public/{practiceId:guid}/{fileName}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(
        Guid practiceId,
        string fileName,
        CancellationToken ct)
    {
        // Uploaded branding imagery is public, never patient imagery.
        if (!Regex.IsMatch(
            fileName,
            @"^(slide|logo|badge|loginbg)-[a-f0-9]{32}\.(png|jpg|webp)$",
            RegexOptions.IgnoreCase))
            return NotFound();

        var active = await _db.DentalPractices.AsNoTracking()
            .AnyAsync(p => p.Id == practiceId && p.IsActive, ct);

        if (!active) return NotFound();

        var path = Path.Combine(
            StorageRoot, practiceId.ToString("D"), fileName);

        if (!System.IO.File.Exists(path))
            return NotFound();

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var mime = extension switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg"
        };

        return PhysicalFile(path, mime);
    }
}
