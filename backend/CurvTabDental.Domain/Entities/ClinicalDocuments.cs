using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Issued clinical documents are append-only and tied to an authenticated
// treating dentist and a specific patient encounter.
public sealed class ClinicalPrescription : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid ConsultationId { get; set; }
    public Guid DentistUserId { get; set; }
    public Guid RequestId { get; set; }
    public string Medication { get; set; } = string.Empty;
    public string Dose { get; set; } = string.Empty;
    public string Route { get; set; } = string.Empty;
    public string Frequency { get; set; } = string.Empty;
    public string Duration { get; set; } = string.Empty;
    public string Quantity { get; set; } = string.Empty;
    public string Directions { get; set; } = string.Empty;
    public string ClinicalRationale { get; set; } = string.Empty;
    public bool MedicalHistoryReviewed { get; set; }
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class PatientMedicalCertificate : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid ConsultationId { get; set; }
    public Guid DentistUserId { get; set; }
    public Guid RequestId { get; set; }
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }
    public string ClinicalJustification { get; set; } = string.Empty;
    public string WorkAdvice { get; set; } = string.Empty;
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;
}
