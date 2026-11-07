import { useEffect, useState } from 'react'
import { CalendarDays, Users, Clock3, CheckCircle2, Building2, RefreshCw } from 'lucide-react'
import { apiRequest } from '../services/api'
import './ClientDashboardKpis.css'

type Props = {
  role: string
  onPrimaryAction: () => void
}

type AppointmentRow = {
  startUtc: string
  status: string
}

type PracticeRow = { isActive: boolean }

type Metrics = {
  appointmentsToday: number | null
  patients: number | null
  awaitingCheckout: number | null
  checkedOutToday: number | null
  practices: number | null
  activePractices: number | null
  inactivePractices: number | null
}

const initialMetrics: Metrics = {
  appointmentsToday: null,
  patients: null,
  awaitingCheckout: null,
  checkedOutToday: null,
  practices: null,
  activePractices: null,
  inactivePractices: null,
}

function dayWindow() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function patientTotal(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  // Only show an authoritative API total. A paginated 'items' array length is NOT
  // the total number of registered patients.
  for (const key of ['totalCount', 'totalItems', 'total', 'count']) {
    const count = data[key]
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) return count
  }
  return null
}

function appointmentRows(value: unknown): AppointmentRow[] {
  if (!Array.isArray(value)) throw new Error('Appointments response is not a list.')
  return value.filter((item: unknown): item is AppointmentRow => {
    if (!item || typeof item !== 'object') return false
    const row = item as Record<string, unknown>
    return typeof row.startUtc === 'string' && typeof row.status === 'string'
  })
}

export default function ClientDashboardKpis({ role, onPrimaryAction }: Props) {
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshId, setRefreshId] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (role === 'SuperAdmin') {
          const raw = await apiRequest<unknown>('/platform/practices')
          if (!Array.isArray(raw)) throw new Error('Unable to read practices.')
          const rows = raw.filter((item: unknown): item is PracticeRow =>
            Boolean(item && typeof item === 'object' &&
              typeof (item as Record<string, unknown>).isActive === 'boolean'))
          if (!cancelled) setMetrics({
            ...initialMetrics,
            practices: rows.length,
            activePractices: rows.filter((row) => row.isActive).length,
            inactivePractices: rows.filter((row) => !row.isActive).length,
          })
          return
        }
        const { start, end } = dayWindow()
        const url = `/appointments?fromUtc=${encodeURIComponent(start.toISOString())}&toUtc=${encodeURIComponent(end.toISOString())}`
        // Patient directory is optional here: a failed patient request must not
        // hide otherwise valid appointment statistics.
        const [appointmentsResult, patientsResult] = await Promise.allSettled([
          apiRequest<unknown>(url),
          apiRequest<unknown>('/patients'),
        ])
        if (appointmentsResult.status === 'rejected') throw appointmentsResult.reason
        const rows = appointmentRows(appointmentsResult.value)
        const totalPatients = patientsResult.status === 'fulfilled'
          ? patientTotal(patientsResult.value) : null
        if (!cancelled) setMetrics({
          ...initialMetrics,
          appointmentsToday: rows.length,
          patients: totalPatients,
          awaitingCheckout: rows.filter((row) => row.status === 'AwaitingCheckout').length,
          checkedOutToday: rows.filter((row) => row.status === 'CheckedOut').length,
        })
      } catch (cause: unknown) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load metrics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [role, refreshId])

  const superAdmin = role === 'SuperAdmin'
  const cards = superAdmin ? [
    { title: 'Registered Practices', value: metrics.practices, icon: Building2, className: 'appointments' },
    { title: 'Active Practices', value: metrics.activePractices, icon: CheckCircle2, className: 'patients' },
    { title: 'Inactive Practices', value: metrics.inactivePractices, icon: Clock3, className: 'pending' },
  ] : [
    { title: "Today's Appointments", value: metrics.appointmentsToday, icon: CalendarDays, className: 'appointments' },
    { title: 'Registered Patients', value: metrics.patients, icon: Users, className: 'patients' },
    { title: 'Awaiting Checkout Today', value: metrics.awaitingCheckout, icon: Clock3, className: 'pending' },
    { title: 'Checked Out (Today’s Visits)', value: metrics.checkedOutToday, icon: CheckCircle2, className: 'completed' },
  ]

  return (
    <section className="client-kpis" aria-label="Practice dashboard summary">
      <div className="client-kpis-toolbar">
        <span>Practice overview · live records</span>
        <button type="button" onClick={() => { setLoading(true); setRefreshId((value) => value + 1) }}
          disabled={loading} aria-label="Refresh dashboard summary" title="Refresh dashboard summary">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && <p className="client-kpis-error" role="alert">{error}</p>}
      <div className="client-kpis-grid">
        {cards.map((card, index) => {
          const Icon = card.icon
          const isPrimary = index === 0
          return (
            <article className={`client-kpi client-kpi-${card.className}`} key={card.title}>
              <span className="client-kpi-icon" aria-hidden="true"><Icon size={23} /></span>
              <div className="client-kpi-text">
                <span className="client-kpi-label">{card.title}</span>
                <strong className="client-kpi-value" aria-busy={loading}>
                  {loading || error ? '—' : card.value === null ? '—' : card.value.toLocaleString('en-ZA')}
                </strong>
              </div>
              {isPrimary && (
                <button type="button" className="client-kpi-action" onClick={onPrimaryAction}
                  aria-label={superAdmin ? 'Open dental practices' : 'Open appointments'} title="Open workspace">
                  <span aria-hidden="true">›</span>
                </button>
              )}
            </article>
          )
        })}
      </div>
      {!superAdmin && !loading && !error && metrics.patients === null && (
        <p className="client-kpis-hint">Patient total unavailable from the current directory response; no number has been guessed.</p>
      )}
    </section>
  )
}
