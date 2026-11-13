using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Services;

/// <summary>
/// Credits existing plan payment allocations against only the exact procedure
/// billed on a consultation. A transfer changes allocation, not cash receipts.
/// All amounts are capped by the related charge and tenant-scoped.
/// </summary>
public static class TreatmentAdvanceCredit
{
    public static async Task<decimal> ForConsultation(
        DentalDbContext db, Guid practiceId, Guid consultationId, CancellationToken ct) =>
        (await ForConsultations(db, practiceId, new[] { consultationId }, ct))
            .GetValueOrDefault(consultationId);

    public static async Task<Dictionary<Guid, decimal>> ForConsultations(
        DentalDbContext db, Guid practiceId, IReadOnlyCollection<Guid> consultationIds, CancellationToken ct)
    {
        var result = consultationIds.Distinct().ToDictionary(id => id, _ => 0m);
        if (result.Count == 0) return result;

        var idsForQuery = result.Keys.ToArray();
        var charges = await db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId &&
                        idsForQuery.Contains(c.ConsultationId) && c.TreatmentProcedureId.HasValue)
            .Select(c => new { c.ConsultationId, ProcedureId = c.TreatmentProcedureId!.Value, c.Amount })
            .ToListAsync(ct);
        if (charges.Count == 0) return result;

        var procedureIds = charges.Select(c => c.ProcedureId).Distinct().ToArray();
        var allocations = await db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && procedureIds.Contains(a.ProcedureId))
            .GroupBy(a => a.ProcedureId)
            .Select(g => new { ProcedureId = g.Key, Amount = g.Sum(a => a.Amount) })
            .ToListAsync(ct);
        var transfers = await db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId &&
                        (procedureIds.Contains(t.FromProcedureId) || procedureIds.Contains(t.ToProcedureId)))
            .Select(t => new { t.FromProcedureId, t.ToProcedureId, t.Amount })
            .ToListAsync(ct);
        var netCredits = allocations.ToDictionary(a => a.ProcedureId, a => a.Amount);
        foreach (var transfer in transfers)
        {
            netCredits[transfer.FromProcedureId] =
                netCredits.GetValueOrDefault(transfer.FromProcedureId) - transfer.Amount;
            netCredits[transfer.ToProcedureId] =
                netCredits.GetValueOrDefault(transfer.ToProcedureId) + transfer.Amount;
        }
        foreach (var charge in charges)
            result[charge.ConsultationId] += decimal.Min(charge.Amount,
                decimal.Max(0m, netCredits.GetValueOrDefault(charge.ProcedureId)));
        return result;
    }
}
