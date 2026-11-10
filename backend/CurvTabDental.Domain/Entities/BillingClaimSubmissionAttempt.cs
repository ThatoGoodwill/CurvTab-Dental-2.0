using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Each staff-reported scheme transmission gets an immutable payload snapshot.
// Multiple attempts point to one logical claim and ONE existing invoice.
public sealed class BillingClaimSubmissionAttempt : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid ClaimId { get; set; }
    public Guid RequestId { get; set; }
    public int AttemptNumber { get; set; }
    public string ExternalReference { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public string PayloadJson { get; set; } = "{}";
    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
