#!/usr/bin/env python3
"""CurvTab Dental SignalR routing: Reception scheduling -> Dentist,
Dentist calling -> Reception. Preserve existing check-in and checkout events.
Run from Codespace repository root. No database changes.
"""
from pathlib import Path
from datetime import datetime, timezone
import re, shutil, sys

ROOT = Path.cwd()
APPT = ROOT / 'backend/CurvTabDental.API/Controllers/AppointmentsController.cs'
UI = ROOT / 'frontend/src/components/LiveClinicNotifications.tsx'
DETAILS = ROOT / 'backend/CurvTabDental.API/Controllers/ClinicNotificationDetailsController.cs'

DETAILS_TEXT = '''using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Small, tenant-protected lookup for live notifications. Never exposes
// consultation notes, diagnoses, medical history or payment details.
[ApiController]
[Route("api/clinic-notifications")]
[Authorize(Roles = "Receptionist,PracticeAdmin,Dentist")]
public sealed class ClinicNotificationDetailsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public ClinicNotificationDetailsController(DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    [HttpGet("appointments/{id:guid}")]
    public async Task<IActionResult> Appointment(Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        // Both sides of the join must belong to the signed-in practice.
        // Filtering before projection avoids the previous EF translation issue.
        var result = await (
            from a in _db.Appointments.AsNoTracking()
            join p in _db.Patients.AsNoTracking() on a.PatientId equals p.Id
            where a.Id == id && a.DentalPracticeId == practiceId
                && p.DentalPracticeId == practiceId
            select new
            {
                appointmentId = a.Id,
                patientName = p.FirstName + " " + p.LastName,
                startUtc = a.StartUtc,
                status = a.Status
            }
        ).SingleOrDefaultAsync(ct);

        if (result is null) return NotFound();
        return Ok(result);
    }
}
'''


def stop(msg):
    sys.exit('STOP: ' + msg + '\nNo changes made.')


def insert_after_audit(text, event_name, insertion, label):
    # Locate exactly one existing successful audit call. The event is published
    # AFTER the database status transition and audit, not before SaveChanges.
    pat = (r'await\s+_audit\.WriteAsync\(\s*"' + re.escape(event_name) +
           r'"\s*,.*?\bct\s*:\s*ct\s*\)\s*;')
    matches = list(re.finditer(pat, text, re.DOTALL))
    if len(matches) != 1:
        stop(f'{label}: expected exactly one {event_name} audit call, found {len(matches)}')
    m = matches[0]
    # Safety: ensure insertion is in the correct action with expected symbols.
    before = text[max(0, m.start()-4000):m.start()]
    if 'practiceId' not in before:
        stop(f'{label}: practiceId scope not found near audit call')
    return text[:m.end()] + insertion + text[m.end():]


CREATE_PUBLISH = '''\n
        // Reception booked a visit -> notify DENTISTS of this practice.
        // Publish only AFTER the booking and audit were saved.
        try
        {
            await _notifications.Clients.Group(ClinicNotificationsHub.DentistGroup(practiceId))
                .SendAsync("ClinicEvent", new
                {
                    kind = "AppointmentScheduled",
                    appointmentId = appointment.Id,
                    occurredAtUtc = DateTime.UtcNow
                }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Appointment notification failed for {AppointmentId}", appointment.Id);
        }
'''
CALL_PUBLISH = '''\n
        // Dentist called the patient -> notify RECEPTION of this practice.
        try
        {
            await _notifications.Clients.Group(ClinicNotificationsHub.FrontDeskGroup(practiceId))
                .SendAsync("ClinicEvent", new
                {
                    kind = "PatientCalled",
                    appointmentId = id,
                    occurredAtUtc = DateTime.UtcNow
                }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Patient-called notification failed for {AppointmentId}", id);
        }
'''


def patch_appt(t):
    if 'IHubContext<ClinicNotificationsHub>' not in t or 'ClinicNotificationsHub' not in t:
        stop('AppointmentsController has no installed SignalR hub; install previous notifications first.')
    if 'kind = "AppointmentScheduled"' in t or 'kind = "PatientCalled"' in t:
        stop('New notification events already exist; do not install twice.')
    if 'APPOINTMENT_CREATED' not in t or 'PATIENT_CALLED' not in t:
        stop('AppointmentsController does not contain both required actions.')
    t = insert_after_audit(t, 'APPOINTMENT_CREATED', CREATE_PUBLISH, 'Create')
    t = insert_after_audit(t, 'PATIENT_CALLED', CALL_PUBLISH, 'CallPatient')
    return t


def replace_once(t, old, new, description):
    occurrences = t.count(old)
    if occurrences != 1:
        stop(f'{description} anchor expected once, found {occurrences}')
    return t.replace(old, new, 1)


def patch_ui(t):
    t = replace_once(
        t,
        "kind: 'CheckoutReady' | 'PatientWaiting'",
        "kind: 'CheckoutReady' | 'PatientWaiting' | 'AppointmentScheduled' | 'PatientCalled'",
        'Event types'
    )
    t = replace_once(t, 'type PendingVisit = {', '''type NotificationSummary = {
  appointmentId: string
  patientName: string
  startUtc: string
  status: string
}

type RecentAlert = {
  id: string
  kind: ClinicEvent['kind']
  message: string
  occurredAtUtc: string
}

type PendingVisit = {''', 'Types')
    t = replace_once(t, '  const [rows, setRows] = useState<PendingVisit[]>([])', '''  const [rows, setRows] = useState<PendingVisit[]>([])
  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([])''', 'Component state')
    old = '''    connection.on('ClinicEvent', (event: ClinicEvent) => {
      if (!active) return
      if ((isDentist && event.kind !== 'PatientWaiting') ||
          (!isDentist && event.kind !== 'CheckoutReady')) return
      void sync(event)
      // Refresh Checkout/Queue if those screens are currently mounted.
      window.dispatchEvent(new Event('curvtab:clinic-notification'))
    })'''
    new = '''    connection.on('ClinicEvent', (event: ClinicEvent) => {
      if (!active) return
      // Never show a front-desk event to a Dentist or vice versa.
      const toDentist = event.kind === 'AppointmentScheduled' || event.kind === 'PatientWaiting'
      if (isDentist !== toDentist) return

      if (event.kind === 'AppointmentScheduled' || event.kind === 'PatientCalled') {
        // Retrieve the patient's name from a secure practice-scoped API.
        // The SignalR broadcast itself contains only an appointment ID.
        void (async () => {
          let patient = 'A patient'
          let bookedFor = ''
          try {
            const summary = await apiRequest<NotificationSummary>(
              `/clinic-notifications/appointments/${encodeURIComponent(event.appointmentId)}`
            )
            if (summary.appointmentId.toLowerCase() === event.appointmentId.toLowerCase()) {
              patient = summary.patientName
              if (event.kind === 'AppointmentScheduled') {
                bookedFor = ` for ${new Date(summary.startUtc).toLocaleString('en-ZA', {
                  dateStyle: 'medium', timeStyle: 'short',
                })}`
              }
            }
          } catch {
            // A missed lookup should not suppress the live notification.
          }
          if (!active) return
          const message = event.kind === 'AppointmentScheduled'
            ? `${patient} has a new appointment${bookedFor}.`
            : `Dentist called ${patient} from the waiting queue.`
          const id = `${event.kind}:${event.appointmentId}:${event.occurredAtUtc}`
          setRecentAlerts(previous => [
            { id, kind: event.kind, message, occurredAtUtc: event.occurredAtUtc },
            ...previous.filter(item => item.id !== id),
          ].slice(0, 15))
          setToast(message)
          void sync()
          window.dispatchEvent(new Event('curvtab:clinic-notification'))
        })()
        return
      }

      // Existing check-in and checkout alerts stay enabled.
      void sync(event)
      window.dispatchEvent(new Event('curvtab:clinic-notification'))
    })'''
    t = replace_once(t, old, new, 'SignalR event listener')
    t = replace_once(t, 'Notifications: ${rows.length} ${isDentist', 'Notifications: ${rows.length + recentAlerts.length} ${isDentist', 'Bell aria-label')
    t = replace_once(t,
        "{rows.length > 0 && <span className=\"ct-live-badge\">{rows.length > 99 ? '99+' : rows.length}</span>}",
        "{rows.length + recentAlerts.length > 0 && <span className=\"ct-live-badge\">{rows.length + recentAlerts.length > 99 ? '99+' : rows.length + recentAlerts.length}</span>}",
        'Bell counter')
    t = replace_once(t,
        "{rows.length === 0 && <p className=\"ct-live-empty\"><CheckCircle2 size={19}/> All caught up</p>}",
        """{rows.length === 0 && recentAlerts.length === 0 && <p className=\"ct-live-empty\"><CheckCircle2 size={19}/> All caught up</p>}
            {recentAlerts.map(item => (
              <div className=\"ct-live-item\" key={item.id}>
                <strong>{item.kind === 'AppointmentScheduled' ? 'New appointment' : 'Patient called'}</strong>
                <span>{item.message}</span>
                <small>{time(item.occurredAtUtc)}</small>
              </div>
            ))}""",
        'Recent alerts list')
    return t


def main():
    if not APPT.is_file() or not UI.is_file():
        stop('Run in the CurvTab-Dental-2.0 repository root (expected controller and component missing).')
    if DETAILS.exists():
        stop('ClinicNotificationDetailsController.cs already exists; inspect it before patching.')
    old_appt, old_ui = APPT.read_text(), UI.read_text()
    new_appt = patch_appt(old_appt)
    new_ui = patch_ui(old_ui)
    backup = ROOT / '.curvtab-notification-routing-backups' / datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True, exist_ok=False)
    for path in (APPT, UI):
        out = backup / path.relative_to(ROOT)
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, out)
    try:
        APPT.write_text(new_appt)
        UI.write_text(new_ui)
        DETAILS.write_text(DETAILS_TEXT)
    except Exception:
        APPT.write_text(old_appt)
        UI.write_text(old_ui)
        DETAILS.unlink(missing_ok=True)
        raise
    print('SUCCESS: Notifications now route new bookings to Dentists and patient calls to Reception.')
    print('Preserved: check-in -> Dentist; consultation complete -> Reception.')
    print('Backup:', backup)
    print('Next: dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj')
    print('Then: cd frontend && npm run build && npm run lint')
    print('No database migration required.')

if __name__ == '__main__':
    main()
