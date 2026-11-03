using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// One clinical encounter for an existing appointment.
// Clinical fields are never returned by the front-desk checkout endpoint.
public sealed class Consultation : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid AppointmentId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? DentistUserId { get; set; }

    public string? ChiefComplaint { get; set; }
    public string? Symptoms { get; set; }
    public string? ExaminationFindings { get; set; }
    public string? Diagnosis { get; set; }
    public string? TreatmentPerformed { get; set; }
    public string? TreatmentPlan { get; set; }
    public string? PrescriptionNotes { get; set; }
    public string? FollowUpAdvice { get; set; }

    // Dentist must explicitly confirm the charges, even for a no-charge visit.
    public bool ChargesConfirmed { get; set; }
    public bool IsFinalized { get; set; }
    public DateTime? FinalizedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
