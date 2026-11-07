using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>Explicit appointment WhatsApp opt-in, separate from general POPIA consent.</summary>
public class WhatsAppConsent : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public string Channel { get; set; } = "WhatsApp";
    public string Source { get; set; } = "StaffRecorded";
    public DateTime? GrantedAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public Guid? UpdatedByUserId { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
