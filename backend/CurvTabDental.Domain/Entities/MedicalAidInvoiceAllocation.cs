using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Allocation of verified, reconciled medical aid funds to an invoice.
// Does not create an appointment Payment or duplicate a bank receipt.
public sealed class MedicalAidInvoiceAllocation : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DentalPracticeId { get; set; }

    // Idempotency identifier for a future authorised posting request.
    public Guid RequestId { get; set; }

    // Source of the reconciled scheme funds.
    public Guid RemittanceMatchId { get; set; }

    // Target invoice belonging to the medical aid claim.
    public Guid InvoiceId { get; set; }

    public decimal Amount { get; set; }

    public string EvidenceReference { get; set; } = "";

    public string Notes { get; set; } = "";

    public Guid AllocatedByUserId { get; set; }

    public DateTime AllocatedAtUtc { get; set; } = DateTime.UtcNow;
}
