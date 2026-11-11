using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Private clinical intake attachment, scoped to the existing patient and
/// orthodontic intake. Bytes live in PostgreSQL, not Render's ephemeral disk.
/// No patient-visible public URL or application-static file is generated.
/// </summary>
public sealed class OrthodonticIntakeDocument : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid OrthodonticIntakeCaseId { get; set; }
    public Guid PatientId { get; set; }
    public string Category { get; set; } = "Other";
    public string OriginalFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public byte[] FileBytes { get; set; } = [];
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public string? SourceProvider { get; set; }
    public Guid UploadedByUserId { get; set; }
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? ReviewedByUserId { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
}
