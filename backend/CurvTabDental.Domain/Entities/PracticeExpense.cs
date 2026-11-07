using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

public sealed class PracticeExpense : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }

    public DateOnly ExpenseDate { get; set; }
    public string Category { get; set; } = "";
    public string Description { get; set; } = "";
    public string Method { get; set; } = "";
    public string? Reference { get; set; }
    public decimal Amount { get; set; }

    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
