using System.Security.Cryptography;
using System.Text;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Read-only PDF rendition and original captured signature of signed,
/// immutable intake terms. Exact UTF-8 text and hashes remain in Postgres.
/// </summary>
[ApiController]
[Route("api/orthodontics/intakes/{intakeId:guid}/signed-terms")]
[Authorize(Roles = "PracticeAdmin,Receptionist,Dentist")]
public sealed class OrthodonticSignedTermsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    public OrthodonticSignedTermsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    { _db = db; _current = current; _audit = audit; }

    private async Task<OrthodonticIntakeCase?> Read(Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return null;
        var query = _db.OrthodonticIntakes.AsNoTracking().Where(x =>
            x.Id == id && x.DentalPracticeId == practiceId);
        if (_current.Role == StaffRoles.Dentist)
            query = query.Where(x => x.AssignedOrthodontistUserId == _current.UserId);
        return await query.FirstOrDefaultAsync(ct);
    }

    [HttpGet("pdf")]
    public async Task<IActionResult> DownloadPdf(Guid intakeId, CancellationToken ct)
    {
        var intake = await Read(intakeId, ct);
        if (intake is null) return NotFound();
        if (intake.TermsAcceptedAtUtc == null || string.IsNullOrWhiteSpace(intake.TermsFullText) ||
            string.IsNullOrWhiteSpace(intake.TermsSha256))
            return Conflict(new { message = "This intake has no signed approved terms to retrieve." });
        var actualHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(intake.TermsFullText))).ToLowerInvariant();
        if (actualHash != intake.TermsSha256)
            return StatusCode(500, new { message = "The signed terms no longer match the originally captured document." });
        var signatureData = intake.TermsSignatureDataUrl ?? "";
        var signatureBytes = DecodeSignature(signatureData);
        if (signatureBytes == null)
            return StatusCode(500, new { message = "The signed agreement's signature evidence is invalid." });

        var patient = await _db.Patients.AsNoTracking().Where(p =>
            p.Id == intake.PatientId && p.DentalPracticeId == intake.DentalPracticeId)
            .Select(p => new { p.FirstName, p.LastName }).FirstOrDefaultAsync(ct);
        if (patient == null) return NotFound();
        var meta = new[]
        {
            "CURVTAB DENTAL - ORTHODONTIC INTAKE AGREEMENT",
            "Patient: " + patient.FirstName + " " + patient.LastName,
            "Case: " + intake.Id,
            "Version: " + (intake.TermsVersion ?? "Unknown"),
            "Signed: " + intake.TermsAcceptedAtUtc.Value.ToString("yyyy-MM-dd HH:mm:ss") + " UTC",
            "Signer: " + (intake.TermsSignerName ?? "Unknown"),
            "Capacity: " + (intake.TermsSignerCapacity ?? "Unknown"),
            "Acceptance: " + (intake.TermsAcceptanceMethod ?? "Electronic"),
            "Original document SHA-256: " + actualHash,
            "Drawn signature PNG SHA-256: " +
                Convert.ToHexString(SHA256.HashData(signatureBytes)).ToLowerInvariant(),
            "The original signed text and drawn signature remain in the secure case record.",
            "",
            "EXACT SIGNED AGREEMENT TEXT (readable PDF rendition)",
            ""
        };
        var bytes = SimpleAgreementPdf.Create(meta.Concat(
            intake.TermsFullText.Replace("\r\n", "\n").Split('\n')).ToArray());
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        await _audit.WriteAsync("ORTHO_SIGNED_TERMS_PDF_DOWNLOADED",
            "OrthodonticIntakeCase", intake.Id.ToString(), ct: ct);
        return File(bytes, "application/pdf", $"Orthodontic-Intake-{intake.Id:N}.pdf");
    }

    [HttpGet("signature.png")]
    public async Task<IActionResult> DownloadSignature(Guid intakeId, CancellationToken ct)
    {
        var intake = await Read(intakeId, ct);
        if (intake is null) return NotFound();
        if (intake.TermsAcceptedAtUtc == null ||
            DecodeSignature(intake.TermsSignatureDataUrl ?? "") is not { } bytes)
            return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        await _audit.WriteAsync("ORTHO_SIGNED_TERMS_SIGNATURE_DOWNLOADED",
            "OrthodonticIntakeCase", intake.Id.ToString(), ct: ct);
        return File(bytes, "image/png", $"Orthodontic-Signature-{intake.Id:N}.png");
    }

    private static byte[]? DecodeSignature(string base64Data)
    {
        const string prefix = "data:image/png;base64,";
        if (!base64Data.StartsWith(prefix, StringComparison.Ordinal) || base64Data.Length > 180000)
            return null;
        try
        {
            var bytes = Convert.FromBase64String(base64Data[prefix.Length..]);
            return bytes.Length >= 8 &&
                bytes.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10})
                ? bytes : null;
        }
        catch (FormatException) { return null; }
    }

    /// <summary>
    /// Portable, dependency-free PDF 1.4 text layout, paginated with line wrap.
    /// The archived UTF-8 terms, not this WinAnsi rendition, are the authoritative
    /// signed record. Hash lines provide an independent integrity check.
    /// </summary>
    private static class SimpleAgreementPdf
    {
        public static byte[] Create(IReadOnlyList<string> paragraphs)
        {
            var lines = new List<string>();
            foreach (var paragraph in paragraphs)
            {
                if (string.IsNullOrWhiteSpace(paragraph)) { lines.Add(""); continue; }
                var text = paragraph.Trim();
                while (text.Length > 95)
                {
                    var end = text.LastIndexOf(' ', Math.Min(95, text.Length - 1));
                    if (end < 20) end = 95;
                    lines.Add(text[..end]);
                    text = text[end..].TrimStart();
                }
                lines.Add(text);
            }
            const int perPage = 53;
            var totalPages = Math.Max(1, (lines.Count + perPage - 1) / perPage);
            var objects = new List<string> { "", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>" };
            var pageNumbers = new List<int>();
            for (var page = 0; page < totalPages; page++)
            {
                var pageObject = objects.Count + 1;
                var contentObject = objects.Count + 2;
                pageNumbers.Add(pageObject);
                objects.Add($"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {contentObject} 0 R >>");
                var pageLines = lines.Skip(page * perPage).Take(perPage);
                var content = new StringBuilder("BT /F1 10 Tf 42 752 Td 13 TL\n");
                foreach (var line in pageLines)
                {
                    var ascii = ToPdfText(line).Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
                    content.Append('(').Append(ascii).Append(") Tj T*\n");
                }
                content.Append("ET");
                var stream = content.ToString();
                objects.Add($"<< /Length {Encoding.Latin1.GetByteCount(stream)} >>\nstream\n{stream}\nendstream");
            }
            objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
            objects[1] = $"<< /Type /Pages /Count {totalPages} /Kids [{string.Join(" ", pageNumbers.Select(n => $"{n} 0 R"))}] >>";
            using var output = new MemoryStream();
            void Write(string content)
            {
                var bytes = Encoding.Latin1.GetBytes(content);
                output.Write(bytes, 0, bytes.Length);
            }
            Write("%PDF-1.4\n%CurvTab\n");
            var offsets = new List<long> { 0 };
            for (var i = 0; i < objects.Count; i++)
            {
                offsets.Add(output.Position);
                Write($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
            }
            var xref = output.Position;
            Write($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n");
            foreach (var offset in offsets.Skip(1))
                Write($"{offset:D10} 00000 n \n");
            Write($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF");
            return output.ToArray();
        }

        private static string ToPdfText(string value) => value
            .Replace("\u2018", "'").Replace("\u2019", "'")
            .Replace("\u201C", "\"").Replace("\u201D", "\"")
            .Replace("\u2013", "-").Replace("\u2014", "-")
            .Replace("\u2022", "-").Replace("\u20AC", "EUR")
            .Select(ch => ch < 32 ? ' ' : ch > 255 ? '?' : ch)
            .Aggregate(new StringBuilder(), (sb, ch) => sb.Append(ch)).ToString();
    }
}
