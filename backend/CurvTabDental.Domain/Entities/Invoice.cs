using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Immutable posted invoice header.
public sealed class Invoice : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? AppointmentId { get; set; }
    public Guid? ConsultationId { get; set; }

    // CT_PHASE6H: Orthodontic invoices use an agreement,
    // never an artificial consultation.
    public Guid? OrthodonticFinancialAgreementId { get; set; }

    public string InvoiceNumber { get; set; } = "";
    public string Currency { get; set; } = "ZAR";
    public decimal TotalAmount { get; set; }

    public Guid IssuedByUserId { get; set; }
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;
}
