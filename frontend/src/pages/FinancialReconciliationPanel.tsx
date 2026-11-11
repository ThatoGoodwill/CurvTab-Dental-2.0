import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import './BillingClientGuide.css'
import './FinancialReconciliationPanel.css'

type ExternalEvidence = {
  id: string
  instrument: string
  ledgerReceived: number
  verifiedReceived: number
  evidenceReference: string
  verificationSource: string
  externalSettlementConfirmed: boolean
}
type FinancialSummary = {
  countSubmitted: boolean
  submissionId?: string
  businessDate: string
  originalCountedCash?: number
  originalExpectedCash?: number
  originalVariance?: number
  receipts?: { cash: number; card: number; eft: number }
  latestCard?: ExternalEvidence | null
  latestEft?: ExternalEvidence | null
  financialSignoff?: {
    id: string
    signedAtUtc: string
    signedByUserId: string
    handoverReason: string
    snapshotJson: string
  } | null
  canSubmit?: boolean
  managerApproved?: boolean
  note?: string
}
const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n)
async function err(res: Response) {
  const body = await res.json().catch(() => null) as { message?: string } | null
  return body?.message ?? `Request failed (${res.status})`
}

export default function FinancialReconciliationPanel({ businessDate, isManager }: { businessDate: string; isManager: boolean }) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [instrument, setInstrument] = useState<'Card' | 'EFT'>('Card')
  const [received, setReceived] = useState('')
  const [source, setSource] = useState('')
  const [reference, setReference] = useState('')
  const [externalConfirmed, setExternalConfirmed] = useState(false)
  const [reviewExpenses, setReviewExpenses] = useState(false)
  const [reviewRefunds, setReviewRefunds] = useState(false)
  const [reviewLabs, setReviewLabs] = useState(false)
  const [handover, setHandover] = useState('')
  const [showEvidence, setShowEvidence] = useState(false)
  const [showSignoff, setShowSignoff] = useState(false)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const evidenceId = useRef<string | null>(null)
  const signoffId = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/api/billing/financial-reconciliation?date=${encodeURIComponent(businessDate)}`,
      { credentials: 'include', cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error(await err(res))
        return res.json() as Promise<FinancialSummary>
      })
      .then(data => { if (active) { setSummary(data); setError('') } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load settlement evidence') })
    return () => { active = false }
  }, [businessDate, reload])

  const ledgerValue = instrument === 'Card' ? summary?.receipts?.card : summary?.receipts?.eft

  async function saveEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !summary?.submissionId) return
    setBusy(true); setError(''); setNotice('')
    evidenceId.current ??= crypto.randomUUID()
    try {
      const res = await fetch('/api/billing/financial-reconciliation/evidence', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          requestId: evidenceId.current,
          submissionId: summary.submissionId, instrument,
          verifiedReceived: Number(received),
          evidenceReference: reference.trim(),
          verificationSource: source.trim(),
          externalSettlementConfirmed: externalConfirmed,
        }),
      })
      if (!res.ok) throw new Error(await err(res))
      const result = await res.json() as { matched?: boolean }
      evidenceId.current = null
      setReceived(''); setReference(''); setSource(''); setExternalConfirmed(false)
      setShowEvidence(false)
      setNotice(result.matched === false ?
        'Evidence saved with an unresolved mismatch. Financial sign-off remains blocked.' :
        'Settlement evidence recorded. The reference must be independently verifiable.')
      setReload(n => n + 1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save external evidence') }
    finally { setBusy(false) }
  }

  async function submitSignoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !summary?.submissionId) return
    setBusy(true); setError(''); setNotice('')
    signoffId.current ??= crypto.randomUUID()
    try {
      const res = await fetch('/api/billing/financial-reconciliation/signoff', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          requestId: signoffId.current,
          submissionId: summary.submissionId,
          expensesReviewed: reviewExpenses,
          refundsReviewed: reviewRefunds,
          labPayoutsReviewed: reviewLabs,
          handoverReason: handover.trim(),
        }),
      })
      if (!res.ok) throw new Error(await err(res))
      signoffId.current = null; setShowSignoff(false)
      setNotice('Financial sign-off recorded. The medical-aid review remains independent.')
      setReload(n => n + 1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign off') }
    finally { setBusy(false) }
  }

  if (!summary?.countSubmitted) return null
  return <section className="ct-guide-panel ct-financial-evidence">
    <header className="ct-financial-evidence-header">
      <div><small>DAY CLOSE / STEPS 2–4</small><h3>Card, EFT and Financial Sign-Off</h3>
        <p>External settlement references are not payments. Mismatches require investigation.</p></div>
      <button type="button" className="secondary-button" onClick={() => setReload(n => n + 1)}>
        <RefreshCw size={14}/> Refresh
      </button>
    </header>
    {error && <p className="ct-guide-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="ct-financial-method-grid">
      {(['Card', 'EFT'] as const).map(method => {
        const item = method === 'Card' ? summary.latestCard : summary.latestEft
        const expected = method === 'Card' ? summary.receipts?.card : summary.receipts?.eft
        const matched = item?.externalSettlementConfirmed && expected === item.verifiedReceived &&
          expected === item.ledgerReceived
        return <article key={method}>
          <h4>{method === 'Card' ? 'Card terminal settlement' : 'EFT bank confirmation'}</h4>
          <small>Recorded ledger</small><strong>{expected == null ? '—' : money(expected)}</strong>
          <small>External evidence</small><strong>{item ? money(item.verifiedReceived) : 'Not supplied'}</strong>
          <span className={'ct-financial-evidence-state' + (matched ? ' matched' : '')}>
            {matched ? 'Matched · staff-reported evidence' : item ? 'Mismatch / exception' : 'Evidence required'}
          </span>
          {item && <small>Reference: {item.evidenceReference} · {item.verificationSource}</small>}
          {!summary.financialSignoff && <button className="secondary-button" type="button"
            onClick={() => { setInstrument(method); setShowEvidence(true); setError('') }}>
            {item ? 'Record updated evidence' : 'Record evidence'}
          </button>}
        </article>
      })}
    </div>
    {summary.financialSignoff ? <p className="ct-guide-status">
      <ShieldCheck size={15}/> Financial sign-off frozen on{' '}
      {new Date(summary.financialSignoff.signedAtUtc).toLocaleString('en-ZA')}.
      Original count and shortage remain unchanged. Medical-aid sign-off is separate.
    </p> : <div className="ct-financial-final">
      <p>Review actual expenses, recorded refunds and source-linked lab payouts before handover. Do not re-enter an existing lab payout.</p>
      <button type="button" className="primary-button" disabled={!summary.canSubmit || !isManager}
        onClick={() => setShowSignoff(true)}><ClipboardCheck size={15}/> Review final financial sign-off</button>
      {!summary.managerApproved && <small>The practice manager must approve the cash count before final financial sign-off.</small>}
      {!summary.canSubmit && <small>Both card and EFT evidence must match the ledger and manager approval must be recorded.</small>}
      {!isManager && <small>Only PracticeAdmin can submit the final financial sign-off.</small>}
    </div>}
    {showEvidence && !summary.financialSignoff && <div className="ct-guide-drawer-backdrop">
      <form className="ct-guide-drawer" onSubmit={event => void saveEvidence(event)}>
        <header><h3>{instrument} settlement evidence</h3>
          <button type="button" className="secondary-button" onClick={() => setShowEvidence(false)}>Close</button>
        </header>
        <p>Ledger: {ledgerValue == null ? '—' : money(ledgerValue)}. Record actual external evidence, not an estimate.</p>
        <div className="ct-guide-form">
          <label>{instrument === 'Card' ? 'Confirmed terminal batch amount' : 'Cleared bank EFT amount'}
            <input required type="number" min="0" step="0.01" value={received}
              onChange={e => { setReceived(e.target.value); evidenceId.current = null }} />
          </label>
          <label>External evidence type/source
            <input required minLength={3} maxLength={40} value={source} placeholder="Bank statement / terminal batch"
              onChange={e => { setSource(e.target.value); evidenceId.current = null }}/>
          </label>
          <label>External settlement reference
            <input required minLength={3} maxLength={300} value={reference}
              onChange={e => { setReference(e.target.value); evidenceId.current = null }}/>
          </label>
          <label><input type="checkbox" required checked={externalConfirmed}
            onChange={e => { setExternalConfirmed(e.target.checked); evidenceId.current = null }}/>
            I have checked actual cleared bank/terminal evidence, not a pending instruction.</label>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Record immutable evidence event'}</button>
        </div>
      </form>
    </div>}
    {showSignoff && !summary.financialSignoff && <div className="ct-guide-drawer-backdrop">
      <form className="ct-guide-drawer" onSubmit={event => void submitSignoff(event)}>
        <header><h3>Financial handover review</h3>
          <button className="secondary-button" type="button" onClick={() => setShowSignoff(false)}>Close</button></header>
        <p>Original shortage: {money(-(summary.originalVariance ?? 0))} when positive.
          A handover does not remove or balance any discrepancy.</p>
        <div className="ct-guide-form">
          <label><input type="checkbox" checked={reviewExpenses}
            onChange={e => { setReviewExpenses(e.target.checked); signoffId.current = null }}/>
            All expense sources, methods and authorisations reviewed</label>
          <label><input type="checkbox" checked={reviewRefunds}
            onChange={e => { setReviewRefunds(e.target.checked); signoffId.current = null }}/>
            Refund records and matching ledger effects reviewed</label>
          <label><input type="checkbox" checked={reviewLabs}
            onChange={e => { setReviewLabs(e.target.checked); signoffId.current = null }}/>
            Lab payouts reconciled once against supplier liability</label>
          <label>Handover explanation and unresolved exceptions
            <textarea required minLength={5} maxLength={1000} rows={3} value={handover}
              onChange={e => { setHandover(e.target.value); signoffId.current = null }}/></label>
          <button className="primary-button" type="submit"
            disabled={busy || !reviewExpenses || !reviewRefunds || !reviewLabs || handover.trim().length < 5}>
            {busy ? 'Signing…' : 'Submit independent financial sign-off'}
          </button>
        </div>
      </form>
    </div>}
  </section>
}
