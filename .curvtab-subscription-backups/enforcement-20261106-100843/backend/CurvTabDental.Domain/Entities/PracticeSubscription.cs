using System;

namespace CurvTabDental.Domain.Entities;

public class PracticeSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DentalPracticeId { get; set; }

    public string PlanName { get; set; } = "Standard";

    public string BillingCycle { get; set; } = "Monthly";

    public decimal Amount { get; set; }

    public string Currency { get; set; } = "ZAR";

    public string Status { get; set; } = "Pending";

    public DateTime PeriodStartUtc { get; set; }

    public DateTime PeriodEndUtc { get; set; }

    public int GraceDays { get; set; } = 7;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
