import { useEffect, useState } from 'react'
import { ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import RandIcon from '../components/RandIcon'
import './BillingClientGuide.css'
import './BillingDayCloseLandingPage.css'

type FinancialDay = {
  submitted: boolean
  status: string
  cash?: { cashReceived: number; countedCash: number; variance: number }
}
type ReceiptLedger = { totalReceived: number }
type ClaimDay = {
  signed: boolean
  status: string
  uniqueClaims: number
  submittedValue: number
  actionsPending: number
}
type Props = {
  businessDate: string
  onBusinessDateChange: (date: string) => void
  openFinancial: () => void
  openClaims: () => void
}

const todaySA = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function financialStatus(status?: string) {
  if (!status) return 'Unavailable'
  if (status === 'CorrectionRequired') return 'Discrepancy — manager review required'
  if (status === 'Approved') return 'Cash count approved'
  if (status === 'Submitted') return 'Cash count submitted'
  if (status === 'Open') return 'Open — count not submitted'
  return status.replace(/([a-z])([A-Z])/g, '$1 $2')
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)

async function readDay<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not load sign-off status (${response.status}).`)
  return response.json() as Promise<T>
}

/** Read-only launcher: opening either workflow never signs off the other. */
export default function BillingDayCloseLandingPage({ businessDate: date, onBusinessDateChange, openFinancial, openClaims }: Props) {
  const [reload, setReload] = useState(0)
  const [financial, setFinancial] = useState<FinancialDay | null>(null)
  const [claims, setClaims] = useState<ClaimDay | null>(null)
  const [ledger, setLedger] = useState<ReceiptLedger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const from = new Date(`${date}T00:00:00+02:00`)
    const to = new Date(from.getTime() + 86400000)
    const interval = new URLSearchParams({ fromUtc: from.toISOString(), toUtc: to.toISOString() })
    Promise.allSettled([
      readDay<FinancialDay>(`/api/billing/cash-day-close?date=${encodeURIComponent(date)}`),
      readDay<ClaimDay>(`/api/billing/medical-aid-day-signoff?date=${encodeURIComponent(date)}`),
      readDay<ReceiptLedger>(`/api/finance/ledger?${interval.toString()}`),
    ]).then(([cash, aid, receipts]) => {
      if (!active) return
      setFinancial(cash.status === 'fulfilled' ? cash.value : null)
      setClaims(aid.status === 'fulfilled' ? aid.value : null)
      setLedger(receipts.status === 'fulfilled' ? receipts.value : null)
      const failed = [cash, aid, receipts].filter(item => item.status === 'rejected')
      if (failed.length) setError('One or more sign-off statuses could not be loaded. No sign-off was changed.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [date, reload])

  return <section className="ct-guide-page ct-guide-day-close-landing">
    <header className="ct-guide-heading">
      <div>
        <small>BILLING / DAY CLOSE</small>
        <h2>Day Close</h2>
        <p>Two independent reviews. Completing one never signs off the other.</p>
      </div>
      <div className="ct-guide-heading-tools">
        <label>Business date
          <input type="date" max={todaySA()} value={date} onChange={event => onBusinessDateChange(event.target.value)} />
        </label>
        <button type="button" className="secondary-button" disabled={loading}
          onClick={() => setReload(value => value + 1)}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
    </header>
    {error && <p className="ct-guide-error" role="alert">{error}</p>}
    <div className="ct-guide-day-close-grid">
      <article className="ct-guide-day-close-card">
        <div className="ct-guide-day-close-card-title"><ClipboardCheck size={20}/><h3>Financial Reconciliation</h3></div>
        <p className="ct-guide-status">Status: {loading ? 'Loading…' : financialStatus(financial?.status)}</p>
        <p>Physical blind cash count, card and EFT evidence, expenses, variance and manager exceptions.</p>
        <div className="ct-guide-day-close-card-total"><RandIcon size={18}/><strong>
          {ledger ? money(ledger.totalReceived) : '—'}
        </strong><small>Actual receipts — cash, card and EFT; claims excluded</small></div>
        <button type="button" className="primary-button" onClick={openFinancial}>Open Financial Reconciliation</button>
      </article>
      <article className="ct-guide-day-close-card">
        <div className="ct-guide-day-close-card-title"><ShieldCheck size={20}/><h3>Medical Aid Claims Review</h3></div>
        <p className="ct-guide-status">Status: {loading ? 'Loading…' : claims?.signed ? 'Signed' : claims ? 'Not signed' : 'Unavailable'}</p>
        <p>Independent dated submission snapshot, encounter checks and unresolved scheme follow-ups.</p>
        <div className="ct-guide-day-close-card-total"><strong>
          {claims ? `${claims.uniqueClaims} claims · ${money(claims.submittedValue)}` : '—'}
        </strong><small>Claimed only — not a receipt</small></div>
        <button type="button" className="primary-button" onClick={openClaims}>Open Medical Aid Review</button>
      </article>
    </div>
  </section>
}
