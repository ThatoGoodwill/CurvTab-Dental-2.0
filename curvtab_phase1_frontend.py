#!/usr/bin/env python3
"""CurvTab Dental 2.0 — additive Dentist Phase 1 frontend installer.
Run from the repository root: python3 curvtab_phase1_frontend.py
Only frontend files are modified. Existing files are backed up in /tmp.
"""
from pathlib import Path
from datetime import datetime
import shutil
import sys
import re

root = Path.cwd()
app_path = root / 'frontend/src/App.tsx'
appointments_path = root / 'frontend/src/pages/AppointmentsPage.tsx'
controller = root / 'backend/CurvTabDental.API/Controllers/DentistController.cs'

if not app_path.exists() or not appointments_path.exists():
    sys.exit('ERROR: Run this script from /workspaces/CurvTab-Dental-2.0 (repository root).')
if not controller.exists():
    sys.exit('ERROR: DentistController.cs not found. First add the Dentist backend controller from Phase 1.')

app = app_path.read_text(encoding='utf-8')
appointments = appointments_path.read_text(encoding='utf-8')
if "import DentistDashboardPage from './pages/DentistDashboardPage'" in app:
    sys.exit('Already installed. No files changed. Run npm run build to verify.')

def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        sys.exit(f'ERROR: Expected exactly one {label} anchor; found {count}. No changes made.')
    return source.replace(old, new, 1)

# Expand an existing section-name union if App.tsx uses one.
# This prevents TypeScript from rejecting navigate('Daily Patients').
for declaration in re.finditer(r"\btype\s+([A-Za-z_][A-Za-z_0-9]*)\s*=", app):
    snippet = app[declaration.end():declaration.end() + 700]
    if "'Dashboard'" in snippet and "'Appointments'" in snippet:
        at = app.find("'Dashboard'", declaration.end(), declaration.end() + 700)
        app = app[:at + len("'Dashboard'")] + " | 'Daily Patients'" + app[at + len("'Dashboard'"):]
        break

# Preserve existing role-based navigation and screen components.
app = (
    "import DentistDashboardPage from './pages/DentistDashboardPage'\n"
    "import DailyPatientsPage from './pages/DailyPatientsPage'\n"
    "import { ClipboardList as DailyPatientsIcon } from 'lucide-react'\n" + app
)
app = replace_once(app,
    '        </nav>\n\n        <div className="sidebar-bottom">',
    '''          {role === 'Dentist' && (
            <button
              type="button"
              className={section === 'Daily Patients' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Daily Patients')}
            >
              <DailyPatientsIcon size={19} />
              <span>Daily Patients</span>
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">''',
    'Dentist sidebar')
app = replace_once(app,
    "          {section === 'Dashboard' && (",
    '''          {section === 'Dashboard' && role === 'Dentist' && (
            <DentistDashboardPage
              onOpenAppointments={() => openAppointmentTab('In Queue')}
              onOpenDailyPatients={() => navigate('Daily Patients')}
            />
          )}
          {section === 'Dashboard' && role !== 'Dentist' && (''',
    'dashboard conditional')
app = replace_once(app,
    "          {/* PATIENTS */}",
    '''          {/* DENTIST DAILY PATIENTS */}
          {section === 'Daily Patients' && role === 'Dentist' && (
            <DailyPatientsPage onOpenPatients={() => navigate('Patients')} />
          )}

          {/* PATIENTS */}''',
    'patient section')
app = replace_once(app,
    "            (section === 'Patients' && !canViewPatients) ||",
    "            (section === 'Daily Patients' && role !== 'Dentist') ||\n            (section === 'Patients' && !canViewPatients) ||",
    'access guard')

# Only enhance existing buttons/endpoint dispatch; all booking UI stays intact.
appointments = replace_once(appointments,
    "    action: 'check-in' | 'call'",
    "    action: 'check-in' | 'call' | 'start-consultation'",
    'appointment action type')
appointments = replace_once(appointments,
    '''      await apiRequest(
        `/appointments/${encodeURIComponent(id)}/${action}`,
        'POST'
      )''',
    '''      const url = action === 'start-consultation'
        ? `/dentist/appointments/${encodeURIComponent(id)}/start-consultation`
        : `/appointments/${encodeURIComponent(id)}/${action}`

      await apiRequest(url, 'POST')''',
    'appointment action URL')
appointments = replace_once(appointments,
    '''        action === 'check-in'
          ? 'Patient checked in and added to the queue.'
          : 'Patient called successfully.' ''',
    '''        action === 'check-in'
          ? 'Patient checked in and added to the queue.'
          : action === 'call'
            ? 'Patient called successfully.'
            : 'Consultation started. Patient moved to Daily Patients.' ''',
    'appointment success text') if '''        action === 'check-in'
          ? 'Patient checked in and added to the queue.'
          : 'Patient called successfully.' ''' in appointments else replace_once(appointments,
    '''        action === 'check-in'
          ? 'Patient checked in and added to the queue.'
          : 'Patient called successfully.''',
    '''        action === 'check-in'
          ? 'Patient checked in and added to the queue.'
          : action === 'call'
            ? 'Patient called successfully.'
            : 'Consultation started. Patient moved to Daily Patients.' ''',
    'appointment success text')
appointments = replace_once(appointments,
    '''                          Check In
                        </button>
                      )}''',
    '''                          Check In
                        </button>
                      )}
                      {item.status === 'Called' && canCall && (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={saving}
                          onClick={() => void performAction(item.id, 'start-consultation')}
                        >
                          <Stethoscope size={16} />
                          Start Consultation
                        </button>
                      )}''',
    'calendar Start Consultation button')
appointments = replace_once(appointments,
    '''                      Call Patient
                    </button>
                  )}''',
    '''                      Call Patient
                    </button>
                  )}
                  {canCall && item.status === 'Called' && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving}
                      onClick={() => void performAction(item.id, 'start-consultation')}
                    >
                      <Stethoscope size={16} />
                      Start Consultation
                    </button>
                  )}''',
    'queue Start Consultation button')
appointments = replace_once(appointments,
    '''In Queue ({queue.filter(
            (a) => a.status === 'Waiting'
          ).length})''',
    'In Queue ({queue.length})',
    'queue count')
appointments = replace_once(appointments,
    '''          <div className="eyebrow">FRONT DESK</div>''',
    '''          <div className="eyebrow">{role === 'Dentist' ? 'CLINICAL WORKSPACE' : 'FRONT DESK'}</div>''',
    'role heading')
appointments = replace_once(appointments,
    '''          <p>Schedule visits, check patients in and manage the queue.</p>''',
    '''          <p>{role === 'Dentist'
            ? 'Call waiting patients and begin their consultations.'
            : 'Schedule visits, check patients in and manage the queue.'}</p>''',
    'role subtitle')
appointments = replace_once(appointments,
    '''            Consultation documentation will be added separately.''',
    '''            Once a Dentist starts consultation, the visit appears in Daily Patients.''',
    'queue help')

DASHBOARD = r'''import { useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, RefreshCw, Stethoscope, Users } from 'lucide-react'
import { apiRequest } from '../services/api'
import './DentistWorkspace.css'

type DashboardStats = {
  scheduled: number
  waiting: number
  called: number
  inConsultation: number
  attendedToday: number
}

type QueuePatient = {
  id: string
  patientName: string
  status: string
  reason: string | null
}

type Props = {
  onOpenAppointments: () => void
  onOpenDailyPatients: () => void
}

function todayRange(): { fromUtc: string; toUtc: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { fromUtc: start.toISOString(), toUtc: end.toISOString() }
}

export default function DentistDashboardPage({
  onOpenAppointments,
  onOpenDailyPatients,
}: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [queue, setQueue] = useState<QueuePatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    const { fromUtc, toUtc } = todayRange()
    const qs = `fromUtc=${encodeURIComponent(fromUtc)}&toUtc=${encodeURIComponent(toUtc)}`
    Promise.all([
      apiRequest<DashboardStats>(`/dentist/dashboard?${qs}`),
      apiRequest<QueuePatient[]>('/appointments/queue'),
    ]).then(([dashboard, currentQueue]) => {
      if (cancelled) return
      setStats(dashboard)
      setQueue(currentQueue)
      setError('')
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Dashboard unavailable.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [reload])

  const measures = [
    { label: 'Scheduled Today', value: stats?.scheduled ?? 0 },
    { label: 'Waiting', value: stats?.waiting ?? 0 },
    { label: 'Called', value: stats?.called ?? 0 },
    { label: 'In Consultation', value: stats?.inConsultation ?? 0 },
    { label: 'Attended Today', value: stats?.attendedToday ?? 0 },
  ]

  return (
    <div className="dentist-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DENTIST</div>
          <h1>Clinical Dashboard</h1>
          <p>Today's clinical workflow and live patient queue.</p>
        </div>
        <button type="button" className="secondary-button" disabled={loading}
          onClick={() => { setLoading(true); setReload(n => n + 1) }}>
          <RefreshCw size={17} /> Refresh
        </button>
      </div>

      {error && <div className="appointment-alert" role="alert">{error}</div>}
      <div className="dentist-metrics">
        {measures.map((item) => (
          <article className="panel dentist-metric" key={item.label}>
            <span>{item.label}</span>
            <strong>{loading && !stats ? '…' : item.value}</strong>
          </article>
        ))}
      </div>

      <div className="dentist-actions">
        <button type="button" className="primary-button" onClick={onOpenAppointments}>
          <CalendarDays size={18} /> Open Patient Queue
        </button>
        <button type="button" className="secondary-button" onClick={onOpenDailyPatients}>
          <ClipboardList size={18} /> Daily Patients
        </button>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Waiting and Called Patients</h2>
            <p>Open the queue to call patients or start consultations.</p>
          </div>
          <Users size={21} />
        </div>
        {loading && queue.length === 0 ? <p>Loading patient queue...</p> :
          queue.length === 0 ? <p className="appointment-empty">No patients in the queue.</p> :
          <div className="dentist-rows">
            {queue.map((item) => (
              <div className="dentist-row" key={item.id}>
                <div>
                  <strong>{item.patientName}</strong>
                  <p>{item.reason || 'Dental appointment'}</p>
                </div>
                <span className="dentist-status"><Stethoscope size={15} /> {item.status}</span>
              </div>
            ))}
          </div>}
      </section>
    </div>
  )
}
'''

DAILY = r'''import { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, Users } from 'lucide-react'
import { apiRequest } from '../services/api'
import './DentistWorkspace.css'

type DailyPatient = {
  appointmentId: string
  patientId: string
  patientName: string
  appointmentStartUtc: string
  consultationStartedAtUtc: string | null
  consultationEndedAtUtc: string | null
  status: string
  reason: string | null
}

type Props = { onOpenPatients: () => void }

function localDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { fromUtc: start.toISOString(), toUtc: end.toISOString() }
}

function timeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit',
  }) : '—'
}

export default function DailyPatientsPage({ onOpenPatients }: Props) {
  const [day, setDay] = useState(() => localDateString(new Date()))
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<DailyPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!day) { setLoading(false); return }
    const { fromUtc, toUtc } = dayRange(day)
    const qs = `fromUtc=${encodeURIComponent(fromUtc)}&toUtc=${encodeURIComponent(toUtc)}`
    apiRequest<DailyPatient[]>(`/dentist/daily-patients?${qs}`)
      .then(rows => {
        if (!cancelled) { setItems(rows); setError('') }
      }).catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load daily patients.')
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [day, reload])

  const q = search.trim().toLocaleLowerCase()
  const visible = items.filter(item =>
    [item.patientName, item.reason || '', item.status]
      .some(value => value.toLocaleLowerCase().includes(q)))

  return (
    <div className="dentist-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DENTIST</div>
          <h1>Daily Patients</h1>
          <p>Consultations started on the selected day remain in your saved visit history.</p>
        </div>
        <button type="button" className="secondary-button" disabled={loading}
          onClick={() => { setLoading(true); setReload(n => n + 1) }}>
          <RefreshCw size={17} /> Refresh
        </button>
      </div>

      <div className="panel dentist-filters">
        <label>Visit date
          <input type="date" value={day} onChange={e => { setDay(e.target.value); setLoading(true) }} />
        </label>
        <label>Search
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Patient, reason, status" />
        </label>
      </div>
      {error && <div className="appointment-alert" role="alert">{error}</div>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Daily Visits ({visible.length})</h2>
            <p>Patients appear here automatically when the Dentist starts consultation.</p>
          </div>
          <ClipboardList size={21} />
        </div>
        {loading ? <p>Loading daily patient visits...</p> :
          visible.length === 0 ? (
            <div className="appointment-empty">
              <Users size={28} />
              <h3>No consultations for this selection</h3>
              <p>Start a consultation from the Appointments queue to add a visit.</p>
            </div>
          ) : (
            <div className="dentist-rows">
              {visible.map(item => (
                <article className="dentist-row" key={item.appointmentId}>
                  <div>
                    <strong>{item.patientName}</strong>
                    <p>{item.reason || 'Dental appointment'}</p>
                    <small>Started: {timeText(item.consultationStartedAtUtc)} · Ended: {timeText(item.consultationEndedAtUtc)}</small>
                  </div>
                  <span className="dentist-status">{item.status}</span>
                </article>
              ))}
            </div>
          )}
        <div className="dentist-actions">
          <button type="button" className="secondary-button" onClick={onOpenPatients}>
            <Users size={16} /> Open Patient Directory
          </button>
        </div>
      </section>
    </div>
  )
}
'''

STYLES = r'''.dentist-workspace { display: grid; gap: 20px; }
.dentist-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 14px; }
.dentist-metric { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
.dentist-metric span { color: #607487; font-size: 13px; }
.dentist-metric strong { font-size: 30px; line-height: 1; color: #092b42; }
.dentist-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.dentist-rows { display: grid; gap: 0; }
.dentist-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid #e3eaf0; }
.dentist-row:last-child { border-bottom: 0; }
.dentist-row strong { display: block; }
.dentist-row p { margin: 5px 0; color: #65788a; font-size: 13px; }
.dentist-row small { color: #65788a; }
.dentist-status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; color: #0e7880; font-size: 13px; font-weight: 600; }
.dentist-filters { display: flex; align-items: end; gap: 14px; flex-wrap: wrap; }
.dentist-filters label { display: grid; gap: 7px; font-size: 13px; font-weight: 600; }
.dentist-filters input { border: 1px solid #d3dfe6; border-radius: 9px; padding: 10px 12px; background: transparent; color: inherit; min-width: 180px; }
@media (max-width: 600px) { .dentist-row { flex-direction: column; align-items: start; } }
'''

new_pages = {
    root / 'frontend/src/pages/DentistDashboardPage.tsx': DASHBOARD,
    root / 'frontend/src/pages/DailyPatientsPage.tsx': DAILY,
    root / 'frontend/src/pages/DentistWorkspace.css': STYLES,
}
for path in new_pages:
    if path.exists():
        sys.exit(f'ERROR: {path} already exists; no files changed. Review before overwriting.')

# Everything has been verified in memory before modifying any original file.
backup_dir = Path('/tmp') / ('curvtab_phase1_backup_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
backup_dir.mkdir(parents=True, exist_ok=False)
shutil.copy2(app_path, backup_dir / 'App.tsx')
shutil.copy2(appointments_path, backup_dir / 'AppointmentsPage.tsx')
app_path.write_text(app, encoding='utf-8')
appointments_path.write_text(appointments, encoding='utf-8')
for path, content in new_pages.items():
    path.write_text(content, encoding='utf-8')

print('SUCCESS: Dentist dashboard, Daily Patients, and Start Consultation UI added.')
print('Original frontend files backed up at:', backup_dir)
print('Next: cd frontend && npm run build && npm run lint')
print('No API, database, migrations, or existing patient data were changed.')
