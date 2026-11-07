using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/orthodontics/{caseId:guid}/agreement")]
[Authorize(Roles = "Dentist,Receptionist,PracticeAdmin")]
public sealed class OrthodonticFinanceController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public OrthodonticFinanceController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record CreateAgreementRequest(
        decimal TotalFee,
        decimal DepositRequired,
        DateOnly AgreementDate,
        DateOnly FirstDueDate,
        int InstalmentCount,
        string? Terms
    );

    private static bool MoneyIsValid(decimal amount) =>
        amount >= 0m &&
        amount <= 10_000_000m &&
        decimal.Round(amount, 2) == amount;

    [HttpGet]
    public async Task<IActionResult> Get(
        Guid caseId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var belongsToPractice =
            await _db.OrthodonticCases.AsNoTracking()
                .AnyAsync(c =>
                    c.Id == caseId &&
                    c.DentalPracticeId == practiceId, ct);

        if (!belongsToPractice)
            return NotFound();

        var agreement =
            await _db.OrthodonticFinancialAgreements
                .AsNoTracking()
                .FirstOrDefaultAsync(a =>
                    a.DentalPracticeId == practiceId &&
                    a.OrthodonticCaseId == caseId, ct);

        if (agreement is null)
            return NotFound(new {
                message = "No financial agreement exists for this case."
            });

        var instalments =
            await _db.OrthodonticInstallments
                .AsNoTracking()
                .Where(i =>
                    i.DentalPracticeId == practiceId &&
                    i.AgreementId == agreement.Id)
                .OrderBy(i => i.Sequence)
                .Select(i => new
                {
                    i.Id,
                    i.Sequence,
                    i.DueDate,
                    i.AmountDue
                })
                .ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";

        return Ok(new
        {
            agreement.Id,
            agreement.OrthodonticCaseId,
            agreement.TotalFee,
            agreement.DepositRequired,
            agreement.Currency,
            agreement.AgreementDate,
            agreement.Terms,
            agreement.CreatedAtUtc,
            agreement.CreatedByUserId,
            Instalments = instalments,
            paymentStatus = "Not reconciled",
            note = "This agreement records amounts due, not money received."
        });
    }

    [HttpPost]
    [Authorize(Roles = "Dentist,PracticeAdmin")]
    public async Task<IActionResult> Create(
        Guid caseId,
        [FromBody] CreateAgreementRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (!MoneyIsValid(request.TotalFee) ||
            request.TotalFee <= 0m ||
            !MoneyIsValid(request.DepositRequired) ||
            request.DepositRequired >= request.TotalFee)
        {
            return BadRequest(new
            {
                message = "Supply a valid positive fee and a deposit " +
                          "smaller than the total fee."
            });
        }

        if (request.AgreementDate == default ||
            request.FirstDueDate == default ||
            request.FirstDueDate < request.AgreementDate ||
            request.InstalmentCount is < 1 or > 60 ||
            request.Terms?.Length > 2000)
        {
            return BadRequest(new
            {
                message = "Choose valid dates, 1–60 instalments " +
                          "and payment terms up to 2000 characters."
            });
        }

        var caseExists =
            await _db.OrthodonticCases.AsNoTracking()
                .AnyAsync(c =>
                    c.Id == caseId &&
                    c.DentalPracticeId == practiceId, ct);

        if (!caseExists)
            return NotFound(new
            {
                message = "Orthodontic case not found."
            });

        var existing =
            await _db.OrthodonticFinancialAgreements
                .AsNoTracking()
                .AnyAsync(a =>
                    a.OrthodonticCaseId == caseId &&
                    a.DentalPracticeId == practiceId, ct);

        if (existing)
            return Conflict(new
            {
                message = "This case already has an agreement. " +
                          "Existing agreements cannot be overwritten."
            });

        var agreement = new OrthodonticFinancialAgreement
        {
            DentalPracticeId = practiceId,
            OrthodonticCaseId = caseId,
            CreatedByUserId = actorId,
            TotalFee = request.TotalFee,
            DepositRequired = request.DepositRequired,
            AgreementDate = request.AgreementDate,
            Terms = string.IsNullOrWhiteSpace(request.Terms)
                ? null : request.Terms.Trim()
        };

        // Exact integer-cent calculation. The final instalment
        // receives the remainder, avoiding rounding differences.
        var remainder = request.TotalFee - request.DepositRequired;
        var totalCents = decimal.ToInt64(remainder * 100m);
        var monthlyCents = totalCents / request.InstalmentCount;
        var extraCents = totalCents % request.InstalmentCount;

        if (monthlyCents == 0)
            return BadRequest(new
            {
                message = "There are too many instalments for the fee."
            });

        var instalments = new List<OrthodonticInstallment>();

        for (var n = 0; n < request.InstalmentCount; n++)
        {
            var cents = monthlyCents +
                (n == request.InstalmentCount - 1 ? extraCents : 0);

            instalments.Add(new OrthodonticInstallment
            {
                DentalPracticeId = practiceId,
                AgreementId = agreement.Id,
                Sequence = n + 1,
                DueDate = request.FirstDueDate.AddMonths(n),
                AmountDue = cents / 100m
            });
        }

        // Save the agreement and its schedule as one transaction.
        await using var transaction =
            await _db.Database.BeginTransactionAsync(ct);

        _db.OrthodonticFinancialAgreements.Add(agreement);
        _db.OrthodonticInstallments.AddRange(instalments);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "ORTHODONTIC_FINANCIAL_AGREEMENT_CREATED",
            "OrthodonticFinancialAgreement",
            agreement.Id.ToString(),
            ct: ct);

        await transaction.CommitAsync(ct);

        return Created(
            $"/api/finance/orthodontics/{caseId}/agreement",
            new
            {
                agreement.Id,
                agreement.OrthodonticCaseId,
                agreement.TotalFee,
                agreement.DepositRequired,
                agreement.Currency,
                instalmentCount = instalments.Count,
                scheduledTotal =
                    instalments.Sum(i => i.AmountDue),
                agreement.CreatedAtUtc
            });
    }
}
