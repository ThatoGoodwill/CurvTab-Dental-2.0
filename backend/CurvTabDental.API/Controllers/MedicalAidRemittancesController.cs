using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/medical-aid/remittances")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class MedicalAidRemittancesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public MedicalAidRemittancesController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record RecordAdviceRequest(
        Guid RequestId,
        Guid ClaimId,
        string RemittanceReference,
        decimal AdvisedAmount,
        string EvidenceReference,
        string? Notes);

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var rows = await (
            from advice in _db.Set<MedicalAidRemittanceAdvice>()
                .AsNoTracking()
            join claim in _db.Set<MedicalAidClaim>().AsNoTracking()
                on advice.ClaimId equals claim.Id
            where advice.DentalPracticeId == practiceId
                  && claim.DentalPracticeId == practiceId
            orderby advice.RecordedAtUtc descending
            select new
            {
                advice.Id,
                advice.ClaimId,
                claim.ClaimNumber,
                advice.RemittanceReference,
                advice.AdvisedAmount,
                advice.EvidenceReference,
                advice.Notes,
                advice.RecordedAtUtc,
                advice.RecordedByUserId,
                status = "AdviceRecorded"
            }
        ).Take(200).ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(rows);
    }

    [HttpPost]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> RecordAdvice(
        [FromBody] RecordAdviceRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var reference = request.RemittanceReference?.Trim() ?? "";
        var evidence = request.EvidenceReference?.Trim() ?? "";
        var notes = request.Notes?.Trim() ?? "";

        if (request.RequestId == Guid.Empty ||
            request.ClaimId == Guid.Empty ||
            reference.Length is < 3 or > 120 ||
            evidence.Length is < 3 or > 300 ||
            notes.Length > 1000 ||
            request.AdvisedAmount <= 0m ||
            request.AdvisedAmount > 10_000_000m ||
            decimal.Round(request.AdvisedAmount, 2) !=
                request.AdvisedAmount)
        {
            return BadRequest(new
            {
                message = "Provide a valid claim, reference, amount " +
                          "and evidence reference."
            });
        }

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        // Lock claim so concurrent advice submissions are serialised.
        var claim = await _db.Set<MedicalAidClaim>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"MedicalAidClaims\" WHERE \"Id\" = {request.ClaimId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (claim is null)
            return NotFound(new { message = "Claim not found." });

        var previous =
            await _db.Set<MedicalAidRemittanceAdvice>()
                .AsNoTracking()
                .FirstOrDefaultAsync(x =>
                    x.DentalPracticeId == practiceId &&
                    x.RequestId == request.RequestId, ct);

        if (previous is not null)
        {
            if (previous.ClaimId == request.ClaimId &&
                previous.RemittanceReference == reference &&
                previous.AdvisedAmount == request.AdvisedAmount &&
                previous.EvidenceReference == evidence &&
                previous.Notes == notes)
            {
                return Ok(new
                {
                    previous.Id,
                    alreadyRecorded = true
                });
            }

            return Conflict(new
            {
                message = "Request ID already used for different advice."
            });
        }

        if (claim.Status != "ApprovedReported" &&
            claim.Status != "PartiallyApprovedReported")
        {
            return Conflict(new
            {
                message = "Record a reported scheme approval before " +
                          "registering remittance advice."
            });
        }

        if (claim.ApprovedAmount is not decimal approved ||
            approved <= 0m)
        {
            return Conflict(new
            {
                message = "This claim has no reported approved amount."
            });
        }

        var duplicate =
            await _db.Set<MedicalAidRemittanceAdvice>()
                .AnyAsync(x =>
                    x.DentalPracticeId == practiceId &&
                    x.ClaimId == claim.Id &&
                    x.RemittanceReference == reference, ct);

        if (duplicate)
        {
            return Conflict(new
            {
                message = "This remittance reference is already recorded " +
                          "for the claim."
            });
        }

        var previouslyAdvised =
            await _db.Set<MedicalAidRemittanceAdvice>()
                .Where(x =>
                    x.DentalPracticeId == practiceId &&
                    x.ClaimId == claim.Id)
                .SumAsync(x => (decimal?)x.AdvisedAmount, ct) ?? 0m;

        if (request.AdvisedAmount > approved - previouslyAdvised)
        {
            return Conflict(new
            {
                message = "Remittance advice exceeds the remaining " +
                          "reported approved amount."
            });
        }

        var advice = new MedicalAidRemittanceAdvice
        {
            DentalPracticeId = practiceId,
            RequestId = request.RequestId,
            ClaimId = claim.Id,
            RemittanceReference = reference,
            AdvisedAmount = request.AdvisedAmount,
            EvidenceReference = evidence,
            Notes = notes,
            RecordedByUserId = actorId
        };

        _db.Set<MedicalAidRemittanceAdvice>().Add(advice);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "MEDICAL_AID_REMITTANCE_ADVICE_RECORDED",
            "MedicalAidRemittanceAdvice",
            advice.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            "/api/finance/medical-aid/remittances",
            new
            {
                advice.Id,
                advice.ClaimId,
                advice.RemittanceReference,
                advice.AdvisedAmount,
                status = "AdviceRecorded",
                notice = "Advice registered only. No funds received, " +
                         "payment created or invoice allocated."
            });
    }
}
