using CurvTabDental.Domain.Common;
namespace CurvTabDental.Domain.Entities;

// Append-only clinician-authored refusal/cancellation note. This is NOT a
// procedure completion and never generates earned revenue.
public sealed class PatientProcedureDecision : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public Guid ProcedureId { get; set; }
    public Guid? AppointmentId { get; set; }
    public string Decision { get; set; } = string.Empty;
    public string ClinicalReason { get; set; } = string.Empty;
    public string RisksExplained { get; set; } = string.Empty;
    public string AlternativesExplained { get; set; } = string.Empty;
    public string PatientResponse { get; set; } = string.Empty;
    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
