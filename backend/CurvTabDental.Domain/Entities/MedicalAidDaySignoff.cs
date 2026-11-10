using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// A medical-aid operational activity snapshot, NEVER a monetary receipt.
public sealed class MedicalAidDaySignoff : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public int PatientsTreated { get; set; }
    public int UniqueClaims { get; set; }
    public int SubmissionAttempts { get; set; }
    public decimal SubmittedValue { get; set; }
    public int ActionsPending { get; set; }
    public string SnapshotJson { get; set; } = "[]";
    public Guid SignedByUserId { get; set; }
    public DateTime SignedAtUtc { get; set; } = DateTime.UtcNow;
}
