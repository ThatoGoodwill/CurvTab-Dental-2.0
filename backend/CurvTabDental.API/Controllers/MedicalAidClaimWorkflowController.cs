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
        (from == "RejectedReported" && to == "CorrectionApproved") ||
        (from == "CorrectionApproved" && to == "ResubmittedExternallyReported") ||
        (from == "ResubmittedExternallyReported" &&
         (to == "AcknowledgedReported" ||
          to == "ApprovedReported" ||
          to == "PartiallyApprovedReported" ||
          to == "RejectedReported"));

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

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            claim,
            events,
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
                    (target is "SubmittedExternallyReported" or "ResubmittedExternallyReported"
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

        if (target is "SubmittedExternallyReported" or "ResubmittedExternallyReported")
        {
            if (string.IsNullOrWhiteSpace(external))
                return BadRequest(new
                {
                    message = "A unique actual submission attempt reference is required."
                });

            if (request.ApprovedAmount is not null)
                return BadRequest(new
                {
                    message = "Submission must not specify approval."
                });

            if (target == "ResubmittedExternallyReported" &&
                (external == claim.ExternalReference ||
                 await _db.Set<MedicalAidClaimEvent>().AsNoTracking()
                     .AnyAsync(x => x.DentalPracticeId == practiceId &&
                         x.ClaimId == claimId && x.ExternalReference == external, ct)))
                return Conflict(new
                {
                    message = "Use a new external attempt reference; the original claim and invoice are preserved."
                });
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

        if (target is "SubmittedExternallyReported" or "ResubmittedExternallyReported")
            claim.ExternalReference = external;

        if (target is "CorrectionApproved" or "ResubmittedExternallyReported")
            claim.ApprovedAmount = null;

        if (isDecision)
            claim.ApprovedAmount = approvedAmount;

        var isSubmissionAttempt = target is "SubmittedExternallyReported" or "ResubmittedExternallyReported";
        var attemptNumber = isSubmissionAttempt
            ? await _db.Set<MedicalAidClaimEvent>().AsNoTracking()
                .CountAsync(x => x.DentalPracticeId == practiceId && x.ClaimId == claimId &&
                    (x.ToStatus == "SubmittedExternallyReported" || x.ToStatus == "ResubmittedExternallyReported"), ct) + 1
            : 0;
        var historyEvent = new MedicalAidClaimEvent
        {
            DentalPracticeId = practiceId,
            ClaimId = claim.Id,
            RequestId = request.RequestId,
            FromStatus = from,
            ToStatus = target,
            ApprovedAmount = approvedAmount,
            ExternalReference = claim.ExternalReference,
            AttemptNumber = isSubmissionAttempt ? attemptNumber : null,
            PayloadSnapshotJson = isSubmissionAttempt ? JsonSerializer.Serialize(new
            {
                claim.Id, claim.ClaimNumber, claim.PatientId, claim.InvoiceId,
                claim.ClaimedAmount, claim.Currency, claim.Status,
                attemptNumber, externalReference = external, evidence, reason,
                recordedAtUtc = now
            }) : null,
            EvidenceReference = evidence,
            Reason = reason,
            PerformedByUserId = actorId,
            PerformedAtUtc = now
        };

        _db.Set<MedicalAidClaimEvent>().Add(historyEvent);

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
