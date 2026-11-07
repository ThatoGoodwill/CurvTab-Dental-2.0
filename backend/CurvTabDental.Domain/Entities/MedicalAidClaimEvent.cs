using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Historical claim processing record.
// Application code must never update or delete these events.
public sealed class MedicalAidClaimEvent : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid ClaimId { get; set; }
    public Guid RequestId { get; set; }

    public string FromStatus { get; set; } = "";
    public string ToStatus { get; set; } = "";
    public decimal? ApprovedAmount { get; set; }

    public string? ExternalReference { get; set; }
    public string EvidenceReference { get; set; } = "";
    public string Reason { get; set; } = "";

    public Guid PerformedByUserId { get; set; }
    public DateTime PerformedAtUtc { get; set; } = DateTime.UtcNow;
}
