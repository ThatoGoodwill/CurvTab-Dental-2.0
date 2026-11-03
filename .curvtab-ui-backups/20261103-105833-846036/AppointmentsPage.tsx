
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  ListOrdered,
  RefreshCw,
  UserRound,
  CheckCircle2,
  Stethoscope,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import './AppointmentsPage.css'

export type AppointmentTab = 'Scheduling' | 'In Queue'

type PatientChoice = {
  id: string
  name: string
}

type Appointment = {
  id: string
  patientId: string
  patientName: string
  startUtc: string
  endUtc: string
  status: string
  reason: string | null
  checkedInAtUtc: string | null
}

type Props = {
  tab: AppointmentTab
  onTabChange: (tab: AppointmentTab) => void
  onOpenPatients: () => void
  role: string
}

function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parsePatients(response: unknown): PatientChoice[] {
  const source = response as
    | Record<string, unknown>
    | unknown[]

  const items = Array.isArray(source)
    ? source
    : source?.items ??
      source?.patients ??
      source?.data ??
      source?.results

  if (!Array.isArray(items)) {
    throw new Error('Unable to read the patient directory.')
  }

  return items.map((value: unknown) => {
    const row = value as Record<string, unknown>

    const id = row.id
    if (typeof id !== 'string') {
      throw new Error('Patient ID is missing.')
    }

    const name =
      (typeof row.fullName === 'string' && row.fullName) ||
      (typeof row.name === 'string' && row.name) ||
      [row.firstName, row.lastName]
        .filter((part) => typeof part === 'string')
        .join(' ')

    return {
      id,
      name: name || 'Patient',
    }
  })
}

function parseAppointments(response: unknown): Appointment[] {
  if (!Array.isArray(response)) {
    throw new Error('Unable to read appointments from the API.')
  }
  return response as Appointment[]
}

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function AppointmentsPage({
  tab,
  onTabChange,
  onOpenPatients,
  role,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(
    () => new Date()
  )

  const [displayMonth, setDisplayMonth] = useState(
    () => new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    )
  )

  const [patients, setPatients] = useState<PatientChoice[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [queue, setQueue] = useState<Appointment[]>([])

  const [patientId, setPatientId] = useState('')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState('30')
  const [reason, setReason] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reload, setReload] = useState(0)

  const canBook =
    role === 'Receptionist' ||
    role === 'PracticeAdmin'

  const canCall = role === 'Dentist'

  const selectedKey = dateKey(selectedDate)
  const year = displayMonth.getFullYear()
  const month = displayMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7

  const calendarDays: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => index + 1
    ),
  ]

  // Retrieve real patients from Claude's existing API.
  useEffect(() => {
    let cancelled = false

    apiRequest<unknown>('/patients')
      .then(parsePatients)
      .then((rows) => {
        if (!cancelled) setPatients(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Failed to load patients.'
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Retrieve bookings for the displayed month plus the live queue.
  useEffect(() => {
    let cancelled = false

    const from = new Date(year, month, 1).toISOString()
    const to = new Date(year, month + 1, 1).toISOString()

    const url =
      `/appointments?fromUtc=${encodeURIComponent(from)}` +
      `&toUtc=${encodeURIComponent(to)}`

    Promise.all([
      apiRequest<unknown>(url),
      apiRequest<unknown>('/appointments/queue'),
    ])
      .then(([bookings, waiting]) => {
        if (cancelled) return

        setAppointments(parseAppointments(bookings))
        setQueue(parseAppointments(waiting))
        setError('')
      })
      .catch((cause: unknown) => {
        if (cancelled) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load appointments.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year, month, reload])

  function refresh() {
    setLoading(true)
    setReload((value) => value + 1)
  }

  function changeMonth(direction: number) {
    setDisplayMonth(new Date(year, month + direction, 1))
    setSelectedDate(new Date(year, month + direction, 1))
    setLoading(true)
  }

  function goToToday() {
    const today = new Date()
    setSelectedDate(today)
    setDisplayMonth(
      new Date(today.getFullYear(), today.getMonth(), 1)
    )
  }

  // Save a booking to PostgreSQL through POST /api/appointments.
  async function createAppointment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!patientId) {
      setError('Please select a patient.')
      return
    }

    const start = new Date(`${selectedKey}T${time}:00`)
    const end = new Date(
      start.getTime() + Number(duration) * 60_000
    )

    if (
      Number.isNaN(start.getTime()) ||
      end <= start
    ) {
      setError('Please select a valid appointment time.')
      return
    }

    setSaving(true)

    try {
      await apiRequest('/appointments', 'POST', {
        patientId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        reason: reason.trim() || null,
      })

      setSuccess('Appointment booked successfully.')
      setPatientId('')
      setReason('')
      refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save appointment.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function performAction(
    id: string,
    action: 'check-in' | 'call' | 'start-consultation'
  ) {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const url = action === 'start-consultation'
        ? `/dentist/appointments/${encodeURIComponent(id)}/start-consultation`
        : `/appointments/${encodeURIComponent(id)}/${action}`

      await apiRequest(url, 'POST')

      setSuccess(
        action === 'check-in'
          ? 'Patient checked in and added to the queue.'
          : action === 'call'
            ? 'Patient called successfully.'
            : 'Consultation started. Patient moved to Daily Patients.'
      )

      refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to update appointment.'
      )
    } finally {
      setSaving(false)
    }
  }

  const selectedAppointments = appointments.filter(
    (item) =>
      dateKey(new Date(item.startUtc)) === selectedKey
  )

  const bookedDays = new Set(
    appointments.map((item) =>
      dateKey(new Date(item.startUtc))
    )
  )

  const displayedDate = selectedDate.toLocaleDateString(
    'en-ZA',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }
  )

  function appointmentTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="appointments-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{role === 'Dentist' ? 'CLINICAL WORKSPACE' : 'FRONT DESK'}</div>
          <h1>Appointments</h1>
          <p>{role === 'Dentist'
            ? 'Call waiting patients and begin their consultations.'
            : 'Schedule visits, check patients in and manage the queue.'}</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={refresh}
          disabled={loading || saving}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <div className="appointment-tabs">
        <button
          type="button"
          className={
            tab === 'Scheduling'
              ? 'primary-button'
              : 'secondary-button'
          }
          onClick={() => onTabChange('Scheduling')}
        >
          <CalendarPlus size={18} /> Scheduling
        </button>

        <button
          type="button"
          className={
            tab === 'In Queue'
              ? 'primary-button'
              : 'secondary-button'
          }
          onClick={() => onTabChange('In Queue')}
        >
          <ListOrdered size={18} />
          In Queue ({queue.length})
        </button>
      </div>

      {error && (
        <div className="appointment-alert" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div
          className="appointment-alert appointment-success"
          role="status"
        >
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      {tab === 'Scheduling' && (
        <div className="appointment-layout">
          {/* INTERACTIVE CALENDAR */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Calendar</h2>
                <p>Select an appointment date.</p>
              </div>
              <CalendarDays size={21} />
            </div>

            <div className="appointment-month">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={20} />
              </button>

              <strong>
                {displayMonth.toLocaleDateString('en-ZA', {
                  month: 'long',
                  year: 'numeric',
                })}
              </strong>

              <button
                type="button"
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="appointment-calendar">
              {weekDays.map((day) => (
                <div className="appointment-weekday" key={day}>
                  {day}
                </div>
              ))}

              {calendarDays.map((day, index) => {
                if (day === null) {
                  return <span key={`blank-${index}`} />
                }

                const date = new Date(year, month, day)
                const key = dateKey(date)
                const selected = key === selectedKey
                const today = key === dateKey(new Date())
                const booked = bookedDays.has(key)

                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      'appointment-day',
                      selected ? 'selected' : '',
                      today ? 'today' : '',
                    ].join(' ')}
                    aria-pressed={selected}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span>{day}</span>
                    {booked && (
                      <span className="ct-calendar-status-dots" aria-hidden="true">
                        {Array.from(new Set(appointments
                          .filter((appointment) => dateKey(new Date(appointment.startUtc)) === key)
                          .map((appointment) => appointment.status)
                        )).slice(0, 4).map((status) => (
                          <span
                            key={status}
                            className={`ct-status-dot ct-status-${status.toLowerCase()}`}
                            title={status}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={goToToday}
            >
              Today
            </button>

            <div className="ct-calendar-legend" aria-label="Appointment calendar color legend">
  <span><i className="ct-legend-scheduled"/>Scheduled</span>
  <span><i className="ct-legend-progress"/>In progress</span>
  <span><i className="ct-legend-checkout"/>Checkout</span>
  <span><i className="ct-legend-done"/>Checked out</span>
</div>
            <p className="panel-note">
              Colored dots show saved appointment statuses for each day.
            </p>
          </section>

          {/* BOOKING FORM AND SELECTED DAY */}
          <div className="appointment-right">
            {canBook && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Book Appointment</h2>
                    <p>{displayedDate}</p>
                  </div>
                  <CalendarPlus size={21} />
                </div>

                <form
                  className="appointment-form"
                  onSubmit={createAppointment}
                >
                  <label htmlFor="booking-patient">
                    Patient
                  </label>

                  <select
                    id="booking-patient"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    required
                  >
                    <option value="">Select patient</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name}
                      </option>
                    ))}
                  </select>

                  {patients.length === 0 && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={onOpenPatients}
                    >
                      <UserRound size={16} />
                      Register a Patient
                    </button>
                  )}

                  <div className="appointment-form-row">
                    <div>
                      <label htmlFor="booking-time">Time</label>
                      <input
                        id="booking-time"
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="booking-duration">
                        Duration
                      </label>
                      <select
                        id="booking-duration"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                      >
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="45">45 minutes</option>
                        <option value="60">1 hour</option>
                      </select>
                    </div>
                  </div>

                  <label htmlFor="booking-reason">
                    Reason for visit
                  </label>

                  <input
                    id="booking-reason"
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Dental check-up"
                  />

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving || loading}
                  >
                    <CalendarPlus size={17} />
                    {saving ? 'Saving...' : 'Save Appointment'}
                  </button>
                </form>
              </section>
            )}

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Daily Appointments</h2>
                  <p>{displayedDate}</p>
                </div>
                <span>{selectedAppointments.length} booked</span>
              </div>

              {loading ? (
                <p>Loading bookings...</p>
              ) : selectedAppointments.length === 0 ? (
                <p className="appointment-empty">
                  No appointments scheduled for this date.
                </p>
              ) : (
                <div className="appointment-list">
                  {selectedAppointments.map((item) => (
                    <article
                      className="appointment-entry"
                      key={item.id}
                    >
                      <div>
                        <strong>{item.patientName}</strong>
                        <p>
                          {appointmentTime(item.startUtc)}
                          {' · '}
                          {item.reason || 'Dental appointment'}
                        </p>
                        <small className={`ct-status ct-status-${item.status.toLowerCase()}`}>{item.status}</small>
                      </div>

                      {item.status === 'Scheduled' && canBook && (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={saving}
                          onClick={() =>
                            void performAction(item.id, 'check-in')
                          }
                        >
                          Check In
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
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* LIVE QUEUE */}
      {tab === 'In Queue' && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Live Patient Queue</h2>
              <p>Patients who have checked in at reception.</p>
            </div>
            <ListOrdered size={21} />
          </div>

          {loading ? (
            <p>Loading waiting patients...</p>
          ) : queue.length === 0 ? (
            <div className="appointment-empty">
              <ListOrdered size={28} />
              <h3>Queue is empty</h3>
              <p>Check in a scheduled patient to add them here.</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onTabChange('Scheduling')}
              >
                Open Scheduling
              </button>
            </div>
          ) : (
            <div className="appointment-list">
              {queue.map((item, index) => (
                <article
                  key={item.id}
                  className="appointment-entry"
                >
                  <div className="queue-number">
                    {index + 1}
                  </div>

                  <div className="appointment-entry-info">
                    <strong>{item.patientName}</strong>
                    <p>
                      {item.reason || 'Dental appointment'}
                    </p>
                    <small className={`ct-status ct-status-${item.status.toLowerCase()}`}>Status: {item.status}</small>
                  </div>

                  {canCall && item.status === 'Waiting' && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving}
                      onClick={() =>
                        void performAction(item.id, 'call')
                      }
                    >
                      <Stethoscope size={16} />
                      Call Patient
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
                  )}
                </article>
              ))}
            </div>
          )}

          <p className="panel-note">
            Receptionists check patients in.
            Dentists can call waiting patients.
            Once a Dentist starts consultation, the visit appears in Daily Patients.
          </p>
        </section>
      )}
    </div>
  )
}
