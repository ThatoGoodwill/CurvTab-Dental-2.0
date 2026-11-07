// ORTHOHUB_V1 — read-only practice-wide overview / case dashboard.
// Maintains existing patient-specific write routes and financial workflows.
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  AlertTriangle, CalendarClock, CalendarDays, CheckCircle2,
  ChevronRight, ClipboardList, FileText, History, Plus, RefreshCw, Search,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import './OrthoHub.css'

export type OrthoHubCase = {
  id: string
  patientId: string
  patientName: string
  title: string
  applianceType: string
  status: string
  nextReviewDate: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

type OrthoActivity = {
  id: string
  caseId: string
  patientId: string
  patientName: string
  caseTitle: string
  visitDate: string
  progressNotes: string
  adjustments: string | null
}

type OverviewData = {
  totalCases: number
  isTruncated: boolean
  cases: OrthoHubCase[]
  recentActivity: OrthoActivity[]
}

type Props = {
  mode: 'overview' | 'cases'
  onOpenCase: (item: OrthoHubCase) => void
  onFinancials: (item: OrthoHubCase) => void
  onNewCase: () => void
  onCases: () => void
  onReports: () => void
}

const stillOpen = (status: string) => status !== 'Completed'
function todayLocal(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function dateInDays(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function showDate(value: string | null): string {
  if (!value) return 'Not scheduled'
  const parts = value.slice(0, 10).split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
}

export default function OrthoHub({ mode, onOpenCase, onFinancials, onNewCase, onCases, onReports }: Props) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    apiRequest<OverviewData>('/dentist/orthodontics/overview')
      .then(result => { if (!cancelled) setData(result) })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load orthodontic records.')
          setData(null)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  const today = todayLocal()
  const twoWeeks = dateInDays(14)
  const cases = data?.cases ?? []
  const reviews = useMemo(() => cases
    .filter(c => stillOpen(c.status) && c.nextReviewDate && c.nextReviewDate >= today)
    .sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '')), [cases, today])
  const overdue = useMemo(() => cases
    .filter(c => stillOpen(c.status) && c.nextReviewDate && c.nextReviewDate < today)
    .sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '')), [cases, today])
  const unscheduled = cases.filter(c => stillOpen(c.status) && !c.nextReviewDate)
  const upcoming = reviews.filter(c => (c.nextReviewDate ?? '') <= twoWeeks)
  const filtered = cases.filter(c => {
    const matchesStatus = filter === 'All' || c.status === filter
    const needle = search.trim().toLowerCase()
    const matchesText = !needle || [c.patientName, c.title, c.applianceType].some(s => s.toLowerCase().includes(needle))
    return matchesStatus && matchesText
  })

  return (
    <div className="oc-hub">
      <header className="oc-header">
        <div>
          <div className="oc-eyebrow">SPECIALIST ORTHODONTICS · PRACTICE OVERVIEW</div>
          <h2>{mode === 'overview' ? 'Clinical Overview' : 'Orthodontic Cases'}</h2>
          <p>{mode === 'overview' ? 'What needs attention, who needs reviewing, and what happened recently.' : 'All authorised orthodontic cases in this practice, linked to existing patient records.'}</p>
        </div>
        <div className="oc-actions">
          <button type="button" className="oc-button oc-button-outline" onClick={() => setReload(v => v + 1)}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button type="button" className="oc-button oc-button-solid" onClick={onNewCase}>
            <Plus size={16} /> New Case
          </button>
        </div>
      </header>

      {error && <div className="oc-error" role="alert">{error} <button type="button" onClick={() => setReload(v => v + 1)}>Retry</button></div>}
      {loading && <div className="oc-loading" role="status">Loading clinical records…</div>}
      {!loading && !error && data && <>
        {data.isTruncated && <div className="oc-notice">Showing the latest 250 cases. Use the patient workspace for older cases; paginated search will follow.</div>}
        {mode === 'overview' ? <>
          <div className="oc-overview-grid">
            <section className="oc-panel">
              <div className="oc-section-title"><span className="oc-icon"><CalendarDays size={20} /></span><div><h3>Next Clinical Reviews</h3><p>Review dates recorded in orthodontic cases</p></div></div>
              {upcoming.length === 0 ? <div className="oc-empty">No review dates within the next 14 days.</div> :
                <div className="oc-rows">{upcoming.slice(0, 6).map(c => <button key={c.id} type="button" className="oc-row" onClick={() => onOpenCase(c)}>
                  <div className="oc-date">{showDate(c.nextReviewDate)}</div><div className="oc-row-main"><strong>{c.patientName}</strong><small>{c.title} · {c.applianceType}</small></div><ChevronRight size={16} />
                </button>)}</div>}
              <div className="oc-panel-footer"><span>{reviews.length} future review dates in the loaded records</span><button type="button" onClick={onCases}>All cases</button></div>
            </section>
            <section className="oc-panel">
              <div className="oc-section-title"><span className="oc-icon oc-warning"><AlertTriangle size={20} /></span><div><h3>Clinical Attention</h3><p>Review dates and planning actions</p></div></div>
              <div className="oc-attention-row"><div><strong>Overdue reviews</strong><small>Recorded review date has passed</small></div><b>{overdue.length}</b></div>
              <div className="oc-attention-row"><div><strong>No next review scheduled</strong><small>Open cases missing a review date</small></div><b>{unscheduled.length}</b></div>
              <div className="oc-attention-row"><div><strong>Awaiting treatment</strong><small>Cases currently in planning</small></div><b>{cases.filter(c => c.status === 'Planning').length}</b></div>
              {overdue[0] && <button className="oc-first-alert" type="button" onClick={() => onOpenCase(overdue[0])}><CalendarClock size={16}/> Review oldest overdue case <ChevronRight size={14}/></button>}
            </section>
          </div>
          <section className="oc-panel">
            <div className="oc-section-title"><span className="oc-icon"><History size={20}/></span><div><h3>Recent Clinical Activity</h3><p>Latest documented orthodontic visits across the practice</p></div></div>
            {data.recentActivity.length === 0 ? <div className="oc-empty">No orthodontic visit notes have been recorded.</div> :
              <div className="oc-activity-list">{data.recentActivity.slice(0, 8).map(n => <article key={n.id} className="oc-activity">
                <span className="oc-activity-mark"><CheckCircle2 size={16}/></span><div><strong>{n.patientName}</strong><small>{n.caseTitle} · {showDate(n.visitDate)}</small><p>{n.progressNotes}</p>{n.adjustments && <small>Adjustment: {n.adjustments}</small>}</div>
                <button type="button" className="oc-quiet-link" onClick={() => { const c = cases.find(x => x.id === n.caseId); if (c) onOpenCase(c) }} disabled={!cases.some(x => x.id === n.caseId)}>Open</button>
              </article>)}</div>}
          </section>
          <div className="oc-shortcuts"><button type="button" onClick={onCases}><ClipboardList size={18}/> Browse treatment cases <ChevronRight size={16}/></button><button type="button" onClick={onReports}><FileText size={18}/> Orthodontic financials <ChevronRight size={16}/></button></div>
        </> : <>
          <div className="oc-cases-toolbar">
            <label className="oc-search"><Search size={17}/><input aria-label="Search orthodontic cases" value={search} onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Search patient, treatment, appliance…" /></label>
            <select aria-label="Filter by treatment status" value={filter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}>
              {['All', 'Planning', 'Active', 'Paused', 'Completed'].map(s => <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>)}
            </select>
            <span className="oc-result-count">{filtered.length} shown</span>
          </div>
          {filtered.length === 0 ? <div className="oc-empty oc-case-empty">No cases match your search or status filter.</div> : <div className="oc-card-grid">{filtered.map(c => <article className="oc-case-card" key={c.id}>
            <div className="oc-card-head"><div><h3>{c.patientName}</h3><p>{c.applianceType}</p></div><span className={`oc-status oc-status-${c.status.toLowerCase()}`}>{c.status}</span></div>
            <div className="oc-card-title">{c.title}</div>
            <div className="oc-case-facts"><div><small>CASE CREATED</small><strong>{showDate(c.createdAtUtc)}</strong></div><div><small>NEXT REVIEW</small><strong>{showDate(c.nextReviewDate)}</strong></div><div><small>TREATMENT</small><strong>{c.applianceType}</strong></div><div><small>STATUS</small><strong>{c.status}</strong></div></div>
            <div className="oc-finance-note">Payment progress is available in verified case financial records; no estimates are shown here.</div>
            <div className="oc-card-actions"><button type="button" className="oc-button oc-button-solid" onClick={() => onOpenCase(c)}>Open Case</button><button type="button" className="oc-button oc-button-outline" onClick={() => onFinancials(c)}>Financials</button></div>
          </article>)}</div>}
        </>}
      </>}
    </div>
  )
}
