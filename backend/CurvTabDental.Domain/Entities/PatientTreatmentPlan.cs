using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Private, tenant-scoped plan. Clinical edits are restricted to Dentists by the API.
public sealed class PatientTreatmentPlan : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid DentistUserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? ClinicalRationale { get; set; }
    public string Status { get; set; } = "Draft";
    public int Revision { get; set; } = 1;
    public string? ConsentName { get; set; }
    public DateTime? ConsentRecordedAtUtc { get; set; }
    public Guid? ConsentRecordedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class PatientTreatmentProcedure : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? ToothCode { get; set; }
    public string Status { get; set; } = "Proposed";
    public decimal? EstimatedCost { get; set; }
    public bool RequiresLab { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }
}


// Clinical refusal is retained separately from the planned procedure,
// including explanation of risks/alternatives and the authorising clinician.
public sealed class TreatmentProcedureRefusal : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public Guid ProcedureId { get; set; }
    public Guid ClinicianUserId { get; set; }
    public string PatientOrRepresentative { get; set; } = string.Empty;
    public string RisksAndAlternatives { get; set; } = string.Empty;
    public string ClinicalNotes { get; set; } = string.Empty;
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
