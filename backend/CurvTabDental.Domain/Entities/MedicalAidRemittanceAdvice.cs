using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// A scheme-reported remittance advice, NOT proof of funds received.
public sealed class MedicalAidRemittanceAdvice : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }
    public Guid ClaimId { get; set; }

    public string RemittanceReference { get; set; } = "";
    public decimal AdvisedAmount { get; set; }
    public string EvidenceReference { get; set; } = "";
    public string Notes { get; set; } = "";

    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
