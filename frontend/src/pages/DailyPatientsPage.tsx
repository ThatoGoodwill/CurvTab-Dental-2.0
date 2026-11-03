import { useEffect, useState } from 'react'
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

type Props = {
  onOpenPatients: () => void
  onOpenConsultation: (appointmentId: string) => void
}

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

export default function DailyPatientsPage({ onOpenPatients, onOpenConsultation }: Props) {
  const [day, setDay] = useState(() => localDateString(new Date()))
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<DailyPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!day) return
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
                  <div className="dentist-actions">
                    <span className="dentist-status">{item.status}</span>
                    <button type="button" className="secondary-button"
                      onClick={() => onOpenConsultation(item.appointmentId)}>
                      Open Consultation
                    </button>
                  </div>
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
