using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only clinical observations. A new observation never overwrites history.
public sealed class DentalChartEntry : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Guid RecordedByUserId { get; set; }
    public string ToothCode { get; set; } = string.Empty; // FDI: e.g. 11, 36, 55
    public string Surface { get; set; } = string.Empty;
    public string Finding { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
