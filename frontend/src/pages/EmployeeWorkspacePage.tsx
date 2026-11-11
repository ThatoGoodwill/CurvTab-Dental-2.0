import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Clock3, FileText, RefreshCw, Wallet } from 'lucide-react'
import './EmployeeWorkspacePage.css'

type RecordRow = {
  id: string; category: string; title: string; status: string
  startDate?: string | null; endDate?: string | null
  amount?: number | null; documentReference?: string | null
  notes?: string | null; createdAtUtc: string
}
type ResponseData = {
  employee: { id: string; fullName: string; email: string }
  records: RecordRow[]
  notice: string
}
type Tab = 'Overview' | 'Roster & Availability' | 'Leave' |
  'Payslips & Earnings' | 'Contracts & Documents' | 'Attendance'
const tabs: Tab[] = [
  'Overview', 'Roster & Availability', 'Leave', 'Payslips & Earnings',
  'Contracts & Documents', 'Attendance',
]
const categories: Record<Tab, string | null> = {
  Overview: null, 'Roster & Availability': 'Roster', Leave: 'Leave',
  'Payslips & Earnings': 'Payslip', 'Contracts & Documents': 'Contract',
  Attendance: 'Attendance',
}
const money = (n: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR',
}).format(n)
async function apiError(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string } | null
  return body?.message ?? `Request failed (${response.status})`
}

/** No employee ID is sent by the client. Server resolves self via cookie identity. */
export default function EmployeeWorkspacePage() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [data, setData] = useState<ResponseData | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const requestId = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/employee-workspace/me', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(await apiError(response))
        return response.json() as Promise<ResponseData>
      })
      .then(result => { if (active) { setData(result); setError('') } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cannot load your workspace.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  async function post(path: string, body: object, done: string) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    requestId.current ??= crypto.randomUUID()
    try {
      const response = await fetch(path, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ requestId: requestId.current, ...body }),
      })
      if (!response.ok) throw new Error(await apiError(response))
      requestId.current = null
      setNotice(done)
      setReload(value => value + 1)
      setFrom(''); setTo(''); setReason('')
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Unable to record the request.')
    } finally { setBusy(false) }
  }

  function requestLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!from || !to || from > to || reason.trim().length < 5) {
      setError('Choose valid dates and provide a reason.')
      return
    }
    void post('/api/employee-workspace/leave',
      { startDate: from, endDate: to, reason: reason.trim() },
      'Leave request submitted for management review.')
  }
  const records = data?.records.filter(item => categories[tab] === null ||
    item.category === categories[tab]) ?? []
  const latestAttendance = data?.records.find(item => item.category === 'Attendance')
  const isClockedIn = latestAttendance?.status === 'ClockIn'

  return <section className="ct-employee-workspace">
    <header className="ct-employee-header">
      <div><small>EMPLOYEE SELF-SERVICE</small><h2>Workspace</h2>
        <p>Personal roster, leave, earnings, contracts and attendance — separate from Staff Management.</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => setReload(v => v + 1)}>
        <RefreshCw size={15}/> Refresh</button>
    </header>
    {error && <p className="ct-guide-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Loading your records…</p> : data ? <>
      <p className="ct-employee-identity">{data.employee.fullName} · {data.employee.email}</p>
      <nav className="ct-employee-tabs" aria-label="Employee sections">
        {tabs.map(item => <button type="button" key={item}
          className={tab === item ? 'active' : ''}
          aria-current={tab === item ? 'page' : undefined}
          onClick={() => setTab(item)}>{item}</button>)}
      </nav>
      {tab === 'Overview' && <div className="ct-employee-summary">
        <article><CalendarDays size={16}/><small>Published shifts</small><strong>
          {data.records.filter(row => row.category === 'Roster').length}</strong></article>
        <article><FileText size={16}/><small>Leave requests</small><strong>
          {data.records.filter(row => row.category === 'Leave').length}</strong></article>
        <article><Wallet size={16}/><small>Payslip records</small><strong>
          {data.records.filter(row => row.category === 'Payslip').length}</strong></article>
        <article><Clock3 size={16}/><small>Attendance</small><strong>
          {isClockedIn ? 'Clocked in' : 'Not clocked in'}</strong></article>
      </div>}
      {tab === 'Leave' && <form className="ct-employee-form" onSubmit={requestLeave}>
        <h3>Request leave</h3>
        <label>Start date <input required type="date" value={from}
          onChange={e => { setFrom(e.target.value); requestId.current = null }}/></label>
        <label>End date <input required type="date" min={from} value={to}
          onChange={e => { setTo(e.target.value); requestId.current = null }}/></label>
        <label>Reason <textarea required minLength={5} maxLength={1200} value={reason}
          onChange={e => { setReason(e.target.value); requestId.current = null }}/></label>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit leave request'}</button>
      </form>}
      {tab === 'Attendance' && <div className="ct-employee-form">
        <h3>Attendance</h3><p>Times are recorded by the server, not the device clock.</p>
        <button type="button" className="primary-button" disabled={busy}
          onClick={() => void post('/api/employee-workspace/attendance',
            { action: isClockedIn ? 'ClockOut' : 'ClockIn' }, 'Attendance recorded.')}>
          {busy ? 'Saving…' : isClockedIn ? 'Clock out' : 'Clock in'}
        </button>
      </div>}
      <section className="ct-employee-records">
        <h3>{tab === 'Overview' ? 'Recent personal records' : tab}</h3>
        {records.length === 0 ? <p>No {tab === 'Overview' ? 'personal' : tab.toLowerCase()} records have been published yet.
          This does not imply a roster, payslip, contract or leave entitlement exists.</p> :
          <div className="ct-employee-record-list">{records.map(row =>
            <article key={row.id}>
              <div><strong>{row.title}</strong><span>{row.status} · {row.category}</span></div>
              {(row.startDate || row.endDate) && <small>
                {row.startDate || '—'}{row.endDate && row.endDate !== row.startDate ? ' to ' + row.endDate : ''}
              </small>}
              {row.amount != null && <strong>{money(row.amount)}</strong>}
              {row.documentReference && <small>Employer reference: {row.documentReference}</small>}
              {row.notes && <p>{row.notes}</p>}
              <small>{new Date(row.createdAtUtc).toLocaleString('en-ZA')}</small>
            </article>)}</div>}
      </section>
    </> : null}
  </section>
}
