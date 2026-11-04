using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only history. Never edit an existing event.
public sealed class MedicalAidAuthorisationEvent : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid AuthorisationId { get; set; }

    public string EventType { get; set; } = "";
    public string FromStatus { get; set; } = "";
    public string ToStatus { get; set; } = "";

    public decimal? ApprovedAmount { get; set; }
    public string? AuthorisationNumber { get; set; }
    public DateOnly? ExpiresOn { get; set; }
    public string? EvidenceReference { get; set; }

    public string Reason { get; set; } = "";
    public Guid PerformedByUserId { get; set; }
    public DateTime PerformedAtUtc { get; set; } = DateTime.UtcNow;
}
