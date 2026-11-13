using CurvTabDental.API.Services;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

/// <summary>Reconciles immutable receipts, clinical charges and advance movements.</summary>
[ApiController]
[Route("api/billing/reports")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class ClinicalFinanceReportsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    public ClinicalFinanceReportsController(DentalDbContext db, ICurrentUser current)
    { _db = db; _current = current; }

    [HttpGet("patients/{patientId:guid}/statement")]
    public async Task<IActionResult> PatientStatement(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p =>
            p.Id == patientId && p.DentalPracticeId == practiceId && !p.IsArchived, ct);
        if (patient is null) return NotFound();

        var plans = await _db.PatientTreatmentPlans.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId)
            .ToListAsync(ct);
        var planIds = plans.Select(p => p.Id).ToArray();
        var procedures = await _db.PatientTreatmentProcedures.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId &&
                        planIds.Contains(p.TreatmentPlanId))
            .OrderBy(p => p.CreatedAtUtc).ToListAsync(ct);
        var originalAllocations = await _db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && planIds.Contains(a.TreatmentPlanId))
            .ToListAsync(ct);
        var transfers = await _db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId && t.PatientId == patientId)
            .OrderBy(t => t.AuthorizedAtUtc).ToListAsync(ct);
        var decisions = await _db.TreatmentProcedureDecisions.AsNoTracking()
            .Where(d => d.DentalPracticeId == practiceId && d.PatientId == patientId)
            .OrderBy(d => d.RecordedAtUtc).ToListAsync(ct);
        var planReceipts = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId)
            .OrderBy(p => p.ReceivedAtUtc).ToListAsync(ct);

        var appointments = await _db.Appointments.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && a.PatientId == patientId)
            .Select(a => new { a.Id, a.Status }).ToListAsync(ct);
        var appointmentIds = appointments.Select(a => a.Id).ToArray();
        var consultations = await _db.Consultations.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.PatientId == patientId &&
                c.IsFinalized && appointmentIds.Contains(c.AppointmentId))
            .Select(c => new { c.Id, c.AppointmentId, c.FinalizedAtUtc }).ToListAsync(ct);
        var consultationIds = consultations.Select(c => c.Id).ToArray();
        var charges = await _db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && consultationIds.Contains(c.ConsultationId))
            .Select(c => new { c.Id, c.ConsultationId, c.TreatmentProcedureId, c.Description, c.Amount })
            .ToListAsync(ct);
        var checkoutReceipts = await _db.Payments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && appointmentIds.Contains(p.AppointmentId))
            .OrderBy(p => p.ReceivedAtUtc).ToListAsync(ct);
        var credited = await TreatmentAdvanceCredit.ForConsultations(_db, practiceId, consultationIds, ct);
        var totalCredits = credited.Values.Sum();
        var completedValue = procedures.Where(p => p.Status == "Completed")
            .Sum(p => p.EstimatedCost ?? 0m);
        var chargeTotal = charges.Sum(c => c.Amount);
        var visitReceiptsTotal = checkoutReceipts.Sum(p => p.Amount);
        var advanceTotal = planReceipts.Sum(p => p.Amount);
        var netBalance = chargeTotal - totalCredits - visitReceiptsTotal;

        var procedureRows = procedures.Select(p => {
            var original = originalAllocations.Where(a => a.ProcedureId == p.Id).Sum(a => a.Amount);
            var movedIn = transfers.Where(t => t.ToProcedureId == p.Id).Sum(t => t.Amount);
            var movedOut = transfers.Where(t => t.FromProcedureId == p.Id).Sum(t => t.Amount);
            return new {
                p.Id, p.TreatmentPlanId, p.Description, p.ToothCode, p.Status,
                plannedPrice = p.EstimatedCost ?? 0m,
                completedValue = p.Status == "Completed" ? p.EstimatedCost ?? 0m : 0m,
                originalAdvance = original, transferredIn = movedIn, transferredOut = movedOut,
                netAdvance = original + movedIn - movedOut,
                isAdvanceHeld = p.Status is "Declined" or "Cancelled"
            };
        }).ToList();

        Response.Headers.CacheControl = "private, no-store";
        return Ok(new {
            currency = "ZAR",
            patientId, patientName = patient.FirstName + " " + patient.LastName,
            originalPlannedValue = procedures.Sum(p => p.EstimatedCost ?? 0m),
            completedTreatmentValue = completedValue,
            finalizedConsultationCharges = chargeTotal,
            planAdvanceReceipts = advanceTotal,
            planAdvancesApplied = totalCredits,
            unappliedPlanAdvances = decimal.Max(0m, advanceTotal - totalCredits),
            checkoutReceipts = visitReceiptsTotal,
            actualCollections = advanceTotal + visitReceiptsTotal,
            currentFinalizedBalance = netBalance,
            status = netBalance == 0m ? "SettledForFinalizedVisits" : "BalanceOrReviewRequired",
            procedures = procedureRows,
            charges,
            receipts = planReceipts.Select(p => new {
                source = "PlanAdvance", p.Id, p.ReceiptNumber, p.Method, p.Amount,
                p.ReceivedAtUtc, p.TreatmentPlanId, p.ReceivedByUserId
            }).Cast<object>().Concat(checkoutReceipts.Select(p => (object)new {
                source = "Checkout", p.Id, p.ReceiptNumber, p.Method, p.Amount,
                p.ReceivedAtUtc, treatmentPlanId = (Guid?)null, p.ReceivedByUserId
            })),
            transfers = transfers.Select(t => new {
                t.Id, t.RequestId, t.FromProcedureId, t.ToProcedureId, t.Amount,
                t.Reason, t.AuthorizedByPatientName, t.RecordedByUserId, t.AuthorizedAtUtc
            }),
            decisions = decisions.Select(d => new {
                d.ProcedureId, d.Decision, d.Reason, d.RisksAndAlternativesExplained,
                d.PatientOrRepresentativeName, d.DentistUserId, d.RecordedAtUtc
            }),
            note = "Only actual plan/checkout receipts are collections. Advances are credited only to completed procedures billed in finalized visits. Cancellations and transfers never add new cash."
        });
    }

    [HttpGet("monthly")]
    [Authorize(Roles = "PracticeAdmin,Finance")]
    public async Task<IActionResult> Monthly([FromQuery] int year, [FromQuery] int month, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (year < 2020 || year > 2100 || month < 1 || month > 12)
            return BadRequest(new { message = "Supply year and month (1-12)." });
        var from = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var to = from.AddMonths(1);
        var planReceipts = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId &&
                        p.ReceivedAtUtc >= from && p.ReceivedAtUtc < to)
            .Select(p => new { p.Method, p.Amount }).ToListAsync(ct);
        var checkoutReceipts = await _db.Payments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId &&
                        p.ReceivedAtUtc >= from && p.ReceivedAtUtc < to)
            .Select(p => new { p.Method, p.Amount }).ToListAsync(ct);
        var receipts = planReceipts.Concat(checkoutReceipts).ToList();

        var completed = await _db.PatientTreatmentProcedures.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.Status == "Completed" &&
                        p.CompletedAtUtc >= from && p.CompletedAtUtc < to)
            .SumAsync(p => (decimal?)p.EstimatedCost, ct) ?? 0m;
        var canceled = await _db.TreatmentProcedureDecisions.AsNoTracking()
            .CountAsync(p => p.DentalPracticeId == practiceId &&
                (p.Decision == "Cancelled" || p.Decision == "Declined") &&
                p.RecordedAtUtc >= from && p.RecordedAtUtc < to, ct);

        var startDay = DateOnly.FromDateTime(from);
        var endDay = DateOnly.FromDateTime(to);
        var labExpenses = await _db.Set<CurvTabDental.Domain.Entities.PracticeExpense>().AsNoTracking()
            .Where(e => e.DentalPracticeId == practiceId &&
                        e.ExpenseDate >= startDay && e.ExpenseDate < endDay &&
                        e.Category.ToLower().Contains("lab"))
            .SumAsync(e => (decimal?)e.Amount, ct) ?? 0m;

        var planCollectedLifetime = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.ReceivedAtUtc < to)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var finalizedBeforeMonthEnd = await _db.Consultations.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.IsFinalized &&
                        c.FinalizedAtUtc < to)
            .Select(c => c.Id).ToListAsync(ct);
        var credits = await TreatmentAdvanceCredit.ForConsultations(
            _db, practiceId, finalizedBeforeMonthEnd, ct);

        Response.Headers.CacheControl = "private, no-store";
        return Ok(new {
            currency = "ZAR", year, month,
            cashReceived = receipts.Where(r => r.Method == "Cash").Sum(r => r.Amount),
            cardReceived = receipts.Where(r => r.Method == "Card").Sum(r => r.Amount),
            eftReceived = receipts.Where(r => r.Method == "EFT").Sum(r => r.Amount),
            actualCollections = receipts.Sum(r => r.Amount),
            completedTreatmentValue = completed,
            labExpensesActuallyRecorded = labExpenses,
            proceduresDeclinedOrCancelled = canceled,
            unappliedPlanAdvancesAtPeriodEnd = decimal.Max(0m, planCollectedLifetime - credits.Values.Sum()),
            receiptCount = receipts.Count,
            note = "Collection dates reflect UTC. Transfers do not create receipts. Completed clinical value is not automatically accounting revenue. Lab costs count only actual recorded expense transactions."
        });
    }
}
