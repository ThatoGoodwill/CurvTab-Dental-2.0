using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only progress history; later notes do not erase earlier notes.
public sealed class OrthodonticProgressNote : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid OrthodonticCaseId { get; set; }
    public Guid RecordedByUserId { get; set; }
    public DateOnly VisitDate { get; set; }
    public string ProgressNotes { get; set; } = string.Empty;
    public string? Adjustments { get; set; }
    public string? NextSteps { get; set; }
    public DateOnly? NextReviewDate { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
