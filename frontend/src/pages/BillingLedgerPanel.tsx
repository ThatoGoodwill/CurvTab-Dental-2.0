import { useEffect, useState } from 'react'
import { Banknote, CreditCard, Landmark, Receipt, RefreshCw } from 'lucide-react'
import './BillingLedgerPanel.css'

type PaymentRow = {
  paymentId: string
  receiptNumber: string
  amount: number
  method: string
  reference: string | null
  receivedAtUtc: string
  receivedByUserId: string
  appointmentId: string | null
  patientId: string
  patientName: string
}

type Ledger = {
  currency: string
  transactionCount: number
  displayedCount: number
  totalReceived: number
  cashReceived: number
  cardReceived: number
  eftReceived: number
  transactions: PaymentRow[]
}

function localDate(daysAgo = 0): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function money(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function startOfLocalDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function nextLocalDay(value: string): Date {
  const date = startOfLocalDay(value)
  date.setDate(date.getDate() + 1)
  return date
}

export default function BillingLedgerPanel() {
  const [fromDate, setFromDate] = useState(localDate(6))
  const [toDate, setToDate] = useState(localDate())
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!fromDate || !toDate) return

    const from = startOfLocalDay(fromDate)
    const to = nextLocalDay(toDate)
    const days = (to.getTime() - from.getTime()) / 86400000

    if (to <= from || days > 31) {
      return
    }

    const controller = new AbortController()
    let active = true

    const params = new URLSearchParams({
      fromUtc: from.toISOString(),
      toUtc: to.toISOString(),
    })

    async function load() {
      setLoading(true)
      setError('')
      setLedger(null)

      try {
        const response = await fetch(
          `/api/finance/ledger?${params.toString()}`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error(`Unable to load ledger (${response.status}).`)
        }

        const result = await response.json() as Ledger
        if (active) setLedger(result)
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load financial records.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [fromDate, toDate, reload])

  const selectedFrom = fromDate ? startOfLocalDay(fromDate) : null
  const selectedTo = toDate ? nextLocalDay(toDate) : null
  const validRange = Boolean(
    selectedFrom &&
    selectedTo &&
    selectedTo > selectedFrom &&
    (selectedTo.getTime() - selectedFrom.getTime()) / 86400000 <= 31
  )

  return (
    <section className="panel ct-billing-ledger">
      <header className="ct-billing-header">
        <div>
          <div className="eyebrow">FINANCE · PAYMENT AUDIT</div>
          <h2>Cash Ledger & Receipts</h2>
          <p>Recorded patient payments and payment-method totals</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => setReload(value => value + 1)}
        >
          <RefreshCw size={17}/> Refresh
        </button>
      </header>

      <div className="ct-billing-filters">
        <label>
          From
          <input
            type="date"
            value={fromDate}
            onChange={event => setFromDate(event.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={toDate}
            onChange={event => setToDate(event.target.value)}
          />
        </label>
      </div>

      {!validRange && (
        <p role="alert" className="ct-billing-error">
          Choose a valid date range of up to 31 days.
        </p>
      )}
      {validRange && error && (
        <p role="alert" className="ct-billing-error">{error}</p>
      )}
      {loading && <p role="status">Loading payment records…</p>}

      {ledger && (
        <>
          <div className="ct-billing-kpis">
            <article>
              <Receipt size={21}/>
              <span>Total received</span>
              <strong>{money(ledger.totalReceived)}</strong>
            </article>
            <article>
              <Banknote size={21}/>
              <span>Cash received</span>
              <strong>{money(ledger.cashReceived)}</strong>
            </article>
            <article>
              <CreditCard size={21}/>
              <span>Card received</span>
              <strong>{money(ledger.cardReceived)}</strong>
            </article>
            <article>
              <Landmark size={21}/>
              <span>EFT received</span>
              <strong>{money(ledger.eftReceived)}</strong>
            </article>
          </div>

          <div className="ct-billing-transactions">
            <div className="ct-billing-section-heading">
              <h3>Payment Transactions</h3>
              <span>{ledger.transactionCount} recorded</span>
            </div>

            <div className="ct-billing-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Receipt</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Method</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.transactions.map(payment => (
                    <tr key={payment.paymentId}>
                      <td>{dateLabel(payment.receivedAtUtc)}</td>
                      <td>{payment.receiptNumber}</td>
                      <td>{payment.patientName}</td>
                      <td>{payment.method}</td>
                      <td>{payment.reference || '—'}</td>
                      <td className="ct-billing-amount">
                        {money(payment.amount)}
                      </td>
                    </tr>
                  ))}
                  {ledger.transactions.length === 0 && (
                    <tr>
                      <td colSpan={6}>No recorded payments in this date range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {ledger.transactionCount > ledger.displayedCount && (
              <p className="ct-billing-note">
                Displaying {ledger.displayedCount} of{' '}
                {ledger.transactionCount} transactions.
                The summary totals cover the complete selected period.
              </p>
            )}
          </div>

          <p className="ct-billing-note">
            These totals show payment records only. They exclude expenses,
            refunds, invoice adjustments and reconciliation differences
            because those financial workflows are not yet implemented.
          </p>
        </>
      )}
    </section>
  )
}
