#!/usr/bin/env python3
"""CurvTab Dental 2.0: hover cards + live appointment name popovers.

Run from repository root in Codespaces:
    python3 curvtab_calendar_hover_upgrade.py

Frontend only; preserves backend and patient data. Backs up modified files.
"""
from pathlib import Path
from datetime import datetime, timezone
import shutil
import sys
import textwrap

ROOT = Path.cwd()
SRC = ROOT / 'frontend' / 'src'
APP_COMPONENT = SRC / 'components' / 'ClinicDashboardEnhancements.tsx'
APPOINTMENTS = SRC / 'pages' / 'AppointmentsPage.tsx'
LIVE_COMPONENT_PATH = SRC / 'components' / 'LiveAppointmentCalendar.tsx'
CSS_PATH = SRC / 'CurvTabCalendarHover.css'
MARKER = 'CT_HOVER_CALENDAR_V1'

LIVE_COMPONENT = r'''import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { apiRequest } from '../services/api'

type Appointment = {
  id: string
  patientName: string
  startUtc: string
  status: string
}

type Props = {
  onOpenAppointments: () => void
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit',
  })
}

function statusClass(status: string): string {
  return status.toLowerCase().replace(/[^a-z]/g, '')
}

function parseAppointments(data: unknown): Appointment[] {
  if (!Array.isArray(data)) throw new Error('Could not read the appointment calendar.')
  return data.filter((value: unknown): value is Appointment => {
    if (!value || typeof value !== 'object') return false
    const row = value as Record<string, unknown>
    return typeof row.id === 'string' &&
      typeof row.patientName === 'string' &&
      typeof row.startUtc === 'string' &&
      typeof row.status === 'string'
  })
}

// CT_HOVER_CALENDAR_V1 — The calendar reads real, authorised appointment data.
export default function LiveAppointmentCalendar({ onOpenAppointments }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()))
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  const year = month.getFullYear()
  const monthNumber = month.getMonth()
  const daysInMonth = new Date(year, monthNumber + 1, 0).getDate()
  const firstWeekday = (new Date(year, monthNumber, 1).getDay() + 6) % 7
  const calendarDays: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  useEffect(() => {
    let cancelled = false
    const from = new Date(year, monthNumber, 1).toISOString()
    const to = new Date(year, monthNumber + 1, 1).toISOString()
    const url = `/appointments?fromUtc=${encodeURIComponent(from)}&toUtc=${encodeURIComponent(to)}`

    apiRequest<unknown>(url)
      .then((data) => {
        if (cancelled) return
        setRows(parseAppointments(data))
        setError('')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setRows([])
        setError(cause instanceof Error ? cause.message : 'Unable to load appointments.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [year, monthNumber, reload])

  function moveMonth(direction: number) {
    const next = new Date(year, monthNumber + direction, 1)
    setMonth(next)
    setSelectedDay(dateKey(next))
    setLoading(true)
    setError('')
  }

  function rowsForDay(key: string): Appointment[] {
    return rows.filter((row) => dateKey(new Date(row.startUtc)) === key)
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
  }

  const selectedAppointments = rowsForDay(selectedDay)
  const selectedDate = new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <section className="ct-live-calendar panel" aria-label="Live appointment calendar">
      <div className="ct-live-cal-heading">
        <div className="ct-live-cal-title">
          <CalendarDays size={20} aria-hidden="true" />
          <div>
            <h2>Appointments Calendar</h2>
            <p>Hover or focus a date to see patient names and times.</p>
          </div>
        </div>
        <div className="ct-live-cal-actions">
          <button type="button" className="ct-live-icon" aria-label="Refresh appointments"
            disabled={loading} onClick={() => { setLoading(true); setReload((n) => n + 1) }}>
            <RefreshCw size={17} />
          </button>
          <button type="button" className="ct-live-icon" aria-label="Previous month"
            onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
          <strong aria-live="polite">{month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" className="ct-live-icon" aria-label="Next month"
            onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
          <button type="button" className="ct-live-open" onClick={onOpenAppointments}>
            Open Scheduling
          </button>
        </div>
      </div>

      {error && <p className="ct-live-error" role="alert">{error}</p>}
      <div className="ct-live-cal-grid" aria-busy={loading}>
        {weekdays.map((day) => <div key={day} className="ct-live-weekday">{day}</div>)}
        {calendarDays.map((day, index) => {
          if (day === null) return <span className="ct-live-empty" key={`blank-${index}`} />
          const date = new Date(year, monthNumber, day)
          const key = dateKey(date)
          const booked = rowsForDay(key)
          const statusNames = Array.from(new Set(booked.map((row) => row.status)))
          const isToday = key === dateKey(new Date())
          return (
            <div className="ct-live-cell" key={key}>
              <button type="button"
                className={`ct-live-day${selectedDay === key ? ' ct-live-selected' : ''}${isToday ? ' ct-live-today' : ''}`}
                aria-label={`${day} ${month.toLocaleDateString('en-ZA', { month: 'long' })}, ${booked.length} appointments`}
                aria-describedby={booked.length ? `ct-hover-${key}` : undefined}
                aria-pressed={selectedDay === key}
                onClick={() => setSelectedDay(key)}>
                <span>{day}</span>
                {booked.length > 0 && <span className="ct-live-status-dots" aria-hidden="true">
                  {statusNames.slice(0, 5).map((status) => (
                    <i key={status} className={`ct-hover-status-${statusClass(status)}`} />
                  ))}
                </span>}
              </button>
              {booked.length > 0 && (
                <div className="ct-hover-popover" id={`ct-hover-${key}`} role="tooltip">
                  <strong>{date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
                  <small>{booked.length} appointment{booked.length === 1 ? '' : 's'}</small>
                  <ul>
                    {booked.map((appt) => (
                      <li key={appt.id}>
                        <time>{timeLabel(appt.startUtc)}</time>
                        <span>{appt.patientName}</span>
                        <em>{appt.status}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="ct-live-cal-footer">
        <div>
          <strong>{selectedDate}</strong>
          <span>{loading ? 'Loading...' : `${selectedAppointments.length} appointment${selectedAppointments.length === 1 ? '' : 's'}`}</span>
        </div>
        <ul aria-label={`Appointments on ${selectedDate}`}>
          {!loading && !error && selectedAppointments.length === 0 && <li>No appointments for this date.</li>}
          {!loading && !error && selectedAppointments.map((appt) => (
            <li key={appt.id}>
              <time>{timeLabel(appt.startUtc)}</time>
              <span>{appt.patientName}</span>
              <small>{appt.status}</small>
            </li>
          ))}
        </ul>
      </div>
      <p className="ct-live-cal-note">Displays saved appointments for your practice (up to 500 per month).</p>
    </section>
  )
}
'''

CSS = r'''/* CT_HOVER_CALENDAR_V1 — Visual-only additions. No data or API changes. */
/* Smooth and accessible movement across the existing dashboard */
.app-shell :is(.stat-card,.ct-chart-card,.panel,.ct-hero,.ct-live-calendar) {
  will-change: auto;
  transition: transform .26s cubic-bezier(.2,.8,.2,1), box-shadow .26s ease, border-color .26s ease;
}
@media (hover:hover) and (prefers-reduced-motion:no-preference) {
  .app-shell :is(.stat-card,.ct-chart-card,.panel,.ct-hero):hover {
    transform: translateY(-5px);
    border-color: rgba(24,151,197,.35);
    box-shadow: 0 20px 42px rgba(20,66,105,.15);
  }
  .app-shell :is(.stat-card,.ct-chart-card,.panel):hover :is(.stat-icon,.ct-chart-number) {
    transform: scale(1.06);
  }
}
.app-shell :is(.stat-icon,.ct-chart-number) { transition: transform .23s ease; }
.app-shell :is(.stat-card,.ct-chart-card,.panel):focus-within {
  border-color:#53bcc8;
  box-shadow:0 10px 27px rgba(11,125,153,.14);
}

/* Hover cards must not cut off popovers. */
.app-shell .ct-live-calendar { overflow: visible; }
.app-shell .ct-live-cal-heading { display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px; }
.app-shell .ct-live-cal-title { display:flex;align-items:center;gap:10px; }
.app-shell .ct-live-cal-title svg { color:#2779d8; }
.app-shell .ct-live-cal-title h2 { margin:0;font-size:18px;letter-spacing:-.025em; }
.app-shell .ct-live-cal-title p { margin:4px 0 0;font-size:12px;color:var(--ct-muted,#66778c); }
.app-shell .ct-live-cal-actions { display:flex;align-items:center;flex-wrap:wrap;gap:7px; }
.app-shell .ct-live-cal-actions strong {font-size:13px;min-width:103px;text-align:center;}
.app-shell .ct-live-icon {display:grid;place-items:center;width:33px;height:34px;border:1px solid var(--ct-line,#dce9ef);background:var(--ct-surface,#fff);color:var(--ct-text,#173149);border-radius:9px;cursor:pointer;transition:transform .2s,border-color .2s;}
.app-shell .ct-live-icon:hover:not(:disabled) { transform:translateY(-2px);border-color:#2a9fb4; }
.app-shell .ct-live-icon:disabled { opacity:.5;cursor:wait; }
.app-shell .ct-live-open {border:0;border-radius:10px;padding:10px 14px;background:linear-gradient(110deg,#1b8fba,#5564ed);color:white;font-weight:750;cursor:pointer;transition:transform .2s,box-shadow .2s;}
.app-shell .ct-live-open:hover {transform:translateY(-2px);box-shadow:0 10px 20px rgba(45,106,188,.18);}
.app-shell .ct-live-error {margin:8px 0;padding:10px 12px;background:#fff0f1;color:#a52b46;border-radius:9px;}
.app-shell .ct-live-cal-grid,.app-shell .appointment-calendar {overflow:visible;}
.app-shell .ct-live-cal-grid {display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;}
.app-shell .ct-live-weekday {text-align:center;padding:9px 0;font-size:11px;font-weight:800;color:var(--ct-muted,#697e91);}
.app-shell .ct-live-empty {min-height:50px;}
.app-shell .ct-live-cell,.app-shell .ct-day-hover-wrap {position:relative;min-width:0;z-index:auto;}
.app-shell .ct-live-cell:hover,.app-shell .ct-live-cell:focus-within,
.app-shell .ct-day-hover-wrap:hover,.app-shell .ct-day-hover-wrap:focus-within {z-index:70;}
.app-shell .ct-live-day {width:100%;min-height:52px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;color:var(--ct-text,#16334b);background:var(--ct-surface,#fff);border:1px solid var(--ct-line,#dce9ef);border-radius:10px;cursor:pointer;transition:background .2s,transform .2s,box-shadow .2s;}
.app-shell .ct-live-day:hover,.app-shell .ct-live-day:focus-visible {background:#ebf6ff;transform:translateY(-2px);box-shadow:0 6px 13px rgba(20,96,155,.11);border-color:#5bc2d8;}
.app-shell .ct-live-selected {background:linear-gradient(130deg,#166eaa,#6067e8)!important;color:white!important;border-color:transparent!important;}
.app-shell .ct-live-today:not(.ct-live-selected) {outline:2px solid #1cadad;outline-offset:-2px;}
.app-shell .ct-live-status-dots {display:flex;align-items:center;justify-content:center;gap:3px;flex-wrap:wrap;}
.app-shell .ct-live-status-dots i {display:block;width:6px;height:6px;border-radius:50%;background:#6689bd;}
.app-shell .ct-hover-status-scheduled {background:#3b82f6!important;}
.app-shell .ct-hover-status-waiting,.app-shell .ct-hover-status-called,.app-shell .ct-hover-status-inconsultation {background:#0ea998!important;}
.app-shell .ct-hover-status-awaitingcheckout {background:#f5a623!important;}
.app-shell .ct-hover-status-checkedout {background:#8b5cf6!important;}
.app-shell .ct-hover-status-cancelled,.app-shell .ct-hover-status-noshow {background:#94a3b8!important;}

/* Tooltip is a sibling of the date button, not nested in a button. */
.app-shell .ct-hover-popover {position:absolute;left:50%;bottom:calc(100% + 8px);transform:translate(-50%,6px);width:min(300px,75vw);padding:12px 13px;background:#152e46;color:white;border:1px solid #35556b;border-radius:13px;box-shadow:0 18px 34px rgba(10,31,53,.26);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .18s,transform .18s;}
.app-shell .ct-hover-popover strong {display:block;font-size:12px;color:#fff;}
.app-shell .ct-hover-popover>small {display:block;font-size:11px;color:#acd8e9;margin:3px 0 9px;}
.app-shell .ct-hover-popover ul {list-style:none;padding:0;margin:0;display:grid;gap:7px;max-height:235px;overflow-y:auto;}
.app-shell .ct-hover-popover li {display:grid;grid-template-columns:auto 1fr;align-items:center;gap:4px 9px;padding:6px 0;border-top:1px solid rgba(255,255,255,.12);font-size:11px;}
.app-shell .ct-hover-popover li time {font-variant-numeric:tabular-nums;color:#a2efe6;font-weight:800;}
.app-shell .ct-hover-popover li span {min-width:0;overflow-wrap:anywhere;color:#fff;font-weight:700;}
.app-shell .ct-hover-popover li em {grid-column:2;font-size:10px;font-style:normal;color:#bcd0e4;}
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):hover>.ct-hover-popover,
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):focus-within>.ct-hover-popover {pointer-events:auto;opacity:1;visibility:visible;transform:translate(-50%,0);}
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):nth-child(7n + 1)>.ct-hover-popover {left:0;transform:translate(0,6px);}
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):nth-child(7n + 1):hover>.ct-hover-popover,
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):nth-child(7n + 1):focus-within>.ct-hover-popover {transform:translate(0,0);}
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):nth-child(7n)>.ct-hover-popover {left:auto;right:0;transform:translate(0,6px);}
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):nth-child(7n):hover>.ct-hover-popover,
.app-shell :is(.ct-live-cell,.ct-day-hover-wrap):nth-child(7n):focus-within>.ct-hover-popover {transform:translate(0,0);}

.app-shell .ct-live-cal-footer {display:flex;align-items:flex-start;gap:12px;border-top:1px solid var(--ct-line,#dbe7ed);margin-top:15px;padding-top:13px;}
.app-shell .ct-live-cal-footer>div {display:grid;gap:3px;min-width:130px;}
.app-shell .ct-live-cal-footer>div strong {font-size:12px;}
.app-shell .ct-live-cal-footer>div span {font-size:11px;color:var(--ct-muted,#647a8f);}
.app-shell .ct-live-cal-footer ul {list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;max-height:180px;overflow-y:auto;}
.app-shell .ct-live-cal-footer li {display:flex;align-items:center;gap:7px;border-radius:8px;background:var(--ct-subtle,#eaf3f8);padding:6px 8px;font-size:11px;}
.app-shell .ct-live-cal-footer time {color:#02848a;font-weight:800;}
.app-shell .ct-live-cal-footer li span {font-weight:650;}
.app-shell .ct-live-cal-footer li small {color:var(--ct-muted,#718397);}
.app-shell .ct-live-cal-note {font-size:11px;color:var(--ct-muted,#6f8594);margin-top:10px;}

/* Existing Scheduling calendar retains click-to-select while gaining hover details. */
.app-shell .ct-day-hover-wrap>.appointment-day {width:100%;height:100%;min-height:47px;}
.app-shell .ct-day-hover-wrap .ct-hover-popover {text-align:left;}
.app-shell .ct-day-hover-wrap .ct-calendar-status-dots {pointer-events:none;}
@media (max-width:700px) {
  .app-shell .ct-live-cal-footer {flex-direction:column;}
  .app-shell .ct-live-cal-heading {align-items:flex-start;}
  .app-shell .ct-live-cal-actions {width:100%;justify-content:space-between;}
  .app-shell .ct-hover-popover {width:min(250px,77vw);}
}
@media (prefers-reduced-motion:reduce) {
  .app-shell :is(.stat-card,.ct-chart-card,.panel,.ct-hero,.ct-live-day,.ct-hover-popover) {transition:none!important;transform:none!important;}
}
'''

if not APP_COMPONENT.exists() or not APPOINTMENTS.exists():
    sys.exit('ERROR: Dashboard or Appointments file missing. Run from the CurvTab-Dental-2.0 root.')
if LIVE_COMPONENT_PATH.exists() or CSS_PATH.exists():
    sys.exit('ERROR: Hover upgrade files already exist. Refusing to overwrite.')

component = APP_COMPONENT.read_text(encoding='utf-8')
appointments = APPOINTMENTS.read_text(encoding='utf-8')
if MARKER in component or MARKER in appointments:
    sys.exit('ERROR: Hover upgrade already applied.')

# Insert the live calendar in the existing enhanced dashboard without rewriting its other features.
import_anchor = "import './ClinicDashboardEnhancements.css'"
render_anchor = '<PracticeActivityCharts role={role} />'
if component.count(import_anchor) != 1 or component.count(render_anchor) != 1:
    sys.exit('ERROR: Dashboard component differs from the installed visual upgrade. No changes made.')
component = component.replace(import_anchor,
    "import LiveAppointmentCalendar from './LiveAppointmentCalendar'\nimport '../CurvTabCalendarHover.css'\n" + import_anchor, 1)
component = component.replace(render_anchor,
    '''{/* CT_HOVER_CALENDAR_V1: Practice-scoped, real appointment names. */}
      {['PracticeAdmin', 'Receptionist', 'Dentist'].includes(role) && (
        <LiveAppointmentCalendar onOpenAppointments={onPrimaryAction} />
      )}
      ''' + render_anchor, 1)

# Existing Scheduling calendar: wrap date button in a cell, and place tooltip beside it.
cal_anchor = '{calendarDays.map((day, index) => {'
if appointments.count(cal_anchor) != 1:
    sys.exit('ERROR: Could not find unique Scheduling calendar. No changes made.')
cal_start = appointments.index(cal_anchor)
cal_end_pattern = '\n                  </button>\n                )\n              })}'
cal_end = appointments.find(cal_end_pattern, cal_start)
if cal_end == -1:
    sys.exit('ERROR: Scheduling date button structure changed. No changes made.')
cal_end += len(cal_end_pattern)
calendar = appointments[cal_start:cal_end]

booked_anchor = 'const booked = bookedDays.has(key)'
start_btn_anchor = 'return (\n                  <button'
if calendar.count(booked_anchor) != 1 or calendar.count(start_btn_anchor) != 1:
    sys.exit('ERROR: Calendar booking marker or button changed. No changes made.')
calendar = calendar.replace(booked_anchor, '''const booked = bookedDays.has(key)
                const dayPatients = appointments
                  .filter((appointment) => dateKey(new Date(appointment.startUtc)) === key)
                  .sort((a, b) => a.startUtc.localeCompare(b.startUtc))''', 1)
calendar = calendar.replace(start_btn_anchor, '''return (
                  <div className="ct-day-hover-wrap" key={key}>
                  <button''', 1)
calendar = calendar.replace('aria-pressed={selected}', '''aria-pressed={selected}
                    aria-label={`${day} ${displayMonth.toLocaleDateString('en-ZA', { month: 'long' })}: ${dayPatients.length} appointments`}
                    aria-describedby={dayPatients.length ? `ct-scheduling-hover-${key}` : undefined}''', 1)
old_tail = '\n                  </button>\n                )\n              })}'
new_tail = '''
                  </button>
                  {dayPatients.length > 0 && (
                    <div className="ct-hover-popover" role="tooltip" id={`ct-scheduling-hover-${key}`}>
                      <strong>{date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
                      <small>{dayPatients.length} appointment{dayPatients.length === 1 ? '' : 's'}</small>
                      <ul>
                        {dayPatients.map((patient) => (
                          <li key={patient.id}>
                            <time>{appointmentTime(patient.startUtc)}</time>
                            <span>{patient.patientName}</span>
                            <em>{patient.status}</em>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  </div>
                )
              })}'''
if old_tail not in calendar:
    sys.exit('ERROR: Calendar closing button structure changed. No changes made.')
calendar = calendar.replace(old_tail, new_tail, 1)
appointments = appointments[:cal_start] + calendar + appointments[cal_end:]

# All preflight checks complete. Backup before writing.
backup = ROOT / '.curvtab-ui-backups' / datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(APP_COMPONENT, backup / APP_COMPONENT.name)
shutil.copy2(APPOINTMENTS, backup / APPOINTMENTS.name)
try:
    LIVE_COMPONENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    LIVE_COMPONENT_PATH.write_text(textwrap.dedent(LIVE_COMPONENT).lstrip(), encoding='utf-8')
    CSS_PATH.write_text(textwrap.dedent(CSS).lstrip(), encoding='utf-8')
    APP_COMPONENT.write_text(component, encoding='utf-8')
    APPOINTMENTS.write_text(appointments, encoding='utf-8')
except Exception as exc:
    shutil.copy2(backup / APP_COMPONENT.name, APP_COMPONENT)
    shutil.copy2(backup / APPOINTMENTS.name, APPOINTMENTS)
    LIVE_COMPONENT_PATH.unlink(missing_ok=True)
    CSS_PATH.unlink(missing_ok=True)
    sys.exit(f'ERROR: Installation failed and files were restored: {exc}')

print('SUCCESS: Live dashboard calendar and Scheduling hover patient lists installed.')
print('SUCCESS: Hover card animations installed; prefers-reduced-motion respected.')
print('Backup:', backup)
print('NEXT: cd frontend && npm run build && npm run lint')
print('IMPORTANT: The existing backend returns up to 500 appointments per selected month.')
