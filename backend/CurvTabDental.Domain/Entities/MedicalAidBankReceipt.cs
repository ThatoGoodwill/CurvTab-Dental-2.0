using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Staff-recorded evidence of a scheme bank deposit.
// Does NOT allocate funds to invoices or settle claims.
public sealed class MedicalAidBankReceipt : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DentalPracticeId { get; set; }

    public Guid RequestId { get; set; }

    public string SchemeName { get; set; } = "";
    public string SchemeKey { get; set; } = "";

    public string BankReference { get; set; } = "";
    public string BankReferenceKey { get; set; } = "";

    public decimal Amount { get; set; }

    public string Currency { get; set; } = "ZAR";

    public DateOnly ReceivedOn { get; set; }

    public string EvidenceReference { get; set; } = "";

    public string Notes { get; set; } = "";

    public Guid RecordedByUserId { get; set; }

    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
