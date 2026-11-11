using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Immutable operator handover snapshot; independent of MedicalAidDaySignoff.
/// Manager review and any shortage remain as separate, append-only audit facts.
/// </summary>
public sealed class CashDayCloseFinancialSignoff : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid SubmissionId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public Guid RequestId { get; set; }
    public string SnapshotJson { get; set; } = "";
    public string HandoverReason { get; set; } = "";
    public Guid SignedByUserId { get; set; }
    public DateTime SignedAtUtc { get; set; } = DateTime.UtcNow;
}
