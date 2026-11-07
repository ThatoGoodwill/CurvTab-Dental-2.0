using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

public sealed class ClinicalImage : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? OrthodonticCaseId { get; set; }
    public Guid UploadedByUserId { get; set; }

    public string ImageType { get; set; } = "Photo";
    public string OriginalFileName { get; set; } = "";
    public string StoredFileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }

    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}
