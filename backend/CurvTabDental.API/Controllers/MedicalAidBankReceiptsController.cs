using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/medical-aid/bank-receipts")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class MedicalAidBankReceiptsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public MedicalAidBankReceiptsController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record RecordReceiptRequest(
        Guid RequestId,
        string SchemeName,
        string BankReference,
        decimal Amount,
        DateOnly ReceivedOn,
        string EvidenceReference,
        string? Notes);

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var rows = await _db.Set<MedicalAidBankReceipt>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId)
            .OrderByDescending(x => x.RecordedAtUtc)
            .Take(200)
            .Select(x => new
            {
                x.Id,
                x.SchemeName,
                x.BankReference,
                x.Amount,
                x.Currency,
                x.ReceivedOn,
                x.EvidenceReference,
                x.Notes,
                x.RecordedByUserId,
                x.RecordedAtUtc,
                status = "ReceiptRecorded"
            })
            .ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(rows);
    }

    [HttpPost]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Record(
        [FromBody] RecordReceiptRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var scheme = request.SchemeName?.Trim() ?? "";
        var reference = request.BankReference?.Trim() ?? "";
        var evidence = request.EvidenceReference?.Trim() ?? "";
        var notes = request.Notes?.Trim() ?? "";

        var schemeKey = scheme.ToUpperInvariant();
        var referenceKey = reference.ToUpperInvariant();

        if (request.RequestId == Guid.Empty ||
            scheme.Length is < 2 or > 160 ||
            reference.Length is < 3 or > 120 ||
            evidence.Length is < 3 or > 300 ||
            notes.Length > 1000 ||
            request.Amount <= 0m ||
            request.Amount > 10_000_000m ||
            decimal.Round(request.Amount, 2) != request.Amount ||
            request.ReceivedOn == default ||
            request.ReceivedOn >
                DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)))
        {
            return BadRequest(new
            {
                message = "Provide a valid scheme, bank reference, " +
                          "amount, deposit date and evidence reference."
            });
        }

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        // Serialize bank receipt creation within the practice.
        // Prevents concurrent duplicate submissions.
        var practice = await _db.Set<DentalPractice>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"DentalPractices\" WHERE \"Id\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (practice is null)
            return Forbid();

        var previous = await _db.Set<MedicalAidBankReceipt>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);

        if (previous is not null)
        {
            if (previous.SchemeKey == schemeKey &&
                previous.BankReferenceKey == referenceKey &&
                previous.Amount == request.Amount &&
                previous.ReceivedOn == request.ReceivedOn &&
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
                message = "Request ID has already been used " +
                          "for different bank receipt details."
            });
        }

        var duplicate = await _db.Set<MedicalAidBankReceipt>()
            .AnyAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.SchemeKey == schemeKey &&
                x.BankReferenceKey == referenceKey, ct);

        if (duplicate)
        {
            return Conflict(new
            {
                message = "This bank reference has already been " +
                          "recorded for the medical aid scheme."
            });
        }

        var receipt = new MedicalAidBankReceipt
        {
            DentalPracticeId = practiceId,
            RequestId = request.RequestId,
            SchemeName = scheme,
            SchemeKey = schemeKey,
            BankReference = reference,
            BankReferenceKey = referenceKey,
            Amount = request.Amount,
            ReceivedOn = request.ReceivedOn,
            EvidenceReference = evidence,
            Notes = notes,
            RecordedByUserId = actorId
        };

        _db.Set<MedicalAidBankReceipt>().Add(receipt);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "MEDICAL_AID_BANK_RECEIPT_RECORDED",
            "MedicalAidBankReceipt",
            receipt.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            "/api/finance/medical-aid/bank-receipts",
            new
            {
                receipt.Id,
                receipt.SchemeName,
                receipt.BankReference,
                receipt.Amount,
                receipt.ReceivedOn,
                status = "ReceiptRecorded",
                notice = "Bank receipt details recorded by staff. " +
                         "No remittance matched or invoice settled."
            });
    }
}
