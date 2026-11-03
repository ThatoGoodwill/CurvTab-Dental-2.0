#!/usr/bin/env python3
'''CurvTab Dental 2.0: Live notifications via ASP.NET Core SignalR.

Run in the Codespaces repository ROOT:
    python3 curvtab_live_notifications.py

Preflights expected source anchors, makes timestamped backups, and modifies only
specified backend/frontend source files; never touches PostgreSQL or migrations.
'''
from pathlib import Path
from datetime import datetime, timezone
import base64
import re
import shutil
import sys
import zlib

ROOT = Path.cwd()
API = ROOT / 'backend/CurvTabDental.API'
APP = ROOT / 'frontend/src/App.tsx'
APPOINTMENTS = API / 'Controllers/AppointmentsController.cs'
CONSULTATIONS = API / 'Controllers/ConsultationsController.cs'
PROGRAM = API / 'Program.cs'
CHECKOUT = ROOT / 'frontend/src/pages/ReceptionCheckoutPage.tsx'
APPOINTMENT_PAGE = ROOT / 'frontend/src/pages/AppointmentsPage.tsx'

PAYLOAD = {
    "backend/CurvTabDental.API/Notifications/ClinicNotificationsHub.cs": "eNqtVE1vGjEQve+vmKCq2pWocw9KK0RCy6EUJbQ9VFXltYfExdgrf5DShP/e8S4QFpJIlbIH2LVn3sx78xG9MjdwvfIBF+waRXQqrNhAc7XwvSzWt4PollNeXqAJXLORmTnug4siRIdsgs4r8jYCt/aflXDW21lgfV+NMQws2fVjuLVO/eVBWfOi5bW6MVxfHdtcmkDJDR1f4J1182TcyzJDn77iAg/y7E9GbGyDmilRxyQ62ekpjC0IrcjkneBa81IjlM5yKYgTLJCSlP4MrNErII5ETIJHt0QHwkoEXKjgAZcE4FnCu6SrFd0ZgyKFAeWBE1cySIHJnRsJv60y9NowossN5juvCDPSx2nlOPkLZNmPrVSYX1mNHs6hc4UCqwRPUncnG9O+XCjTTXTptFP8zKpYaiUIm2sKJjT3HgZaGSVaQnyKJZwB/Wb3GdBTObWkTMEhlzXxRsGLcmBNwD8BfsmSxKtNmwhPg+aHfrIs4Px9cicOhxg+kGP6c0mToSOfC/Tzj87GKv8YlYStJCNZw7zpzJKRJKOz+8e7s/G603seeCPPS7CyMfHHqPuwlurlUrm4XxkBU+7n8MUMmsKj7KfTvKg9GlnTo2aQn6SobOpWE+485ru77bNRi32lNvjAhsrIoXI+fOM6Yl5P4nRVoWdjavRRnetMoSu6YGOAJXd1/xCZYod8nz2F3y+tC3nRa106pCk2j2frbPeaoLkQNppA5eN3XNWdUOfpaWDHdkpyzUnkvGhhsu+36DCPSd3IRhLOzzc5wtu36cT3SeUlNl9N00x2yrNP3NfcD0CvUZPQDarBO7h/whfWh06UncYv7gJnPOrQFGkryGA3tLU0KIte1qrchv2H4zg05MYGOOgneHhohT95FK2NcCgf65tVk9tRd1SJb7VRcS8UaVftlOzC85xeuy2SMPste0JZjEzaVHlrTXUKkqPV3HuGrRXWKdpVa1SrJ5aEknJq6/dnBDpmPpLdw32yN/MvadV7nuZe8ruN+/ppt7bV/yfdpFByj+x4NTXVXGfr7B9Foo09",
    "frontend/src/components/LiveClinicNotifications.tsx": "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",
    "frontend/src/components/LiveClinicNotifications.css": "eNqNV9uO4ygQfd+vQGqNlNaayPhKkpf9jX3Eppyw4xgLk3R6VvvvC/gSYzvRqB86NhRVdeqcKrwvNa7FHXAjtahEybSQDVZSavQvamUn7PMRKajNyh1OiIuurdn3EYmmFg3gqobHCbFanBssNFy7Iyqh0aBO6BcWDYfHEWXhCf33x350VUBdvzj9S3B9OaIkac2hFxDnix6fth3/c+tM3N+4lMZno5/ONyMqpOKgjoi0D9TJWnCkzgXbkSgNSEIDQpNgT+jnuBErxsXN2BMXQcHKn2clbw0/ojtTO4xLpniAPqqqMjalrKUaVzQ8tFkheZykzC7eVGdXWyn6ULRizZi/+11JdUX7qEPAOghMBA/cXRiXX/OXUwTTyxWyx4u8gwq8d1i20BjIJ0eDTwM7/L3DUfv49NP7AFZFVXWahXFEIaIGt8js7mGLwyDvgduT5HMdSCXLW4fvohNFDc+ArtDcUHHT2qT+YouWrNObe0wS8qYtAY4onqr4EUeUAT2Na1hWVQfabfHjYvwMHvdYYY64aYOjlu0R4dxaqJ54/YOPC415Rqdif12ENV3SJQytYWU4iTvxy4RKyPTia2B1nhpVXEWDB85HZM75/qllnIvmbKH3NXBWgpvlmpWw5vi8YrZY6ViwMLB/+8ivlavHG0hKVpc7k9IP9KcTwueETzgJ1uSxizOTdTBtv38hjCK7f62nKFwBW1m2Daga2URlwrf0+sE5pFW0TJNYZqbhmCiJg5gEmVFzZJOdYCSZ9Tv1JZKGKyTwBZjdbBCZ0H7RarrWwl+A/gJoFh3HmuBOM6VP6MwMiiRaUNFz1mklfZ9FLcufPoeytydcmeuqywNGSLMiPxxiwzimzoZ0rrLJuwN79W1r0viZF8/1kpYpg8qzZo1sYHIvmgsooTf64FSbpVQNzA2UlpHrUmw2dwcztadMOSc5oeCD6MrQg2AJYBgTrmvDpXaJmzbi2gl343A5gQaEBwnQuXzdw4L0afhjwfkoKwo6UdB35osjPUBYeCG65M2+K3vg0Wvc68r2/6q2wmA3LVdW9vA+MkeCmbaAV6Sic73Y9hFvdB6H9bJi7vCJyXPQt3e2rFnsi7zqRXlI6dquMEbjnhBokbPTbzgb5DEa0uRAGN3o0TNDuLb620Js9DJCnFEPjTd0fHkzcdjl80zTKo8of5/FMMEHstl27GuZhE/Kuc78fkJF3njpH+eUs0xkCp+tgYnbNnQOZ3ujgTyBg/mRHpKI23uPN9Uy21JXIl/k0V9RbO1FrW24hRsoDXTdjuxD6s+nvvHMB1QlHsCnKRS5vuhAoNTr73HoT6gkXE+oOOon1LuSrpt56MOXzbGfCaqIION0Qr+GysSbPtfDkh1ovq5Otj0eF6PdijN7zjwamJtYHpuZl3zORimNSWJsWSOurIdvBJYpZf6hfdzfJLG5PK2Bx6Jc9fsPiKqiSp9OwtTIMFrn4V9itqSzqjMXd0uM2s3njfXf6i/91ta1x77T940+3NCY67mjvMk+tQf99RO+K8Wu0C3BMn6VtC1UmuEv9LeT2otrNenv1f8Zbs4NyCuD0G023q/ABUM729oH9maWuZ/mlNe3tkEUTgd9lxr0MUw3tBKUt+7s8v6KMYuhVVCB6rACfiuB46scP9nssxeROzZYfuXNeNffCOYfPv0b6+9/3GvYOQ=="
}


def abort(text):
    raise SystemExit('STOP: ' + text + '\nNo files changed.')


def patch_constructor(source, cls):
    if 'IHubContext<ClinicNotificationsHub>' in source:
        abort(f'{cls} was already patched or has an unexpected hub context. Do not install twice.')
    pattern = (r'(public\s+' + cls + r'\s*\(\s*DentalDbContext\s+db\s*,\s*'
               r'ICurrentUser\s+current\s*,\s*IAuditService\s+audit\s*)\)')
    match = re.search(pattern, source)
    if not match:
        abort(f'{cls} constructor differs from the expected version. Request a targeted patch.')
    source = source[:match.start()] + match.group(1) + (
        ',\n        IHubContext<ClinicNotificationsHub> notifications,\n'
        f'        ILogger<{cls}> logger)'
    ) + source[match.end():]
    field = '    private readonly IAuditService _audit;'
    assignment = '        _audit = audit;'
    if source.count(field) != 1 or source.count(assignment) != 1:
        abort(f'{cls} fields/constructor assignments are different from expected.')
    source = source.replace(field, field + '\n'
        '    private readonly IHubContext<ClinicNotificationsHub> _notifications;\n'
        f'    private readonly ILogger<{cls}> _logger;', 1)
    source = source.replace(assignment, assignment + '\n'
        '        _notifications = notifications;\n'
        '        _logger = logger;', 1)
    source = 'using CurvTabDental.API.Notifications;\nusing Microsoft.AspNetCore.SignalR;\n' + source
    return source


def patch_consultations(source):
    source = patch_constructor(source, 'ConsultationsController')
    anchor = (r'(\s*await _audit\.WriteAsync\(\s*"CONSULTATION_FINALIZED"\s*,\s*'
              r'"Consultation"\s*,\s*consultation\.Id\.ToString\(\)\s*,\s*ct:\s*ct\s*\);)')
    matches = list(re.finditer(anchor, source))
    if len(matches) != 1:
        abort('Consultation finalization audit anchor missing/duplicated.')
    publish = '''
        // The clinical transaction has COMMITTED. Notify Reception in the
        // same practice only; never send private medical notes over the hub.
        try
        {
            await _notifications.Clients.Group(ClinicNotificationsHub.FrontDeskGroup(practiceId))
                .SendAsync("ClinicEvent", new
                {
                    kind = "CheckoutReady",
                    appointmentId,
                    occurredAtUtc = changedAt
                }, ct);
        }
        catch (Exception ex)
        {
            // Notifications are best effort; a failure must not undo treatment.
            _logger.LogWarning(ex, "Checkout push failed for {AppointmentId}", appointmentId);
        }
'''
    at = matches[0].end()
    return source[:at] + publish + source[at:]


def patch_appointments(source):
    source = patch_constructor(source, 'AppointmentsController')
    anchor = (r'(\s*await _audit\.WriteAsync\(\s*"PATIENT_CHECKED_IN"\s*,\s*'
              r'"Appointment"\s*,\s*id\.ToString\(\)\s*,\s*ct:\s*ct\s*\);)')
    matches = list(re.finditer(anchor, source))
    if len(matches) != 1:
        abort('Appointment check-in audit anchor missing/duplicated.')
    publish = '''
        // A checked-in patient becomes visible to dentists instantly.
        try
        {
            await _notifications.Clients.Group(ClinicNotificationsHub.DentistGroup(practiceId))
                .SendAsync("ClinicEvent", new
                {
                    kind = "PatientWaiting",
                    appointmentId = id,
                    occurredAtUtc = DateTime.UtcNow
                }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Queue push failed for {AppointmentId}", id);
        }
'''
    at = matches[0].end()
    return source[:at] + publish + source[at:]


def patch_program(source):
    if 'AddSignalR' in source or 'MapHub<ClinicNotificationsHub>' in source:
        abort('SignalR already wired into Program.cs. No duplicate installation.')
    anchor1 = 'builder.Services.AddControllers();'
    anchor2 = 'app.MapControllers();'
    if source.count(anchor1) != 1 or source.count(anchor2) != 1:
        abort('Program.cs changed: cannot safely find service/endpoint anchors.')
    source = 'using CurvTabDental.API.Notifications;\n' + source
    source = source.replace(anchor1, anchor1 + '\n' + 'builder.Services.AddSignalR();', 1)
    source = source.replace(anchor2, 'app.MapHub<ClinicNotificationsHub>("/api/hubs/clinic");\n' + anchor2, 1)
    return source


def patch_app(source):
    if 'LiveClinicNotifications' in source:
        abort('LiveClinicNotifications already installed in App.tsx.')
    if 'openAppointmentTab(' not in source or "'Checkout & Payments'" not in source:
        abort('App.tsx does not contain both queue navigation and checkout navigation. Need exact current App.tsx.')
    # Replace ONLY the previous decorative bell, regardless of whitespace.
    bell = re.compile(r'<span\s+className=[\'\"]notification-icon[\'\"][^>]*>\s*<Bell\s+size=\{20\}\s*/>\s*</span>')
    matches = list(bell.finditer(source))
    if len(matches) != 1:
        abort('Could not locate the old notification bell in App.tsx.')
    replacement = '''<LiveClinicNotifications
              role={role}
              onOpen={() => {
                if (role === 'Dentist') openAppointmentTab('In Queue')
                else navigate('Checkout & Payments')
              }}
            />'''
    source = source[:matches[0].start()] + replacement + source[matches[0].end():]
    # The previous decorative Bell import is no longer used after replacement.
    if '<Bell' not in source:
        source = re.sub(r'(?m)^\s*Bell,\s*\n', '', source, count=1)
    return "import LiveClinicNotifications from './components/LiveClinicNotifications'\n" + source


def patch_checkout(source):
    marker = "  const paymentRequestId = useRef<string | null>(null)"
    if source.count(marker) != 1 or "'react'" not in source:
        abort('ReceptionCheckoutPage.tsx revision anchor missing/duplicated.')
    addition = '''

  // Refresh checkout-ready and payment details after a live push.
  useEffect(() => {
    const onClinicUpdate = () => setRevision(value => value + 1)
    window.addEventListener('curvtab:clinic-notification', onClinicUpdate)
    return () => window.removeEventListener('curvtab:clinic-notification', onClinicUpdate)
  }, [])'''
    return source.replace(marker, marker + addition, 1)


def patch_appointment_page(source):
    marker = '  const [reload, setReload] = useState(0)'
    if source.count(marker) != 1 or "'react'" not in source:
        abort('AppointmentsPage.tsx reload anchor missing/duplicated.')
    addition = '''

  // The Dentist queue refreshes automatically when Reception checks in a patient.
  useEffect(() => {
    const onClinicUpdate = () => {
      setLoading(true)
      setReload(value => value + 1)
    }
    window.addEventListener('curvtab:clinic-notification', onClinicUpdate)
    return () => window.removeEventListener('curvtab:clinic-notification', onClinicUpdate)
  }, [])'''
    return source.replace(marker, marker + addition, 1)


def main():
    required = [PROGRAM, CONSULTATIONS, APPOINTMENTS, APP, CHECKOUT, APPOINTMENT_PAGE]
    missing = [str(p.relative_to(ROOT)) for p in required if not p.is_file()]
    if missing:
        abort('Required files not found: ' + ', '.join(missing))
    for relative in PAYLOAD:
        if (ROOT / relative).exists():
            abort('Would overwrite an existing file: ' + relative)
    text = {p: p.read_text(encoding='utf-8') for p in required}

    # PRECHECK ALL patches in memory; do not touch disk until they all succeed.
    updated = {
        PROGRAM: patch_program(text[PROGRAM]),
        CONSULTATIONS: patch_consultations(text[CONSULTATIONS]),
        APPOINTMENTS: patch_appointments(text[APPOINTMENTS]),
        APP: patch_app(text[APP]),
        CHECKOUT: patch_checkout(text[CHECKOUT]),
        APPOINTMENT_PAGE: patch_appointment_page(text[APPOINTMENT_PAGE]),
    }
    backup = ROOT / '.curvtab-notification-backups' / datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True, exist_ok=False)
    for path in required:
        dest = backup / path.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)

    created = []
    try:
        for relative, encoded in PAYLOAD.items():
            dest = ROOT / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(zlib.decompress(base64.b64decode(encoded)))
            created.append(dest)
        for path, content in updated.items():
            path.write_text(content, encoding='utf-8')
    except Exception as exc:
        for path in required:
            shutil.copy2(backup / path.relative_to(ROOT), path)
        for path in created:
            path.unlink(missing_ok=True)
        sys.exit('Installation failed. Original files restored: ' + str(exc))

    print('SUCCESS: SignalR live notifications installed.')
    print('Backup:', backup)
    print('Next: cd frontend && npm install @microsoft/signalr && npm run build && npm run lint')
    print('Then: dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj')
    print('No database migration is required. Restart/rebuild ONLY the API container after builds pass.')


if __name__ == '__main__':
    main()
