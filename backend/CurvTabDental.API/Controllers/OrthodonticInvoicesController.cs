using System.Data;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/orthodontic-invoices")]
[Authorize(Roles = "PracticeAdmin")]
public sealed class OrthodonticInvoicesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public OrthodonticInvoicesController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record IssueRequest(
        bool ConfirmNoDuplicateBilling);

    private static bool ValidMoney(decimal value) =>
        value >= 0m &&
        value <= 10_000_000m &&
        decimal.Round(value, 2) == value;

    [HttpGet("eligible")]
    public async Task<IActionResult> Eligible(
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var alreadyInvoiced = _db.Set<Invoice>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId)
            .Select(x => x.OrthodonticFinancialAgreementId);

        var agreements = await (
            from a in _db.OrthodonticFinancialAgreements
                .AsNoTracking()
            join c in _db.OrthodonticCases.AsNoTracking()
                on a.OrthodonticCaseId equals c.Id
            join p in _db.Patients.AsNoTracking()
                on c.PatientId equals p.Id
            where a.DentalPracticeId == practiceId
               && c.DentalPracticeId == practiceId
               && p.DentalPracticeId == practiceId
               && !alreadyInvoiced.Contains((Guid?)a.Id)
            orderby a.CreatedAtUtc descending
            select new
            {
                agreementId = a.Id,
                caseId = c.Id,
                caseTitle = c.Title,
                patientId = p.Id,
                patientName = p.FirstName + " " + p.LastName,
                a.TotalFee,
                a.DepositRequired,
                a.Currency,
                a.AgreementDate
            }
        ).Take(100).ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";
        return Ok(agreements);
    }

    [HttpPost("from-agreement/{agreementId:guid}")]
    public async Task<IActionResult> Issue(
        Guid agreementId,
        [FromBody] IssueRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (!request.ConfirmNoDuplicateBilling)
            return BadRequest(new
            {
                message = "Confirm that the agreed treatment fee " +
                          "has not been invoiced elsewhere."
            });

        // Serializable plus the unique agreement index prevents
        // duplicate invoices even when requests compete.
        await using var tx = await _db.Database
            .BeginTransactionAsync(
                IsolationLevel.Serializable, ct);

        var agreement = await _db.OrthodonticFinancialAgreements
            .AsNoTracking()
            .SingleOrDefaultAsync(x =>
                x.Id == agreementId &&
                x.DentalPracticeId == practiceId, ct);

        if (agreement is null)
            return NotFound(new
            {
                message = "Financial agreement not found."
            });

        var orthodonticCase = await _db.OrthodonticCases
            .AsNoTracking()
            .SingleOrDefaultAsync(x =>
                x.Id == agreement.OrthodonticCaseId &&
                x.DentalPracticeId == practiceId, ct);

        if (orthodonticCase is null)
            return Conflict(new
            {
                message = "The agreement's orthodontic case is missing."
            });

        var patientExists = await _db.Patients
            .AsNoTracking()
            .AnyAsync(x =>
                x.Id == orthodonticCase.PatientId &&
                x.DentalPracticeId == practiceId, ct);

        if (!patientExists)
            return Conflict(new
            {
                message = "The orthodontic patient is missing."
            });

        var existing = await _db.Set<Invoice>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.OrthodonticFinancialAgreementId == agreementId,
                ct);

        if (existing is not null)
            return Conflict(new
            {
                message = "This agreement already has an invoice.",
                invoiceId = existing.Id
            });

        var schedule = await _db.OrthodonticInstallments
            .AsNoTracking()
            .Where(x =>
                x.AgreementId == agreementId &&
                x.DentalPracticeId == practiceId)
            .OrderBy(x => x.Sequence)
            .ToListAsync(ct);

        if (!ValidMoney(agreement.TotalFee) ||
            agreement.TotalFee <= 0m ||
            !ValidMoney(agreement.DepositRequired) ||
            agreement.DepositRequired >= agreement.TotalFee ||
            schedule.Count == 0 ||
            schedule.Any(x =>
                !ValidMoney(x.AmountDue) ||
                x.AmountDue <= 0m) ||
            agreement.DepositRequired +
                schedule.Sum(x => x.AmountDue) !=
                    agreement.TotalFee)
        {
            return Conflict(new
            {
                message = "The agreement fee, deposit and " +
                          "instalment schedule do not reconcile."
            });
        }

        var description = "Orthodontic treatment — " +
                          orthodonticCase.Title.Trim();

        if (description.Length > 200)
            description = description[..200];

        var now = DateTime.UtcNow;

        var invoice = new Invoice
        {
            DentalPracticeId = practiceId,
            PatientId = orthodonticCase.PatientId,
            AppointmentId = null,
            ConsultationId = null,
            OrthodonticFinancialAgreementId = agreementId,
            InvoiceNumber =
                $"ORT-{now:yyyyMMdd}-{Guid.NewGuid():N}",
            Currency = agreement.Currency,
            TotalAmount = agreement.TotalFee,
            IssuedByUserId = actorId,
            IssuedAtUtc = now
        };

        var line = new InvoiceLine
        {
            DentalPracticeId = practiceId,
            InvoiceId = invoice.Id,
            SourceConsultationChargeId = null,
            SourceOrthodonticFinancialAgreementId = agreementId,
            Description = description,
            Amount = agreement.TotalFee
        };

        _db.Set<Invoice>().Add(invoice);
        _db.Set<InvoiceLine>().Add(line);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "ORTHODONTIC_INVOICE_ISSUED",
            "Invoice",
            invoice.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            $"/api/finance/invoices/{invoice.Id}",
            new
            {
                invoice.Id,
                invoice.InvoiceNumber,
                invoice.PatientId,
                invoice.OrthodonticFinancialAgreementId,
                invoice.TotalAmount,
                invoice.Currency,
                invoice.IssuedAtUtc,
                depositRequired = agreement.DepositRequired,
                scheduledInstalments = schedule.Count,
                allocatedAmount = 0m,
                message = "Orthodontic invoice issued. " +
                          "No payment has been recorded."
            });
    }
}
