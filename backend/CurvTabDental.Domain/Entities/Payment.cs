using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Immutable receipt-backed record of money actually received.
// Card numbers and security codes must NEVER be stored here.
public sealed class Payment : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid AppointmentId { get; set; }
    public Guid RequestId { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Method { get; set; } = string.Empty;
    public string? Reference { get; set; }
    public DateTime ReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid ReceivedByUserId { get; set; }
}
