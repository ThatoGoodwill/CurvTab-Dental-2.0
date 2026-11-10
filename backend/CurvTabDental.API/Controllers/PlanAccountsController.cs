using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Patient treatment-plan accounts: advance payments, allocation to procedures,
// split Cash/Card/EFT tenders and the settlement statement.
[ApiController]
[Route("api/billing/plan-accounts")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Finance")]
public sealed class PlanAccountsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PlanAccountsController(
        DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record TenderLine(decimal Amount, string Method, string? Reference);
    public record AllocationLine(Guid ProcedureId, decimal Amount);
    public record PlanPaymentRequest(
        Guid BatchId, List<TenderLine> Tenders, List<AllocationLine> Allocations);

    private static bool IsBillable(PatientTreatmentProcedure p) =>
        p.Status != "Cancelled" && p.Status != "Declined";

    // GET api/billing/plan-accounts?q=name
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        var plans = await _db.PatientTreatmentPlans.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId)
            .OrderByDescending(p => p.UpdatedAtUtc)
            .Take(300).ToListAsync(ct);
        var planIds = plans.Select(p => p.Id).ToList();
        var patientIds = plans.Select(p => p.PatientId).Distinct().ToList();

        var patients = await _db.Patients.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && patientIds.Contains(p.Id))
            .Select(p => new { p.Id, Name = p.FirstName + " " + p.LastName })
            .ToListAsync(ct);
        var procedures = await _db.PatientTreatmentProcedures.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && planIds.Contains(p.TreatmentPlanId))
            .ToListAsync(ct);
        var allocations = await _db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && planIds.Contains(a.TreatmentPlanId))
            .ToListAsync(ct);

        var rows = plans.Select(plan =>
        {
            var procs = procedures.Where(x => x.TreatmentPlanId == plan.Id && IsBillable(x)).ToList();
            var total = procs.Sum(x => x.EstimatedCost ?? 0m);
            var paid = allocations.Where(a => a.TreatmentPlanId == plan.Id).Sum(a => a.Amount);
            return new
            {
                planId = plan.Id,
                patientId = plan.PatientId,
                patientName = patients.FirstOrDefault(x => x.Id == plan.PatientId)?.Name ?? "Patient",
                title = plan.Title,
                status = plan.Status,
                agreed = plan.ConsentRecordedAtUtc != null,
                total, paid, balance = total - paid,
                procedureCount = procs.Count,
                completedCount = procs.Count(x => x.Status == "Completed")
            };
        }).ToList();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            rows = rows.Where(r =>
                r.patientName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                r.title.Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        }
        return Ok(rows);
    }

    // GET api/billing/plan-accounts/{planId}  (also used for the statement)
    [HttpGet("{planId:guid}")]
    public async Task<IActionResult> Detail(Guid planId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var plan = await _db.PatientTreatmentPlans.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == planId && p.DentalPracticeId == practiceId, ct);
        if (plan is null) return NotFound();

        var patient = await _db.Patients.AsNoTracking()
            .Where(p => p.Id == plan.PatientId && p.DentalPracticeId == practiceId)
            .Select(p => new { p.Id, Name = p.FirstName + " " + p.LastName })
            .FirstOrDefaultAsync(ct);
        var procedures = await _db.PatientTreatmentProcedures.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.TreatmentPlanId == planId)
            .OrderBy(p => p.CreatedAtUtc).ToListAsync(ct);
        var allocations = await _db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && a.TreatmentPlanId == planId)
            .ToListAsync(ct);
        var payments = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.TreatmentPlanId == planId)
            .OrderBy(p => p.ReceivedAtUtc).ToListAsync(ct);
        var practiceName = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId).Select(p => p.Name).FirstOrDefaultAsync(ct);

        var procRows = procedures.Select(p =>
        {
            var paid = allocations.Where(a => a.ProcedureId == p.Id).Sum(a => a.Amount);
            var cost = IsBillable(p) ? (p.EstimatedCost ?? 0m) : 0m;
            return new
            {
                id = p.Id, p.Description, p.ToothCode, p.Status,
                cost, paid, due = cost - paid, p.CompletedAtUtc
            };
        }).ToList();
        var total = procRows.Sum(p => p.cost);
        var totalPaid = procRows.Sum(p => p.paid);
        var allDone = procRows.Count > 0 &&
            procedures.Where(IsBillable).All(p => p.Status == "Completed");

        return Ok(new
        {
            planId = plan.Id,
            plan.Title,
            planStatus = plan.Status,
            agreed = plan.ConsentRecordedAtUtc != null,
            patientId = plan.PatientId,
            patientName = patient?.Name ?? "Patient",
            practiceName = practiceName ?? "",
            procedures = procRows,
            total,
            totalPaid,
            balance = total - totalPaid,
            allProceduresCompleted = allDone,
            settled = allDone && total - totalPaid == 0m,
            payments = payments.Select(p => new
            {
                p.Id, p.BatchId, p.ReceiptNumber, p.Amount, p.Method,
                p.Reference, p.ReceivedAtUtc
            }),
            allocations = allocations.Select(a => new
            {
                a.BatchId, a.ProcedureId, a.Amount, a.CreatedAtUtc
            })
        });
    }

    // POST api/billing/plan-accounts/{planId}/payments
    // Tenders (what the patient handed over) must equal allocations (which
    // procedures that money settles). One transaction; idempotent on BatchId.
    [HttpPost("{planId:guid}/payments")]
    public async Task<IActionResult> Pay(
        Guid planId, [FromBody] PlanPaymentRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();

        if (request.BatchId == Guid.Empty || request.Tenders is null ||
            request.Allocations is null || request.Tenders.Count < 1 ||
            request.Tenders.Count > 3 || request.Allocations.Count < 1 ||
            request.Allocations.Count > 30)
            return BadRequest(new { message = "Supply a batch ID, 1-3 payment lines and the procedures being paid." });

        var tenders = new List<(decimal Amount, string Method, string? Reference, Guid RequestId)>();
        for (var i = 0; i < request.Tenders.Count; i++)
        {
            var t = request.Tenders[i];
            var method = t.Method?.Trim() ?? "";
            var reference = t.Reference?.Trim();
            if (method != "Cash" && method != "Card" && method != "EFT")
                return BadRequest(new { message = "Payment method must be Cash, Card or EFT." });
            if (t.Amount <= 0m || t.Amount > 10000000m || decimal.Round(t.Amount, 2) != t.Amount)
                return BadRequest(new { message = "Every payment line needs a valid amount." });
            if (reference?.Length > 100 ||
                (method != "Cash" && string.IsNullOrWhiteSpace(reference)))
                return BadRequest(new { message = "Card and EFT lines require a terminal/EFT reference (never a card number)." });
            if (tenders.Any(x => x.Method == method))
                return BadRequest(new { message = $"Use only one {method} line; combine the amounts." });
            var key = System.Security.Cryptography.MD5.HashData(
                System.Text.Encoding.UTF8.GetBytes($"plan:{request.BatchId}:{i}"));
            tenders.Add((t.Amount, method, string.IsNullOrWhiteSpace(reference) ? null : reference, new Guid(key)));
        }
        foreach (var a in request.Allocations)
            if (a.ProcedureId == Guid.Empty || a.Amount <= 0m || decimal.Round(a.Amount, 2) != a.Amount)
                return BadRequest(new { message = "Every allocation needs a procedure and a valid amount." });
        if (request.Allocations.Select(a => a.ProcedureId).Distinct().Count() != request.Allocations.Count)
            return BadRequest(new { message = "Each procedure may appear only once." });

        var tenderTotal = tenders.Sum(t => t.Amount);
        var allocTotal = request.Allocations.Sum(a => a.Amount);
        if (tenderTotal != allocTotal)
            return BadRequest(new { message = "Money received must equal the amount allocated to procedures.", tenderTotal, allocTotal });

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var plan = await _db.PatientTreatmentPlans
            .FromSqlInterpolated($"SELECT * FROM \"PatientTreatmentPlans\" WHERE \"Id\" = {planId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (plan is null) return NotFound();

        var ids = tenders.Select(t => t.RequestId).ToList();
        var existing = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && ids.Contains(p.RequestId))
            .ToListAsync(ct);
        if (existing.Count > 0)
        {
            if (existing.Count != tenders.Count || existing.Any(e => e.TreatmentPlanId != planId))
                return Conflict(new { message = "This payment batch ID was already used." });
            return Ok(new { alreadyRecorded = true, paymentIds = existing.Select(e => e.Id), total = tenderTotal });
        }

        if (plan.ConsentRecordedAtUtc is null)
            return Conflict(new { message = "The Dentist must record the patient's agreement to the plan before payment." });

        var procedures = await _db.PatientTreatmentProcedures.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.TreatmentPlanId == planId)
            .ToListAsync(ct);
        var paidByProc = await _db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && a.TreatmentPlanId == planId)
            .GroupBy(a => a.ProcedureId)
            .Select(g => new { g.Key, Sum = g.Sum(x => x.Amount) })
            .ToListAsync(ct);

        foreach (var a in request.Allocations)
        {
            var proc = procedures.FirstOrDefault(p => p.Id == a.ProcedureId);
            if (proc is null || !IsBillable(proc))
                return BadRequest(new { message = "A selected procedure is not part of this plan." });
            var due = (proc.EstimatedCost ?? 0m) -
                (paidByProc.FirstOrDefault(x => x.Key == proc.Id)?.Sum ?? 0m);
            if (a.Amount > due)
                return Conflict(new { message = $"'{proc.Description}' only has R{due:0.00} outstanding.", due });
        }

        var now = DateTime.UtcNow;
        var created = new List<PlanPayment>();
        foreach (var t in tenders)
        {
            var id = Guid.NewGuid();
            var payment = new PlanPayment
            {
                Id = id,
                DentalPracticeId = practiceId,
                PatientId = plan.PatientId,
                TreatmentPlanId = planId,
                BatchId = request.BatchId,
                RequestId = t.RequestId,
                Amount = t.Amount,
                Method = t.Method,
                Reference = t.Reference,
                ReceivedAtUtc = now,
                ReceivedByUserId = actorId,
                ReceiptNumber = $"PRCPT-{now:yyyyMMdd}-{id.ToString("N")[..12].ToUpperInvariant()}"
            };
            _db.PlanPayments.Add(payment);
            created.Add(payment);
        }
        foreach (var a in request.Allocations)
            _db.PlanPaymentAllocations.Add(new PlanPaymentAllocation
            {
                DentalPracticeId = practiceId,
                TreatmentPlanId = planId,
                BatchId = request.BatchId,
                ProcedureId = a.ProcedureId,
                Amount = a.Amount,
                CreatedAtUtc = now
            });

        await _db.SaveChangesAsync(ct);
        foreach (var p in created)
            await _audit.WriteAsync("PLAN_PAYMENT_RECORDED", "PlanPayment", p.Id.ToString(), ct: ct);
        await transaction.CommitAsync(ct);

        return Created($"/api/billing/plan-accounts/{planId}", new
        {
            alreadyRecorded = false,
            paymentIds = created.Select(c => c.Id),
            receipts = created.Select(c => new { c.Id, c.ReceiptNumber, c.Method, c.Amount }),
            total = tenderTotal
        });
    }
}
