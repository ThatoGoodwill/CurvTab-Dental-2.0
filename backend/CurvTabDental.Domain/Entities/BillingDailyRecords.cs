using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Financially independent immutable daily snapshots. No updates/deletes after posting.
public sealed class BillingCashCount : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public int Revision { get; set; }
    public decimal OpeningFloat { get; set; }
    public decimal CashReceipts { get; set; }
    public decimal CashExpenses { get; set; }
    public decimal CashRefunds { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal CountedCash { get; set; }
    public decimal Variance { get; set; }
    public string DenominationsJson { get; set; } = "[]";
    public Guid SubmittedByUserId { get; set; }
    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class BillingCashCountEvent : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid CashCountId { get; set; }
    public Guid RequestId { get; set; }
    public string Action { get; set; } = ""; // Explanation, Approved, Rejected, Escalated
    public string Notes { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public Guid ActorUserId { get; set; }
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class BillingMedicalAidDaySignoff : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public int PatientsTreated { get; set; }
    public int UniqueClaims { get; set; }
    public int SubmissionAttempts { get; set; }
    public decimal SubmittedValue { get; set; }
    public int ActionPending { get; set; }
    public string SnapshotJson { get; set; } = "[]";
    public string Notes { get; set; } = "";
    public Guid SignedByUserId { get; set; }
    public DateTime SignedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class BillingClaimCorrection : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid ClaimId { get; set; }
    public Guid RequestId { get; set; }
    public int Version { get; set; }
    public Guid InvoiceLineId { get; set; }
    public string PreviousCode { get; set; } = "";
    public string CorrectedCode { get; set; } = "";
    public string Reason { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public Guid ApprovedByUserId { get; set; }
    public DateTime ApprovedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class BillingPaymentRefund : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }
    public Guid PaymentId { get; set; }
    public DateOnly RefundedOn { get; set; }
    public string Method { get; set; } = "";
    public decimal Amount { get; set; }
    public string Reason { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public Guid ApprovedByUserId { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class BillingExpenseApprovalRequest : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }
    public DateOnly ExpenseDate { get; set; }
    public string Supplier { get; set; } = "";
    public string Category { get; set; } = "";
    public string Description { get; set; } = "";
    public string Method { get; set; } = "";
    public string Reference { get; set; } = "";
    public string ReceiptReference { get; set; } = "";
    public decimal Amount { get; set; }
    public Guid RequestedByUserId { get; set; }
    public DateTime RequestedAtUtc { get; set; } = DateTime.UtcNow;
    // Do not mutate the request: approvals/rejections are recorded separately.
}

public sealed class BillingExpenseDecision : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid RequestId { get; set; }
    public Guid ExpenseRequestId { get; set; }
    public string Decision { get; set; } = ""; // Approved or Rejected
    public string Notes { get; set; } = "";
    public Guid? PostedExpenseId { get; set; }
    public Guid DecidedByUserId { get; set; }
    public DateTime DecidedAtUtc { get; set; } = DateTime.UtcNow;
}
