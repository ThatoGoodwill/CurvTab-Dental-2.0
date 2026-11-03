using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// A long-running case linked to the existing patient; never a second patient account.
public sealed class OrthodonticCase : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ApplianceType { get; set; } = string.Empty;
    public string Goals { get; set; } = string.Empty;
    public string Status { get; set; } = "Planning";
    public DateOnly? NextReviewDate { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }
}
