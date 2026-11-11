import { useEffect, useState } from 'react'
import { FlaskConical, RefreshCw, PackageCheck, Truck, ShieldCheck, Clock3 } from 'lucide-react'
import { apiRequest } from '../services/api'
import './RoleOperationsDashboard.css'

type LabItem = {
  id: string
  manufacturingStatus: string
  qaStatus: string
  custodyStatus: string
  expectedAtUtc: string | null
}
type LabOrder = {
  id: string
  reference: string
  patientName: string
  status: string
  items: LabItem[]
}
type LabManifest = { id: string; status: string; direction: string }
type LabCorrection = { id: string; status: string }
type LabDashboardResponse = {
  partnerMode: boolean
  orders: LabOrder[]
  manifests: LabManifest[]
  corrections: LabCorrection[]
}

export default function LabTechnicianDashboard({ onOpenLaboratory }: { onOpenLaboratory: () => void }) {
  const [data, setData] = useState<LabDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    apiRequest<LabDashboardResponse>('/laboratory/dashboard')
      .then(result => {
        if (!active) return
        setData(result)
        setError('')
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Lab orders unavailable.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])
  const orders = data?.orders ?? []
  const activeOrders = orders.filter(order => order.status !== 'Closed')
  const items = activeOrders.flatMap(order => order.items)
  const counts = [
    { label: 'Assigned open orders', value: activeOrders.length, Icon: FlaskConical },
    { label: 'Production in progress', value: items.filter(item => /inprogress|production|manufacturing/i.test(item.manufacturingStatus)).length, Icon: Clock3 },
    { label: 'QA required', value: items.filter(item => /pending|required|failed|rejected/i.test(item.qaStatus)).length, Icon: ShieldCheck },
    { label: 'Ready for return', value: items.filter(item => /complete/i.test(item.manufacturingStatus) && !/received|practice/i.test(item.custodyStatus)).length, Icon: PackageCheck },
  ]
  const priority = [...activeOrders].sort((a, b) => {
    const aDue = Math.min(...a.items.map(x => x.expectedAtUtc ? Date.parse(x.expectedAtUtc) : Infinity))
    const bDue = Math.min(...b.items.map(x => x.expectedAtUtc ? Date.parse(x.expectedAtUtc) : Infinity))
    return aDue - bDue
  }).slice(0, 5)
  return <section className="ct-role-dashboard" aria-label="Laboratory work dashboard">
    <header className="ct-role-heading">
      <div>
        <div className="ct-role-eyebrow">LABORATORY · LIVE WORK</div>
        <h1>Laboratory Dashboard</h1>
        <p>Your assigned cases, production progress, quality checks and returns.</p>
      </div>
      <button type="button" className="secondary-button" disabled={loading}
        onClick={() => { setLoading(true); setReload(i => i + 1) }}>
        <RefreshCw size={15}/> Refresh
      </button>
    </header>
    {error && <p className="ct-role-alert" role="alert">{error}</p>}
    <div className="ct-role-metrics">
      {counts.map(({label,value,Icon})=><article className="ct-role-metric" key={label}>
        <Icon size={17} aria-hidden="true"/>
        <span>{label}</span>
        <strong>{loading && !data ? '…' : error && !data ? '—' : value}</strong>
      </article>)}
    </div>
    <div className="ct-role-panel">
      <header>
        <div><h2>Assigned cases requiring attention</h2>
          <p>Real orders from your authorised laboratory, not sample records.</p></div>
        <button type="button" className="primary-button" onClick={onOpenLaboratory}>
          <Truck size={15}/> Open Laboratory Workbench
        </button>
      </header>
      {loading && !data ? <p className="ct-role-empty">Loading assigned cases…</p>
        : !error && priority.length === 0 ? <p className="ct-role-empty">No active cases assigned to your laboratory.</p>
        : <div className="ct-role-case-list">{priority.map(order =>
          <div className="ct-role-case" key={order.id}>
            <div><strong>{order.reference}</strong><span>{order.patientName}</span></div>
            <span>{order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {order.status.replace(/([a-z])([A-Z])/g,'$1 $2')}</span>
          </div>)}</div>}
    </div>
  </section>
}
