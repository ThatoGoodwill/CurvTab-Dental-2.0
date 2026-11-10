using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// The receptionist's first blind count is preserved exactly as submitted.
// Manager decisions are separate append-only CashDayCloseReview records.
public sealed class CashDayCloseSubmission : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public decimal OpeningFloat { get; set; }
    public decimal CountedCash { get; set; }
    public decimal CashReceived { get; set; }
    public decimal CashExpenses { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal Variance { get; set; }
    public string? Explanation { get; set; }
    public string? EvidenceReference { get; set; }
    public Guid SubmittedByUserId { get; set; }
    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;
}
