
using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Each appointment belongs to one dental practice.
// The same record moves from scheduling through the queue.
public class Appointment : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }

    public DateTime StartUtc { get; set; }
    public DateTime EndUtc { get; set; }

    // Scheduled, Waiting, Called, InConsultation,
    // AwaitingCheckout, CheckedOut or Cancelled.
    public string Status { get; set; } = "Scheduled";

    public string? Reason { get; set; }

    public DateTime? CheckedInAtUtc { get; set; }
    public DateTime? CalledAtUtc { get; set; }
    public DateTime? ConsultationStartedAtUtc { get; set; }
    public DateTime? ConsultationEndedAtUtc { get; set; }
    public DateTime? CheckedOutAtUtc { get; set; }

    public Guid? CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
