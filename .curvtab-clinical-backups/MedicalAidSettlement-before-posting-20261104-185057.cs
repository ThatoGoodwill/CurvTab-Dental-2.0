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
}
