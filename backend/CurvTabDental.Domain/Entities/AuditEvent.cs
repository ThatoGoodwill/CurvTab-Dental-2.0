namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Append-only record of who did what, when, to which record (FR-006).
/// Never store clinical details in <see cref="Detail"/>; reference the record by id instead.
/// </summary>
public class AuditEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;

    public Guid? ActorUserId { get; set; }

    /// <summary>Tenant the action happened in. Null for platform-level actions.</summary>
    public Guid? DentalPracticeId { get; set; }

    public string Action { get; set; } = string.Empty;
    public string? EntityType { get; set; }
    public string? EntityId { get; set; }
    public bool Succeeded { get; set; } = true;
    public string? Detail { get; set; }
    public string? IpAddress { get; set; }
}
