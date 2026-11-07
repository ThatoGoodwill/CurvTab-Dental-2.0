using System;

namespace CurvTabDental.Domain.Entities;

public class SubscriptionPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PracticeSubscriptionId { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = "ZAR";

    public string Status { get; set; } = "Pending";

    public string? PaymentReference { get; set; }

    public string? PaymentMethod { get; set; }

    public DateTime? PaidAtUtc { get; set; }

    public DateTime? VerifiedAtUtc { get; set; }

    public Guid? VerifiedByUserId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
