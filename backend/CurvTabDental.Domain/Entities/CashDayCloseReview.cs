using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Decisions never overwrite the receptionist's original count.
public sealed class CashDayCloseReview : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid SubmissionId { get; set; }
    public Guid RequestId { get; set; }
    public string Decision { get; set; } = "";
    public string Reason { get; set; } = "";
    public Guid ReviewedByUserId { get; set; }
    public DateTime ReviewedAtUtc { get; set; } = DateTime.UtcNow;
}
