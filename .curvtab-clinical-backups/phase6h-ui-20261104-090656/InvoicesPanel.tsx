import { useEffect, useState } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import InvoiceCorrectionsPanel from './InvoiceCorrectionsPanel'
import './InvoicesPanel.css'

type InvoiceRow = {
  id: string
  patientId: string
  appointmentId: string
  invoiceNumber: string
  totalAmount: number
  allocatedAmount: number
  creditedAmount: number
  netAmount: number
  balance: number
  issuedAtUtc: string
}

type Eligible = {
  consultationId: string
  patientName: string
  amount: number
  chargeCount: number
}

type InvoiceDetails = InvoiceRow & {
  lines: {
    id: string
    description: string
    amount: number
  }[]
  allocations: {
    id: string
    paymentId: string
    amount: number
    isReversed: boolean
  }[]
  availablePayments: {
    paymentId: string
    receiptNumber: string
    method: string
    availableAmount: number
  }[]
}

type Props = {
  canIssue: boolean
}

const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)

async function message(response: Response): Promise<string> {
  try {
    const body = await response.json() as {
      message?: string
      title?: string
    }
    return body.message || body.title ||
      `Request failed (${response.status}).`
  } catch {
    return `Request failed (${response.status}).`
  }
}

function invoicePaymentStatus(total: number, allocated: number) {
  if (total <= 0) return 'Credited'
  if (allocated <= 0) return 'Unpaid'
  if (allocated >= total) return 'Paid'
  return 'Partially paid'
}

export default function InvoicesPanel({ canIssue }: Props) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [eligible, setEligible] = useState<Eligible[]>([])
  const [selected, setSelected] = useState('')
  const [details, setDetails] = useState<InvoiceDetails | null>(null)
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const [invoiceResponse, eligibleResponse] = await Promise.all([
          fetch('/api/finance/invoices', {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }),
          canIssue
            ? fetch('/api/finance/invoices/eligible-consultations', {
                credentials: 'include',
                cache: 'no-store',
                signal: controller.signal,
              })
            : Promise.resolve(null),
        ])

        if (!invoiceResponse.ok) {
          throw new Error(await message(invoiceResponse))
        }

        const rows = await invoiceResponse.json() as InvoiceRow[]
        if (controller.signal.aborted) return
        setInvoices(rows)

        if (eligibleResponse) {
          if (!eligibleResponse.ok) {
            throw new Error(await message(eligibleResponse))
          }
          const available = await eligibleResponse.json() as Eligible[]
          if (!controller.signal.aborted) setEligible(available)
        }

        setError('')
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error
            ? cause.message : 'Unable to load invoices.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [canIssue, reload])

  useEffect(() => {
    if (!selected) return

    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(
          `/api/finance/invoices/${encodeURIComponent(selected)}`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        )

        if (!response.ok) throw new Error(await message(response))

        const result = await response.json() as InvoiceDetails

        if (!controller.signal.aborted) {
          setDetails(result)
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setDetails(null)
          setError(cause instanceof Error
            ? cause.message : 'Unable to load invoice.')
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [selected, reload])

  async function issue(consultationId: string) {
    if (!canIssue || busy) return

    if (!window.confirm(
      'Issue a permanent invoice from this finalised consultation?'
    )) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(
        `/api/finance/invoices/from-consultation/${encodeURIComponent(consultationId)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      )

      if (!response.ok) throw new Error(await message(response))

      const result = await response.json() as { id: string }
      setSelected(result.id)
      setDetails(null)
      setNotice('Invoice issued. No payment has been recorded.')
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Invoice creation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function allocate() {
    if (!details || !paymentId || busy) return

    const value = Number(amount)
    const available = details.availablePayments.find(
      x => x.paymentId === paymentId
    )

    if (
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > details.balance ||
      !available ||
      value > available.availableAmount
    ) {
      setError('Enter an amount within the receipt and invoice balances.')
      return
    }

    if (!window.confirm(
      'Allocate this existing receipt to the selected invoice?'
    )) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(
        `/api/finance/invoices/${encodeURIComponent(details.id)}/allocations`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            paymentId,
            amount: value,
          }),
        }
      )

      if (!response.ok) throw new Error(await message(response))

      setPaymentId('')
      setAmount('')
      setNotice('Existing receipt allocated to the invoice.')
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Allocation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel ct-invoices">
      <header className="ct-invoices-header">
        <div>
          <div className="eyebrow">FINANCE · INVOICE CONTROL</div>
          <h2>Invoices & Payment Allocations</h2>
          <p>Posted consultation invoices linked to recorded receipts</p>
        </div>
        <button type="button" className="secondary-button"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setReload(v => v + 1)
          }}>
          <RefreshCw size={16}/> Refresh
        </button>
      </header>

      {error && <p className="ct-invoices-error" role="alert">{error}</p>}
      {notice && <p className="ct-invoices-success" role="status">{notice}</p>}

      {canIssue && (
        <div className="ct-invoices-section">
          <h3>Finalised consultations ready to invoice</h3>
          {eligible.length === 0
            ? <p>No eligible consultations found.</p>
            : eligible.map(item => (
              <article key={item.consultationId} className="ct-invoice-row">
                <div>
                  <strong>{item.patientName}</strong>
                  <small>{item.chargeCount} charges</small>
                </div>
                <strong>{money(item.amount)}</strong>
                <button type="button" className="secondary-button"
                  disabled={busy}
                  onClick={() => void issue(item.consultationId)}>
                  Issue invoice
                </button>
              </article>
            ))}
        </div>
      )}

      <div className="ct-invoices-section">
        <h3>Posted invoices</h3>
        {loading
          ? <p>Loading invoices…</p>
          : invoices.length === 0
            ? <p>No invoices issued yet.</p>
            : invoices.map(item => (
              <button type="button" key={item.id}
                className={`ct-invoice-row ct-invoice-choice ${selected === item.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelected(item.id)
                  setDetails(null)
                  setPaymentId('')
                  setAmount('')
                }}>
                <FileText size={19}/>
                <span>{item.invoiceNumber}</span>
                <span>{money(item.totalAmount)}</span>
                <span className={`ct-invoice-payment-status ${
                  item.balance <= 0 ? 'paid' :
                  item.allocatedAmount > 0 ? 'partial' : 'unpaid'
                }`}>
                  {invoicePaymentStatus(
                    item.netAmount,
                    item.allocatedAmount
                  )}
                </span>
                <strong>Balance: {money(item.balance)}</strong>
              </button>
            ))}
      </div>

      {selected && details && (
        <div className="ct-invoices-section">
          <h3>Invoice details — {details.invoiceNumber}</h3>
          <div className="ct-invoices-totals">
            <span>Billed: <strong>{money(details.totalAmount)}</strong></span>
            <span>Credits: <strong>{money(details.creditedAmount)}</strong></span>
            <span>Net invoiced: <strong>{money(details.netAmount)}</strong></span>
            <span>Allocated: <strong>{money(details.allocatedAmount)}</strong></span>
            <span>Balance: <strong>{money(details.balance)}</strong></span>
          </div>

          <div className="ct-invoice-settlement-summary">
            <strong>
              Payment status: {invoicePaymentStatus(
                details.netAmount,
                details.allocatedAmount
              )}
            </strong>
            <span>
              {details.balance <= 0
                ? 'Fully allocated — no remaining invoice balance.'
                : 'Allocate an eligible existing receipt to reduce this balance.'}
            </span>
          </div>

          <h4>Treatment lines</h4>
          {details.lines.map(item => (
            <div className="ct-invoice-row" key={item.id}>
              <span>{item.description}</span>
              <strong>{money(item.amount)}</strong>
            </div>
          ))}

          <h4>Receipt allocations</h4>
          {details.allocations.length === 0
            ? <p>No receipts allocated to this invoice.</p>
            : details.allocations.map(item => (
              <div className="ct-invoice-row" key={item.id}>
                <span>
                  Receipt ID: {item.paymentId}
                  {item.isReversed ? ' · REVERSED' : ''}
                </span>
                <strong>{money(item.amount)}</strong>
              </div>
            ))}

          {details.balance > 0 && details.availablePayments.length > 0 && (
            <div className="ct-invoice-allocation">
              <h4>Allocate an existing receipt</h4>
              <label>
                Available payment
                <select value={paymentId}
                  onChange={e => {
                    const id = e.target.value
                    setPaymentId(id)
                    const receipt = details.availablePayments.find(
                      payment => payment.paymentId === id
                    )
                    setAmount(receipt
                      ? Math.min(
                          receipt.availableAmount,
                          details.balance
                        ).toFixed(2)
                      : '')
                  }}>
                  <option value="">Choose receipt</option>
                  {details.availablePayments.map(item => (
                    <option key={item.paymentId} value={item.paymentId}>
                      {item.receiptNumber} · {item.method} ·{' '}
                      {money(item.availableAmount)} available
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount to allocate (ZAR)
                <input inputMode="decimal" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"/>
              </label>
              <button type="button" className="primary-button"
                disabled={!paymentId || !amount || busy}
                onClick={() => void allocate()}>
                Allocate receipt
              </button>
            </div>
          )}

          <InvoiceCorrectionsPanel
            key={details.id}
            invoiceId={details.id}
            availableCredit={Math.max(0, details.balance)}
            allocations={details.allocations}
            canManage={canIssue}
            onChanged={() => {
              setDetails(null)
              setReload(value => value + 1)
            }}
          />

          <p className="ct-invoices-note">
            Allocating a receipt does not collect money again.
            Posted invoices and allocations have no edit or
            delete actions in this initial version.
          </p>
        </div>
      )}
    </section>
  )
}
