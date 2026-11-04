using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Approved financial terms for one orthodontic case.
// This is NOT an invoice or proof of payment.
public sealed class OrthodonticFinancialAgreement : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid OrthodonticCaseId { get; set; }
    public Guid CreatedByUserId { get; set; }

    public decimal TotalFee { get; set; }
    public decimal DepositRequired { get; set; }
    public string Currency { get; set; } = "ZAR";

    public DateOnly AgreementDate { get; set; }
    public string? Terms { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
