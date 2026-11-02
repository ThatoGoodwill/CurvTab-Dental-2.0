namespace CurvTabDental.Application.Abstractions;

public interface IAuditService
{
    /// <summary>
    /// Writes one audit row. Actor, practice and IP default to the current caller;
    /// pass explicit values for events with no signed-in user (e.g. failed login).
    /// NOTE: this calls SaveChanges, so call it AFTER your own SaveChanges.
    /// </summary>
    Task WriteAsync(
        string action,
        string? entityType = null,
        string? entityId = null,
        bool succeeded = true,
        string? detail = null,
        Guid? practiceId = null,
        Guid? actorUserId = null,
        CancellationToken ct = default);
}
