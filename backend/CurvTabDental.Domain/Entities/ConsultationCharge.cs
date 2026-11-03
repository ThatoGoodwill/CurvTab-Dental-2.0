using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Dentist-entered treatment charges; not proof of payment.
public sealed class ConsultationCharge : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid ConsultationId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}
