using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Clinical laboratory exchange: production, custody, QA, fitment and closure are independent.
// No invoice, payment or refund entity is defined here: finance remains authoritative.
public sealed class LaboratoryPartner : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public string Name { get; set; } = "";
    public string? Contact { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class LaboratoryMembership : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid LaboratoryPartnerId { get; set; }
    public Guid UserId { get; set; }
}

public sealed class LaboratoryOrder : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid LaboratoryPartnerId { get; set; }
    public Guid? TreatmentPlanId { get; set; }
    public string Reference { get; set; } = "";
    public string Instructions { get; set; } = "";
    public string Status { get; set; } = "Open";
    public Guid PrescribedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAtUtc { get; set; }
}

public sealed class LaboratoryItem : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid LaboratoryOrderId { get; set; }
    public Guid? ActiveManifestId { get; set; }
    public string ToothCode { get; set; } = "";
    public string Procedure { get; set; } = "";
    public bool IsRemovable { get; set; }
    public string ManufacturingStatus { get; set; } = "AwaitingDispatch";
    public string CustodyStatus { get; set; } = "AtPractice";
    public string QaStatus { get; set; } = "Pending";
    public string ClinicalStatus { get; set; } = "Planned";
    public DateTime? ExpectedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? PatientHandedOverAtUtc { get; set; }
    public string? GuaranteeNote { get; set; }
    public int CorrectionCount { get; set; }
}

public sealed class LaboratoryManifest : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid LaboratoryPartnerId { get; set; }
    public string Reference { get; set; } = "";
    public string Direction { get; set; } = "ToLab";
    public string Status { get; set; } = "Prepared";
    public int PackageCount { get; set; }
    public string? CollectorName { get; set; }
    public string? ReceiverName { get; set; }
    public string? Waybill { get; set; }
    public string? Acknowledgement { get; set; }
    public string? Discrepancy { get; set; }
    public DateTime PreparedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? HandedOverAtUtc { get; set; }
    public DateTime? ReceivedAtUtc { get; set; }
}

public sealed class LaboratoryManifestLine : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid LaboratoryManifestId { get; set; }
    public Guid LaboratoryItemId { get; set; }
    public DateTime? ReceivedAtUtc { get; set; }
}

public sealed class LaboratoryCorrection : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid LaboratoryItemId { get; set; }
    public string Kind { get; set; } = "Redo"; // Redo or ImpressionCorrection
    public string Status { get; set; } = "Requested";
    public string Reason { get; set; } = "";
    public string Instructions { get; set; } = "";
    public string Priority { get; set; } = "Standard";
    public DateTime? DueAtUtc { get; set; }
    public Guid RequestedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAtUtc { get; set; }
}

public sealed class LaboratoryActivity : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid LaboratoryOrderId { get; set; }
    public Guid? LaboratoryItemId { get; set; }
    public Guid? LaboratoryManifestId { get; set; }
    public Guid ActorUserId { get; set; }
    public string Action { get; set; } = "";
    public string? Details { get; set; }
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
}

// Evidence lives in PostgreSQL so it is protected by the same pg_dump backup.
public sealed class LaboratoryEvidence : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid LaboratoryOrderId { get; set; }
    public Guid LaboratoryItemId { get; set; }
    public Guid UploadedByUserId { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public byte[] Bytes { get; set; } = Array.Empty<byte>();
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}
