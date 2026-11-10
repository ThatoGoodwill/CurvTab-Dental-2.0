using CurvTabDental.Domain.Common;
namespace CurvTabDental.Domain.Entities;

// Corrections never overwrite the first blind count.
public sealed class CashDayCloseAdjustment : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid SubmissionId { get; set; }
    public Guid RequestId { get; set; }
    public decimal RevisedCountedCash { get; set; }
    public string Reason { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
