using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Administrative declaration, responsible-person information and captured signature.
// Patient-supplied clinical history lives in PatientMedicalHistories instead.
public sealed class PatientRegistrationDetails : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public string? HomePhone { get; set; }
    public string? WorkPhone { get; set; }
    public string? Occupation { get; set; }
    public string? Employer { get; set; }
    public string? ResponsibleName { get; set; }
    public string? ResponsibleRelationship { get; set; }
    public string? ResponsiblePhone { get; set; }
    public string? ResponsibleEmail { get; set; }
    public string? ResponsibleAddress { get; set; }
    public string? ResponsibleIdNumber { get; set; }
    public bool DeclarationAccepted { get; set; }
    public bool InformationConsent { get; set; }
    public string SignerName { get; set; } = "";
    public string SignerCapacity { get; set; } = "Patient";
    public string SignatureDataUrl { get; set; } = "";
    public string? WitnessName { get; set; }
    public string? WitnessSignatureDataUrl { get; set; }
    public string DeclarationVersion { get; set; } = "registration-2026-11-v2";
    public DateTime SignedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? RecordedByUserId { get; set; }
}
