using CurvTabDental.API.Services;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Actual reception-collected Phase 1 advance. The standard R2,500 is credited
/// to the PATIENT, not a new invoice, treatment contract or instalment.
/// Receipt ID is an idempotent, authoritative cash/Card/EFT entry.
/// </summary>
[ApiController]
[Route("api/orthodontics/intakes/{intakeId:guid}/advance")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class OrthodonticIntakeAdvancesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public OrthodonticIntakeAdvancesController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db; _current = current; _audit = audit;
    }

    public sealed record ReceiveAdvanceRequest(
        Guid RequestId, decimal Amount, string Method,
        string? Reference, bool ConfirmFundsReceived);

    private static object Receipt(OrthodonticIntakeAdvanceReceipt r, bool alreadyRecorded = false) => new
    {
        r.Id, r.OrthodonticIntakeCaseId, r.PatientId,
        r.ReceiptNumber, r.Amount, r.Method, r.Reference, r.ReceivedAtUtc,
        r.ReceivedByUserId, creditAvailable = r.AllocatedAtUtc is null ? r.Amount : 0m,
        r.AllocatedOrthodonticAgreementId, alreadyRecorded,
        note = "Actual paid advance, held as unallocated patient credit until an approved orthodontic treatment agreement."
    };

    [HttpGet]
    public async Task<IActionResult> Get(Guid intakeId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await _db.OrthodonticIntakes.AsNoTracking().AnyAsync(x =>
            x.Id == intakeId && x.DentalPracticeId == practiceId, ct)) return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        var receipts = await _db.OrthodonticIntakeAdvanceReceipts.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.OrthodonticIntakeCaseId == intakeId)
            .OrderBy(x => x.ReceivedAtUtc)
            .ToListAsync(ct);
        return Ok(receipts.Select(x => Receipt(x)));
    }

    [HttpPost]
    [Authorize(Roles = "Receptionist,PracticeAdmin")]
    public async Task<IActionResult> Record(Guid intakeId, [FromBody] ReceiveAdvanceRequest req,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        if (req.RequestId == Guid.Empty || req.Amount != 2500.00m ||
            req.Method is not ("Cash" or "Card" or "EFT") ||
            !req.ConfirmFundsReceived || req.Reference?.Length > 100 ||
            (req.Method != "Cash" && string.IsNullOrWhiteSpace(req.Reference)))
            return BadRequest(new {
                message = "Record only an ACTUALLY received R2,500 advance, with a unique request ID and a terminal/EFT reference where applicable. Never enter card numbers."
            });

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        // Row-lock the intake so two reception terminals cannot take the
        // same advance concurrently. The database enforces both unique IDs.
        var intake = await _db.OrthodonticIntakes
            .FromSqlInterpolated($"SELECT * FROM \"OrthodonticIntakes\" WHERE \"Id\" = {intakeId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (intake is null || intake.ClosedAtUtc is not null) return NotFound();

        var alreadyByKey = await _db.OrthodonticIntakeAdvanceReceipts.AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId && x.RequestId == req.RequestId, ct);
        if (alreadyByKey != null)
        {
            if (alreadyByKey.OrthodonticIntakeCaseId != intake.Id ||
                alreadyByKey.Amount != req.Amount || alreadyByKey.Method != req.Method ||
                alreadyByKey.Reference != (string.IsNullOrWhiteSpace(req.Reference) ? null : req.Reference.Trim()))
                return Conflict(new { message = "This payment request ID is already associated with a different receipt." });
            return Ok(Receipt(alreadyByKey, alreadyRecorded: true));
        }
        if (intake.AdvancePaymentId.HasValue ||
            await _db.OrthodonticIntakeAdvanceReceipts.AnyAsync(x =>
                x.OrthodonticIntakeCaseId == intake.Id, ct))
            return Conflict(new { message = "An orthodontic advance has already been receipted. Never charge a second R2,500." });

        if (intake.AdvancePolicy != "STANDARD_R2500" ||
            !intake.TermsApplicable || !intake.TermsAcceptedAtUtc.HasValue ||
            string.IsNullOrWhiteSpace(intake.TermsSha256) ||
            string.IsNullOrWhiteSpace(intake.TermsVersion))
            return Conflict(new { message = "An advance can be collected only after valid, versioned and signed intake terms. Transfer-in fees require an explicitly approved policy." });

        var patientExists = await _db.Patients.AsNoTracking().AnyAsync(x =>
            x.Id == intake.PatientId && x.DentalPracticeId == practiceId && !x.IsArchived, ct);
        if (!patientExists) return NotFound();

        var now = DateTime.UtcNow;
        var id = Guid.NewGuid();
        var receipt = new OrthodonticIntakeAdvanceReceipt
        {
            Id = id, DentalPracticeId = practiceId,
            OrthodonticIntakeCaseId = intake.Id, PatientId = intake.PatientId,
            RequestId = req.RequestId,
            ReceiptNumber = $"ORT-RCPT-{now:yyyyMMdd}-{id.ToString("N")[..12].ToUpperInvariant()}",
            Amount = req.Amount, Method = req.Method,
            Reference = string.IsNullOrWhiteSpace(req.Reference) ? null : req.Reference.Trim(),
            ReceivedAtUtc = now, ReceivedByUserId = actor
        };
        _db.OrthodonticIntakeAdvanceReceipts.Add(receipt);
        intake.AdvancePaymentId = receipt.Id;
        intake.UpdatedAtUtc = now;

        // Payment never proves medical review, the consent to full treatment,
        // or a new instalment agreement.
        if (intake.Status != "ASSESSMENT_IN_PROGRESS" &&
            intake.HistoryVerifiedByClinician &&
            (System.Text.Json.JsonSerializer.Deserialize<string[]>(intake.MissingDocumentsJson)?.Length ?? 0) == 0 &&
            intake.TermsAcceptedAtUtc.HasValue)
            intake.Status = "ASSESSMENT_READY";
        else if (intake.Status != "ASSESSMENT_IN_PROGRESS" && intake.Status == "PAYMENT_PENDING")
            intake.Status = "RECORDS_PENDING";

        try
        {
            await _db.SaveChangesAsync(ct);
            await _audit.WriteAsync("ORTHO_INTAKE_ADVANCE_RECEIVED",
                "OrthodonticIntakeAdvanceReceipt", receipt.Id.ToString(),
                detail: $"intake={intake.Id};amount={receipt.Amount:0.00};method={receipt.Method};receipt={receipt.ReceiptNumber}", ct: ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            return Conflict(new { message = "The intake advance was receipted concurrently. Reload the existing receipt; do not retry as a new payment." });
        }
        Response.Headers.CacheControl = "private, no-store";
        return Created($"/api/orthodontics/intakes/{intakeId}/advance", Receipt(receipt));
    }

    [HttpGet("{paymentId:guid}/receipt.pdf")]
    public async Task<IActionResult> DownloadReceipt(Guid intakeId, Guid paymentId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var advance = await _db.OrthodonticIntakeAdvanceReceipts.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == paymentId && x.DentalPracticeId == practiceId &&
                x.OrthodonticIntakeCaseId == intakeId, ct);
        if (advance is null) return NotFound();
        var patientName = await _db.Patients.AsNoTracking()
            .Where(p => p.Id == advance.PatientId && p.DentalPracticeId == practiceId)
            .Select(p => p.FirstName + " " + p.LastName).FirstOrDefaultAsync(ct);
        if (patientName is null) return NotFound();
        var practiceName = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId).Select(p => p.Name)
            .FirstOrDefaultAsync(ct) ?? "Dental Practice";
        var pdf = OrthodonticIntakePdf.RenderAdvanceReceipt(
            practiceName, patientName, advance.ReceiptNumber, advance.Id, intakeId,
            advance.Amount, advance.Method, advance.Reference, advance.ReceivedAtUtc);
        await _audit.WriteAsync("ORTHO_INTAKE_ADVANCE_RECEIPT_DOWNLOADED",
            "OrthodonticIntakeAdvanceReceipt", advance.Id.ToString(), ct: ct);
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(pdf, "application/pdf", $"{advance.ReceiptNumber}.pdf");
    }
}
