using CurvTabDental.API.Contracts;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>A PracticeAdmin reviews the audit trail of their own practice only.</summary>
[ApiController]
[Route("api/audit")]
[Authorize(Roles = StaffRoles.PracticeAdmin)]
public class AuditController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public AuditController(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<AuditEventDto>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? action = null,
        CancellationToken ct = default)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.AuditEvents.AsNoTracking().Where(a => a.DentalPracticeId == practiceId);
        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(a => a.OccurredAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AuditEventDto(a.Id, a.OccurredAtUtc, a.ActorUserId, a.Action, a.EntityType,
                a.EntityId, a.Succeeded, a.Detail))
            .ToListAsync(ct);

        return Ok(new PagedResult<AuditEventDto>(items, total, page, pageSize));
    }
}
