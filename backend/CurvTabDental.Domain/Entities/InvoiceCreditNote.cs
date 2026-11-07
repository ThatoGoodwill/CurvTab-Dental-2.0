using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only reduction of an issued invoice.
// Never overwrites the original invoice.
public sealed class InvoiceCreditNote : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid InvoiceId { get; set; }
    public Guid RequestId { get; set; }

    public string CreditNoteNumber { get; set; } = "";
    public decimal Amount { get; set; }
    public string Reason { get; set; } = "";

    public Guid IssuedByUserId { get; set; }
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;
}
