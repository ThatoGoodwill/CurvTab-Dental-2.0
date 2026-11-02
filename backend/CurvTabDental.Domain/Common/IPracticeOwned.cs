namespace CurvTabDental.Domain.Common;

/// <summary>
/// Marker for every record that belongs to exactly one dental practice (tenant).
/// The DbContext applies a global query filter to every entity implementing this,
/// so a practice can never read another practice's rows by accident.
/// </summary>
public interface IPracticeOwned
{
    Guid DentalPracticeId { get; set; }
}
