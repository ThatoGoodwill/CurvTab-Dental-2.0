import { useEffect, useState } from 'react'
import './PlanAccountsPanel.css'
import { RefreshCw } from 'lucide-react'
import { apiRequest } from '../services/api'

type AuditEvent = {
  id: string; occurredAtUtc: string; actorUserId: string | null
  action: string; entityType: string; entityId: string | null
  succeeded: boolean; detail: string | null
}
type Paged = { items: AuditEvent[]; total: number; page: number; pageSize: number }

const when = (v: string) =>
  new Date(v).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })

export default function AuditLogPage() {
  const [data, setData] = useState<Paged | null>(null)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [rev, setRev] = useState(0)

  useEffect(() => {
    let live = true
    const qs = `page=${page}&pageSize=50` + (action.trim() ? `&action=${encodeURIComponent(action.trim())}` : '')
    apiRequest<Paged>(`/audit?${qs}`)
      .then(v => { if (live) { setData(v); setError('') } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Unable to load the audit log.') })
    return () => { live = false }
  }, [page, action, rev])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="pa-wrap">
      <div className="pa-card">
        <h2 style={{ margin: 0 }}>Audit Log</h2>
        <p style={{ margin: 0, opacity: .75 }}>Every important action in your practice: who did what, and when.</p>
        <div className="pa-actions">
          <input aria-label="Filter by action" placeholder="Filter by action, e.g. PAYMENT_RECORDED"
            value={action} onChange={e => { setAction(e.target.value); setPage(1) }}
            style={{ padding: 8, minWidth: 260 }} />
          <button type="button" className="secondary-button" onClick={() => setRev(n => n + 1)}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {error && <p role="alert" className="pa-alert pa-err">{error}</p>}
        <table className="pa-table">
          <thead><tr><th>When</th><th>Action</th><th>Record</th><th>Result</th></tr></thead>
          <tbody>
            {data?.items.map(e => (
              <tr key={e.id}>
                <td>{when(e.occurredAtUtc)}</td>
                <td>{e.action}</td>
                <td>{e.entityType}</td>
                <td>{e.succeeded ? 'Success' : 'Failed'}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={4}>No events found.</td></tr>}
          </tbody>
        </table>
        <div className="pa-actions">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>Page {page} of {pages}{data ? ` · ${data.total} events` : ''}</span>
          <button type="button" className="secondary-button" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  )
}
