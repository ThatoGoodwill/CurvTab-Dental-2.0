using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/dentist/patients/{patientId:guid}/images")]
[Authorize(Roles = "Dentist,Orthodontist")]
public sealed class ClinicalImagesController : ControllerBase
{
    private const long MaximumSize = 10_000_000;

    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    private static string StorageRoot =>
        Path.Combine(AppContext.BaseDirectory, "clinical-media");

    public ClinicalImagesController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    private Task<bool> PatientExists(
        Guid practiceId, Guid patientId, CancellationToken ct) =>
        _db.Patients.AsNoTracking().AnyAsync(
            p => p.Id == patientId &&
                 p.DentalPracticeId == practiceId &&
                 !p.IsArchived &&
                 (_current.Role == "Orthodontist"
                     ? _db.OrthodonticIntakes.Any(i => i.PatientId == patientId &&
                         i.DentalPracticeId == practiceId && i.ClosedAtUtc == null &&
                         i.AssignedOrthodontistUserId == _current.UserId)
                     : !_db.OrthodonticIntakes.Any(i => i.PatientId == patientId &&
                         i.DentalPracticeId == practiceId && i.ClosedAtUtc == null &&
                         i.ReferralAuthorUserId != _current.UserId)), ct);

    private static string Folder(Guid practiceId, Guid patientId) =>
        Path.Combine(
            StorageRoot,
            practiceId.ToString("N"),
            patientId.ToString("N"));

    private static (string Mime, string Extension)? Identify(
        byte[] bytes)
    {
        if (bytes.Length >= 8 &&
            bytes.AsSpan(0, 8).SequenceEqual(
                new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
            return ("image/png", ".png");

        if (bytes.Length >= 3 &&
            bytes[0] == 255 &&
            bytes[1] == 216 &&
            bytes[2] == 255)
            return ("image/jpeg", ".jpg");

        if (bytes.Length >= 12 &&
            System.Text.Encoding.ASCII.GetString(
                bytes, 0, 4) == "RIFF" &&
            System.Text.Encoding.ASCII.GetString(
                bytes, 8, 4) == "WEBP")
            return ("image/webp", ".webp");

        return null;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (!await PatientExists(practiceId, patientId, ct))
            return NotFound();

        Response.Headers.CacheControl = "private, no-store";

        var records = await _db.Set<ClinicalImage>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.PatientId == patientId)
            .OrderByDescending(x => x.UploadedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.PatientId,
                x.OrthodonticCaseId,
                x.ImageType,
                x.OriginalFileName,
                x.ContentType,
                x.SizeBytes,
                x.UploadedAtUtc,
                x.UploadedByUserId
            })
            .Take(200)
            .ToListAsync(ct);

        return Ok(records);
    }

    [HttpPost]
    [RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> Upload(
        Guid patientId,
        [FromForm] IFormFile file,
        [FromForm] string imageType,
        [FromForm] Guid? orthodonticCaseId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid userId)
            return Unauthorized();

        if (!await PatientExists(practiceId, patientId, ct))
            return NotFound();

        if (file is null ||
            file.Length == 0 ||
            file.Length > MaximumSize)
            return BadRequest(new
            {
                message = "Image must be between 1 byte and 10 MB."
            });

        if (imageType is not ("Photo" or "Radiograph" or "Other"))
            return BadRequest(new
            {
                message = "Invalid image type."
            });

        if (orthodonticCaseId.HasValue)
        {
            var validCase = await _db.OrthodonticCases
                .AsNoTracking()
                .AnyAsync(x =>
                    x.Id == orthodonticCaseId.Value &&
                    x.PatientId == patientId &&
                    x.DentalPracticeId == practiceId, ct);

            if (!validCase)
                return BadRequest(new
                {
                    message = "Invalid orthodontic case."
                });
        }

        byte[] bytes;

        await using (var memory = new MemoryStream())
        {
            await file.CopyToAsync(memory, ct);

            if (memory.Length > MaximumSize)
                return BadRequest(new
                {
                    message = "Image exceeds the 10 MB limit."
                });

            bytes = memory.ToArray();
        }

        var image = Identify(bytes);

        if (image is null)
            return BadRequest(new
            {
                message = "Only PNG, JPEG and WebP are supported."
            });

        if (!string.Equals(
            file.ContentType,
            image.Value.Mime,
            StringComparison.OrdinalIgnoreCase))
            return BadRequest(new
            {
                message = "Image content type does not match the file."
            });

        var directory = Folder(practiceId, patientId);
        Directory.CreateDirectory(directory);

        var storedName =
            Guid.NewGuid().ToString("N") + image.Value.Extension;

        var path = Path.Combine(directory, storedName);

        var originalName = Path.GetFileName(
            file.FileName.Replace('\\', '/'));

        if (string.IsNullOrWhiteSpace(originalName))
            originalName = "clinical-image" + image.Value.Extension;

        if (originalName.Length > 255)
            originalName = originalName[..255];

        var record = new ClinicalImage
        {
            DentalPracticeId = practiceId,
            PatientId = patientId,
            OrthodonticCaseId = orthodonticCaseId,
            UploadedByUserId = userId,
            ImageType = imageType,
            OriginalFileName = originalName,
            StoredFileName = storedName,
            ContentType = image.Value.Mime,
            SizeBytes = bytes.LongLength
        };

        await System.IO.File.WriteAllBytesAsync(path, bytes, ct);

        try
        {
            _db.Set<ClinicalImage>().Add(record);
            await _db.SaveChangesAsync(ct);
        }
        catch
        {
            System.IO.File.Delete(path);
            throw;
        }

        await _audit.WriteAsync(
            "CLINICAL_IMAGE_UPLOADED",
            "ClinicalImage",
            record.Id.ToString(),
            ct: ct);

        return Created(
            $"/api/dentist/patients/{patientId}/images/{record.Id}",
            new
            {
                record.Id,
                record.PatientId,
                record.OrthodonticCaseId,
                record.ImageType,
                record.OriginalFileName,
                record.UploadedAtUtc
            });
    }

    [HttpGet("{imageId:guid}/file")]
    public async Task<IActionResult> ViewImage(
        Guid patientId,
        Guid imageId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (!await PatientExists(practiceId, patientId, ct))
            return NotFound();

        var record = await _db.Set<ClinicalImage>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == imageId &&
                x.PatientId == patientId &&
                x.DentalPracticeId == practiceId, ct);

        if (record is null)
            return NotFound();

        var path = Path.Combine(
            Folder(practiceId, patientId),
            record.StoredFileName);

        if (!System.IO.File.Exists(path))
            return NotFound();

        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        await _audit.WriteAsync(
            "CLINICAL_IMAGE_VIEWED",
            "ClinicalImage",
            imageId.ToString(),
            ct: ct);

        return PhysicalFile(path, record.ContentType);
    }
}
