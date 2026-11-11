using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Real money accepted during orthodontic intake, before a final treatment
/// quote. An unallocated patient credit, NOT an instalment, invoice, treatment
/// fee recognised as revenue, or a second payment when later allocated.
/// </summary>
public sealed class OrthodonticIntakeAdvanceReceipt : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid OrthodonticIntakeCaseId { get; set; }
    public Guid PatientId { get; set; }
    public Guid RequestId { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Method { get; set; } = "Cash";
    public string? Reference { get; set; }
    public DateTime ReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid ReceivedByUserId { get; set; }
    // Allocation to a signed braces contract is a Phase 3 action, not an
    // automatic intake consequence; this credit remains unapplied in Phase 1.
    public Guid? AllocatedOrthodonticAgreementId { get; set; }
    public DateTime? AllocatedAtUtc { get; set; }
}
