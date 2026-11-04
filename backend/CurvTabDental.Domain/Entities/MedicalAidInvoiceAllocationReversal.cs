using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only full reversal of a medical aid invoice allocation.
// Does not delete the original allocation or refund bank funds.
public sealed class MedicalAidInvoiceAllocationReversal : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DentalPracticeId { get; set; }

    public Guid AllocationId { get; set; }

    public string Reason { get; set; } = "";

    public Guid ReversedByUserId { get; set; }

    public DateTime ReversedAtUtc { get; set; } = DateTime.UtcNow;
}
