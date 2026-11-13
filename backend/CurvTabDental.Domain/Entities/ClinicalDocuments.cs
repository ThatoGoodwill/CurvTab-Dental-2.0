using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only, clinician-authorised document records. No automatic diagnosis,
// dosage suggestions, pharmacy dispatch, or invented digital signatures.
public sealed class ClinicalPrescription : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid ConsultationId { get; set; }
    public Guid AppointmentId { get; set; }
    public Guid PrescriberUserId { get; set; }
    public string PractitionerName { get; set; } = "";
    public string PractitionerRegistrationNumber { get; set; } = "";
    public string MedicationName { get; set; } = "";
    public string Strength { get; set; } = "";
    public string Dosage { get; set; } = "";
    public string Route { get; set; } = "";
    public string Frequency { get; set; } = "";
    public string Duration { get; set; } = "";
    public string Quantity { get; set; } = "";
    public string Instructions { get; set; } = "";
    public string ClinicalIndication { get; set; } = "";
    public DateTime AuthorizedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class ClinicalMedicalCertificate : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid ConsultationId { get; set; }
    public Guid AppointmentId { get; set; }
    public Guid PractitionerUserId { get; set; }
    public string PractitionerName { get; set; } = "";
    public string PractitionerRegistrationNumber { get; set; } = "";
    public DateOnly FromDate { get; set; }
    public DateOnly ThroughDate { get; set; }
    public string WorkCapacityStatement { get; set; } = "";
    public string ClinicalJustification { get; set; } = "";
    public string PatientOrRepresentativeName { get; set; } = "";
    public DateTime AuthorizedAtUtc { get; set; } = DateTime.UtcNow;
}
