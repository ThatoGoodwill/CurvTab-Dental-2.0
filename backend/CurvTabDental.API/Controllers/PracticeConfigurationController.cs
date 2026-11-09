using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Scheduling, billing and clinical defaults for the signed-in practice.
// The practice always comes from the signed login, never from the request.
[ApiController]
[Authorize(Roles = "PracticeAdmin,Dentist,Receptionist,Finance")]
[Route("api/practice/configuration")]
public sealed class PracticeConfigurationController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PracticeConfigurationController(
        DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record DayHours(int Day, bool Open, string From, string To);

    public record ConfigurationRequest(
        List<DayHours> Hours,
        int SlotMinutes,
        int BufferMinutes,
        int AdvanceBookingDays,
        int CancellationNoticeHours,
        string InvoicePrefix,
        decimal VatRatePercent,
        int PaymentTermsDays,
        string? InvoiceFooter,
        int DefaultAppointmentMinutes,
        bool RequireToothForProcedure,
        bool ConsentRequiredBeforeTreatment,
        int DefaultRecallMonths);

    private static List<DayHours> DefaultHours() => new()
    {
        new(0, false, "08:00", "13:00"), // Sunday
        new(1, true, "08:00", "17:00"),
        new(2, true, "08:00", "17:00"),
        new(3, true, "08:00", "17:00"),
        new(4, true, "08:00", "17:00"),
        new(5, true, "08:00", "17:00"),
        new(6, true, "08:00", "13:00")
    };

    private static List<DayHours> ReadHours(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return DefaultHours();
        try
        {
            var rows = JsonSerializer.Deserialize<List<DayHours>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return rows is { Count: 7 } ? rows : DefaultHours();
        }
        catch (JsonException) { return DefaultHours(); }
    }

    private static object Shape(PracticeConfiguration c) => new
    {
        hours = ReadHours(c.OpeningHoursJson),
        c.SlotMinutes,
        c.BufferMinutes,
        c.AdvanceBookingDays,
        c.CancellationNoticeHours,
        c.InvoicePrefix,
        c.VatRatePercent,
        c.PaymentTermsDays,
        c.InvoiceFooter,
        c.DefaultAppointmentMinutes,
        c.RequireToothForProcedure,
        c.ConsentRequiredBeforeTreatment,
        c.DefaultRecallMonths,
        c.UpdatedAtUtc
    };

    private static bool ValidTime(string? value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out time);

    private static string? Validate(ConfigurationRequest r)
    {
        if (r.Hours is null || r.Hours.Count != 7 ||
            r.Hours.Select(h => h.Day).Distinct().Count() != 7 ||
            r.Hours.Any(h => h.Day < 0 || h.Day > 6))
            return "Opening hours must list all seven days.";

        foreach (var h in r.Hours.Where(h => h.Open))
        {
            if (!ValidTime(h.From, out var from) || !ValidTime(h.To, out var to))
                return "Use HH:mm times for opening hours.";
            if (from >= to)
                return "Closing time must be after opening time.";
        }

        if (r.SlotMinutes < 5 || r.SlotMinutes > 120 || r.SlotMinutes % 5 != 0)
            return "Appointment slot must be 5 to 120 minutes, in steps of 5.";
        if (r.BufferMinutes < 0 || r.BufferMinutes > 60)
            return "Buffer must be 0 to 60 minutes.";
        if (r.AdvanceBookingDays < 1 || r.AdvanceBookingDays > 365)
            return "Advance booking must be 1 to 365 days.";
        if (r.CancellationNoticeHours < 0 || r.CancellationNoticeHours > 168)
            return "Cancellation notice must be 0 to 168 hours.";

        if (string.IsNullOrWhiteSpace(r.InvoicePrefix) ||
            !Regex.IsMatch(r.InvoicePrefix.Trim(), "^[A-Za-z0-9-]{1,10}$"))
            return "Invoice prefix must be 1 to 10 letters, numbers or dashes.";
        if (r.VatRatePercent < 0 || r.VatRatePercent > 30 ||
            decimal.Round(r.VatRatePercent, 2) != r.VatRatePercent)
            return "VAT rate must be between 0 and 30 percent.";
        if (r.PaymentTermsDays < 0 || r.PaymentTermsDays > 90)
            return "Payment terms must be 0 to 90 days.";
        if ((r.InvoiceFooter?.Trim().Length ?? 0) > 300)
            return "Invoice footer can be at most 300 characters.";

        if (r.DefaultAppointmentMinutes < 5 || r.DefaultAppointmentMinutes > 240)
            return "Default appointment length must be 5 to 240 minutes.";
        if (r.DefaultRecallMonths < 0 || r.DefaultRecallMonths > 24)
            return "Recall interval must be 0 to 24 months.";

        return null;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var row = await _db.Set<PracticeConfiguration>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId, ct);

        // A practice that has never saved settings gets the defaults.
        return Ok(Shape(row ?? new PracticeConfiguration
        {
            DentalPracticeId = practiceId,
            OpeningHoursJson = ""
        }));
    }

    [HttpPut]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Save(
        [FromBody] ConfigurationRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();
        if (request is null)
            return BadRequest(new { message = "Settings are required." });

        var problem = Validate(request);
        if (problem is not null)
            return BadRequest(new { message = problem });

        var row = await _db.Set<PracticeConfiguration>()
            .FirstOrDefaultAsync(x => x.DentalPracticeId == practiceId, ct);

        if (row is null)
        {
            row = new PracticeConfiguration { DentalPracticeId = practiceId };
            _db.Set<PracticeConfiguration>().Add(row);
        }

        row.OpeningHoursJson = JsonSerializer.Serialize(
            request.Hours.OrderBy(h => h.Day).ToList());
        row.SlotMinutes = request.SlotMinutes;
        row.BufferMinutes = request.BufferMinutes;
        row.AdvanceBookingDays = request.AdvanceBookingDays;
        row.CancellationNoticeHours = request.CancellationNoticeHours;
        row.InvoicePrefix = request.InvoicePrefix.Trim().ToUpperInvariant();
        row.VatRatePercent = request.VatRatePercent;
        row.PaymentTermsDays = request.PaymentTermsDays;
        row.InvoiceFooter = request.InvoiceFooter?.Trim() ?? "";
        row.DefaultAppointmentMinutes = request.DefaultAppointmentMinutes;
        row.RequireToothForProcedure = request.RequireToothForProcedure;
        row.ConsentRequiredBeforeTreatment = request.ConsentRequiredBeforeTreatment;
        row.DefaultRecallMonths = request.DefaultRecallMonths;
        row.UpdatedAtUtc = DateTime.UtcNow;
        row.UpdatedByUserId = _current.UserId;

        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync(
            "PRACTICE_CONFIGURATION_UPDATED",
            "PracticeConfiguration",
            row.Id.ToString(),
            ct: ct);

        return Ok(Shape(row));
    }
}
