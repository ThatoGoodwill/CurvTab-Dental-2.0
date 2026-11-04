using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

public sealed class MedicalAidClaim : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }

    public Guid PatientId { get; set; }
    public Guid InvoiceId { get; set; }
    public Guid MembershipId { get; set; }

    public string ClaimNumber { get; set; } = "";
    public string Status { get; set; } = "Draft";
    public string Currency { get; set; } = "ZAR";

    public decimal ClaimedAmount { get; set; }

    // Internal reference is not an EDI submission reference.
    public string? Notes { get; set; }

    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
