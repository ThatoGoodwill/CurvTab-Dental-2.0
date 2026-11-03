import { useEffect, useState } from 'react'
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
