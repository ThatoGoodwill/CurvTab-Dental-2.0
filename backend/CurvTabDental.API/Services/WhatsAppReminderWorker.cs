using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Services;

// CT_PHASE8B_AUTOMATIC_MOCK_REMINDERS
// No real WhatsApp messages are sent by this service.
public sealed class WhatsAppReminderWorker : BackgroundService
{
    private const string TemplateKey = "appointment_reminder_v1";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<WhatsAppReminderWorker> _logger;

    public WhatsAppReminderWorker(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<WhatsAppReminderWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        if (!_configuration.GetValue<bool>(
                "Features:WhatsAppAutoRemindersEnabled"))
        {
            _logger.LogInformation(
                "Automatic WhatsApp mock reminders are disabled.");
            return;
        }

        _logger.LogInformation(
            "Automatic WhatsApp mock reminder worker started.");

        try
        {
            await ScanAsync(stoppingToken);

            using var timer = new PeriodicTimer(
                TimeSpan.FromMinutes(5));

            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await ScanAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException)
            when (stoppingToken.IsCancellationRequested)
        {
            // Normal application shutdown.
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "WhatsApp mock reminder worker stopped unexpectedly.");
            throw;
        }
    }

    private async Task ScanAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();

        var db = scope.ServiceProvider
            .GetRequiredService<DentalDbContext>();

        var now = DateTime.UtcNow;

        // Queue reminders for appointments between
        // 23 and 25 hours into the future.
        var windowStart = now.AddHours(23);
        var windowEnd = now.AddHours(25);

        // Background workers have no signed-in practice.
        // Therefore every tenant-filtered table explicitly
        // ignores its filter, then joins on DentalPracticeId.
        var candidates = await (
            from appointment in db.Appointments
                .IgnoreQueryFilters()
                .AsNoTracking()

            join patient in db.Patients
                .IgnoreQueryFilters()
                .AsNoTracking()
                on new
                {
                    appointment.DentalPracticeId,
                    appointment.PatientId
                }
                equals new
                {
                    patient.DentalPracticeId,
                    PatientId = patient.Id
                }

            join consent in db.WhatsAppConsents
                .IgnoreQueryFilters()
                .AsNoTracking()
                on new
                {
                    appointment.DentalPracticeId,
                    appointment.PatientId
                }
                equals new
                {
                    consent.DentalPracticeId,
                    consent.PatientId
                }

            join practice in db.DentalPractices
                .AsNoTracking()
                on appointment.DentalPracticeId
                equals practice.Id

            where practice.IsActive
                && appointment.Status == "Scheduled"
                && appointment.StartUtc >= windowStart
                && appointment.StartUtc < windowEnd
                && !patient.IsArchived
                && patient.PhoneNumber != null
                && patient.PhoneNumber != ""
                && consent.GrantedAtUtc != null
                && consent.RevokedAtUtc == null

            orderby appointment.StartUtc

            select new
            {
                AppointmentId = appointment.Id,
                appointment.DentalPracticeId,
                appointment.PatientId,
                appointment.StartUtc,
                RecipientNumber = patient.PhoneNumber!
            }
        ).Take(250).ToListAsync(ct);

        var created = 0;

        foreach (var candidate in candidates)
        {
            ct.ThrowIfCancellationRequested();

            var exists = await db.WhatsAppOutboundMessages
                .IgnoreQueryFilters()
                .AsNoTracking()
                .AnyAsync(x =>
                    x.DentalPracticeId ==
                        candidate.DentalPracticeId &&
                    x.AppointmentId ==
                        candidate.AppointmentId &&
                    x.TemplateKey == TemplateKey,
                    ct);

            if (exists)
                continue;

            var message = new WhatsAppOutboundMessage
            {
                DentalPracticeId = candidate.DentalPracticeId,
                PatientId = candidate.PatientId,
                AppointmentId = candidate.AppointmentId,
                RecipientNumber =
                    candidate.RecipientNumber.Trim(),
                TemplateKey = TemplateKey,
                AppointmentStartUtc = candidate.StartUtc,
                Status = "MockQueued",
                CreatedAtUtc = DateTime.UtcNow
            };

            db.WhatsAppOutboundMessages.Add(message);

            try
            {
                await db.SaveChangesAsync(ct);
                created++;
            }
            catch (DbUpdateException ex)
            {
                // A parallel worker may have inserted the same
                // appointment reminder first. The database's
                // unique index remains the final safeguard.
                db.ChangeTracker.Clear();

                _logger.LogWarning(
                    ex,
                    "Unable to queue automatic mock reminder.");
            }
        }

        if (created > 0)
        {
            _logger.LogInformation(
                "Created {Count} automatic mock reminders.",
                created);
        }
    }
}
