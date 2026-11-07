using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// CT_PHASE9C_ENFORCEMENT_V1
[ApiController]
[Route("api/platform/subscriptions")]
[Authorize(Roles = StaffRoles.SuperAdmin)]
public sealed class PlatformSubscriptionEnforcementController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly IAuditService _audit;

    public PlatformSubscriptionEnforcementController(
        DentalDbContext db, IAuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    public record EnforcementRequest(bool Enabled);

    [HttpPatch("{practiceId:guid}/enforcement")]
    public async Task<IActionResult> SetEnforcement(
        Guid practiceId,
        [FromBody] EnforcementRequest request,
        CancellationToken ct)
    {
        var subscription = await _db.PracticeSubscriptions
            .Where(s => s.DentalPracticeId == practiceId)
            .OrderByDescending(s => s.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (subscription is null)
            return NotFound("No subscription assigned to this practice.");

        if (request.Enabled)
        {
            var now = DateTime.UtcNow;

            var paid = await _db.SubscriptionPayments
                .AnyAsync(p => p.PracticeSubscriptionId == subscription.Id
                               && p.Status == "Verified", ct);

            if (!paid ||
                subscription.Status != "Active" ||
                subscription.PeriodStartUtc > now ||
                subscription.PeriodEndUtc <= now)
            {
                return Conflict(
                    "Automatic enforcement can only be enabled " +
                    "for a currently active, verified-paid subscription.");
            }
        }

        if (subscription.EnforcementEnabled == request.Enabled)
            return Ok(new { subscription.EnforcementEnabled });

        subscription.EnforcementEnabled = request.Enabled;
        subscription.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            request.Enabled
                ? "SUBSCRIPTION_ENFORCEMENT_ENABLED"
                : "SUBSCRIPTION_ENFORCEMENT_DISABLED",
            "PracticeSubscription",
            subscription.Id.ToString(),
            detail: request.Enabled ? "Enabled" : "Disabled",
            practiceId: practiceId,
            ct: ct);

        return Ok(new { subscription.EnforcementEnabled });
    }
}
