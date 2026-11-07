using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Reconciles a recorded bank receipt against remittance advice.
// Does NOT create invoice allocations or patient payment receipts.
public sealed class MedicalAidRemittanceMatch : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DentalPracticeId { get; set; }

    public Guid RequestId { get; set; }

    public Guid BankReceiptId { get; set; }

    public Guid RemittanceAdviceId { get; set; }

    public decimal MatchedAmount { get; set; }

    public string EvidenceReference { get; set; } = "";

    public string Notes { get; set; } = "";

    public Guid MatchedByUserId { get; set; }

    public DateTime MatchedAtUtc { get; set; } = DateTime.UtcNow;
}
