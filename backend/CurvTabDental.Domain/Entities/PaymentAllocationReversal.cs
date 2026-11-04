using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Full reversal of an allocation, not a refund of the payment.
public sealed class PaymentAllocationReversal : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid AllocationId { get; set; }

    public string Reason { get; set; } = "";

    public Guid ReversedByUserId { get; set; }
    public DateTime ReversedAtUtc { get; set; } = DateTime.UtcNow;
}
