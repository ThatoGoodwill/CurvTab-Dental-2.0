import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Banknote, ClipboardCheck, Plus, RefreshCw } from 'lucide-react'
import './FinanceOperationsPanel.css'

type Expense = {
  id: string
  expenseDate: string
  category: string
  description: string
  amount: number
  method: string
  reference: string | null
  recordedAtUtc: string
}

type Signoff = {
  id: string
  openingFloat: number
  cashReceived: number
  cashExpenses: number
  expectedCash: number
  countedCash: number
  variance: number
  signedAtUtc: string
  signedByUserId: string
  notes: string | null
}

type Summary = {
  businessDate: string
  cashReceived: number
  cashReceiptCount: number
  cashExpenses: number
  cashExpenseCount: number
  expenses: Expense[]
  signoff: Signoff | null
  changedAfterSignoff: boolean
}

const categories = [
  'Dental Supplies', 'Laboratory', 'Equipment', 'Utilities',
  'Maintenance', 'Rent', 'Staff Costs', 'Other',
]

function todaySA() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function money(value: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)
}

function validMoney(value: string) {
  return /^\d+(\.\d{1,2})?$/.test(value) &&
    Number(value) >= 0 &&
    Number(value) <= 10_000_000
}

async function errorMessage(response: Response) {
  try {
    const result = await response.json() as {
      message?: string
      title?: string
    }
    return result.message || result.title ||
      `Request failed (${response.status}).`
  } catch {
    return `Request failed (${response.status}).`
  }
}

export default function FinanceOperationsPanel({
  canManage,
}: {
  canManage: boolean
}) {
  const [date, setDate] = useState(todaySA)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [category, setCategory] = useState(categories[0])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const expenseRequestId = useRef<string | null>(null)

  const [showExpenseForm, setShowExpenseForm] = useState(false)

  const endpoint = '/api/finance/operations'

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function load() {
      setLoading(true)
      try {
        const response = await fetch(
          `${endpoint}?date=${encodeURIComponent(date)}`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error(await errorMessage(response))
        }

        const data = await response.json() as Summary

        if (active) {
          setSummary(data)
          setError('')
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          setSummary(null)
          setError(cause instanceof Error
            ? cause.message : 'Unable to load daily cash summary.')
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
  }, [date, reload])

  async function recordExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !canManage) return

    if (!validMoney(amount) || Number(amount) <= 0) {
      setError('Enter a positive amount with no more than two decimals.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    // Keep this ID for retries so a repeated request cannot
    // silently create a second expense.
    expenseRequestId.current ??= crypto.randomUUID()

    try {
      const response = await fetch(`${endpoint}/expenses`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          requestId: expenseRequestId.current,
          expenseDate: date,
          category,
          description: description.trim(),
          amount: Number(amount),
          method,
          reference: reference.trim() || null,
        }),
      })

      if (!response.ok) throw new Error(await errorMessage(response))

      expenseRequestId.current = null
      setDescription('')
      setAmount('')
      setReference('')
      setNotice('Expense recorded in the financial audit history.')
      setShowExpenseForm(false)
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Unable to record expense.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel ct-finance-ops">
      <header className="ct-finance-ops-header">
        <div>
          <div className="eyebrow">FINANCE · DAILY CONTROL</div>
          <h2>Expenses & Financial Controls</h2>
          <p>Practice expenses and daily cash reconciliation</p>
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

      <label className="ct-finance-date">
        Business date (South Africa)
        <input
          type="date"
          value={date}
          max={todaySA()}
          onChange={event => {
            setDate(event.target.value)
            setConfirmed(false)
            setNotice('')
            expenseRequestId.current = null
          }}
        />
      </label>

      {error && <p role="alert" className="ct-finance-error">{error}</p>}
      {notice && <p role="status" className="ct-finance-success">{notice}</p>}
      {loading && <p>Loading financial records…</p>}

      {summary && !loading && (
        <>
          <div className="ct-finance-cards">
            <article>
              <Banknote size={20}/>
              <span>Cash receipts</span>
              <strong>{money(summary.cashReceived)}</strong>
              <small>{summary.cashReceiptCount} recorded payments</small>
            </article>
            <article>
              <Banknote size={20}/>
              <span>Cash expenses</span>
              <strong>{money(summary.cashExpenses)}</strong>
              <small>{summary.cashExpenseCount} cash expenses</small>
            </article>
          </div>

          {summary.changedAfterSignoff && (
            <p role="alert" className="ct-finance-warning">
              Cash transactions changed after the original sign-off.
              The recorded cash-up needs investigation.
            </p>
          )}

          <h3>Practice expenses</h3>

          {summary.expenses.length === 0 ? (
            <p>No expenses recorded for this date.</p>
          ) : (
            <div className="ct-finance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.expenses.map(expense => (
                    <tr key={expense.id}>
                      <td>{expense.category}</td>
                      <td>{expense.description}</td>
                      <td>{expense.method}</td>
                      <td>{expense.reference || '—'}</td>
                      <td>{money(expense.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManage && (
            <div className="ct-finance-actions">
              <button type="button" className="primary-button" disabled={busy}
                onClick={() => { setError(''); setShowExpenseForm(true) }}>
                <Plus size={16}/> Record expense
              </button>
              {showExpenseForm && (
                <div className="ct-finance-action-overlay" role="presentation"
                  onMouseDown={event => {
                    if (event.target === event.currentTarget && !busy) setShowExpenseForm(false)
                  }}>
                  <div className="ct-finance-action-dialog" role="dialog" aria-modal="true"
                    aria-label="Record practice expense">
                    <header className="ct-finance-action-header">
                      <div><strong>Record expense</strong><small>Save an audited practice expense</small></div>
                      <button type="button" className="secondary-button" disabled={busy}
                        onClick={() => setShowExpenseForm(false)}>Close ×</button>
                    </header>
                    {error && <p role="alert" className="ct-finance-error">{error}</p>}
                    <form className="ct-finance-form"
                      onSubmit={event => void recordExpense(event)}>
            
              <h3><Plus size={18}/> Record expense</h3>

              <label>
                Category
                <select value={category}
                  onChange={event => {
                    setCategory(event.target.value)
                    expenseRequestId.current = null
                  }}>
                  {categories.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label>
                Amount (ZAR)
                <input required inputMode="decimal" value={amount}
                  onChange={event => {
                    setAmount(event.target.value)
                    expenseRequestId.current = null
                  }} placeholder="0.00"/>
              </label>

              <label>
                Payment method
                <select value={method}
                  onChange={event => {
                    setMethod(event.target.value)
                    expenseRequestId.current = null
                  }}>
                  <option>Cash</option>
                  <option>Card</option>
                  <option>EFT</option>
                </select>
              </label>

              <label>
                Payment reference
                <input
                  required={method !== 'Cash'}
                  maxLength={100}
                  value={reference}
                  onChange={event => {
                    setReference(event.target.value)
                    expenseRequestId.current = null
                  }}
                  placeholder="Receipt / EFT reference"
                />
              </label>

              <label className="ct-finance-wide">
                Description
                <textarea required rows={3} maxLength={250}
                  value={description}
                  onChange={event => {
                    setDescription(event.target.value)
                    expenseRequestId.current = null
                  }}
                  placeholder="What was purchased and why?"/>
              </label>

              <button type="submit" className="primary-button" disabled={busy}>
                Record audited expense
              </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="ct-finance-signoff">
            <h3><ClipboardCheck size={18}/> Separate Cash Day Close</h3>
            <p>Original daily cash sign-offs are historical read-only records. All new blind cash counts and manager decisions belong to Billing → Cash Day Close, with no combined medical-aid reconciliation.</p>
            {summary.signoff && <p><strong>Legacy record:</strong> Signed {new Date(summary.signoff.signedAtUtc).toLocaleString('en-ZA')}. Snapshot preserved; do not submit again here.</p>}
          </div>

          <p className="ct-finance-footnote">
            This cash-up excludes refunds, cash banking, transfers and
            unrecorded cash movements. It is not a complete general ledger.
          </p>
        </>
      )}
    </section>
  )
}
