import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import './EmployeeWorkspacePage.css'

type Staff = { id: string; fullName: string; role: string; isActive: boolean }
type RecordRow = {
  id: string; employeeUserId: string; fullName: string
  category: string; title: string; status: string
  startDate?: string | null; endDate?: string | null
  amount?: number | null; createdAtUtc: string; notes?: string | null
}
async function errorOf(res: Response) {
  const payload = await res.json().catch(() => null) as { message?: string } | null
  return payload?.message ?? `Request failed (${res.status}).`
}

export default function EmployeeWorkspaceManagementPanel() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [records, setRecords] = useState<RecordRow[]>([])
  const [reload, setReload] = useState(0)
  const [employeeId, setEmployeeId] = useState('')
  const [category, setCategory] = useState('Roster')
  const [title, setTitle] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedLeaveId, setSelectedLeaveId] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestId = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/staff', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/employee-workspace/team', { credentials: 'include', cache: 'no-store' }),
    ]).then(async ([a,b]) => {
      if (!a.ok) throw new Error(await errorOf(a))
      if (!b.ok) throw new Error(await errorOf(b))
      return [await a.json() as Staff[], await b.json() as RecordRow[]] as const
    }).then(([team, items]) => { if (active) { setStaff(team); setRecords(items) } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load HR records.') })
    return () => { active = false }
  }, [reload])

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    requestId.current ??= crypto.randomUUID()
    try {
      const response = await fetch('/api/employee-workspace/publish', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          requestId: requestId.current, employeeUserId: employeeId,
          category, title: title.trim(), startDate: from || null, endDate: to || null,
          amount: category === 'Payslip' ? Number(amount) : null,
          documentReference: reference.trim() || null, notes: notes.trim() || null,
        }),
      })
      if (!response.ok) throw new Error(await errorOf(response))
      requestId.current = null; setTitle(''); setAmount(''); setReference(''); setNotes('')
      setNotice('Employee record published to that staff member only. No payroll payment was made.')
      setReload(n => n + 1)
    } catch(e) { setError(e instanceof Error ? e.message : 'Unable to publish record.') }
    finally { setBusy(false) }
  }

  async function decideLeave(decision: 'Approved' | 'Declined') {
    if (!selectedLeaveId || busy || decisionReason.trim().length < 5) {
      setError('Select a leave request and supply a reason with at least five characters.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(
        `/api/employee-workspace/leave/${encodeURIComponent(selectedLeaveId)}/decision`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ decision, reason: decisionReason.trim() }),
        })
      if (!response.ok) throw new Error(await errorOf(response))
      setSelectedLeaveId(''); setDecisionReason('')
      setNotice(`Leave request ${decision.toLowerCase()} and audited.`)
      setReload(n => n + 1)
    } catch(e) { setError(e instanceof Error ? e.message : 'Unable to decide leave request.') }
    finally { setBusy(false) }
  }

  const pendingLeave = records.filter(item => item.category === 'Leave' && item.status === 'Pending')
  return <section className="ct-employee-workspace ct-employee-management">
    <header className="ct-employee-header"><div>
      <small>STAFF MANAGEMENT / EMPLOYEE RECORDS</small><h2>Employee Workspace Administration</h2>
      <p>Only PracticeAdmin can publish records and decide staff leave. Staff see their own records.</p>
    </div><button type="button" className="secondary-button" onClick={() => setReload(n => n + 1)}>
      <RefreshCw size={15}/> Refresh
    </button></header>
    {error && <p className="ct-guide-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="ct-guide-columns">
      <form className="ct-employee-form" onSubmit={event => void publish(event)}>
        <h3>Publish verified employee record</h3>
        <label>Employee
          <select required value={employeeId}
            onChange={e => { setEmployeeId(e.target.value); requestId.current = null }}>
            <option value="">Choose employee</option>
            {staff.filter(p => p.isActive).map(p => <option key={p.id} value={p.id}>
              {p.fullName} · {p.role}</option>)}
          </select></label>
        <label>Record type
          <select value={category} onChange={e => { setCategory(e.target.value); requestId.current = null }}>
            <option value="Roster">Roster / shift</option>
            <option value="Payslip">Payslip / earnings metadata</option>
            <option value="Contract">Contract / document reference</option>
          </select></label>
        <label>Title
          <input required minLength={3} maxLength={180} value={title}
            onChange={e => { setTitle(e.target.value); requestId.current = null }}/></label>
        <label>Start date
          <input type="date" required={category === 'Roster'} value={from}
            onChange={e => { setFrom(e.target.value); requestId.current = null }}/></label>
        <label>End date
          <input type="date" min={from} value={to}
            onChange={e => { setTo(e.target.value); requestId.current = null }}/></label>
        {category === 'Payslip' && <label>Verified earnings amount (ZAR)
          <input type="number" required min="0" step="0.01" value={amount}
            onChange={e => { setAmount(e.target.value); requestId.current = null }}/></label>}
        <label>Internal source/document reference (not a file upload)
          <input maxLength={350} value={reference}
            onChange={e => { setReference(e.target.value); requestId.current = null }}/></label>
        <label>Notes
          <textarea maxLength={1200} rows={2} value={notes}
            onChange={e => { setNotes(e.target.value); requestId.current = null }}/></label>
        <p className="ct-guide-warning">Only publish HR data after verifying it. This does not calculate or pay salaries, generate documents or upload private files.</p>
        <button type="submit" className="primary-button" disabled={!employeeId || busy}>
          {busy ? 'Publishing…' : 'Publish to employee Workspace'}</button>
      </form>
      <section className="ct-employee-form">
        <h3>Pending leave review ({pendingLeave.length})</h3>
        {pendingLeave.length === 0 ? <p>No pending leave requests.</p> :
          <label>Leave request
            <select value={selectedLeaveId} onChange={e => setSelectedLeaveId(e.target.value)}>
              <option value="">Choose request</option>
              {pendingLeave.map(item => <option key={item.id} value={item.id}>
                {item.fullName} · {item.startDate}–{item.endDate}</option>)}
            </select></label>}
        {selectedLeaveId && <><label>Decision reason
          <textarea minLength={5} maxLength={1200} value={decisionReason} rows={3}
            onChange={e => setDecisionReason(e.target.value)}/></label>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            <button type="button" className="primary-button" disabled={busy}
              onClick={() => void decideLeave('Approved')}>Approve leave</button>
            <button type="button" className="secondary-button" disabled={busy}
              onClick={() => void decideLeave('Declined')}>Decline</button>
          </div></>}
      </section>
    </div>
  </section>
}
