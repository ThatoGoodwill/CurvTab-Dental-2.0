using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Money received against an agreed treatment plan (advances and settlements).
// One row per tender: Cash is stored as Cash, Card as Card. Never store card numbers.
public sealed class PlanPayment : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public Guid BatchId { get; set; }
    public Guid RequestId { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Method { get; set; } = string.Empty;
    public string? Reference { get; set; }
    public DateTime ReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid ReceivedByUserId { get; set; }
}

// Which procedure a received amount was applied to (e.g. R350 to Extraction).
public sealed class PlanPaymentAllocation : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public Guid BatchId { get; set; }
    public Guid ProcedureId { get; set; }
    public decimal Amount { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}


// Append-only, authorised movement of EXISTING money between procedures.
// It is never a cash/card/EFT receipt and must not appear in collections.
public sealed class PlanAdvanceTransfer : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid TreatmentPlanId { get; set; }
    public Guid RequestId { get; set; }
    public Guid FromProcedureId { get; set; }
    public Guid ToProcedureId { get; set; }
    public decimal Amount { get; set; }
    public string AuthorizationName { get; set; } = string.Empty;
    public string AuthorizationNote { get; set; } = string.Empty;
    public Guid AuthorizedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
