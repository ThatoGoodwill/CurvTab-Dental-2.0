using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Services;

// Plan receipts are ACTUAL money received. Their allocations (plus approved
// internal transfers) are credits against the same completed clinical
// procedures when those procedures reach consultation checkout. They are
// never posted again as a new front-desk payment.
public static class PlanCreditCalculator
{
    public sealed record AppliedCredit(Guid ProcedureId, Guid TreatmentPlanId,
        decimal Amount, string Description);
    public sealed record CreditSnapshot(decimal Total, IReadOnlyList<AppliedCredit> Items);

    public static async Task<CreditSnapshot> ForConsultation(
        DentalDbContext db, Guid practiceId, Guid patientId, Guid? consultationId,
        CancellationToken ct)
    {
        if (consultationId is not Guid linkedConsultation)
            return new CreditSnapshot(0m, Array.Empty<AppliedCredit>());
        var charges = await db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId &&
                c.ConsultationId == linkedConsultation && c.TreatmentProcedureId != null)
            .Select(c => new { c.TreatmentProcedureId, c.Amount }).ToListAsync(ct);
        var ids = charges.Where(c => c.TreatmentProcedureId.HasValue)
            .Select(c => c.TreatmentProcedureId!.Value).Distinct().ToList();
        if (ids.Count == 0) return new CreditSnapshot(0m, Array.Empty<AppliedCredit>());
        var procedures = await db.PatientTreatmentProcedures.AsNoTracking()
            .Where(p => p.DentalPracticeId == practiceId && p.PatientId == patientId &&
                ids.Contains(p.Id) && p.Status == "Completed")
            .Select(p => new { p.Id, p.TreatmentPlanId, p.Description }).ToListAsync(ct);
        var validIds = procedures.Select(p => p.Id).ToList();
        if (validIds.Count != ids.Count)
            throw new InvalidOperationException("Consultation has an invalid, non-completed or foreign-patient procedure link.");
        var allocations = await db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && validIds.Contains(a.ProcedureId))
            .Select(a => new { a.ProcedureId, a.TreatmentPlanId, a.Amount }).ToListAsync(ct);
        var transfers = await db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId && t.PatientId == patientId &&
                (validIds.Contains(t.FromProcedureId) || validIds.Contains(t.ToProcedureId)))
            .Select(t => new { t.FromProcedureId, t.ToProcedureId, t.TreatmentPlanId, t.Amount })
            .ToListAsync(ct);
        var result = new List<AppliedCredit>();
        foreach (var p in procedures)
        {
            var charged = charges.Where(c => c.TreatmentProcedureId == p.Id).Sum(c => c.Amount);
            var applied = allocations.Where(a => a.ProcedureId == p.Id &&
                a.TreatmentPlanId == p.TreatmentPlanId).Sum(a => a.Amount)
                + transfers.Where(t => t.TreatmentPlanId == p.TreatmentPlanId &&
                    t.ToProcedureId == p.Id).Sum(t => t.Amount)
                - transfers.Where(t => t.TreatmentPlanId == p.TreatmentPlanId &&
                    t.FromProcedureId == p.Id).Sum(t => t.Amount);
            if (applied < 0 || applied > charged)
                throw new InvalidOperationException("Plan credit exceeds a billed procedure or is negative; manager reconciliation required.");
            if (applied > 0) result.Add(new AppliedCredit(p.Id, p.TreatmentPlanId, applied, p.Description));
        }
        return new CreditSnapshot(result.Sum(x => x.Amount), result);
    }
}
