using System.Text.Json;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/medical-aid/claims/{claimId:guid}/workflow")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class MedicalAidClaimWorkflowController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public MedicalAidClaimWorkflowController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record TransitionRequest(
        Guid RequestId,
        string TargetStatus,
        string? ExternalReference,
        decimal? ApprovedAmount,
        string EvidenceReference,
        string Reason);

    private static bool Allowed(string from, string to) =>
        (from == "Draft" &&
         to == "SubmittedExternallyReported") ||

        (from == "SubmittedExternallyReported" &&
         (to == "AcknowledgedReported" ||
          to == "ApprovedReported" ||
          to == "PartiallyApprovedReported" ||
          to == "RejectedReported")) ||

        (from == "AcknowledgedReported" &&
         (to == "ApprovedReported" ||
          to == "PartiallyApprovedReported" ||
          to == "RejectedReported")) ||

        // A rejection may be resubmitted only after an audited, approved correction.
        (from == "CorrectedPendingResubmission" &&
         to == "SubmittedExternallyReported");

    private static bool ValidMoney(decimal value) =>
        value >= 0m &&
        value <= 10_000_000m &&
        decimal.Round(value, 2) == value;

    [HttpGet("history")]
    public async Task<IActionResult> History(
        Guid claimId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var claim = await _db.Set<MedicalAidClaim>()
            .AsNoTracking()
            .Where(x =>
                x.Id == claimId &&
                x.DentalPracticeId == practiceId)
            .Select(x => new
            {
                x.Id,
                x.ClaimNumber,
                x.Status,
                x.ClaimedAmount,
                x.ApprovedAmount,
                x.ExternalReference,
                x.CreatedAtUtc,
                x.LastStatusAtUtc
            })
            .SingleOrDefaultAsync(ct);

        if (claim is null) return NotFound();

        var events = await _db.Set<MedicalAidClaimEvent>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.ClaimId == claimId)
            .OrderBy(x => x.PerformedAtUtc)
            .ThenBy(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.FromStatus,
                x.ToStatus,
                x.ApprovedAmount,
                x.ExternalReference,
                x.EvidenceReference,
                x.Reason,
                x.PerformedByUserId,
                x.PerformedAtUtc
            })
            .ToListAsync(ct);

        var corrections = await _db.Set<BillingClaimCorrection>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.ClaimId == claimId)
            .OrderBy(x => x.Version)
            .Select(x => new {
                x.Id, x.Version, x.InvoiceLineId,
                x.PreviousCode, x.CorrectedCode, x.Reason,
                x.EvidenceReference, x.ApprovedByUserId, x.ApprovedAtUtc
            }).ToListAsync(ct);

        var attempts = await _db.Set<BillingClaimSubmissionAttempt>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.ClaimId == claimId)
            .OrderBy(x => x.AttemptNumber)
            .Select(x => new {
                x.Id, x.AttemptNumber, x.ExternalReference,
                x.EvidenceReference, x.PayloadJson,
                x.RecordedByUserId, x.RecordedAtUtc
            }).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            claim,
            events,
            attempts,
            corrections,
            notice = "All scheme updates are staff-recorded, " +
                     "not independently verified."
        });
    }

    [HttpPost("transition")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Transition(
        Guid claimId,
        [FromBody] TransitionRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var target = request.TargetStatus?.Trim() ?? "";
        var evidence = request.EvidenceReference?.Trim() ?? "";
        var reason = request.Reason?.Trim() ?? "";
        var external = request.ExternalReference?.Trim();

        if (request.RequestId == Guid.Empty ||
            evidence.Length is < 3 or > 300 ||
            reason.Length is < 5 or > 1000 ||
            external?.Length > 120)
        {
            return BadRequest(new
            {
                message = "Provide a valid request ID, evidence " +
                          "reference and explanation."
            });
        }

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        // Lock this claim so concurrent status updates cannot both pass.
        var claim = await _db.Set<MedicalAidClaim>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"MedicalAidClaims\" WHERE \"Id\" = {claimId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (claim is null) return NotFound();

        // Idempotency: retrying exactly the same request is safe.
        var previous = await _db.Set<MedicalAidClaimEvent>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);

        if (previous is not null)
        {
            if (previous.ClaimId == claimId &&
                previous.ToStatus == target &&
                previous.ApprovedAmount == request.ApprovedAmount &&
                previous.ExternalReference ==
                    (target == "SubmittedExternallyReported"
                        ? external
                        : claim.ExternalReference) &&
                previous.EvidenceReference == evidence &&
                previous.Reason == reason)
            {
                return Ok(new
                {
                    previous.Id,
                    claim.Status,
                    alreadyRecorded = true
                });
            }

            return Conflict(new
            {
                message = "Request ID already used for " +
                          "a different status change."
            });
        }

        if (!Allowed(claim.Status, target))
            return Conflict(new
            {
                message = "This claim status transition is not allowed.",
                currentStatus = claim.Status,
                requestedStatus = target
            });

        var isDecision =
            target == "ApprovedReported" ||
            target == "PartiallyApprovedReported" ||
            target == "RejectedReported";

        decimal? approvedAmount = null;

        if (target == "SubmittedExternallyReported")
        {
            if (string.IsNullOrWhiteSpace(external))
                return BadRequest(new
                {
                    message = "External submission reference is required."
                });

            if (request.ApprovedAmount is not null)
                return BadRequest(new
                {
                    message = "Submission must not specify approval."
                });

            if (claim.Status == "CorrectedPendingResubmission")
            {
                var correction = await _db.Set<BillingClaimCorrection>()
                    .AsNoTracking()
                    .Where(x => x.DentalPracticeId == practiceId && x.ClaimId == claim.Id)
                    .OrderByDescending(x => x.Version).FirstOrDefaultAsync(ct);
                if (correction is null)
                    return Conflict(new { message = "Approve a versioned clinical code correction before resubmitting." });
                if (string.Equals(external, claim.ExternalReference, StringComparison.Ordinal))
                    return Conflict(new { message = "Resubmission needs a NEW transmission reference; keep the earlier reference in history." });
                var submittedReferences = await _db.Set<MedicalAidClaimEvent>()
                    .AsNoTracking()
                    .Where(x => x.DentalPracticeId == practiceId && x.ClaimId == claim.Id &&
                        x.ToStatus == "SubmittedExternallyReported")
                    .Select(x => x.ExternalReference).ToListAsync(ct);
                if (submittedReferences.Contains(external))
                    return Conflict(new { message = "That transmission reference is already used by an earlier attempt." });
            }
        }
        else if (!string.IsNullOrWhiteSpace(external) &&
                 external != claim.ExternalReference)
        {
            return BadRequest(new
            {
                message = "Existing external claim reference " +
                          "cannot be changed in this workflow."
            });
        }

        if (isDecision)
        {
            if (request.ApprovedAmount is not decimal amount ||
                !ValidMoney(amount) ||
                amount > claim.ClaimedAmount)
                return BadRequest(new
                {
                    message = "A valid reported decision amount is required."
                });

            if (target == "ApprovedReported" &&
                amount != claim.ClaimedAmount)
                return BadRequest(new
                {
                    message = "Full approval must equal the claimed amount."
                });

            if (target == "PartiallyApprovedReported" &&
                (amount <= 0m || amount >= claim.ClaimedAmount))
                return BadRequest(new
                {
                    message = "Partial approval must be greater than zero " +
                              "and less than the claimed amount."
                });

            if (target == "RejectedReported" && amount != 0m)
                return BadRequest(new
                {
                    message = "Rejected claims must have zero approved amount."
                });

            approvedAmount = amount;
        }
        else if (request.ApprovedAmount is not null)
        {
            return BadRequest(new
            {
                message = "Approval amounts are only accepted " +
                          "for reported decisions."
            });
        }

        // CT_PHASE7E3_APPROVAL_CHANGE_GUARD
        // Do not reduce a reported decision below existing
        // active scheme invoice allocations.
        if (isDecision)
        {
            var activeAllocated = await (
                from allocation in
                    _db.Set<MedicalAidInvoiceAllocation>().AsNoTracking()
                join match in
                    _db.Set<MedicalAidRemittanceMatch>().AsNoTracking()
                    on allocation.RemittanceMatchId equals match.Id
                join advice in
                    _db.Set<MedicalAidRemittanceAdvice>().AsNoTracking()
                    on match.RemittanceAdviceId equals advice.Id
                where allocation.DentalPracticeId == practiceId
                    && match.DentalPracticeId == practiceId
                    && advice.DentalPracticeId == practiceId
                    && advice.ClaimId == claim.Id
                    && !_db.Set<MedicalAidInvoiceAllocationReversal>()
                        .Any(r =>
                            r.DentalPracticeId == practiceId &&
                            r.AllocationId == allocation.Id)
                select (decimal?)allocation.Amount
            ).SumAsync(ct) ?? 0m;

            if (approvedAmount.GetValueOrDefault() < activeAllocated)
            {
                return Conflict(new
                {
                    message = "Approval cannot be reduced below " +
                              "existing active scheme allocations. " +
                              "Reverse incorrect allocations first.",
                    activeAllocated,
                    requestedApprovedAmount = approvedAmount
                });
            }
        }

        var from = claim.Status;
        var now = DateTime.UtcNow;

        claim.Status = target;
        claim.LastStatusAtUtc = now;

        if (target == "SubmittedExternallyReported")
            claim.ExternalReference = external;

        if (isDecision)
            claim.ApprovedAmount = approvedAmount;

        var historyEvent = new MedicalAidClaimEvent
        {
            DentalPracticeId = practiceId,
            ClaimId = claim.Id,
            RequestId = request.RequestId,
            FromStatus = from,
            ToStatus = target,
            ApprovedAmount = approvedAmount,
            ExternalReference = claim.ExternalReference,
            EvidenceReference = evidence,
            Reason = reason,
            PerformedByUserId = actorId,
            PerformedAtUtc = now
        };

        _db.Set<MedicalAidClaimEvent>().Add(historyEvent);

        if (target == "SubmittedExternallyReported")
        {
            // No new claim, invoice, payment or patient charge is created.
            // The payload snapshot reflects the original posted invoice and
            // the latest manager-approved code correction, if there is one.
            var priorAttempts = await _db.Set<BillingClaimSubmissionAttempt>()
                .AsNoTracking()
                .CountAsync(x => x.DentalPracticeId == practiceId &&
                    x.ClaimId == claim.Id, ct);
            var invoiceLines = await _db.Set<InvoiceLine>().AsNoTracking()
                .Where(x => x.DentalPracticeId == practiceId &&
                    x.InvoiceId == claim.InvoiceId)
                .OrderBy(x => x.Id)
                .Select(x => new {
                    x.Id, x.Description, x.Amount
                }).ToListAsync(ct);
            var correction = await _db.Set<BillingClaimCorrection>().AsNoTracking()
                .Where(x => x.DentalPracticeId == practiceId &&
                    x.ClaimId == claim.Id)
                .OrderByDescending(x => x.Version)
                .Select(x => new {
                    x.Version, x.InvoiceLineId,
                    x.PreviousCode, x.CorrectedCode, x.EvidenceReference
                }).FirstOrDefaultAsync(ct);
            var snapshot = JsonSerializer.Serialize(new {
                claimId = claim.Id,
                invoiceId = claim.InvoiceId,
                membershipId = claim.MembershipId,
                claimedAmount = claim.ClaimedAmount,
                currency = claim.Currency,
                invoiceLines,
                latestApprovedCorrection = correction,
                submittedExternalReference = external,
                eventEvidenceReference = evidence,
                eventReason = reason
            });
            _db.Set<BillingClaimSubmissionAttempt>().Add(
                new BillingClaimSubmissionAttempt {
                    DentalPracticeId = practiceId, ClaimId = claim.Id,
                    RequestId = request.RequestId,
                    AttemptNumber = priorAttempts + 1,
                    ExternalReference = external!,
                    EvidenceReference = evidence,
                    PayloadJson = snapshot,
                    RecordedByUserId = actorId,
                    RecordedAtUtc = now
                });
        }

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "MEDICAL_AID_CLAIM_STATUS_RECORDED",
            "MedicalAidClaimEvent",
            historyEvent.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Ok(new
        {
            eventId = historyEvent.Id,
            claimId = claim.Id,
            claim.Status,
            claim.ApprovedAmount,
            claim.ExternalReference,
            message = "Staff-reported claim status recorded. " +
                      "No electronic submission or payment occurred."
        });
    }
}
