using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>
/// Personal staff records. Earnings are HR metadata only and never post to the finance ledger.
/// DocumentReference is metadata, not an uploaded document or secure download URL.
/// </summary>
public sealed class EmployeeWorkspaceRecord : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid EmployeeUserId { get; set; }
    public Guid RequestId { get; set; }
    public string Category { get; set; } = "";
    public string Title { get; set; } = "";
    public string Status { get; set; } = "";
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public decimal? Amount { get; set; }
    public string? DocumentReference { get; set; }
    public string? Notes { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
