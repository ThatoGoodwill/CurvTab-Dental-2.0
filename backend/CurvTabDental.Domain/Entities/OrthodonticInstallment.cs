using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Scheduled obligation, not evidence of actual cash received.
public sealed class OrthodonticInstallment : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid AgreementId { get; set; }

    public int Sequence { get; set; }
    public DateOnly DueDate { get; set; }
    public decimal AmountDue { get; set; }
}
