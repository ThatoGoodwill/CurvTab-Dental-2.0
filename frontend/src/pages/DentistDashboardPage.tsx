import { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, Stethoscope, Users } from 'lucide-react'
import { apiRequest } from '../services/api'
import './DentistWorkspace.css'
import RoleDashboardCarousel from './RoleDashboardCarousel'

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
  onOpenPatients: () => void
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
  onOpenPatients,
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
      <RoleDashboardCarousel eyebrow="CLINICAL OPERATIONS · AUTHORISED DATA"
        loading={loading} onRefresh={() => { setLoading(true); setReload(n => n + 1) }}
        slides={[
          { title: 'Patient Queue', content: (
            <section className="ct-role-panel ct-dentist-report">
              <header><div><h2>Waiting and Called Patients</h2>
                <p>Live queue. Open the patient queue to call patients or begin consultations.</p></div>
                <button type="button" className="secondary-button" onClick={onOpenAppointments}>
                  <Users size={15}/> Open queue
                </button>
              </header>
              {loading && queue.length === 0 ? <p className="ct-role-empty">Loading patient queue…</p> :
                error && queue.length === 0 ? <p className="ct-role-empty">Queue information unavailable.</p> :
                queue.length === 0 ? <p className="ct-role-empty">No patients are currently in the queue.</p> :
                <div className="dentist-rows">
                  {queue.map(item => <div className="dentist-row" key={item.id}>
                    <div><strong>{item.patientName}</strong><p>{item.reason || 'Dental appointment'}</p></div>
                    <span className="dentist-status"><Stethoscope size={15}/>{item.status}</span>
                  </div>)}
                </div>}
            </section>
          ) },
          { title: "Today's Clinical Progress", content: (
            <section className="ct-role-panel ct-dentist-report">
              <header><div><h2>Patient flow</h2><p>Today's appointment and attendance counts from the clinical API.</p></div>
                <button className="secondary-button" type="button" onClick={onOpenPatients}>
                  <ClipboardList size={15}/> Patients & Consultations
                </button>
              </header>
              <div className="ct-clinical-bar-chart" role="img"
                aria-label={measures.map(item => `${item.label}: ${item.value}`).join(', ')}>
                {measures.map(item => {
                  const max = Math.max(1, ...measures.map(row => row.value))
                  const height = Math.max(5, (item.value / max) * 100)
                  return <div key={item.label} className="ct-clinical-bar-column">
                    <strong>{loading && !stats ? '…' : error && !stats ? '—' : item.value}</strong>
                    <div className="ct-clinical-bar-track"><div className="ct-clinical-bar-fill"
                      style={{height: `${height}%`}}/></div>
                    <span>{item.label}</span>
                  </div>
                })}
              </div>
              <p className="ct-role-hint">Only records returned for your authorised clinical workspace appear here.</p>
            </section>
          ) }
        ]}/>

    </div>
  )
}
