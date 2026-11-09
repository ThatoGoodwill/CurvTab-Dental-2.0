using System;
using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// One row per practice: scheduling, billing and clinical defaults edited in the Configuration Center.
public sealed class PracticeConfiguration : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }

    // Scheduling
    public string OpeningHoursJson { get; set; } = "";
    public int SlotMinutes { get; set; } = 30;
    public int BufferMinutes { get; set; } = 0;
    public int AdvanceBookingDays { get; set; } = 90;
    public int CancellationNoticeHours { get; set; } = 24;

    // Billing
    public string InvoicePrefix { get; set; } = "INV";
    public decimal VatRatePercent { get; set; } = 15m;
    public int PaymentTermsDays { get; set; } = 7;
    public string InvoiceFooter { get; set; } = "";

    // Clinical
    public int DefaultAppointmentMinutes { get; set; } = 30;
    public bool RequireToothForProcedure { get; set; } = true;
    public bool ConsentRequiredBeforeTreatment { get; set; } = true;
    public int DefaultRecallMonths { get; set; } = 6;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? UpdatedByUserId { get; set; }
}
