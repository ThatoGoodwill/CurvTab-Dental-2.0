using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

public sealed class MedicalAidMembership : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }

    public string SchemeName { get; set; } = "";
    public string PlanName { get; set; } = "";

    // Only a reference suffix, not the complete membership number.
    public string MemberNumberLast4 { get; set; } = "";

    public Guid RecordedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
