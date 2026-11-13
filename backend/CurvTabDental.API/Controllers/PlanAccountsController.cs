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
    // Consent is recorded as an acknowledgement, never represented as a digital signature.
    public record TransferAdvanceRequest(Guid RequestId, Guid FromProcedureId, Guid ToProcedureId,
        decimal Amount, bool PatientAuthorized, string AuthorizationName, string AuthorizationNote);

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

        var transfers = await _db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId && planIds.Contains(t.TreatmentPlanId))
            .ToListAsync(ct);

        var rows = plans.Select(plan =>
        {
            var procs = procedures.Where(x => x.TreatmentPlanId == plan.Id && IsBillable(x)).ToList();
            var total = procs.Sum(x => x.EstimatedCost ?? 0m);
            var activeIds = procs.Select(p => p.Id).ToHashSet();
            var paid = allocations.Where(a => a.TreatmentPlanId == plan.Id && activeIds.Contains(a.ProcedureId))
                .Sum(a => a.Amount)
                + transfers.Where(t => t.TreatmentPlanId == plan.Id && activeIds.Contains(t.ToProcedureId)).Sum(t => t.Amount)
                - transfers.Where(t => t.TreatmentPlanId == plan.Id && activeIds.Contains(t.FromProcedureId)).Sum(t => t.Amount);
            var held = allocations.Where(a => a.TreatmentPlanId == plan.Id && !activeIds.Contains(a.ProcedureId)).Sum(a => a.Amount)
                + transfers.Where(t => t.TreatmentPlanId == plan.Id && !activeIds.Contains(t.ToProcedureId)).Sum(t => t.Amount)
                - transfers.Where(t => t.TreatmentPlanId == plan.Id && !activeIds.Contains(t.FromProcedureId)).Sum(t => t.Amount);
            return new
            {
                planId = plan.Id,
                patientId = plan.PatientId,
                patientName = patients.FirstOrDefault(x => x.Id == plan.PatientId)?.Name ?? "Patient",
                title = plan.Title,
                status = plan.Status,
                agreed = plan.ConsentRecordedAtUtc != null,
                total, paid, advanceHeld = held, balance = total - paid,
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
        var transfers = await _db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId && t.TreatmentPlanId == planId)
            .OrderBy(t => t.CreatedAtUtc).ToListAsync(ct);
        var payments = await _db.PlanPayments.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.TreatmentPlanId == planId)
            .OrderBy(p => p.ReceivedAtUtc).ToListAsync(ct);
        var practiceName = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId).Select(p => p.Name).FirstOrDefaultAsync(ct);

        var procRows = procedures.Select(p =>
        {
            var paid = allocations.Where(a => a.ProcedureId == p.Id).Sum(a => a.Amount)
                + transfers.Where(t => t.ToProcedureId == p.Id).Sum(t => t.Amount)
                - transfers.Where(t => t.FromProcedureId == p.Id).Sum(t => t.Amount);
            var cost = IsBillable(p) ? (p.EstimatedCost ?? 0m) : 0m;
            return new
            {
                id = p.Id, p.Description, p.ToothCode, p.Status,
                cost, paid, due = cost - paid, p.CompletedAtUtc
            };
        }).ToList();
        var total = procRows.Sum(p => p.cost);
        var totalPaid = procRows.Where(p => p.Status != "Declined" && p.Status != "Cancelled").Sum(p => p.paid);
        var heldAdvance = procRows.Where(p => p.Status == "Declined" || p.Status == "Cancelled").Sum(p => p.paid);
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
            advanceHeld = heldAdvance,
            cashCollected = payments.Sum(p => p.Amount),
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
            }),
            transfers = transfers.Select(t => new
            {
                t.Id, t.RequestId, t.FromProcedureId, t.ToProcedureId, t.Amount,
                t.AuthorizationName, t.AuthorizationNote, t.AuthorizedByUserId, t.CreatedAtUtc
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

        var transfersExisting = await _db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId && t.TreatmentPlanId == planId)
            .ToListAsync(ct);

        foreach (var a in request.Allocations)
        {
            var proc = procedures.FirstOrDefault(p => p.Id == a.ProcedureId);
            if (proc is null || !IsBillable(proc))
                return BadRequest(new { message = "A selected procedure is not part of this plan." });
            var applied = (paidByProc.FirstOrDefault(x => x.Key == proc.Id)?.Sum ?? 0m)
                + transfersExisting.Where(t => t.ToProcedureId == proc.Id).Sum(t => t.Amount)
                - transfersExisting.Where(t => t.FromProcedureId == proc.Id).Sum(t => t.Amount);
            var due = (proc.EstimatedCost ?? 0m) - applied;
            // A visit already collected at reception must not be made
            // overpaid by a later plan advance.
            var finalisedVisitWithPayment = await (
                from charge in _db.ConsultationCharges.AsNoTracking()
                join consultation in _db.Consultations.AsNoTracking() on charge.ConsultationId equals consultation.Id
                join payment in _db.Payments.AsNoTracking() on consultation.AppointmentId equals payment.AppointmentId
                where charge.DentalPracticeId == practiceId && charge.TreatmentProcedureId == proc.Id &&
                    payment.DentalPracticeId == practiceId
                select payment.Id).AnyAsync(ct);
            if (finalisedVisitWithPayment)
                return Conflict(new { message = "An advance cannot be collected after a linked consultation has received a checkout payment." });
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

    // POST api/billing/plan-accounts/{planId}/advance-transfers
    // Pure internal reallocation: NO new PlanPayment, Payment, cash receipt,
    // supplier expense or revenue recognition is created.
    [HttpPost("{planId:guid}/advance-transfers")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> TransferAdvance(
        Guid planId, [FromBody] TransferAdvanceRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actorId) return Unauthorized();
        if (request.RequestId == Guid.Empty || request.FromProcedureId == request.ToProcedureId ||
            request.Amount <= 0 || request.Amount > 10000000m ||
            decimal.Round(request.Amount, 2) != request.Amount)
            return BadRequest(new { message = "A distinct source and destination, valid request ID and positive amount are required." });
        if (!request.PatientAuthorized || string.IsNullOrWhiteSpace(request.AuthorizationName) ||
            request.AuthorizationName.Trim().Length > 200 ||
            string.IsNullOrWhiteSpace(request.AuthorizationNote) ||
            request.AuthorizationNote.Trim().Length > 2000)
            return BadRequest(new { message = "Record explicit patient authorization, the representative's name and the purpose of this transfer." });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        // Serialize all transfers and plan payments by locking the one parent plan.
        var plan = await _db.PatientTreatmentPlans
            .FromSqlInterpolated($"SELECT * FROM \"PatientTreatmentPlans\" WHERE \"Id\" = {planId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
        if (plan is null) return NotFound();
        var previous = await _db.PlanAdvanceTransfers.AsNoTracking()
            .FirstOrDefaultAsync(t => t.DentalPracticeId == practiceId && t.RequestId == request.RequestId, ct);
        if (previous is not null)
        {
            if (previous.TreatmentPlanId != planId || previous.FromProcedureId != request.FromProcedureId ||
                previous.ToProcedureId != request.ToProcedureId || previous.Amount != request.Amount ||
                previous.AuthorizationName != request.AuthorizationName.Trim() ||
                previous.AuthorizationNote != request.AuthorizationNote.Trim())
                return Conflict(new { message = "The transfer request ID has already been used with different details." });
            return Ok(new { transferId = previous.Id, amount = previous.Amount, alreadyRecorded = true });
        }
        var source = await _db.PatientTreatmentProcedures.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.FromProcedureId &&
                p.PatientId == plan.PatientId && p.TreatmentPlanId == planId &&
                p.DentalPracticeId == practiceId, ct);
        var destination = await _db.PatientTreatmentProcedures.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ToProcedureId &&
                p.PatientId == plan.PatientId && p.TreatmentPlanId == planId &&
                p.DentalPracticeId == practiceId, ct);
        if (source is null || destination is null) return NotFound();
        if (source.Status is not ("Declined" or "Cancelled"))
            return Conflict(new { message = "Only an advance held against a declined or cancelled procedure can be transferred." });
        if (destination.Status is "Declined" or "Cancelled")
            return Conflict(new { message = "The receiving procedure must remain active." });

        var allocations = await _db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && a.TreatmentPlanId == planId)
            .ToListAsync(ct);
        var transfers = await _db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId && t.TreatmentPlanId == planId)
            .ToListAsync(ct);
        decimal Effective(Guid id) =>
            allocations.Where(a => a.ProcedureId == id).Sum(a => a.Amount)
            + transfers.Where(t => t.ToProcedureId == id).Sum(t => t.Amount)
            - transfers.Where(t => t.FromProcedureId == id).Sum(t => t.Amount);
        var available = Effective(source.Id);
        var due = (destination.EstimatedCost ?? 0m) - Effective(destination.Id);
        if (request.Amount > available || request.Amount > due)
            return Conflict(new { message = "Transfer exceeds held advance or remaining procedure value.", available, due });
        // A completed and checked-out consultation cannot be retrospectively altered.
        var settled = await (
            from charge in _db.ConsultationCharges.AsNoTracking()
            join consultation in _db.Consultations.AsNoTracking() on charge.ConsultationId equals consultation.Id
            join appointment in _db.Appointments.AsNoTracking() on consultation.AppointmentId equals appointment.Id
            where charge.DentalPracticeId == practiceId && charge.TreatmentProcedureId == destination.Id &&
                appointment.DentalPracticeId == practiceId && appointment.Status == "CheckedOut"
            select charge.Id).AnyAsync(ct);
        if (settled)
            return Conflict(new { message = "A settled visit cannot receive a retroactive advance transfer. Use the audited financial corrections process." });

        var movement = new PlanAdvanceTransfer {
            DentalPracticeId = practiceId, PatientId = plan.PatientId, TreatmentPlanId = planId,
            RequestId = request.RequestId,
            FromProcedureId = source.Id, ToProcedureId = destination.Id,
            Amount = request.Amount,
            AuthorizationName = request.AuthorizationName.Trim(),
            AuthorizationNote = request.AuthorizationNote.Trim(),
            AuthorizedByUserId = actorId
        };
        _db.PlanAdvanceTransfers.Add(movement);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("PLAN_ADVANCE_TRANSFER_AUTHORIZED", "PlanAdvanceTransfer", movement.Id.ToString(), ct: ct);
        await tx.CommitAsync(ct);
        return Created($"/api/billing/plan-accounts/{planId}", new {
            transferId = movement.Id, movement.Amount, alreadyRecorded = false,
            sourceAvailable = available - movement.Amount, destinationDue = due - movement.Amount,
            newCashReceipt = false
        });
    }

}
