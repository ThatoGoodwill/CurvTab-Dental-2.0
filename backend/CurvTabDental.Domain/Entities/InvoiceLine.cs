using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Snapshot of a consultation charge at the moment of invoicing.
public sealed class InvoiceLine : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid InvoiceId { get; set; }
    public Guid? SourceConsultationChargeId { get; set; }

    // CT_PHASE6H: Alternative source for a treatment-fee line.
    public Guid? SourceOrthodonticFinancialAgreementId { get; set; }

    public string Description { get; set; } = "";
    public decimal Amount { get; set; }
}
