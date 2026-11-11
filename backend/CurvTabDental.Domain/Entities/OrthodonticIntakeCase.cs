using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Phase 1 intake/routing ONLY. Never indicates an agreed treatment plan,
/// signed braces contract, instalment, invoice or payment.
/// References the same patient identity used by general dentistry.
/// </summary>
public sealed class OrthodonticIntakeCase : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public string Source { get; set; } = "DIRECT"; // DIRECT, INTERNAL, TRANSFER_IN
    public string Status { get; set; } = "INTAKE_STARTED";
    public Guid CreatedByUserId { get; set; }
    public Guid? ReferralAuthorUserId { get; set; }
    public Guid? AssignedOrthodontistUserId { get; set; }
    public string? ReferralReason { get; set; }
    public string? ReferralNotes { get; set; }
    public string? PreviousProvider { get; set; }
    public string? ExistingAppliances { get; set; }
    public DateOnly? PreviousTreatmentStartDate { get; set; }
    public string? PreviousTreatmentPlanSummary { get; set; }
    public string? TransferReason { get; set; }
    public string? PreviousRecordsSummary { get; set; }
    public string? UrgentConcerns { get; set; }
    // A transfer is NOT accepted merely because an intake or appointment
    // exists. Acceptance requires an independent specialist review.
    public string TransferContinuationDecision { get; set; } = "NOT_REVIEWED";
    public string? TransferDecisionReason { get; set; }
    public Guid? TransferDecidedByUserId { get; set; }
    public DateTime? TransferDecidedAtUtc { get; set; }
    // References to reviewed documents, not untrusted raw file content.
    public string DocumentReferencesJson { get; set; } = "[]";
    public string MissingDocumentsJson { get; set; } = "[]";
    public bool HistoryVerifiedByClinician { get; set; }
    public Guid? HistoryVerifiedByUserId { get; set; }
    public DateTime? HistoryVerifiedAtUtc { get; set; }
    public bool TermsApplicable { get; set; }
    public string? TermsVersion { get; set; }
    public string? TermsFullText { get; set; }
    public string? TermsSha256 { get; set; }
    public string? TermsSignerName { get; set; }
    public string? TermsSignerCapacity { get; set; }
    public string? TermsSignatureDataUrl { get; set; }
    public DateTime? TermsAcceptedAtUtc { get; set; }
    public string? TermsAcceptanceMethod { get; set; }
    public string AdvancePolicy { get; set; } = "REVIEW_REQUIRED";
    public Guid? AdvancePaymentId { get; set; }
    public string? NextAction { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateTime? AssessmentStartedAtUtc { get; set; }
    public Guid? AssessmentStartedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAtUtc { get; set; }
}
