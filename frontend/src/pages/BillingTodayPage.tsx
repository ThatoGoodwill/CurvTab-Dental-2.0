import { useEffect, useState } from 'react'
import { ArrowDownToLine, RefreshCw, Receipt, ShieldCheck, Wallet } from 'lucide-react'
import './BillingClientGuide.css'

type Movement = {
  id: string
  label: string
  method: string
  amount: number
  at: string
  category: string
  reference: string
  operator: string
}
type Ledger = {
  totalReceived: number
  cashReceived: number
  cardReceived: number
  eftReceived: number
  transactions: Array<{
    paymentId: string; receiptNumber: string; patientName: string
    method: string; amount: number; receivedAtUtc: string; reference: string | null
    receivedByUserId: string
  }>
}
type ExpenseSummary = {
  expenses: Array<{
    id: string; category: string; description: string; amount: number
    method: string; expenseDate: string; reference: string | null
    recordedByUserId: string; recordedAtUtc: string
  }>
}
type AidSummary = { submittedValue: number; uniqueClaims: number; signed: boolean }

const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
function period(date: string) {
  const start = new Date(`${date}T00:00:00+02:00`)
  const end = new Date(start.getTime() + 86400000)
  return new URLSearchParams({ fromUtc: start.toISOString(), toUtc: end.toISOString() }).toString()
}
async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error(`Unable to load billing activity (${res.status}).`)
  return res.json() as Promise<T>
}

export default function BillingTodayPage({ onRecordExpense }: { onRecordExpense: () => void }) {
  const [date, setDate] = useState(today)
  const [reload, setReload] = useState(0)
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null)
  const [aid, setAid] = useState<AidSummary | null>(null)
  const [selected, setSelected] = useState<Movement | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setBusy(true)
    setLedger(null)
    setExpenses(null)
    setAid(null)
    Promise.allSettled([
      get<Ledger>(`/api/finance/ledger?${period(date)}`),
      get<ExpenseSummary>(`/api/finance/operations?date=${date}`),
      get<AidSummary>(`/api/billing/medical-aid-day-signoff?date=${date}`),
    ]).then(([l, e, m]) => {
      if (!active) return
      setLedger(l.status === 'fulfilled' ? l.value : null)
      setExpenses(e.status === 'fulfilled' ? e.value : null)
      setAid(m.status === 'fulfilled' ? m.value : null)
      const failed = [
        l.status === 'rejected' ? 'Payments' : '',
        e.status === 'rejected' ? 'Expenses' : '',
        m.status === 'rejected' ? 'Medical aid' : '',
      ].filter(Boolean)
      setError(failed.length ? `Unable to load ${failed.join(', ')}. Other available figures are shown below; refresh to retry.` : '')
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [date, reload])
  const movements: Movement[] = [
    ...(ledger?.transactions ?? []).map(row => ({
      id: row.paymentId, label: row.patientName, method: row.method,
      amount: row.amount, at: row.receivedAtUtc, category: 'Receipt',
      reference: row.receiptNumber, operator: row.receivedByUserId,
    })),
    ...(expenses?.expenses ?? []).map(row => ({
      id: row.id, label: row.description, method: row.method,
      amount: -row.amount, at: row.recordedAtUtc, category: row.category,
      reference: row.reference ?? 'No reference', operator: row.recordedByUserId,
    })),
  ].sort((a,b) => b.at.localeCompare(a.at))
  const expensesTotal = expenses?.expenses.reduce((sum,row) => sum + row.amount,0) ?? 0

  return <section className="ct-guide-page">
    <header className="ct-guide-heading ct-billing-datebar">
      <div><small>DAILY OVERVIEW</small>
        <p>Actual money received and expenses are separate from medical-aid submissions.</p></div>
      <div className="ct-guide-heading-tools">
        <label>Business date <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)}/></label>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setReload(x => x+1)}>
          <RefreshCw size={15}/> Refresh</button>
        <button type="button" className="secondary-button" onClick={onRecordExpense}>
          <Receipt size={15}/> Record Expense</button>
      </div>
    </header>
    {error && <p className="ct-guide-warning" role="alert">{error}</p>}
    <div className="ct-guide-kpis">
      <article><ArrowDownToLine size={19}/><span>Money received</span><strong>{ledger ? money(ledger.totalReceived) : '—'}</strong><small>Actual receipts · cash / card / EFT</small></article>
      <article><Receipt size={19}/><span>Expenses paid</span><strong>{expenses ? money(expensesTotal) : '—'}</strong><small>Recorded cash, card and EFT outflows</small></article>
      <article><Wallet size={19}/><span>Net movement</span><strong>{ledger && expenses ? money(ledger.totalReceived-expensesTotal) : '—'}</strong><small>Receipts minus recorded expenses</small></article>
      <article><ShieldCheck size={19}/><span>Medical-aid activity</span><strong>{aid ? money(aid.submittedValue) : '—'}</strong><small>{aid?.uniqueClaims ?? '—'} unique submitted claims · NOT received</small></article>
    </div>
    <div className="ct-guide-columns">
      <section className="ct-guide-panel">
        <h3>Today's transactions</h3>
        <p>Click once for recorded source and operator details. Negative values are outflows.</p>
        <div className="ct-guide-scroll">
          <table><thead><tr><th>Time</th><th>Transaction</th><th>Method</th><th>Amount</th></tr></thead>
            <tbody>{movements.map(row => <tr key={row.id} onClick={() => setSelected(row)}
              onKeyDown={e => { if (e.key === 'Enter') setSelected(row) }} tabIndex={0} role="button">
              <td>{new Date(row.at).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})}</td>
              <td>{row.label}<small>{row.category}</small></td><td>{row.method}</td>
              <td>{money(row.amount)}</td></tr>)}
              {!movements.length && <tr><td colSpan={4}>{busy ? 'Loading…' : error ? 'Some transaction sources are unavailable. Refresh to retry.' : 'No recorded transactions on this date.'}</td></tr>}
            </tbody></table>
        </div>
      </section>
      <aside className="ct-guide-panel">
        <h3>Today at a glance</h3>
        <p><strong>Cash:</strong> {ledger ? money(ledger.cashReceived) : '—'}</p>
        <p><strong>Card:</strong> {ledger ? money(ledger.cardReceived) : '—'}</p>
        <p><strong>EFT:</strong> {ledger ? money(ledger.eftReceived) : '—'}</p>
        <p><strong>Medical-aid unique claims:</strong> {aid?.uniqueClaims ?? '—'}</p>
        <p><strong>Claims day status:</strong> {aid?.signed ? 'Signed' : 'Open'}</p>
        <p className="ct-guide-warning">A submitted claim is not a receipt. Payments count only on the date money actually arrives.</p>
      </aside>
    </div>
    {selected && <div className="ct-guide-drawer-backdrop" onMouseDown={e => { if(e.target===e.currentTarget)setSelected(null) }}>
      <aside className="ct-guide-drawer" role="dialog" aria-modal="true" aria-label="Transaction details">
        <header><h3>Transaction details</h3><button type="button" className="secondary-button" onClick={()=>setSelected(null)}>Close ×</button></header>
        <dl><dt>Source</dt><dd>{selected.category}</dd><dt>Description</dt><dd>{selected.label}</dd>
          <dt>Amount</dt><dd>{money(selected.amount)}</dd><dt>Method</dt><dd>{selected.method}</dd>
          <dt>Reference / receipt</dt><dd>{selected.reference}</dd><dt>Recorded at</dt><dd>{new Date(selected.at).toLocaleString('en-ZA')}</dd>
          <dt>Operator ID</dt><dd>{selected.operator}</dd></dl>
        <p className="ct-guide-warning">Posted transactions are not silently editable. Use authorised correction/reversal workflows.</p>
      </aside></div>}
  </section>
}
