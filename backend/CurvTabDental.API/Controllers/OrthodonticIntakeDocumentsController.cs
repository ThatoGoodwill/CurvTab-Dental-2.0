using System.Security.Cryptography;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Secure, immutable, practice-scoped Phase 1 supporting evidence.
/// Stored in Postgres, never in Render's ephemeral container filesystem.
/// </summary>
[ApiController]
[Route("api/orthodontics/intakes/{intakeId:guid}/documents")]
[Authorize(Roles = "PracticeAdmin,Receptionist,Dentist,Orthodontist")]
public sealed class OrthodonticIntakeDocumentsController : ControllerBase
{
    private const int MaximumBytes = 4_000_000;
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    public OrthodonticIntakeDocumentsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db; _current = current; _audit = audit;
    }

    private async Task<OrthodonticIntakeCase?> Allowed(Guid intakeId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return null;
        var query = _db.OrthodonticIntakes.AsNoTracking().Where(x =>
            x.Id == intakeId && x.DentalPracticeId == practiceId && x.ClosedAtUtc == null);
        if (_current.Role is StaffRoles.Dentist or StaffRoles.Orthodontist)
            query = query.Where(x => x.AssignedOrthodontistUserId == _current.UserId);
        return await query.FirstOrDefaultAsync(ct);
    }

    [HttpGet]
    public async Task<IActionResult> List(Guid intakeId, CancellationToken ct)
    {
        var intake = await Allowed(intakeId, ct);
        if (intake is null) return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        var docs = await _db.OrthodonticIntakeDocuments.AsNoTracking()
            .Where(x => x.IntakeId == intake.Id && x.PatientId == intake.PatientId &&
                        x.DentalPracticeId == intake.DentalPracticeId)
            .OrderByDescending(x => x.UploadedAtUtc)
            .Select(x => new { x.Id, x.Category, x.OriginalFileName, x.ContentType,
                x.SizeBytes, x.Sha256, x.UploadedAtUtc, x.UploadedByUserId })
            .Take(100).ToListAsync(ct);
        return Ok(docs);
    }

    [HttpPost]
    [RequestSizeLimit(5_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 5_000_000)]
    public async Task<IActionResult> Upload(Guid intakeId,
        [FromForm] IFormFile file, [FromForm] string category, CancellationToken ct)
    {
        if (_current.UserId is not Guid actor) return Unauthorized();
        var intake = await Allowed(intakeId, ct);
        if (intake is null) return NotFound();
        if (file is null || file.Length is <= 0 or > MaximumBytes)
            return BadRequest(new { message = "Upload a nonempty PDF, JPEG or PNG of at most 4 MB." });
        if (category is not ("XRAY" or "PHOTO" or "REFERRAL" or "PREVIOUS_RECORD" or "CONSENT_EVIDENCE" or "OTHER"))
            return BadRequest(new { message = "Select a valid evidence category." });

        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        if (buffer.Length is <= 0 or > MaximumBytes) return BadRequest(new { message = "File exceeds the limit." });
        var bytes = buffer.ToArray();

        // Strict signature and declared type checking. Never trust the extension alone.
        var isPdf = bytes.Length >= 5 &&
            bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8);
        var isPng = bytes.Length >= 8 &&
            bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var isJpeg = bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255;
        var mime = isPdf ? "application/pdf" : isPng ? "image/png" : isJpeg ? "image/jpeg" : null;
        if (mime == null) return BadRequest(new { message = "Invalid or unsupported file format." });
        if (!string.Equals(file.ContentType, mime, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "The file type does not match the file contents." });

        var name = Path.GetFileName(file.FileName);
        name = string.Concat(name.Where(ch => char.IsLetterOrDigit(ch) || ch is ' ' or '.' or '-' or '_'));
        name = string.IsNullOrWhiteSpace(name) ? "intake-evidence" : name[..Math.Min(name.Length, 200)];
        var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        var duplicate = await _db.OrthodonticIntakeDocuments.AsNoTracking()
            .AnyAsync(x => x.IntakeId == intake.Id && x.Sha256 == hash, ct);
        if (duplicate) return Conflict(new { message = "This exact document is already attached to this intake." });

        var doc = new OrthodonticIntakeDocument
        {
            DentalPracticeId = intake.DentalPracticeId,
            PatientId = intake.PatientId,
            IntakeId = intake.Id,
            UploadedByUserId = actor,
            Category = category,
            OriginalFileName = name,
            ContentType = mime,
            SizeBytes = bytes.LongLength,
            Sha256 = hash,
            Content = bytes
        };
        _db.OrthodonticIntakeDocuments.Add(doc);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_INTAKE_DOCUMENT_UPLOADED",
            "OrthodonticIntakeDocument", doc.Id.ToString(),
            detail: $"case={intake.Id};category={category};sha256={hash}", ct: ct);
        return Created($"/api/orthodontics/intakes/{intake.Id}/documents/{doc.Id}",
            new { doc.Id, doc.Category, doc.OriginalFileName, doc.SizeBytes, doc.Sha256 });
    }

    [HttpGet("{documentId:guid}")]
    public async Task<IActionResult> Download(Guid intakeId, Guid documentId, CancellationToken ct)
    {
        var intake = await Allowed(intakeId, ct);
        if (intake is null) return NotFound();
        var doc = await _db.OrthodonticIntakeDocuments.AsNoTracking().FirstOrDefaultAsync(x =>
            x.Id == documentId && x.IntakeId == intake.Id &&
            x.PatientId == intake.PatientId && x.DentalPracticeId == intake.DentalPracticeId, ct);
        if (doc is null) return NotFound();
        if (!string.Equals(Convert.ToHexString(SHA256.HashData(doc.Content)).ToLowerInvariant(),
                doc.Sha256, StringComparison.Ordinal))
            return StatusCode(500, new { message = "File integrity verification failed." });
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        await _audit.WriteAsync("ORTHO_INTAKE_DOCUMENT_DOWNLOADED",
            "OrthodonticIntakeDocument", doc.Id.ToString(), ct: ct);
        return File(doc.Content, doc.ContentType, doc.OriginalFileName);
    }
}
