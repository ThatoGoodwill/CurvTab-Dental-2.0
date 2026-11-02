using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;

namespace CurvTabDental.Infrastructure.Services;

public class AuditService : IAuditService
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public AuditService(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    public async Task WriteAsync(
        string action,
        string? entityType = null,
        string? entityId = null,
        bool succeeded = true,
        string? detail = null,
        Guid? practiceId = null,
        Guid? actorUserId = null,
        CancellationToken ct = default)
    {
        _db.AuditEvents.Add(new AuditEvent
        {
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Succeeded = succeeded,
            Detail = detail is { Length: > 500 } ? detail[..500] : detail,
            DentalPracticeId = practiceId ?? _current.PracticeId,
            ActorUserId = actorUserId ?? _current.UserId,
            IpAddress = _current.IpAddress
        });

        await _db.SaveChangesAsync(ct);
    }
}
