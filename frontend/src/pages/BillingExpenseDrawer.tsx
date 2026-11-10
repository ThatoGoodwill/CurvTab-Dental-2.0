import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Receipt } from 'lucide-react'
import './BillingClientGuide.css'

const categories = ['Dental Supplies','Laboratory','Equipment','Utilities','Maintenance','Rent','Staff Costs','Other']
const dateSA = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())

export default function BillingExpenseDrawer({ onClose, onRecorded }: {
  onClose: () => void; onRecorded: () => void
}) {
  const [businessDate, setBusinessDate] = useState(dateSA)
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef<string | null>(null)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!/^(?:[0-9]+)(?:\.[0-9]{1,2})?$/.test(amount) || Number(amount) <= 0) {
      setError('Enter a valid positive amount in rand with up to two decimals.'); return
    }
    if (method !== 'Cash' && !reference.trim()) {
      setError('Card and EFT payouts require a transaction reference.'); return
    }
    if (!supplier.trim() || !description.trim()) {
      setError('Enter both supplier and reason.'); return
    }
    setBusy(true); setError('')
    requestId.current ??= crypto.randomUUID()
    try {
      const res = await fetch('/api/finance/operations/expenses', {
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({
          requestId:requestId.current, expenseDate:businessDate, category,
          description:`${supplier.trim()} — ${description.trim()}`.slice(0,250),
          amount:Number(amount), method, reference:reference.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(()=>null) as {message?:string}|null
        throw new Error(data?.message ?? `Expense not saved (${res.status}).`)
      }
      requestId.current = null
      onRecorded()
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record expense.')
    } finally { setBusy(false) }
  }
  return <div className="ct-guide-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
    <aside className="ct-guide-drawer" role="dialog" aria-modal="true" aria-label="Record daily expense">
      <header><h3><Receipt size={18}/> Record Daily Expense</h3>
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Close ×</button></header>
      <p>One expense event shared by Billing and Finances. Do not enter already-posted laboratory payouts again.</p>
      {error && <p className="ct-guide-error" role="alert">{error}</p>}
      <form className="ct-guide-form" onSubmit={e=>void save(e)}>
        <label>Supplier *<input required maxLength={90} value={supplier} onChange={e=>{setSupplier(e.target.value);requestId.current=null}} placeholder="Supplier name"/></label>
        <label>Category<select value={category} onChange={e=>{setCategory(e.target.value);requestId.current=null}}>
          {categories.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Reason / description *<input required maxLength={130} value={description} onChange={e=>{setDescription(e.target.value);requestId.current=null}} placeholder="What was purchased?"/></label>
        <label>Amount (ZAR) *<input required inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);requestId.current=null}} placeholder="250.00"/></label>
        <label>Payment method<select value={method} onChange={e=>{setMethod(e.target.value);requestId.current=null}}>
          <option>Cash</option><option>Card</option><option>EFT</option></select></label>
        <label>Payment / evidence reference {method==='Cash'?'(optional)':'*'}
          <input required={method!=='Cash'} maxLength={100} value={reference} onChange={e=>{setReference(e.target.value);requestId.current=null}} placeholder="Receipt number or EFT reference"/></label>
        <label>Business date<input type="date" required value={businessDate} max={dateSA()} onChange={e=>{setBusinessDate(e.target.value);requestId.current=null}}/></label>
        <p className="ct-guide-warning">The receipt reference is evidence metadata, not a file upload. Cash reduces the physical drawer expectation; card and EFT remain non-cash outflows.</p>
        <button className="primary-button" type="submit" disabled={busy}>{busy?'Saving…':'Record audited expense'}</button>
      </form>
    </aside>
  </div>
}
