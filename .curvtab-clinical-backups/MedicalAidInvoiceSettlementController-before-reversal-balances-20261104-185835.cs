using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/medical-aid/invoice-settlement")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class MedicalAidInvoiceSettlementController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public MedicalAidInvoiceSettlementController(
        DentalDbContext db,
        ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    private static string SchemeKey(string? value)
    {
        var normalized = string.Join(
            " ",
            (value ?? "").Trim()
                .ToUpperInvariant()
                .Split(' ', StringSplitOptions.RemoveEmptyEntries));

        return normalized switch
        {
            "GEMS" => "GEMS",
            "GOVERNMENT EMPLOYEES MEDICAL SCHEME" => "GEMS",
            "GOVERNMENT EMPLOYEES MEDICAL SCHEME (GEMS)" => "GEMS",
            _ => normalized
        };
    }

    [HttpGet("preview/{matchId:guid}")]
    public async Task<IActionResult> Preview(
        Guid matchId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var match = await _db.Set<MedicalAidRemittanceMatch>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == matchId &&
                x.DentalPracticeId == practiceId, ct);

        if (match is null)
            return NotFound(new { message = "Match not found." });

        var receipt = await _db.Set<MedicalAidBankReceipt>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == match.BankReceiptId &&
                x.DentalPracticeId == practiceId, ct);

        var advice = await _db.Set<MedicalAidRemittanceAdvice>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == match.RemittanceAdviceId &&
                x.DentalPracticeId == practiceId, ct);

        if (receipt is null || advice is null)
            return Conflict(new
            {
                message = "Matching source records are incomplete."
            });

        var claim = await _db.Set<MedicalAidClaim>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == advice.ClaimId &&
                x.DentalPracticeId == practiceId, ct);

        if (claim is null)
            return Conflict(new
            {
                message = "The related medical aid claim was not found."
            });

        var membership = await _db.Set<MedicalAidMembership>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == claim.MembershipId &&
                x.DentalPracticeId == practiceId, ct);

        var invoice = await _db.Set<Invoice>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == claim.InvoiceId &&
                x.DentalPracticeId == practiceId, ct);

        if (membership is null ||
            invoice is null ||
            membership.PatientId != claim.PatientId ||
            invoice.PatientId != claim.PatientId)
        {
            return Conflict(new
            {
                message = "Claim, patient, membership and invoice " +
                          "must belong together."
            });
        }

        if (claim.Status != "ApprovedReported" &&
            claim.Status != "PartiallyApprovedReported")
        {
            return Conflict(new
            {
                message = "The claim is not in an approved status."
            });
        }

        if (SchemeKey(receipt.SchemeName) !=
            SchemeKey(membership.SchemeName))
        {
            return Conflict(new
            {
                message = "Bank receipt scheme does not match " +
                          "the patient's medical aid membership."
            });
        }

        if (invoice.Currency != "ZAR" ||
            claim.Currency != "ZAR" ||
            receipt.Currency != "ZAR")
        {
            return Conflict(new
            {
                message = "All settlement records must use ZAR."
            });
        }

        var regularPaid = await _db.Set<PaymentAllocation>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoice.Id &&
                !_db.Set<PaymentAllocationReversal>().Any(r =>
                    r.DentalPracticeId == practiceId &&
                    r.AllocationId == x.Id))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var credited = await _db.Set<InvoiceCreditNote>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoice.Id)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var schemePaid = await _db.Set<MedicalAidInvoiceAllocation>()
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoice.Id)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var matchAllocated =
            await _db.Set<MedicalAidInvoiceAllocation>()
                .AsNoTracking()
                .Where(x =>
                    x.DentalPracticeId == practiceId &&
                    x.RemittanceMatchId == match.Id)
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var invoiceBalance =
            invoice.TotalAmount - credited - regularPaid - schemePaid;

        var availableMatch = match.MatchedAmount - matchAllocated;

        var maxAllocatable = Math.Max(
            0m,
            Math.Min(invoiceBalance, availableMatch));

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            matchId = match.Id,
            claimId = claim.Id,
            claim.ClaimNumber,
            invoiceId = invoice.Id,
            invoice.InvoiceNumber,
            invoice.PatientId,
            schemeName = membership.SchemeName,
            receipt.BankReference,
            advice.RemittanceReference,
            matchedAmount = match.MatchedAmount,
            alreadyAllocatedFromMatch = matchAllocated,
            remainingMatchedFunds = Math.Max(0m, availableMatch),
            invoiceTotal = invoice.TotalAmount,
            creditedAmount = credited,
            patientPayments = regularPaid,
            schemePayments = schemePaid,
            outstandingBalance = Math.Max(0m, invoiceBalance),
            maxAllocatable,
            status = "PreviewOnly",
            notice = "Settlement preview only. " +
                     "No invoice balance has been changed."
        });
    }

    // CT_PHASE7E3_SETTLEMENT_POSTING
    // Deliberately disabled until reversal support and testing
    // have been completed.
    public sealed record PostSettlementRequest(
        Guid RequestId,
        Guid RemittanceMatchId,
        decimal Amount,
        string EvidenceReference,
        string? Notes);

    [HttpPost("allocations")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> PostAllocation(
        [FromBody] PostSettlementRequest request,
        [FromServices] IConfiguration configuration,
        [FromServices] IAuditService audit,
        CancellationToken ct)
    {
        if (!configuration.GetValue<bool>(
                "Features:MedicalAidSettlementPostingEnabled"))
        {
            return StatusCode(503, new
            {
                message = "Medical aid settlement posting is disabled " +
                          "until reversal support and validation tests " +
                          "are complete."
            });
        }

        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var evidence = request.EvidenceReference?.Trim() ?? "";
        var notes = request.Notes?.Trim() ?? "";

        if (request.RequestId == Guid.Empty ||
            request.RemittanceMatchId == Guid.Empty ||
            request.Amount <= 0m ||
            request.Amount > 10_000_000m ||
            decimal.Round(request.Amount, 2) != request.Amount ||
            evidence.Length < 3 ||
            evidence.Length > 300 ||
            notes.Length > 1000)
        {
            return BadRequest(new
            {
                message = "Invalid allocation request, amount or evidence."
            });
        }

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        // RequestId prevents a retried request from posting twice.
        var previous = await _db.Set<MedicalAidInvoiceAllocation>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);

        if (previous is not null)
        {
            if (previous.RemittanceMatchId != request.RemittanceMatchId ||
                previous.Amount != request.Amount ||
                previous.EvidenceReference != evidence ||
                previous.Notes != notes)
            {
                return Conflict(new
                {
                    message = "This request ID was already used " +
                              "with different allocation details."
                });
            }

            return Ok(new
            {
                previous.Id,
                previous.InvoiceId,
                previous.Amount,
                alreadyPosted = true
            });
        }

        var match = await _db.Set<MedicalAidRemittanceMatch>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == request.RemittanceMatchId &&
                x.DentalPracticeId == practiceId, ct);

        if (match is null)
            return NotFound(new { message = "Remittance match not found." });

        var advice = await _db.Set<MedicalAidRemittanceAdvice>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == match.RemittanceAdviceId &&
                x.DentalPracticeId == practiceId, ct);

        var receipt = await _db.Set<MedicalAidBankReceipt>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == match.BankReceiptId &&
                x.DentalPracticeId == practiceId, ct);

        if (advice is null || receipt is null)
            return Conflict(new { message = "Missing reconciliation records." });

        var claim = await _db.Set<MedicalAidClaim>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == advice.ClaimId &&
                x.DentalPracticeId == practiceId, ct);

        if (claim is null)
            return Conflict(new { message = "Claim not found." });

        // Lock the invoice before calculating its available balance.
        // Patient payments and credit notes use the same invoice lock.
        var invoice = await _db.Set<Invoice>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"Invoice\" WHERE \"Id\" = {claim.InvoiceId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (invoice is null)
            return Conflict(new { message = "Invoice not found." });

        var lockedMatch = await _db.Set<MedicalAidRemittanceMatch>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"MedicalAidRemittanceMatches\" WHERE \"Id\" = {match.Id} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (lockedMatch is null)
            return Conflict(new { message = "Remittance match changed." });

        var membership = await _db.Set<MedicalAidMembership>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == claim.MembershipId &&
                x.DentalPracticeId == practiceId, ct);

        if (membership is null ||
            membership.PatientId != claim.PatientId ||
            invoice.PatientId != claim.PatientId ||
            SchemeKey(receipt.SchemeName) !=
                SchemeKey(membership.SchemeName))
        {
            return Conflict(new
            {
                message = "Scheme, patient, claim and invoice " +
                          "do not match."
            });
        }

        if (claim.Status != "ApprovedReported" &&
            claim.Status != "PartiallyApprovedReported")
        {
            return Conflict(new
            {
                message = "The claim has not been reported approved."
            });
        }

        if (invoice.Currency != "ZAR" ||
            claim.Currency != "ZAR" ||
            receipt.Currency != "ZAR")
        {
            return Conflict(new
            {
                message = "Settlement currency must be ZAR."
            });
        }

        var matchUsed = await _db.Set<MedicalAidInvoiceAllocation>()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.RemittanceMatchId == match.Id)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var patientPaid = await _db.Set<PaymentAllocation>()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoice.Id &&
                !_db.Set<PaymentAllocationReversal>().Any(r =>
                    r.DentalPracticeId == practiceId &&
                    r.AllocationId == x.Id))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var credited = await _db.Set<InvoiceCreditNote>()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoice.Id)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var schemePaid = await _db.Set<MedicalAidInvoiceAllocation>()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.InvoiceId == invoice.Id)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var remainingMatch = lockedMatch.MatchedAmount - matchUsed;
        var invoiceBalance =
            invoice.TotalAmount - credited - patientPaid - schemePaid;

        if (request.Amount > remainingMatch ||
            request.Amount > invoiceBalance)
        {
            return Conflict(new
            {
                message = "Allocation exceeds available funds " +
                          "or the invoice balance.",
                remainingMatch,
                invoiceBalance
            });
        }

        var allocation = new MedicalAidInvoiceAllocation
        {
            DentalPracticeId = practiceId,
            RequestId = request.RequestId,
            RemittanceMatchId = match.Id,
            InvoiceId = invoice.Id,
            Amount = request.Amount,
            EvidenceReference = evidence,
            Notes = notes,
            AllocatedByUserId = actorId
        };

        _db.Set<MedicalAidInvoiceAllocation>().Add(allocation);

        await _db.SaveChangesAsync(ct);

        await audit.WriteAsync(
            "MEDICAL_AID_INVOICE_ALLOCATED",
            "MedicalAidInvoiceAllocation",
            allocation.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            $"/api/finance/invoices/{invoice.Id}",
            new
            {
                allocation.Id,
                allocation.InvoiceId,
                allocation.RemittanceMatchId,
                allocation.Amount,
                remainingInvoiceBalance =
                    invoiceBalance - allocation.Amount
            });
    }

}
