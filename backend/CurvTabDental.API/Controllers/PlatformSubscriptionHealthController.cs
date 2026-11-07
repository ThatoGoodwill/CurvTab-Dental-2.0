using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/platform/subscription-health")]
[Authorize(Roles = StaffRoles.SuperAdmin)]
public sealed class PlatformSubscriptionHealthController : ControllerBase
{
    private readonly DentalDbContext _db;

    public PlatformSubscriptionHealthController(DentalDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        var practices = await _db.DentalPractices
            .AsNoTracking()
            .OrderBy(p => p.Name)
            .ToListAsync(ct);

        var subscriptions = await _db.PracticeSubscriptions
            .AsNoTracking()
            .ToListAsync(ct);

        var verifiedSubscriptionIds =
            (await _db.SubscriptionPayments
                .AsNoTracking()
                .Where(p => p.Status == "Verified")
                .Select(p => p.PracticeSubscriptionId)
                .Distinct()
                .ToListAsync(ct))
            .ToHashSet();

        var result = practices.Select(practice =>
        {
            var subscription = subscriptions
                .Where(s => s.DentalPracticeId == practice.Id)
                .OrderByDescending(s => s.CreatedAtUtc)
                .FirstOrDefault();

            var status = "NotConfigured";
            DateTime? graceEndsUtc = null;

            if (subscription is not null)
            {
                graceEndsUtc = subscription.PeriodEndUtc.AddDays(
                    Math.Clamp(subscription.GraceDays, 0, 60));

                var hasVerifiedPayment =
                    verifiedSubscriptionIds.Contains(subscription.Id);

                if (subscription.Status != "Active" ||
                    !hasVerifiedPayment)
                {
                    status = "Pending";
                }
                else if (now < subscription.PeriodStartUtc)
                {
                    status = "Scheduled";
                }
                else if (now < subscription.PeriodEndUtc)
                {
                    status = "Active";
                }
                else if (now < graceEndsUtc)
                {
                    status = "GracePeriod";
                }
                else
                {
                    status = "Overdue";
                }
            }

            return new
            {
                practiceId = practice.Id,
                practiceName = practice.Name,
                manualAccessActive = practice.IsActive,
                subscriptionStatus = status,
                renewalDateUtc = subscription?.PeriodEndUtc,
                graceEndsUtc
            };
        }).ToList();

        return Ok(new
        {
            checkedAtUtc = now,
            automaticEnforcementEnabled = false,
            practices = result
        });
    }
}
