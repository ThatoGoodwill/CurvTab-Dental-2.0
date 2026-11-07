using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

public sealed class MedicalAidAuthorisation : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid RequestId { get; set; }

    public string TreatmentDescription { get; set; } = "";
    public decimal RequestedAmount { get; set; }
    public decimal? ApprovedAmount { get; set; }

    // RecordedPending, ApprovedReported,
    // PartiallyApprovedReported or DeclinedReported.
    public string Status { get; set; } = "RecordedPending";

    public string? AuthorisationNumber { get; set; }
    public DateOnly? ExpiresOn { get; set; }
    public string? EvidenceReference { get; set; }

    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
