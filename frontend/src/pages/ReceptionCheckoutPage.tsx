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
  balance: number
  currency: string
  payments: Payment[]
}
type PaymentResult = {
  paymentId: string
  receiptNumber: string
  amount: number
  balance?: number
  alreadyRecorded: boolean
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

export default function ReceptionCheckoutPage() {
  const [tab, setTab] = useState<'ready' | 'completed'>('ready')
  const [ready, setReady] = useState<WaitingCheckout[]>([])
  const [completed, setCompleted] = useState<HistoryRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Details | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [method, setMethod] = useState<'Cash' | 'Card' | 'EFT'>('Cash')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [revision, setRevision] = useState(0)
  const paymentRequestId = useRef<string | null>(null)

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

  useEffect(() => {
    if (!selectedId) return
    let active = true
    apiRequest<Details>(`/frontdesk/checkouts/${encodeURIComponent(selectedId)}`)
      .then(result => {
        if (!active) return
        setDetail(result)
        setAmount(result.balance > 0 ? result.balance.toFixed(2) : '')
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
    setReference('')
    setMethod('Cash')
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

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || busy || detail.status !== 'AwaitingCheckout') return
    const received = Number(amount)
    if (!Number.isFinite(received) || received <= 0 || received > detail.balance ||
        Math.abs(Math.round(received * 100) - received * 100) > 0.000001) {
      setError('Enter a valid amount that does not exceed the outstanding balance.')
      return
    }
    if (method !== 'Cash' && !reference.trim()) {
      setError('Enter the card terminal or EFT reference (not the card number).')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      if (!paymentRequestId.current) paymentRequestId.current = crypto.randomUUID()
      const result = await apiRequest<PaymentResult>(
        `/frontdesk/checkouts/${encodeURIComponent(detail.appointmentId)}/payments`,
        'POST',
        { requestId: paymentRequestId.current, amount: received, method,
          reference: reference.trim() || null }
      )
      paymentRequestId.current = null
      setSuccess(result.alreadyRecorded
        ? 'This payment was already recorded; no duplicate was created.'
        : 'Payment recorded successfully. Receipt is ready.')
      setReference('')
      setMethod('Cash')
      await showReceipt(result.paymentId)
      refresh()
    } catch (cause) {
      // Keep the request ID on errors so retries do not create duplicates.
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
                <span>{money(row.amountDue)} billed</span>
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
                <div><span>Payments received</span><strong>{money(detail.amountPaid)}</strong></div>
                <div className="checkout-due"><span>Remaining balance</span><strong>{money(detail.balance)}</strong></div>
              </div>
              {detail.status === 'AwaitingCheckout' && detail.balance > 0 && (
                <form className="checkout-payment-form" onSubmit={recordPayment}>
                  <h3>Record payment received</h3>
                  <label>Payment method
                    <select value={method} onChange={event => {
                      setMethod(event.target.value as 'Cash' | 'Card' | 'EFT')
                      paymentRequestId.current = null
                    }} disabled={busy}>
                      <option value="Cash">Cash</option><option value="Card">Card terminal</option><option value="EFT">EFT</option>
                    </select>
                  </label>
                  <label>Amount received (ZAR)
                    <input type="number" min="0.01" step="0.01" max={detail.balance}
                      value={amount} disabled={busy} required
                      onChange={event => { setAmount(event.target.value); paymentRequestId.current = null }} />
                  </label>
                  <label>External payment reference {method !== 'Cash' ? '(required)' : '(optional)'}
                    <input type="text" maxLength={100} value={reference} disabled={busy}
                      placeholder={method === 'Cash' ? 'Optional cash reference' : 'Terminal/EFT transaction reference — no card numbers'}
                      onChange={event => { setReference(event.target.value); paymentRequestId.current = null }} />
                  </label>
                  <button type="submit" className="primary-button" disabled={busy}>
                    <Wallet size={17}/>{busy ? 'Recording...' : 'Record Payment & Generate Receipt'}
                  </button>
                  <p className="checkout-hint">Partial payments are supported. Checkout is enabled only when the remaining balance is zero.</p>
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
