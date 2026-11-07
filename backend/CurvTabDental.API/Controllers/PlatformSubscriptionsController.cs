using CurvTabDental.API.Security;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/platform/subscriptions")]
[Authorize(Roles = StaffRoles.SuperAdmin)]
public sealed class PlatformSubscriptionsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly IAuditService _audit;

    public PlatformSubscriptionsController(
        DentalDbContext db,
        IAuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    public record ConfigureRequest(
        string PlanName,
        string BillingCycle,
        decimal Amount,
        DateTime PeriodStartUtc,
        DateTime PeriodEndUtc,
        int GraceDays
    );

    public record VerifiedPaymentRequest(
        decimal Amount,
        string Reference,
        string Method,
        DateTime PaidAtUtc
    );

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var practices = await _db.DentalPractices
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .ToListAsync(ct);

        var subscriptions = await _db.PracticeSubscriptions
            .AsNoTracking()
            .ToListAsync(ct);

        var payments = await _db.SubscriptionPayments
            .AsNoTracking()
            .Where(x => x.Status == "Verified")
            .ToListAsync(ct);

        var result = practices.Select(p =>
        {
            var s = subscriptions
                .Where(x => x.DentalPracticeId == p.Id)
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefault();

            var paid = s is null
                ? 0m
                : payments
                    .Where(x => x.PracticeSubscriptionId == s.Id)
                    .Sum(x => x.Amount);

            return new
            {
                practiceId = p.Id,
                practiceName = p.Name,
                practiceActive = p.IsActive,
                subscription = s,
                verifiedPaymentsTotal = paid
            };
        });

        return Ok(result);
    }

    [HttpPut("{practiceId:guid}")]
    public async Task<IActionResult> Configure(
        Guid practiceId,
        [FromBody] ConfigureRequest request,
        CancellationToken ct)
    {
        if (!await _db.DentalPractices
            .AnyAsync(x => x.Id == practiceId, ct))
            return NotFound("Practice not found.");

        var cycles = new[] { "Monthly", "Quarterly", "Annual" };

        if (string.IsNullOrWhiteSpace(request.PlanName)
            || request.PlanName.Trim().Length > 100
            || !cycles.Contains(request.BillingCycle)
            || request.Amount < 0
            || request.Amount > 1000000
            || request.GraceDays < 0
            || request.GraceDays > 60
            || request.PeriodStartUtc.Kind != DateTimeKind.Utc
            || request.PeriodEndUtc.Kind != DateTimeKind.Utc
            || request.PeriodEndUtc <= request.PeriodStartUtc)
        {
            return BadRequest(
                "Invalid subscription plan, dates, fee or grace period.");
        }

        var existing = await _db.PracticeSubscriptions
            .FirstOrDefaultAsync(
                x => x.DentalPracticeId == practiceId, ct);

        if (existing is not null)
        {
            var hasPayments = await _db.SubscriptionPayments
                .AnyAsync(
                    x => x.PracticeSubscriptionId == existing.Id
                         && x.Status == "Verified", ct);

            if (hasPayments)
                return Conflict(
                    "This subscription has verified payments. "
                    + "Changing the billing agreement requires a separate "
                    + "renewal or amendment workflow.");

            existing.PlanName = request.PlanName.Trim();
            existing.BillingCycle = request.BillingCycle;
            existing.Amount = request.Amount;
            existing.PeriodStartUtc = request.PeriodStartUtc;
            existing.PeriodEndUtc = request.PeriodEndUtc;
            existing.GraceDays = request.GraceDays;
            existing.UpdatedAtUtc = DateTime.UtcNow;
        }
        else
        {
            existing = new PracticeSubscription
            {
                DentalPracticeId = practiceId,
                PlanName = request.PlanName.Trim(),
                BillingCycle = request.BillingCycle,
                Amount = request.Amount,
                Currency = "ZAR",
                Status = "Pending",
                PeriodStartUtc = request.PeriodStartUtc,
                PeriodEndUtc = request.PeriodEndUtc,
                GraceDays = request.GraceDays
            };
            _db.PracticeSubscriptions.Add(existing);
        }

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "PLATFORM_SUBSCRIPTION_CONFIGURED",
            "PracticeSubscription",
            existing.Id.ToString(),
            detail: $"Plan={existing.PlanName};Cycle={existing.BillingCycle}",
            practiceId: practiceId,
            ct: ct);

        return Ok(existing);
    }

    [HttpPost("{subscriptionId:guid}/verified-payments")]
    public async Task<IActionResult> RecordVerifiedPayment(
        Guid subscriptionId,
        [FromBody] VerifiedPaymentRequest request,
        CancellationToken ct)
    {
        var subscription = await _db.PracticeSubscriptions
            .FirstOrDefaultAsync(x => x.Id == subscriptionId, ct);

        if (subscription is null)
            return NotFound();

        if (request.Amount <= 0
            || request.Amount != subscription.Amount
            || string.IsNullOrWhiteSpace(request.Reference)
            || request.Reference.Trim().Length > 200
            || string.IsNullOrWhiteSpace(request.Method)
            || request.Method.Trim().Length > 60
            || request.PaidAtUtc.Kind != DateTimeKind.Utc
            || request.PaidAtUtc > DateTime.UtcNow)
        {
            return BadRequest(
                "A valid amount, payment reference, method and payment date "
                + "are required.");
        }

        var reference = request.Reference.Trim();

        if (await _db.SubscriptionPayments.AnyAsync(
            x => x.PaymentReference == reference
                 && x.Status == "Verified", ct))
        {
            return Conflict("Payment reference already recorded.");
        }

        var previouslyPaid = await _db.SubscriptionPayments.AnyAsync(
            x => x.PracticeSubscriptionId == subscriptionId
                 && x.Status == "Verified", ct);

        _db.SubscriptionPayments.Add(new SubscriptionPayment
        {
            PracticeSubscriptionId = subscription.Id,
            Amount = request.Amount,
            Currency = "ZAR",
            Status = "Verified",
            PaymentReference = reference,
            PaymentMethod = request.Method.Trim(),
            PaidAtUtc = request.PaidAtUtc,
            VerifiedAtUtc = DateTime.UtcNow
        });

        if (previouslyPaid ||
            subscription.PeriodEndUtc <= DateTime.UtcNow)
        {
            var start = subscription.PeriodEndUtc > DateTime.UtcNow
                ? subscription.PeriodEndUtc
                : DateTime.UtcNow;

            subscription.PeriodStartUtc = start;

            subscription.PeriodEndUtc = subscription.BillingCycle switch
            {
                "Quarterly" => start.AddMonths(3),
                "Annual" => start.AddYears(1),
                _ => start.AddMonths(1)
            };
        }

        subscription.Status = "Active";
        subscription.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "PLATFORM_SUBSCRIPTION_PAYMENT_VERIFIED",
            "PracticeSubscription",
            subscription.Id.ToString(),
            detail: $"Reference={reference};Amount={request.Amount}",
            practiceId: subscription.DentalPracticeId,
            ct: ct);

        // Deliberately do not change DentalPractice.IsActive:
        // payment must never override an administrative suspension.
        return Ok(new
        {
            subscription.Id,
            subscription.Status,
            subscription.PeriodEndUtc
        });
    }
}
