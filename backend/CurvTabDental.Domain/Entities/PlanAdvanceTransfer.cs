using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>An append-only change of allocation, not a new receipt or a refund.</summary>
public sealed class PlanAdvanceTransfer : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public Guid FromProcedureId { get; set; }
    public Guid ToProcedureId { get; set; }
    public Guid RequestId { get; set; }
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string AuthorizedByPatientName { get; set; } = string.Empty;
    public Guid RecordedByUserId { get; set; }
    public DateTime AuthorizedAtUtc { get; set; } = DateTime.UtcNow;
}
