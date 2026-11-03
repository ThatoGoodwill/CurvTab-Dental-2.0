import { useEffect, useState } from 'react'
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
