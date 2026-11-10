using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Clinical code corrections never edit the original invoice or patient consultation.
/// One logical claim retains each submitted attempt and a versioned correction trail.
/// </summary>
[ApiController]
[Route("api/finance/medical-aid/claims/{claimId:guid}/corrections")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class MedicalAidClaimCorrectionsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    public MedicalAidClaimCorrectionsController(DentalDbContext db, ICurrentUser current,
        IAuditService audit)
    { _db = db; _current = current; _audit = audit; }

    public sealed record CorrectRequest(Guid RequestId, Guid InvoiceLineId,
        string PreviousCode, string CorrectedCode, string Reason, string EvidenceReference);

    [HttpGet]
    public async Task<IActionResult> History(Guid claimId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        var claim = await _db.Set<MedicalAidClaim>().AsNoTracking()
            .AnyAsync(c => c.DentalPracticeId == id && c.Id == claimId, ct);
        if (!claim) return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        return Ok(await _db.Set<BillingClaimCorrection>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.ClaimId == claimId)
            .OrderBy(x => x.Version).ToListAsync(ct));
    }

    [HttpPost]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Correct(Guid claimId,
        [FromBody] CorrectRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid id) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        var oldCode = req.PreviousCode?.Trim() ?? "";
        var code = req.CorrectedCode?.Trim() ?? "";
        var reason = req.Reason?.Trim() ?? "";
        var evidence = req.EvidenceReference?.Trim() ?? "";
        if (req.RequestId == Guid.Empty || req.InvoiceLineId == Guid.Empty ||
            oldCode.Length is < 1 or > 40 || code.Length is < 1 or > 40 ||
            oldCode.Equals(code, StringComparison.OrdinalIgnoreCase) ||
            reason.Length is < 10 or > 800 || evidence.Length is < 3 or > 300)
            return BadRequest(new { message = "Provide the original code, corrected code, clinical source and authorisation evidence." });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var claim = await _db.Set<MedicalAidClaim>()
            .FromSqlInterpolated($"SELECT * FROM \"MedicalAidClaims\" WHERE \"Id\" = {claimId} AND \"DentalPracticeId\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (claim is null) return NotFound();

        var previous = await _db.Set<BillingClaimCorrection>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == id && x.RequestId == req.RequestId, ct);
        if (previous != null)
            return previous.ClaimId == claimId && previous.CorrectedCode == code
                ? Ok(new { previous.Id, previous.Version, alreadyRecorded = true })
                : Conflict();

        if (claim.Status != "RejectedReported")
            return Conflict(new { message = "Only a rejected claim can be corrected. Existing claims and invoices must never be duplicated." });

        var line = await _db.Set<InvoiceLine>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == id &&
                x.Id == req.InvoiceLineId && x.InvoiceId == claim.InvoiceId, ct);
        if (line is null)
            return Conflict(new { message = "Select a clinical source line from this claim's ORIGINAL invoice." });

        // Corrected code must exist in approved practice procedure pricing; this is not a silent edit of care.
        var valid = await _db.Set<ProcedurePrice>().AsNoTracking()
            .AnyAsync(x => x.DentalPracticeId == id && x.Code == code && x.IsActive, ct);
        if (!valid)
            return BadRequest(new { message = "The corrected procedure code must be an active, approved procedure code in Configuration Center." });

        var version = (await _db.Set<BillingClaimCorrection>().AsNoTracking()
            .Where(x => x.DentalPracticeId == id && x.ClaimId == claimId)
            .MaxAsync(x => (int?)x.Version, ct) ?? 0) + 1;
        var correction = new BillingClaimCorrection {
            DentalPracticeId = id, ClaimId = claimId, RequestId = req.RequestId,
            Version = version, InvoiceLineId = line.Id,
            PreviousCode = oldCode, CorrectedCode = code, Reason = reason,
            EvidenceReference = evidence, ApprovedByUserId = actor
        };
        claim.Status = "CorrectedPendingResubmission";
        claim.ApprovedAmount = null;
        claim.LastStatusAtUtc = DateTime.UtcNow;
        _db.Set<BillingClaimCorrection>().Add(correction);
        _db.Set<MedicalAidClaimEvent>().Add(new MedicalAidClaimEvent {
            DentalPracticeId = id, ClaimId = claimId, RequestId = req.RequestId,
            FromStatus = "RejectedReported", ToStatus = "CorrectedPendingResubmission",
            ExternalReference = claim.ExternalReference,
            EvidenceReference = evidence,
            Reason = $"Approved correction v{version}: {oldCode} -> {code}. {reason}",
            PerformedByUserId = actor
        });
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("CLAIM_CODE_CORRECTION_APPROVED", "BillingClaimCorrection",
            correction.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created($"/api/finance/medical-aid/claims/{claimId}/corrections",
            new { correction.Id, correction.Version, claimId,
                claim.Status, nextAction = "Record a new externally reported submission reference using claim workflow transition." });
    }
}
