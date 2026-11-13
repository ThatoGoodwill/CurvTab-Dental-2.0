using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>Irreversible clinician-recorded procedure refusal/cancellation history.</summary>
public sealed class TreatmentProcedureDecision : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public Guid ProcedureId { get; set; }
    public Guid DentistUserId { get; set; }
    public string Decision { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string RisksAndAlternativesExplained { get; set; } = string.Empty;
    public string PatientOrRepresentativeName { get; set; } = string.Empty;
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
