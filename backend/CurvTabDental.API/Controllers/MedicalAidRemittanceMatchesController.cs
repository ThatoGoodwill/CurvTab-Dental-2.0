using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/medical-aid/remittance-matches")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class MedicalAidRemittanceMatchesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public MedicalAidRemittanceMatchesController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record MatchRequest(
        Guid RequestId,
        Guid BankReceiptId,
        Guid RemittanceAdviceId,
        decimal MatchedAmount,
        string EvidenceReference,
        string? Notes);

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var rows = await (
            from match in _db.Set<MedicalAidRemittanceMatch>()
                .AsNoTracking()
            join receipt in _db.Set<MedicalAidBankReceipt>()
                .AsNoTracking()
                on match.BankReceiptId equals receipt.Id
            join advice in _db.Set<MedicalAidRemittanceAdvice>()
                .AsNoTracking()
                on match.RemittanceAdviceId equals advice.Id
            join claim in _db.Set<MedicalAidClaim>()
                .AsNoTracking()
                on advice.ClaimId equals claim.Id
            where match.DentalPracticeId == practiceId
                  && receipt.DentalPracticeId == practiceId
                  && advice.DentalPracticeId == practiceId
                  && claim.DentalPracticeId == practiceId
            orderby match.MatchedAtUtc descending
            select new
            {
                match.Id,
                match.BankReceiptId,
                match.RemittanceAdviceId,
                match.MatchedAmount,
                match.EvidenceReference,
                match.Notes,
                match.MatchedByUserId,
                match.MatchedAtUtc,
                receipt.SchemeName,
                receipt.BankReference,
                receipt.Amount,
                advice.RemittanceReference,
                advice.AdvisedAmount,
                claim.ClaimNumber,
                status = "MatchedNotAllocated"
            }
        ).Take(200).ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(rows);
    }

    [HttpPost]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Record(
        [FromBody] MatchRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var evidence = request.EvidenceReference?.Trim() ?? "";
        var notes = request.Notes?.Trim() ?? "";

        if (request.RequestId == Guid.Empty ||
            request.BankReceiptId == Guid.Empty ||
            request.RemittanceAdviceId == Guid.Empty ||
            request.MatchedAmount <= 0m ||
            request.MatchedAmount > 10_000_000m ||
            decimal.Round(request.MatchedAmount, 2) !=
                request.MatchedAmount ||
            evidence.Length is < 3 or > 300 ||
            notes.Length > 1000)
        {
            return BadRequest(new
            {
                message = "Provide a valid bank receipt, remittance " +
                          "advice, matching amount and evidence."
            });
        }

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        // Lock the receipt first. All matching requests use the
        // same lock order to reduce concurrency conflicts.
        var receipt = await _db.Set<MedicalAidBankReceipt>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"MedicalAidBankReceipts\" WHERE \"Id\" = {request.BankReceiptId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (receipt is null)
        {
            return NotFound(new
            {
                message = "Bank receipt not found."
            });
        }

        // Lock the advice to prevent concurrent overmatching.
        var advice = await _db.Set<MedicalAidRemittanceAdvice>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"MedicalAidRemittanceAdvices\" WHERE \"Id\" = {request.RemittanceAdviceId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (advice is null)
        {
            return NotFound(new
            {
                message = "Remittance advice not found."
            });
        }

        var previous = await _db.Set<MedicalAidRemittanceMatch>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);

        if (previous is not null)
        {
            if (previous.BankReceiptId == request.BankReceiptId &&
                previous.RemittanceAdviceId ==
                    request.RemittanceAdviceId &&
                previous.MatchedAmount == request.MatchedAmount &&
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
                message = "Request ID already used for " +
                          "different matching details."
            });
        }

        var duplicate = await _db.Set<MedicalAidRemittanceMatch>()
            .AnyAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.BankReceiptId == request.BankReceiptId &&
                x.RemittanceAdviceId ==
                    request.RemittanceAdviceId, ct);

        if (duplicate)
        {
            return Conflict(new
            {
                message = "This receipt and advice are already matched. " +
                          "One matching record per pair is supported."
            });
        }

        var receiptMatched =
            await _db.Set<MedicalAidRemittanceMatch>()
                .Where(x =>
                    x.DentalPracticeId == practiceId &&
                    x.BankReceiptId == receipt.Id)
                .SumAsync(
                    x => (decimal?)x.MatchedAmount, ct) ?? 0m;

        var adviceMatched =
            await _db.Set<MedicalAidRemittanceMatch>()
                .Where(x =>
                    x.DentalPracticeId == practiceId &&
                    x.RemittanceAdviceId == advice.Id)
                .SumAsync(
                    x => (decimal?)x.MatchedAmount, ct) ?? 0m;

        if (request.MatchedAmount >
            receipt.Amount - receiptMatched)
        {
            return Conflict(new
            {
                message = "Matched amount exceeds remaining " +
                          "bank receipt funds."
            });
        }

        if (request.MatchedAmount >
            advice.AdvisedAmount - adviceMatched)
        {
            return Conflict(new
            {
                message = "Matched amount exceeds remaining " +
                          "remittance advice."
            });
        }

        // Verify the advice belongs to an approved claim.
        var claim = await _db.Set<MedicalAidClaim>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == advice.ClaimId &&
                x.DentalPracticeId == practiceId, ct);

        if (claim is null ||
            (claim.Status != "ApprovedReported" &&
             claim.Status != "PartiallyApprovedReported"))
        {
            return Conflict(new
            {
                message = "The remittance advice must belong " +
                          "to an approved claim."
            });
        }

        var match = new MedicalAidRemittanceMatch
        {
            DentalPracticeId = practiceId,
            RequestId = request.RequestId,
            BankReceiptId = receipt.Id,
            RemittanceAdviceId = advice.Id,
            MatchedAmount = request.MatchedAmount,
            EvidenceReference = evidence,
            Notes = notes,
            MatchedByUserId = actorId
        };

        _db.Set<MedicalAidRemittanceMatch>().Add(match);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "MEDICAL_AID_REMITTANCE_MATCH_RECORDED",
            "MedicalAidRemittanceMatch",
            match.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            "/api/finance/medical-aid/remittance-matches",
            new
            {
                match.Id,
                match.BankReceiptId,
                match.RemittanceAdviceId,
                match.MatchedAmount,
                status = "MatchedNotAllocated",
                notice = "Remittance matching recorded. " +
                         "No invoice payment allocation occurred."
            });
    }
}
