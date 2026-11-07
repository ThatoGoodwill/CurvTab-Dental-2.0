import { useEffect, useState } from 'react'
import { CreditCard, RefreshCw } from 'lucide-react'
import { apiRequest } from '../services/api'
import { useConfirmDialog } from '../components/useConfirmDialog'
import './PlatformSubscriptionsPage.css'

type Subscription = {
  id: string
  planName: string
  billingCycle: string
  amount: number
  status: string
  periodStartUtc: string
  periodEndUtc: string
  graceDays: number
}

type SubscriptionRow = {
  practiceId: string
  practiceName: string
  practiceActive: boolean
  subscription: Subscription | null
  verifiedPaymentsTotal: number
}

function dateInput(value: string) {
  return value.slice(0, 10)
}

function utcDate(value: string) {
  return `${value}T00:00:00.000Z`
}

export default function PlatformSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const [planName, setPlanName] = useState('Standard')
  const [billingCycle, setBillingCycle] = useState('Monthly')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = useState('')
  const [graceDays, setGraceDays] = useState('7')
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState('Bank Transfer')
  const [evidenceChecked, setEvidenceChecked] = useState(false)

  const { confirm, confirmationDialog } = useConfirmDialog()

  useEffect(() => {
    let active = true
    apiRequest<SubscriptionRow[]>('/platform/subscriptions')
      .then(data => {
        if (active) {
          setRows(data)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error
            ? cause.message : 'Unable to load subscriptions.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [reload])

  const selected = rows.find(row => row.practiceId === selectedId)

  function selectPractice(row: SubscriptionRow) {
    setSelectedId(row.practiceId)
    setError('')
    setNotice('')
    setReference('')
    setEvidenceChecked(false)

    if (row.subscription) {
      const s = row.subscription
      setPlanName(s.planName)
      setBillingCycle(s.billingCycle)
      setAmount(String(s.amount))
      setStartDate(dateInput(s.periodStartUtc))
      setEndDate(dateInput(s.periodEndUtc))
      setGraceDays(String(s.graceDays))
    } else {
      setPlanName('Standard')
      setBillingCycle('Monthly')
      setAmount('')
      setStartDate(new Date().toISOString().slice(0, 10))
      setEndDate('')
      setGraceDays('7')
    }
  }

  async function saveSubscription() {
    if (!selected || busy) return
    setError('')
    setNotice('')

    const fee = Number(amount)

    if (!Number.isFinite(fee) || fee < 0 ||
        !amount.trim() || !endDate || endDate <= startDate) {
      setError('Enter a valid fee and subscription period.')
      return
    }

    if (!await confirm({
      title: 'Save subscription',
      message: `Configure ${selected.practiceName} on the ${planName} plan for R${fee.toFixed(2)} per ${billingCycle.toLowerCase()} billing period? This does not change the practice's access status.`,
      confirmLabel: 'Save subscription'
    })) return

    setBusy(true)
    try {
      await apiRequest(
        `/platform/subscriptions/${selected.practiceId}`,
        'PUT',
        {
          planName,
          billingCycle,
          amount: fee,
          periodStartUtc: utcDate(startDate),
          periodEndUtc: utcDate(endDate),
          graceDays: Number(graceDays)
        }
      )
      setNotice('Subscription saved successfully.')
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Unable to save subscription.')
    } finally {
      setBusy(false)
    }
  }

  async function recordPayment() {
    const s = selected?.subscription
    if (!s || busy || !evidenceChecked || !reference.trim()) return

    if (!await confirm({
      title: 'Record verified payment',
      message: `Confirm you independently verified payment reference "${reference}" for R${s.amount.toFixed(2)} from ${selected?.practiceName}. This will create an audited subscription payment record.`,
      confirmLabel: 'Record verified payment',
      variant: 'danger'
    })) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await apiRequest(
        `/platform/subscriptions/${s.id}/verified-payments`,
        'POST',
        {
          amount: s.amount,
          reference: reference.trim(),
          method,
          paidAtUtc: new Date().toISOString()
        }
      )
      setNotice('Verified payment recorded.')
      setReference('')
      setEvidenceChecked(false)
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Unable to record payment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ct-subscriptions">
      {confirmationDialog}

      <header className="ct-subscriptions-heading">
        <div>
          <span className="eyebrow">SAAS PLATFORM</span>
          <h1>Subscription Management</h1>
          <p>Manage client billing and subscription records.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setLoading(true)
            setReload(v => v + 1)
          }}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      {error && <p role="alert" className="ct-subscriptions-error">{error}</p>}
      {notice && <p role="status" className="ct-subscriptions-success">{notice}</p>}

      <div className="ct-subscriptions-stats">
        <article>
          <span>Registered Practices</span>
          <strong>{rows.length}</strong>
        </article>
        <article>
          <span>Subscriptions Configured</span>
          <strong>{rows.filter(x => x.subscription).length}</strong>
        </article>
        <article>
          <span>Verified Subscription Payments</span>
          <strong>R {rows.reduce((sum, x) =>
            sum + x.verifiedPaymentsTotal, 0
          ).toFixed(2)}</strong>
        </article>
      </div>

      <section className="ct-subscriptions-panel">
        <h2>Dental Practices</h2>

        {loading && <p>Loading subscriptions...</p>}

        {!loading && (
          <div className="ct-subscriptions-practices">
            {rows.map(row => (
              <button
                type="button"
                key={row.practiceId}
                className={selectedId === row.practiceId ? 'selected' : ''}
                onClick={() => selectPractice(row)}
              >
                <CreditCard size={20} />
                <span>
                  <strong>{row.practiceName}</strong>
                  <small>
                    {row.subscription
                      ? `${row.subscription.planName} · ${row.subscription.status}`
                      : 'No subscription assigned'}
                  </small>
                </span>
                <span className="ct-subscriptions-status">
                  {row.practiceActive ? 'Access Active' : 'Access Suspended'}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="ct-subscriptions-panel">
          <h2>{selected.practiceName}</h2>
          <p>Subscription agreement and billing information</p>

          <div className="ct-subscriptions-form">
            <label>
              Subscription Plan
              <select value={planName}
                onChange={e => setPlanName(e.target.value)}>
                <option>Standard</option>
                <option>Professional</option>
                <option>Enterprise</option>
              </select>
            </label>

            <label>
              Billing Cycle
              <select value={billingCycle}
                onChange={e => setBillingCycle(e.target.value)}>
                <option>Monthly</option>
                <option>Quarterly</option>
                <option>Annual</option>
              </select>
            </label>

            <label>
              Fee (ZAR)
              <input type="number" min="0" step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)} />
            </label>

            <label>
              Start Date
              <input type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </label>

            <label>
              End / Renewal Date
              <input type="date" value={endDate}
                onChange={e => setEndDate(e.target.value)} />
            </label>

            <label>
              Grace Period (days)
              <input type="number" min="0" max="60"
                value={graceDays}
                onChange={e => setGraceDays(e.target.value)} />
            </label>
          </div>

          <button className="primary-button"
            type="button" disabled={busy || Boolean(
              selected.subscription &&
              selected.verifiedPaymentsTotal > 0
            )}
            onClick={() => void saveSubscription()}>
            {busy ? 'Saving...' : 'Save Subscription'}
          </button>

          {selected.subscription && selected.verifiedPaymentsTotal > 0 && (
            <p>Existing paid agreements are locked against direct editing.</p>
          )}
        </section>
      )}

      {selected?.subscription && (
        <section className="ct-subscriptions-panel">
          <h2>Record Verified Subscription Payment</h2>
          <p>
            Enter the reference only after checking genuine bank
            or payment-provider evidence.
          </p>

          <div className="ct-subscriptions-form">
            <label>
              Payment Reference
              <input value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Verified transaction reference" />
            </label>

            <label>
              Payment Method
              <select value={method}
                onChange={e => setMethod(e.target.value)}>
                <option>Bank Transfer</option>
                <option>Card</option>
                <option>Other Verified Method</option>
              </select>
            </label>
          </div>

          <label className="ct-subscriptions-check">
            <input type="checkbox"
              checked={evidenceChecked}
              onChange={e => setEvidenceChecked(e.target.checked)}
            />
            I have independently verified this payment against
            genuine payment evidence.
          </label>

          <button className="primary-button"
            type="button"
            disabled={busy || !evidenceChecked || !reference.trim() ||
              selected.subscription.amount <= 0}
            onClick={() => void recordPayment()}>
            Record Verified Payment
          </button>
        </section>
      )}
    </div>
  )
}
