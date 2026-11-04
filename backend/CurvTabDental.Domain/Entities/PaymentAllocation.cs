using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// References an EXISTING payment; never records new cash.
public sealed class PaymentAllocation : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }

    public Guid InvoiceId { get; set; }
    public Guid PaymentId { get; set; }
    public decimal Amount { get; set; }

    public Guid AllocatedByUserId { get; set; }
    public DateTime AllocatedAtUtc { get; set; } = DateTime.UtcNow;
}
