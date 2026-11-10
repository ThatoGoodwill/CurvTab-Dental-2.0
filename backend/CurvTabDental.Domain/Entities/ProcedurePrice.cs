
using System;
using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Approved, practice-specific procedure fee.
public sealed class ProcedurePrice : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }

    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "General";

    public decimal Price { get; set; }
    public bool IsActive { get; set; } = true;
    // Procedure pricing metadata used by the laboratory workflow.
    public bool RequiresLab { get; set; }
    public decimal SupplierEstimate { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

// Immutable history of administrative price changes.
public sealed class ProcedurePriceHistory : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid ProcedurePriceId { get; set; }
    public Guid ChangedByUserId { get; set; }

    public string Action { get; set; } = "";
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";

    public decimal? PreviousPrice { get; set; }
    public decimal NewPrice { get; set; }

    public bool IsActive { get; set; }
    public DateTime ChangedAtUtc { get; set; } = DateTime.UtcNow;
}
