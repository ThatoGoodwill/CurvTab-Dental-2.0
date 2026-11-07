using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>Mock-only reminder record. No provider API call or clinical content.</summary>
public class WhatsAppOutboundMessage : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid AppointmentId { get; set; }
    public string RecipientNumber { get; set; } = string.Empty;
    public string TemplateKey { get; set; } = "appointment_reminder_v1";
    public string Status { get; set; } = "MockQueued";
    public DateTime AppointmentStartUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}
