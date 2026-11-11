using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Immutable, privately stored orthodontic intake evidence. A database blob is
/// used because container-local files disappear between Render deployments.
/// The hash is computed on the actual uploaded bytes.
/// </summary>
public sealed class OrthodonticIntakeDocument : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid IntakeId { get; set; }
    public Guid UploadedByUserId { get; set; }
    public string Category { get; set; } = "OTHER";
    public string OriginalFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public byte[] Content { get; set; } = [];
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}
