using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Records a physically received assessment advance in the EXISTING receipts
/// ledger. It does not charge a card or assert an EFT has cleared automatically.
/// Only explicitly confirmed, linked and receipted real payments are recorded.
/// </summary>
[ApiController]
[Route("api/orthodontics/intakes/{intakeId:guid}/advance")]
[Authorize(Roles = "PracticeAdmin,Receptionist")]
public sealed class OrthodonticIntakeAdvanceController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    public OrthodonticIntakeAdvanceController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db=db; _current=current; _audit=audit;
    }
    public record RecordAdvanceRequest(Guid AppointmentId, string Method, string? BankReference, bool ConfirmedFundsReceived);
    private Task<OrthodonticIntakeCase?> GetIntake(Guid intakeId, Guid practiceId, CancellationToken ct) =>
        _db.OrthodonticIntakes.FirstOrDefaultAsync(x => x.Id == intakeId &&
            x.DentalPracticeId == practiceId && x.ClosedAtUtc == null, ct);

    [HttpGet("appointments")]
    public async Task<IActionResult> Appointments(Guid intakeId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var intake = await GetIntake(intakeId, practiceId, ct);
        if (intake is null) return NotFound();
        var dates = await _db.Appointments.AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId && x.PatientId == intake.PatientId &&
                x.Status != "Cancelled")
            .OrderByDescending(x => x.StartUtc).Take(30)
            .Select(x => new { x.Id, x.StartUtc, x.Reason, x.Status })
            .ToListAsync(ct);
        return Ok(dates);
    }

    [HttpGet]
    public async Task<IActionResult> Receipt(Guid intakeId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var intake = await GetIntake(intakeId, practiceId, ct);
        if (intake is null) return NotFound();
        if (intake.AdvancePaymentId is null)
            return Ok(new { recorded = false, required = intake.AdvancePolicy == "STANDARD_R2500",
                amount = 2500m, currency = "ZAR" });
        var receipt = await _db.Payments.AsNoTracking()
            .Where(p => p.Id == intake.AdvancePaymentId && p.DentalPracticeId == practiceId)
            .Select(p => new { p.Id, p.ReceiptNumber, p.Amount, p.Method, p.Reference, p.ReceivedAtUtc })
            .FirstOrDefaultAsync(ct);
        if (receipt is null) return Conflict(new { message = "Advance reference missing from the authoritative receipts ledger. Contact practice administrator." });
        return Ok(new { recorded = true, currency = "ZAR", payment = receipt,
            allocation = "Assessment advance – retain as patient credit toward the accepted future braces quotation; Phase 1 does not create a treatment plan." });
    }

    [HttpPost]
    public async Task<IActionResult> Record(Guid intakeId, [FromBody] RecordAdvanceRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId || _current.UserId is not Guid actor) return Forbid();
        var intake = await GetIntake(intakeId, practiceId, ct);
        if (intake is null) return NotFound();
        if (intake.AdvancePaymentId.HasValue)
            return Conflict(new { message = "An advance receipt is already linked to this intake. Open the saved receipt instead." });
        if (intake.AdvancePolicy != "STANDARD_R2500" || !intake.TermsApplicable ||
            intake.TermsAcceptedAtUtc == null || string.IsNullOrWhiteSpace(intake.TermsSha256))
            return Conflict(new { message = "No R2,500 advance may be collected until the correct advance policy and signed approved intake terms exist." });
        if (!req.ConfirmedFundsReceived)
            return BadRequest(new { message = "Do not record funds that have not actually been received and verified." });
        var method = req.Method?.Trim();
        if (method is not ("Cash" or "EFT"))
            return BadRequest(new { message = "Use Cash or verified EFT only. Card payments require a separate integrated processor confirmation." });
        if (method == "EFT" && (string.IsNullOrWhiteSpace(req.BankReference) || req.BankReference.Trim().Length > 55))
            return BadRequest(new { message = "A bank-confirmed reference (max 55 characters) is required for EFT." });
        var appointment = await _db.Appointments.AsNoTracking().FirstOrDefaultAsync(x =>
            x.Id == req.AppointmentId && x.PatientId == intake.PatientId &&
            x.DentalPracticeId == practiceId && x.Status != "Cancelled", ct);
        if (appointment is null)
            return BadRequest(new { message = "Select an existing non-cancelled appointment for this patient and practice." });

        // Deterministic idempotency key: one actual payment per intake, even
        // if a browser resubmits or two reception users click at once.
        var now = DateTime.UtcNow;
        var payment = new Payment
        {
            DentalPracticeId = practiceId,
            AppointmentId = appointment.Id,
            RequestId = intake.Id,
            Amount = 2500.00m,
            Method = method!,
            Reference = method == "EFT"
                ? $"ORTHO-{intake.Id:N}:{req.BankReference!.Trim()}"
                : $"ORTHO-{intake.Id:N}:Cash",
            ReceiptNumber = "ORT-" + now.ToString("yyyyMMdd") + "-" +
                Guid.NewGuid().ToString("N")[..12].ToUpperInvariant(),
            ReceivedAtUtc = now,
            ReceivedByUserId = actor
        };
        // The existing appointment-linked Payment table is the ONLY money row.
        // Link intake and receipt atomically; no second finance ledger.
        _db.Payments.Add(payment);
        intake.AdvancePaymentId = payment.Id;
        intake.UpdatedAtUtc = now;
        if (intake.Status == "PAYMENT_PENDING")
        {
            // An authenticated clinician has to perform the final readiness
            // review; payment receipt alone does not establish clinical safety.
            intake.Status = "RECORDS_PENDING";
            intake.NextAction = "Advance received. Assigned specialist must confirm the final readiness checklist.";
        }
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            return Conflict(new { message = "A receipt was already recorded. Refresh to see the original; no second receipt was created." });
        }
        await _audit.WriteAsync("ORTHO_ADVANCE_PAYMENT_RECEIVED", "OrthodonticIntakeCase",
            intake.Id.ToString(), detail: $"receipt={payment.ReceiptNumber};payment={payment.Id};amount=2500.00;method={method}", ct: ct);
        return Created($"/api/orthodontics/intakes/{intake.Id}/advance", new
        {
            recorded = true, currency = "ZAR", amount = payment.Amount,
            payment.Id, payment.ReceiptNumber, payment.Method, payment.ReceivedAtUtc,
            note = "Posted once to existing appointment receipts ledger. This is advance credit, not additional braces treatment cost."
        });
    }
}
