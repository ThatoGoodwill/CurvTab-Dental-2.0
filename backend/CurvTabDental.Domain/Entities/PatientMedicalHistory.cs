using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// One editable medical-history summary per patient per practice.
public sealed class PatientMedicalHistory : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public string? Allergies { get; set; }
    public string? CurrentMedications { get; set; }
    public string? MedicalConditions { get; set; }
    public string? DentalHistory { get; set; }
    public string? AdditionalNotes { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? UpdatedByUserId { get; set; }
}
