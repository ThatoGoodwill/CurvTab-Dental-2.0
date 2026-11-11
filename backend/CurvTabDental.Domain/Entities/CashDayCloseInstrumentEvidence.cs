using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Immutable operator-provided external settlement evidence for one financial close.
/// Neither entry nor verification posts a payment or changes the drawer ledger.
/// </summary>
public sealed class CashDayCloseInstrumentEvidence : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid SubmissionId { get; set; }
    public Guid RequestId { get; set; }
    public string Instrument { get; set; } = "";
    public decimal LedgerReceived { get; set; }
    public decimal VerifiedReceived { get; set; }
    public string EvidenceReference { get; set; } = "";
    public string VerificationSource { get; set; } = "";
    public bool ExternalSettlementConfirmed { get; set; }
    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
