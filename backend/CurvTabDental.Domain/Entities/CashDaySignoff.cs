using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Immutable snapshot of the cash position when the day was reviewed.
public sealed class CashDaySignoff : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public DateOnly BusinessDate { get; set; }

    public decimal OpeningFloat { get; set; }
    public decimal CashReceived { get; set; }
    public decimal CashExpenses { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal CountedCash { get; set; }
    public decimal Variance { get; set; }

    public int CashReceiptCount { get; set; }
    public int CashExpenseCount { get; set; }

    public string? Notes { get; set; }
    public Guid SignedByUserId { get; set; }
    public DateTime SignedAtUtc { get; set; } = DateTime.UtcNow;
}
