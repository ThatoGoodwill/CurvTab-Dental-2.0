using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Services;

/// <summary>
/// Credits already received against an agreed treatment-plan procedure to the
/// *same* completed treatment when it is billed in a finalized consultation.
/// Credits are never new receipts and never modify the original plan payment.
/// </summary>
public static class TreatmentAdvanceCredit
{
    public static async Task<decimal> ForConsultation(
        DentalDbContext db, Guid practiceId, Guid consultationId, CancellationToken ct)
    {
        var charges = await db.ConsultationCharges.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId &&
                c.ConsultationId == consultationId && c.TreatmentProcedureId.HasValue)
            .Select(c => new { ProcedureId = c.TreatmentProcedureId!.Value, c.Amount })
            .ToListAsync(ct);
        if (charges.Count == 0) return 0m;

        var ids = charges.Select(c => c.ProcedureId).Distinct().ToList();
        var allocations = await db.PlanPaymentAllocations.AsNoTracking()
            .Where(a => a.DentalPracticeId == practiceId && ids.Contains(a.ProcedureId))
            .GroupBy(a => a.ProcedureId)
            .Select(g => new { ProcedureId = g.Key, Amount = g.Sum(a => a.Amount) })
            .ToListAsync(ct);
        var transfers = await db.PlanAdvanceTransfers.AsNoTracking()
            .Where(t => t.DentalPracticeId == practiceId &&
                (ids.Contains(t.FromProcedureId) || ids.Contains(t.ToProcedureId)))
            .Select(t => new { t.FromProcedureId, t.ToProcedureId, t.Amount })
            .ToListAsync(ct);

        var originals = allocations.ToDictionary(a => a.ProcedureId, a => a.Amount);
        decimal total = 0m;
        foreach (var charge in charges)
        {
            var net = originals.GetValueOrDefault(charge.ProcedureId)
                + transfers.Where(t => t.ToProcedureId == charge.ProcedureId).Sum(t => t.Amount)
                - transfers.Where(t => t.FromProcedureId == charge.ProcedureId).Sum(t => t.Amount);
            // Never let an invalid historical over-allocation make checkout negative.
            total += decimal.Min(charge.Amount, decimal.Max(0m, net));
        }
        return total;
    }
}
