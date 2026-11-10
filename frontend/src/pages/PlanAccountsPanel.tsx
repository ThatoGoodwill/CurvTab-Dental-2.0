import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Printer, RefreshCw, Search, Wallet } from 'lucide-react'
import { apiRequest } from '../services/api'
import './PlanAccountsPanel.css'

type PlanRow = {
  planId: string; patientId: string; patientName: string; title: string
  status: string; agreed: boolean; total: number; paid: number; balance: number
  procedureCount: number; completedCount: number
}
type Proc = {
  id: string; description: string; toothCode: string | null; status: string
  cost: number; paid: number; due: number; completedAtUtc: string | null
}
type Pay = {
  id: string; batchId: string; receiptNumber: string; amount: number
  method: string; reference: string | null; receivedAtUtc: string
}
type Alloc = { batchId: string; procedureId: string; amount: number; createdAtUtc: string }
type Detail = {
  planId: string; title: string; planStatus: string; agreed: boolean
  patientName: string; practiceName: string; procedures: Proc[]
  total: number; totalPaid: number; balance: number
  allProceduresCompleted: boolean; settled: boolean
  payments: Pay[]; allocations: Alloc[]
}

const zar = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(v)
const when = (v: string) =>
  new Date(v).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
const cents = (v: string) => Math.round((Number(v) || 0) * 100)
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Request failed.')

export default function PlanAccountsPanel() {
  const [rows, setRows] = useState<PlanRow[]>([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [eft, setEft] = useState('')
  const [cardRef, setCardRef] = useState('')
  const [eftRef, setEftRef] = useState('')
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const [printing, setPrinting] = useState<'statement' | 'receipt' | null>(null)
  const [receiptBatch, setReceiptBatch] = useState<string | null>(null)
  const batchId = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    apiRequest<PlanRow[]>(`/billing/plan-accounts?q=${encodeURIComponent(q)}`)
      .then(v => { if (live) setRows(v) })
      .catch(e => { if (live) setError(msg(e)) })
    return () => { live = false }
  }, [q, revision])

  useEffect(() => {
    if (!selected) return
    let live = true
    apiRequest<Detail>(`/billing/plan-accounts/${encodeURIComponent(selected)}`)
      .then(v => { if (live) setDetail(v) })
      .catch(e => { if (live) setError(msg(e)) })
    return () => { live = false }
  }, [selected, revision])

  const received = cents(cash) + cents(card) + cents(eft)
  const allocated = Object.values(alloc).reduce((s, v) => s + cents(v), 0)
  const balanceCents = detail ? Math.round(detail.balance * 100) : 0

  // Auto-allocate received money to procedures in order; staff may override.
  useEffect(() => {
    if (!detail) return
    let left = received
    const next: Record<string, string> = {}
    for (const p of detail.procedures) {
      const due = Math.round(p.due * 100)
      if (due <= 0 || left <= 0) continue
      const take = Math.min(due, left)
      next[p.id] = (take / 100).toFixed(2)
      left -= take
    }
    setAlloc(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [received, detail?.planId, detail?.totalPaid])

  const procById = useMemo(() => {
    const map = new Map<string, Proc>()
    detail?.procedures.forEach(p => map.set(p.id, p))
    return map
  }, [detail])

  function choose(id: string) {
    setSelected(id); setDetail(null); setError(''); setOk('')
    setCash(''); setCard(''); setEft(''); setCardRef(''); setEftRef('')
    batchId.current = null
  }
  const touch = () => { batchId.current = null }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!detail || busy) return
    setError(''); setOk('')
    const tenders = [
      { method: 'Cash', amount: Number(cash), reference: null as string | null, on: cents(cash) > 0 },
      { method: 'Card', amount: Number(card), reference: cardRef.trim(), on: cents(card) > 0 },
      { method: 'EFT', amount: Number(eft), reference: eftRef.trim(), on: cents(eft) > 0 },
    ].filter(t => t.on)
    if (tenders.length === 0) { setError('Enter the amount received.'); return }
    const missing = tenders.find(t => t.method !== 'Cash' && !t.reference)
    if (missing) { setError(`Enter the ${missing.method} reference (never the card number).`); return }
    if (received !== allocated) {
      setError('Money received must equal the amount applied to procedures.'); return
    }
    if (received > balanceCents) { setError('Amount is more than the plan balance.'); return }
    const allocations = Object.entries(alloc)
      .filter(([, v]) => cents(v) > 0)
      .map(([procedureId, v]) => ({ procedureId, amount: Number(v) }))
    setBusy(true)
    try {
      if (!batchId.current) batchId.current = crypto.randomUUID()
      await apiRequest(`/billing/plan-accounts/${encodeURIComponent(detail.planId)}/payments`, 'POST', {
        batchId: batchId.current,
        tenders: tenders.map(t => ({ method: t.method, amount: t.amount, reference: t.reference || null })),
        allocations,
      })
      setReceiptBatch(batchId.current)
      batchId.current = null
      setOk('Payment recorded. Cash was saved as Cash and card as Card.')
      setCash(''); setCard(''); setEft(''); setCardRef(''); setEftRef('')
      setRevision(n => n + 1)
    } catch (e) { setError(msg(e)) } finally { setBusy(false) }
  }

  function print(kind: 'statement' | 'receipt', batch?: string) {
    setReceiptBatch(batch ?? null)
    setPrinting(kind)
    setTimeout(() => { window.print(); setPrinting(null) }, 80)
  }

  const receiptPays = detail && receiptBatch
    ? detail.payments.filter(p => p.batchId === receiptBatch) : []
  const receiptAllocs = detail && receiptBatch
    ? detail.allocations.filter(a => a.batchId === receiptBatch) : []
  const batches = detail
    ? Array.from(new Set(detail.payments.map(p => p.batchId))) : []

  return (
    <div className="pa-wrap">
      <div className="pa-card">
        <div className="pa-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Treatment Plan Accounts</h2>
            <p style={{ margin: 0, opacity: .75 }}>
              Take advance and final payments on an agreed plan. Split cash and card, and
              choose which procedure each rand pays for.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setRevision(n => n + 1)}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {error && <p role="alert" className="pa-alert pa-err">{error}</p>}
        {ok && <p role="status" className="pa-alert pa-ok">{ok}</p>}
      </div>

      <div className="pa-grid">
        <div className="pa-card">
          <label className="pa-form"><span><Search size={14} /> Find patient or plan</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type a name" />
          </label>
          <div className="pa-list">
            {rows.length === 0 && <p style={{ opacity: .75 }}>No treatment plans found.</p>}
            {rows.map(r => (
              <button type="button" key={r.planId}
                className={'pa-item' + (selected === r.planId ? ' active' : '')}
                onClick={() => choose(r.planId)}>
                <strong>{r.patientName}</strong>
                <small>{r.title}</small>
                <small>
                  <span className={'pa-pill ' + (r.agreed ? 'ok' : 'warn')}>{r.agreed ? 'Agreed' : 'Not agreed yet'}</span>{' '}
                  Balance {zar(r.balance)} of {zar(r.total)}
                </small>
              </button>
            ))}
          </div>
        </div>

        <div className="pa-card">
          {!selected ? <p>Select a patient's plan to take payment.</p>
            : !detail ? <p>Loading…</p> : (
            <>
              <div className="pa-actions" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{detail.patientName}</h3>
                  <small>{detail.title} · {detail.planStatus}</small>
                </div>
                <button type="button" className="secondary-button" onClick={() => print('statement')}>
                  <Printer size={16} /> Statement
                </button>
              </div>

              {detail.settled && <p className="pa-alert pa-ok">Treatment completed — account settled in full.</p>}
              {!detail.agreed && <p className="pa-alert pa-warn">The Dentist must record the patient's agreement to this plan before payments can be taken.</p>}

              <table className="pa-table">
                <thead><tr><th>Procedure</th><th className="num">Cost</th><th className="num">Paid</th><th className="num">Due</th><th>Status</th></tr></thead>
                <tbody>
                  {detail.procedures.map(p => (
                    <tr key={p.id}>
                      <td>{p.description}{p.toothCode ? ` (tooth ${p.toothCode})` : ''}</td>
                      <td className="num">{zar(p.cost)}</td>
                      <td className="num">{zar(p.paid)}</td>
                      <td className="num">{zar(p.due)}</td>
                      <td>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pa-totals">
                <div><span>Total treatment</span><strong>{zar(detail.total)}</strong></div>
                <div><span>Paid so far</span><strong>{zar(detail.totalPaid)}</strong></div>
                <div><span>Outstanding balance</span><strong>{zar(detail.balance)}</strong></div>
              </div>

              {detail.agreed && detail.balance > 0 && (
                <form className="pa-form" onSubmit={submit}>
                  <h4 style={{ margin: 0 }}>Record payment received</h4>
                  <div className="pa-row2">
                    <label>Cash (ZAR)<input type="number" min="0" step="0.01" value={cash} disabled={busy}
                      onChange={e => { setCash(e.target.value); touch() }} /></label>
                    <label>Card (ZAR)<input type="number" min="0" step="0.01" value={card} disabled={busy}
                      onChange={e => { setCard(e.target.value); touch() }} /></label>
                    <label>EFT (ZAR)<input type="number" min="0" step="0.01" value={eft} disabled={busy}
                      onChange={e => { setEft(e.target.value); touch() }} /></label>
                  </div>
                  {cents(card) > 0 && <label>Card terminal reference (required)
                    <input value={cardRef} maxLength={100} onChange={e => { setCardRef(e.target.value); touch() }} /></label>}
                  {cents(eft) > 0 && <label>EFT reference (required)
                    <input value={eftRef} maxLength={100} onChange={e => { setEftRef(e.target.value); touch() }} /></label>}

                  <h4 style={{ margin: '6px 0 0' }}>Apply to procedures</h4>
                  <div className="pa-row2">
                    {detail.procedures.filter(p => p.due > 0).map(p => (
                      <label key={p.id}>{p.description} (due {zar(p.due)})
                        <input type="number" min="0" step="0.01" max={p.due} value={alloc[p.id] ?? ''}
                          disabled={busy}
                          onChange={e => { setAlloc(a => ({ ...a, [p.id]: e.target.value })); touch() }} />
                      </label>
                    ))}
                  </div>
                  <div className="pa-totals">
                    <div><span>Received</span><strong>{zar(received / 100)}</strong></div>
                    <div><span>Applied to procedures</span><strong>{zar(allocated / 100)}</strong></div>
                    <div><span>Balance after this payment</span><strong>{zar((balanceCents - received) / 100)}</strong></div>
                  </div>
                  {received !== allocated && received > 0 &&
                    <p className="pa-alert pa-warn">Received and applied amounts must match before you can save.</p>}
                  <button type="submit" className="primary-button"
                    disabled={busy || received <= 0 || received !== allocated || received > balanceCents}>
                    <Wallet size={16} /> {busy ? 'Recording…' : 'Record payment'}
                  </button>
                </form>
              )}

              <h4 style={{ margin: 0 }}>Payments received</h4>
              {detail.payments.length === 0 ? <p>No payments yet.</p> : (
                <table className="pa-table">
                  <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {detail.payments.map(p => (
                      <tr key={p.id}>
                        <td>{when(p.receivedAtUtc)}</td><td>{p.receiptNumber}</td>
                        <td>{p.method}</td><td className="num">{zar(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="pa-actions">
                {batches.map((b, i) => (
                  <button key={b} type="button" className="secondary-button" onClick={() => print('receipt', b)}>
                    <Printer size={16} /> Receipt {i + 1}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {detail && printing === 'statement' && (
        <div className="pa-print">
          <h2>{detail.practiceName}</h2>
          <h3>PATIENT STATEMENT</h3>
          <p><strong>Patient:</strong> {detail.patientName}<br /><strong>Plan:</strong> {detail.title}<br /><strong>Date:</strong> {when(new Date().toISOString())}</p>
          <table>
            <thead><tr><th>Procedure</th><th className="num">Cost</th><th className="num">Paid</th><th className="num">Due</th><th>Status</th></tr></thead>
            <tbody>{detail.procedures.map(p => (
              <tr key={p.id}><td>{p.description}</td><td className="num">{zar(p.cost)}</td><td className="num">{zar(p.paid)}</td><td className="num">{zar(p.due)}</td><td>{p.status}</td></tr>
            ))}</tbody>
          </table>
          <h4>Payments</h4>
          <table>
            <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th className="num">Amount</th></tr></thead>
            <tbody>{detail.payments.map(p => (
              <tr key={p.id}><td>{when(p.receivedAtUtc)}</td><td>{p.receiptNumber}</td><td>{p.method}</td><td className="num">{zar(p.amount)}</td></tr>
            ))}</tbody>
          </table>
          <p><strong>Total treatment:</strong> {zar(detail.total)}<br /><strong>Total paid:</strong> {zar(detail.totalPaid)}<br /><strong>Outstanding balance:</strong> {zar(detail.balance)}</p>
          {detail.settled && <p><strong>Treatment completed — account settled in full.</strong></p>}
        </div>
      )}

      {detail && printing === 'receipt' && receiptPays.length > 0 && (
        <div className="pa-print">
          <h2>{detail.practiceName}</h2>
          <h3>PAYMENT RECEIPT</h3>
          <p><strong>Patient:</strong> {detail.patientName}<br /><strong>Plan:</strong> {detail.title}<br /><strong>Date:</strong> {when(receiptPays[0].receivedAtUtc)}</p>
          <table>
            <thead><tr><th>Receipt</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
            <tbody>{receiptPays.map(p => (
              <tr key={p.id}><td>{p.receiptNumber}</td><td>{p.method}</td><td>{p.reference ?? '—'}</td><td className="num">{zar(p.amount)}</td></tr>
            ))}</tbody>
          </table>
          <h4>Applied to</h4>
          <table>
            <tbody>{receiptAllocs.map(a => (
              <tr key={a.procedureId}><td>{procById.get(a.procedureId)?.description ?? 'Procedure'}</td><td className="num">{zar(a.amount)}</td></tr>
            ))}</tbody>
          </table>
          <p><strong>Total received:</strong> {zar(receiptPays.reduce((s, p) => s + p.amount, 0))}<br /><strong>Plan balance now:</strong> {zar(detail.balance)}</p>
          <p>Payment acknowledgement only. Not a tax invoice or medical-aid claim.</p>
        </div>
      )}
    </div>
  )
}
