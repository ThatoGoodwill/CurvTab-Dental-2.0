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
/// Private case-scoped Phase 1 attachments. Durable PostgreSQL bytea storage.
/// Never serves arbitrary filesystem paths or publicly accessible URLs.
/// </summary>
[ApiController]
[Route("api/orthodontics/intakes/{intakeId:guid}/documents")]
[Authorize(Roles = "PracticeAdmin,Receptionist,Dentist")]
public sealed class OrthodonticIntakeDocumentsController : ControllerBase
{
    private const long MaxFileSize = 6_000_000;
    private static readonly HashSet<string> Categories = new(StringComparer.Ordinal)
    {
        "Referral", "TransferRecords", "Radiograph", "Photo",
        "MedicalHistory", "GuardianAuthority", "Other"
    };
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public OrthodonticIntakeDocumentsController(
        DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db; _current = current; _audit = audit;
    }

    private async Task<OrthodonticIntakeCase?> Accessible(Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return null;
        var query = _db.OrthodonticIntakes.AsNoTracking()
            .Where(x => x.Id == id && x.DentalPracticeId == practiceId && x.ClosedAtUtc == null);
        if (_current.Role == StaffRoles.Dentist)
            query = query.Where(x => x.AssignedOrthodontistUserId == _current.UserId);
        return await query.SingleOrDefaultAsync(ct);
    }

    private static object Describe(OrthodonticIntakeDocument x) => new
    {
        x.Id, x.OrthodonticIntakeCaseId, x.PatientId, x.Category,
        x.OriginalFileName, x.ContentType, x.SizeBytes, x.Sha256,
        x.SourceProvider, x.UploadedAtUtc, x.UploadedByUserId,
        x.ReviewedByUserId, x.ReviewedAtUtc
    };

    private static string? Identify(byte[] bytes)
    {
        if (bytes.Length >= 5 && bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8))
            return "application/pdf";
        if (bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10}))
            return "image/png";
        if (bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255)
            return "image/jpeg";
        if (bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) &&
            bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8))
            return "image/webp";
        return null;
    }

    [HttpGet]
    public async Task<IActionResult> List(Guid intakeId, CancellationToken ct)
    {
        var intake = await Accessible(intakeId, ct);
        if (intake is null) return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        var docs = await _db.OrthodonticIntakeDocuments.AsNoTracking()
            .Where(d => d.DentalPracticeId == intake.DentalPracticeId &&
                d.OrthodonticIntakeCaseId == intake.Id && d.PatientId == intake.PatientId)
            .OrderByDescending(d => d.UploadedAtUtc).Take(100)
            .Select(d => new
            {
                d.Id, d.OrthodonticIntakeCaseId, d.PatientId, d.Category,
                d.OriginalFileName, d.ContentType, d.SizeBytes, d.Sha256,
                d.SourceProvider, d.UploadedAtUtc, d.UploadedByUserId,
                d.ReviewedByUserId, d.ReviewedAtUtc
            })
            .ToListAsync(ct);
        return Ok(docs);
    }

    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> Upload(Guid intakeId, [FromForm] IFormFile file,
        [FromForm] string category, [FromForm] string? sourceProvider,
        CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        var intake = await Accessible(intakeId, ct);
        if (intake is null) return NotFound();
        if (!Categories.Contains(category) || file is null || file.Length < 1 || file.Length > MaxFileSize)
            return BadRequest(new { message = "Choose a supported document type and a PDF/image of up to 6 MB." });
        if (sourceProvider?.Length > 250)
            return BadRequest(new { message = "Document source/provider is too long." });
        var existingCount = await _db.OrthodonticIntakeDocuments
            .CountAsync(d => d.OrthodonticIntakeCaseId == intake.Id, ct);
        if (existingCount >= 60)
            return Conflict(new { message = "This intake has reached the 60-document limit." });

        byte[] bytes;
        await using (var memory = new MemoryStream())
        {
            await file.CopyToAsync(memory, ct);
            if (memory.Length > MaxFileSize)
                return BadRequest(new { message = "The file exceeds 6 MB." });
            bytes = memory.ToArray();
        }
        var mime = Identify(bytes);
        if (mime is null)
            return BadRequest(new { message = "Only recognised PDF, PNG, JPG or WEBP files are accepted." });
        var name = Path.GetFileName(file.FileName ?? "Clinical record");
        if (string.IsNullOrWhiteSpace(name)) name = "Clinical record";
        if (name.Length > 180) name = name[..180];
        var sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        var exists = await _db.OrthodonticIntakeDocuments.AsNoTracking()
            .Where(d => d.OrthodonticIntakeCaseId == intake.Id && d.Sha256 == sha)
            .Select(d => d.Id).FirstOrDefaultAsync(ct);
        if (exists != Guid.Empty)
            return Conflict(new { message = "This exact file is already attached to the intake.", existingDocumentId = exists });

        var doc = new OrthodonticIntakeDocument
        {
            DentalPracticeId = intake.DentalPracticeId,
            OrthodonticIntakeCaseId = intake.Id, PatientId = intake.PatientId,
            Category = category, OriginalFileName = name,
            ContentType = mime, FileBytes = bytes,
            SizeBytes = bytes.LongLength, Sha256 = sha,
            SourceProvider = string.IsNullOrWhiteSpace(sourceProvider) ? null : sourceProvider.Trim(),
            UploadedByUserId = userId
        };
        _db.OrthodonticIntakeDocuments.Add(doc);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_INTAKE_DOCUMENT_UPLOADED", "OrthodonticIntakeDocument",
            doc.Id.ToString(), detail: $"intake={intake.Id};category={category};sha256={sha}", ct: ct);
        Response.Headers.CacheControl = "private, no-store";
        return Created($"/api/orthodontics/intakes/{intakeId}/documents/{doc.Id}", Describe(doc));
    }

    [HttpGet("{documentId:guid}/file")]
    public async Task<IActionResult> Download(Guid intakeId, Guid documentId, CancellationToken ct)
    {
        var intake = await Accessible(intakeId, ct);
        if (intake is null) return NotFound();
        var file = await _db.OrthodonticIntakeDocuments.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == documentId &&
                d.OrthodonticIntakeCaseId == intake.Id &&
                d.DentalPracticeId == intake.DentalPracticeId &&
                d.PatientId == intake.PatientId, ct);
        if (file is null) return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        await _audit.WriteAsync("ORTHO_INTAKE_DOCUMENT_DOWNLOADED", "OrthodonticIntakeDocument",
            documentId.ToString(), detail: $"intake={intake.Id}", ct: ct);
        return File(file.FileBytes, "application/octet-stream", file.OriginalFileName);
    }

    [HttpPatch("{documentId:guid}/verify")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> Verify(Guid intakeId, Guid documentId, CancellationToken ct)
    {
        if (_current.UserId is not Guid userId) return Unauthorized();
        var intake = await Accessible(intakeId, ct);
        if (intake is null) return NotFound();
        var doc = await _db.OrthodonticIntakeDocuments.FirstOrDefaultAsync(d =>
            d.Id == documentId && d.OrthodonticIntakeCaseId == intake.Id &&
            d.DentalPracticeId == intake.DentalPracticeId && d.PatientId == intake.PatientId, ct);
        if (doc is null) return NotFound();
        if (doc.ReviewedAtUtc.HasValue)
            return Ok(Describe(doc));
        doc.ReviewedByUserId = userId;
        doc.ReviewedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_INTAKE_DOCUMENT_VERIFIED", "OrthodonticIntakeDocument",
            doc.Id.ToString(), detail: $"intake={intake.Id};sha256={doc.Sha256}", ct: ct);
        return Ok(Describe(doc));
    }
}
