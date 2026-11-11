import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'

type RejectedClaim = {
  id: string
  claimNumber: string
  invoiceId: string
  patientName: string
  claimedAmount: number
}
type ClaimHistory = {
  events: Array<{
    id: string
    toStatus: string
    reason: string
    evidenceReference: string
    performedAtUtc: string
  }>
}

const money = (amount: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR',
}).format(amount)

async function apiError(response: Response) {
  const payload = await response.json().catch(() => null) as { message?: string } | null
  return payload?.message ?? `Request failed (${response.status}).`
}

/** Dentist-only entry. Only backend-signed clinician identity can approve a clinical code. */
export default function ClinicalClaimCorrectionsPage() {
  const [claims, setClaims] = useState<RejectedClaim[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [history, setHistory] = useState<ClaimHistory | null>(null)
  const [procedureCode, setProcedureCode] = useState('')
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestId = useRef<string | null>(null)
  const selected = claims.find(c => c.id === selectedId)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/clinical/claim-corrections', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await apiError(response))
        return response.json() as Promise<RejectedClaim[]>
      })
      .then(items => { if (!controller.signal.aborted) setClaims(items) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load corrections.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!selectedId) { setHistory(null); return }
    const controller = new AbortController()
    fetch(`/api/finance/medical-aid/claims/${encodeURIComponent(selectedId)}/workflow/history`,
      { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await apiError(response))
        return response.json() as Promise<ClaimHistory>
      })
      .then(item => { if (!controller.signal.aborted) setHistory(item) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load claim history.') })
    return () => controller.abort()
  }, [selectedId, reload])

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || saving) return
    if (!procedureCode.trim() || reason.trim().length < 5 || evidence.trim().length < 3) {
      setError('Enter a verified procedure code, clinical explanation and evidence reference.')
      return
    }
    setSaving(true); setError(''); setNotice('')
    requestId.current ??= crypto.randomUUID()
    try {
      const response = await fetch(`/api/finance/medical-aid/claims/${encodeURIComponent(selected.id)}/workflow/transition`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          requestId: requestId.current,
          targetStatus: 'CorrectionApproved',
          externalReference: null,
          approvedAmount: null,
          correctedProcedureCode: procedureCode.trim(),
          evidenceReference: evidence.trim(),
          reason: reason.trim(),
        }),
      })
      if (!response.ok) throw new Error(await apiError(response))
      requestId.current = null
      setSelectedId(''); setProcedureCode(''); setEvidence(''); setReason('')
      setNotice('Clinical correction approved and audited. Reception must verify the resubmission; no new invoice or receipt was created.')
      setReload(n => n + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not approve correction.')
    } finally { setSaving(false) }
  }

  return <section className="ct-guide-page">
    <header className="ct-guide-heading"><div>
      <small>CLINICAL / MEDICAL AID</small>
      <h2>Clinical Claim Corrections</h2>
      <p>Review rejected scheme claims. Only the signed-in dentist can authorise procedure-code corrections.</p>
    </div><button className="secondary-button" type="button" disabled={loading}
      onClick={() => setReload(n => n + 1)}><RefreshCw size={15}/> Refresh</button></header>

    {error && <p className="ct-guide-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Loading rejected claims…</p> : claims.length === 0 ? <p>No rejected claims need clinical review.</p> :
      <div className="ct-guide-columns">
        <section className="ct-guide-panel">
          <h3>Rejected claims ({claims.length})</h3>
          {claims.map(claim => <button type="button" key={claim.id} className="secondary-button"
            style={{ width: '100%', justifyContent: 'space-between', marginBottom: 7 }}
            aria-pressed={selectedId === claim.id}
            onClick={() => {
              setSelectedId(claim.id); setProcedureCode(''); setEvidence(''); setReason('');
              setError(''); requestId.current = null
            }}>
            <span>{claim.patientName} · {claim.claimNumber}</span><strong>{money(claim.claimedAmount)}</strong>
          </button>)}
        </section>
        <section className="ct-guide-panel">
          {selected ? <>
            <h3>Clinical approval · {selected.claimNumber}</h3>
            <p>Original invoice: {selected.invoiceId}. No invoice or cash record is changed here.</p>
            <p className="ct-guide-warning"><ShieldCheck size={15}/> Verify the true original clinical record and billed procedure before approving. Do not guess codes.</p>
            <form className="ct-guide-form" onSubmit={event => void approve(event)}>
              <label>Clinically verified procedure code
                <input required maxLength={64} value={procedureCode}
                  onChange={event => { setProcedureCode(event.target.value); requestId.current = null }}/>
              </label>
              <label>Clinical evidence reference
                <input required minLength={3} maxLength={300} value={evidence}
                  onChange={event => { setEvidence(event.target.value); requestId.current = null }}/>
              </label>
              <label>Clinical justification
                <textarea required minLength={5} maxLength={1000} rows={3} value={reason}
                  onChange={event => { setReason(event.target.value); requestId.current = null }}/>
              </label>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Approving…' : 'Approve clinical correction'}
              </button>
            </form>
            <h4>Previous scheme and approval events</h4>
            {history?.events.map(entry => <p key={entry.id} style={{ fontSize: 12 }}>
              {entry.toStatus} · {entry.evidenceReference} · {new Date(entry.performedAtUtc).toLocaleString('en-ZA')}
            </p>)}
          </> : <p>Select a rejected claim to review its clinical correction.</p>}
        </section>
      </div>}
  </section>
}
