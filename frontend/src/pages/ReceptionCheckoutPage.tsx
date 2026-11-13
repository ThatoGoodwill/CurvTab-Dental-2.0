import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, CreditCard, FileText, Printer, RefreshCw, Wallet } from 'lucide-react'
import { apiRequest } from '../services/api'
import './ReceptionCheckoutPage.css'

type WaitingCheckout = {
  appointmentId: string
  patientId: string
  patientName: string
  status: string
  completedAtUtc: string | null
  amountDue: number
  planCreditsApplied?: number
  currency: string
}
type HistoryRow = {
  appointmentId: string
  patientName: string
  checkedOutAtUtc: string | null
  status: string
}
type Payment = {
  id: string
  receiptNumber: string
  amount: number
  method: string
  reference: string | null
  receivedAtUtc: string
}
type Details = {
  appointmentId: string
  patientId: string
  patientName: string
  status: string
  completedAtUtc: string | null
  checkedOutAtUtc: string | null
  amountDue: number
  amountPaid: number
  planCreditsApplied?: number
  balance: number
  currency: string
  payments: Payment[]
}
type Receipt = {
  receiptNumber: string
  paymentId: string
  appointmentId: string
  practiceName: string
  patientName: string
  amount: number
  method: string
  reference: string | null
  receivedAtUtc: string
  currency: string
  amountBilled: number
  planCreditsApplied?: number
  totalPaid: number
  balance: number
  status: string
}

function money(value: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value)
}
function when(value: string | null) {
  return value ? new Date(value).toLocaleString('en-ZA', {
    dateStyle: 'medium', timeStyle: 'short',
  }) : '—'
}
function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Unable to complete request.'
}
function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return `fromUtc=${encodeURIComponent(start.toISOString())}&toUtc=${encodeURIComponent(end.toISOString())}`
}

export default function ReceptionCheckoutPage({ initialAppointmentId }: { initialAppointmentId?: string | null }) {
  const [tab, setTab] = useState<'ready' | 'completed'>('ready')
  const [ready, setReady] = useState<WaitingCheckout[]>([])
  const [completed, setCompleted] = useState<HistoryRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Details | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [cashAmt, setCashAmt] = useState('')
  const [cardAmt, setCardAmt] = useState('')
  const [eftAmt, setEftAmt] = useState('')
  const [cardRef, setCardRef] = useState('')
  const [eftRef, setEftRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [revision, setRevision] = useState(0)
  const paymentRequestId = useRef<string | null>(null)

  // Refresh checkout-ready and payment details after a live push.
  useEffect(() => {
    const onClinicUpdate = () => setRevision(value => value + 1)
    window.addEventListener('curvtab:clinic-notification', onClinicUpdate)
    return () => window.removeEventListener('curvtab:clinic-notification', onClinicUpdate)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest<WaitingCheckout[]>('/frontdesk/checkout-ready'),
      apiRequest<HistoryRow[]>(`/frontdesk/checkouts/history?${todayRange()}`),
    ]).then(([waiting, history]) => {
      if (!active) return
      setReady(waiting)
      setCompleted(history)
      setError('')
    }).catch(cause => { if (active) setError(errorMessage(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])

  // A checkout notification opens the matching patient's invoice, not Today's Billing.
  useEffect(() => {
    if (!initialAppointmentId) return
    setSelectedId(initialAppointmentId)
    setTab('ready')
  }, [initialAppointmentId])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    apiRequest<Details>(`/frontdesk/checkouts/${encodeURIComponent(selectedId)}`)
      .then(result => {
        if (!active) return
        setDetail(result)
      })
      .catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [selectedId, revision])

  function refresh() {
    setLoading(true)
    setRevision(value => value + 1)
  }

  function choose(id: string) {
    setSelectedId(id)
    setDetail(null)
    setReceipt(null)
    setError('')
    setSuccess('')
    setCashAmt(''); setCardAmt(''); setEftAmt('')
    setCardRef(''); setEftRef('')
    paymentRequestId.current = null
  }

  async function showReceipt(paymentId: string) {
    setError('')
    try {
      const value = await apiRequest<Receipt>(
        `/frontdesk/payments/${encodeURIComponent(paymentId)}/receipt`
      )
      setReceipt(value)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const cents = (v: string) => Math.round((Number(v) || 0) * 100)
  const enteredCents = cents(cashAmt) + cents(cardAmt) + cents(eftAmt)
  const balanceCents = detail ? Math.round(detail.balance * 100) : 0
  const remainingCents = balanceCents - enteredCents

  function resetBatch() { paymentRequestId.current = null }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || busy || detail.status !== 'AwaitingCheckout') return
    const rows = [
      { method: 'Cash', amount: cashAmt, reference: '' },
      { method: 'Card', amount: cardAmt, reference: cardRef },
      { method: 'EFT', amount: eftAmt, reference: eftRef },
    ].filter(row => cents(row.amount) > 0)
    if (rows.length === 0) { setError('Enter at least one amount received.'); return }
    if (rows.some(row => Number(row.amount) < 0 ||
        Math.abs(Number(row.amount) * 100 - Math.round(Number(row.amount) * 100)) > 0.000001)) {
      setError('Amounts must be positive and have at most 2 decimals.'); return
    }
    if (enteredCents > balanceCents) {
      setError('The amounts entered exceed the outstanding balance.'); return
    }
    const missing = rows.find(row => row.method !== 'Cash' && !row.reference.trim())
    if (missing) {
      setError(`Enter the ${missing.method} terminal/EFT reference (not the card number).`); return
    }
    const completeCheckout = enteredCents === balanceCents
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      if (!paymentRequestId.current) paymentRequestId.current = crypto.randomUUID()
      const result = await apiRequest<{ paymentIds: string[]; alreadyRecorded: boolean; checkedOut?: boolean }>(
        `/frontdesk/checkouts/${encodeURIComponent(detail.appointmentId)}/payments/split`,
        'POST',
        {
          batchId: paymentRequestId.current,
          completeCheckout,
          lines: rows.map(row => ({
            method: row.method,
            amount: Number(row.amount),
            reference: row.reference.trim() || null,
          })),
        }
      )
      paymentRequestId.current = null
      setSuccess(result.alreadyRecorded
        ? 'This payment was already recorded; no duplicate was created.'
        : completeCheckout
          ? 'Payment recorded and patient checked out.'
          : 'Part payment recorded. Collect the remaining balance to check out.')
      setCashAmt(''); setCardAmt(''); setEftAmt('')
      setCardRef(''); setEftRef('')
      if (result.paymentIds?.[0]) await showReceipt(result.paymentIds[0])
      refresh()
    } catch (cause) {
      // Keep the batch ID on errors so retries do not create duplicates.
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function finishCheckout() {
    if (!detail || busy || detail.balance !== 0 || detail.status !== 'AwaitingCheckout') return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await apiRequest(`/frontdesk/checkouts/${encodeURIComponent(detail.appointmentId)}/complete`, 'POST')
      setSuccess('Patient checked out. The visit remains in Completed Today.')
      refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="checkout-page">
      <div className="page-heading">
        <div><div className="eyebrow">FRONT DESK</div><h1>Checkout &amp; Payments</h1>
          <p>Receive confirmed charges from the Dentist, record payments and print receipts.</p></div>
        <button type="button" className="secondary-button" onClick={refresh} disabled={busy || loading}>
          <RefreshCw size={17} /> Refresh
        </button>
      </div>
      <div className="checkout-tabs">
        <button type="button" className={tab === 'ready' ? 'primary-button' : 'secondary-button'}
          onClick={() => setTab('ready')}>Awaiting Checkout ({ready.length})</button>
        <button type="button" className={tab === 'completed' ? 'primary-button' : 'secondary-button'}
          onClick={() => setTab('completed')}>Completed Today ({completed.length})</button>
      </div>
      {error && <p role="alert" className="checkout-alert checkout-error">{error}</p>}
      {success && <p role="status" className="checkout-alert checkout-success"><CheckCircle2 size={16}/>{success}</p>}
      <div className="checkout-grid">
        <section className="panel checkout-list">
          <div className="panel-header"><div><h2>{tab === 'ready' ? 'Ready for Checkout' : 'Completed Today'}</h2>
            <p>{tab === 'ready' ? 'Completed consultations sent by the Dentist' : 'Visits checked out today'}</p>
          </div><Wallet size={20}/></div>
          {loading ? <p>Loading checkout records...</p> : tab === 'ready' ? (
            ready.length === 0 ? <p className="checkout-empty">No patients awaiting checkout.</p> : (
              ready.map(row => <button type="button" key={row.appointmentId}
                className={`checkout-patient ${selectedId === row.appointmentId ? 'checkout-selected' : ''}`}
                onClick={() => choose(row.appointmentId)}>
                <strong>{row.patientName}</strong>
                <small>Consultation completed {when(row.completedAtUtc)}</small>
                <span>{money(row.amountDue - (row.planCreditsApplied ?? 0))} after plan advances</span>
              </button>)
            )
          ) : completed.length === 0 ? (
            <p className="checkout-empty">No patients checked out today.</p>
          ) : completed.map(row => <button type="button" key={row.appointmentId}
            className={`checkout-patient ${selectedId === row.appointmentId ? 'checkout-selected' : ''}`}
            onClick={() => choose(row.appointmentId)}>
            <strong>{row.patientName}</strong>
            <small>Checked out {when(row.checkedOutAtUtc)}</small>
            <span>Checked Out</span>
          </button>)}
        </section>
        <section className="panel checkout-detail">
          {!selectedId ? (
            <div className="checkout-empty"><CreditCard size={27}/><h2>Select a patient</h2>
              <p>Choose a completed consultation to view the amount due and record payment.</p></div>
          ) : !detail || detail.appointmentId !== selectedId ? <p>Loading payment details...</p> : (
            <>
              <div className="panel-header"><div><h2>{detail.patientName}</h2>
                <p>Consultation finished: {when(detail.completedAtUtc)}</p></div>
                <span className="checkout-status">{detail.status}</span>
              </div>
              <div className="checkout-amounts">
                <div><span>Amount charged by Dentist</span><strong>{money(detail.amountDue)}</strong></div>
                <div><span>Payments at checkout</span><strong>{money(detail.amountPaid)}</strong></div>
                {(detail.planCreditsApplied ?? 0) > 0 && (
                  <div><span>Previously collected plan advances</span><strong>−{money(detail.planCreditsApplied ?? 0)}</strong></div>
                )}
                <div className="checkout-due"><span>Remaining balance</span><strong>{money(detail.balance)}</strong></div>
              </div>
              {detail.status === 'AwaitingCheckout' && detail.balance > 0 && (
                <form className="checkout-payment-form" onSubmit={recordPayment}>
                  <h3>Record payment received</h3>
                  <p className="checkout-hint">Enter what the patient paid in each way. Cash is recorded as Cash and card as Card. Split example: R200 cash + R150 card.</p>
                  <label>Cash received (ZAR)
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={cashAmt} disabled={busy}
                      onChange={e => { setCashAmt(e.target.value); resetBatch() }} />
                  </label>
                  <label>Card received (ZAR)
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={cardAmt} disabled={busy}
                      onChange={e => { setCardAmt(e.target.value); resetBatch() }} />
                  </label>
                  {cents(cardAmt) > 0 && (
                    <label>Card terminal reference (required)
                      <input type="text" maxLength={100} value={cardRef} disabled={busy}
                        placeholder="Terminal slip reference — no card numbers"
                        onChange={e => { setCardRef(e.target.value); resetBatch() }} />
                    </label>
                  )}
                  <label>EFT received (ZAR)
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={eftAmt} disabled={busy}
                      onChange={e => { setEftAmt(e.target.value); resetBatch() }} />
                  </label>
                  {cents(eftAmt) > 0 && (
                    <label>EFT reference (required)
                      <input type="text" maxLength={100} value={eftRef} disabled={busy}
                        placeholder="Bank/EFT reference"
                        onChange={e => { setEftRef(e.target.value); resetBatch() }} />
                    </label>
                  )}
                  <div className="checkout-amounts">
                    <div><span>Total entered</span><strong>{money(enteredCents / 100)}</strong></div>
                    <div><span>Balance due</span><strong>{money(detail.balance)}</strong></div>
                    <div className="checkout-due"><span>{remainingCents < 0 ? 'Over by' : 'Still to collect'}</span>
                      <strong>{money(Math.abs(remainingCents) / 100)}</strong></div>
                  </div>
                  <button type="submit" className="primary-button"
                    disabled={busy || enteredCents <= 0 || remainingCents < 0}>
                    <Wallet size={17}/>{busy ? 'Recording...'
                      : remainingCents === 0 && enteredCents > 0 ? 'Record Payment & Check Out'
                      : 'Record Part Payment'}
                  </button>
                  <p className="checkout-hint">Checkout completes automatically when the amounts equal the balance.</p>
                </form>
              )}
              {detail.status === 'AwaitingCheckout' && detail.balance === 0 && (
                <div className="checkout-payment-form">
                  <p className="checkout-success">Balance is zero. You may complete checkout.</p>
                  <button type="button" className="primary-button" disabled={busy} onClick={() => void finishCheckout()}>
                    <CheckCircle2 size={17}/> Complete Checkout
                  </button>
                </div>
              )}
              {detail.status === 'CheckedOut' && <p className="checkout-alert checkout-success">
                <CheckCircle2 size={17}/> Checked out: {when(detail.checkedOutAtUtc)}</p>}
              <div className="checkout-received">
                <h3>Payment history & receipts</h3>
                {detail.payments.length === 0 ? <p>No payments recorded for this visit.</p>
                  : detail.payments.map(item => <div className="checkout-payment-row" key={item.id}>
                    <div><strong>{money(item.amount)} · {item.method}</strong>
                      <small>{when(item.receivedAtUtc)} · {item.receiptNumber}</small></div>
                    <button className="secondary-button" type="button" onClick={() => void showReceipt(item.id)}>
                      <FileText size={16}/> Receipt
                    </button>
                  </div>)}
              </div>
            </>
          )}
        </section>
      </div>
      {receipt && <section className="panel checkout-print-panel">
        <div className="checkout-print-actions">
          <h2>Payment Receipt</h2>
          <button type="button" className="secondary-button" onClick={() => window.print()}>
            <Printer size={17}/> Print Receipt
          </button>
        </div>
        <div className="checkout-receipt-print">
          <h2>{receipt.practiceName}</h2>
          <h3>PAYMENT RECEIPT</h3>
          <p><strong>Receipt:</strong> {receipt.receiptNumber}</p>
          <p><strong>Date:</strong> {when(receipt.receivedAtUtc)}</p>
          <p><strong>Patient:</strong> {receipt.patientName}</p>
          <p><strong>Service:</strong> Dental services</p>
          <p><strong>Method:</strong> {receipt.method}</p>
          {receipt.reference && <p><strong>Transaction reference:</strong> {receipt.reference}</p>}
          <hr/>
          <p><strong>Amount received:</strong> {money(receipt.amount)}</p>
          <p><strong>Total billed for visit:</strong> {money(receipt.amountBilled)}</p>
          <p><strong>Total received for visit:</strong> {money(receipt.totalPaid)}</p>
          <p><strong>Outstanding balance:</strong> {money(receipt.balance)}</p>
          <p className="checkout-receipt-note">Payment acknowledgement only. Not a tax invoice or medical-aid claim.</p>
        </div>
      </section>}
    </div>
  )
}
