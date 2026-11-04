import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './MedicalAidSettlementActions.css'

type Allocation = {
  id: string
  remittanceMatchId: string
  invoiceId: string
  amount: number
  evidenceReference: string
  allocatedAtUtc: string
  isReversed: boolean
  reversal: null | { id: string; reason: string; reversedAtUtc: string }
}
type Capabilities = { postingEnabled: boolean; reversalEnabled: boolean }
const root = '/api/finance/medical-aid/invoice-settlement'
const money = (n: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR',
}).format(n)
async function extractError(response: Response): Promise<string> {
  try {
    const data: { message?: string; title?: string } = await response.json()
    return data.message || data.title || `Request failed: HTTP ${response.status}`
  } catch { return `Request failed: HTTP ${response.status}` }
}

export default function MedicalAidSettlementActions({
  matchId, claimNumber, invoiceNumber, maxAllocatable, canManage, onUpdated,
}: {
  matchId: string
  claimNumber: string
  invoiceNumber: string
  maxAllocatable: number
  canManage: boolean
  onUpdated: () => void
}) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [evidence, setEvidence] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const requestId = useRef<string | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    const [c, a] = await Promise.all([
      fetch(`${root}/capabilities`, { credentials: 'include', cache: 'no-store', signal }),
      fetch(`${root}/allocations?matchId=${encodeURIComponent(matchId)}`,
        { credentials: 'include', cache: 'no-store', signal }),
    ])
    if (!c.ok) throw new Error(await extractError(c))
    if (!a.ok) throw new Error(await extractError(a))
    const caps = await c.json() as Capabilities
    const rows = await a.json() as Allocation[]
    if (!Array.isArray(rows)) throw new Error('Invalid allocation response.')
    if (!signal.aborted) { setCapabilities(caps); setAllocations(rows) }
  }, [matchId])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void load(controller.signal).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load settlement allocations.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [load, revision])

  function refresh() { setRevision(v => v + 1); onUpdated() }

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !canManage || !capabilities?.postingEnabled) return
    const n = Number(amount)
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(n) ||
        n <= 0 || n > maxAllocatable || evidence.trim().length < 3 ||
        evidence.trim().length > 300 || notes.length > 1000) {
      setError('Check the amount, available funds and evidence reference.')
      return
    }
    if (!window.confirm(`Allocate ${money(n)} from claim ${claimNumber} to invoice ${invoiceNumber}?\nConfirm only if genuine bank evidence has been verified.`)) return
    setBusy(true); setError(''); setNotice('')
    requestId.current ??= crypto.randomUUID()
    try {
      const response = await fetch(`${root}/allocations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          requestId: requestId.current,
          remittanceMatchId: matchId,
          amount: n,
          evidenceReference: evidence.trim(), notes: notes.trim(),
        }),
      })
      if (!response.ok) throw new Error(await extractError(response))
      requestId.current = null; setAmount(''); setEvidence(''); setNotes('')
      setNotice('Scheme invoice allocation recorded. Please verify the invoice balance.')
      refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Allocation failed.') }
    finally { setBusy(false) }
  }

  async function reverse(a: Allocation) {
    if (busy || !canManage || a.isReversed) return
    const reason = window.prompt(`Reason for fully reversing ${money(a.amount)}? (5–1000 characters)`)
    if (reason === null) return
    const trimmed = reason.trim()
    if (trimmed.length < 5 || trimmed.length > 1000) { setError('Enter a reason between 5 and 1000 characters.'); return }
    if (!window.confirm('Confirm full reversal? The allocation will remain in the audit trail.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`${root}/allocations/${encodeURIComponent(a.id)}/reverse`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ reason: trimmed }),
      })
      if (!response.ok) throw new Error(await extractError(response))
      setNotice('Allocation reversed. Invoice balance restored.')
      refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Reversal failed.') }
    finally { setBusy(false) }
  }

  return (
    <section className="ct-settlement-actions" aria-label="Invoice settlement actions">
      <div className="ct-settlement-actions__head">
        <h3>Settlement allocations</h3>
        <button type="button" onClick={refresh} disabled={busy}>Refresh</button>
      </div>
      {loading && <p>Loading allocation history…</p>}
      {error && <p role="alert" className="ct-settlement-actions__error">{error}</p>}
      {notice && <p role="status" className="ct-settlement-actions__notice">{notice}</p>}
      {!loading && allocations.length === 0 && <p>No scheme allocations recorded for this match.</p>}
      {allocations.length > 0 && <div className="ct-settlement-actions__scroll"><table><thead><tr>
        <th>Allocated</th><th>Amount</th><th>Evidence</th><th>Status</th><th>Action</th>
      </tr></thead><tbody>{allocations.map(a => <tr key={a.id}>
        <td>{new Date(a.allocatedAtUtc).toLocaleDateString('en-ZA')}</td>
        <td>{money(Number(a.amount))}</td><td>{a.evidenceReference}</td>
        <td>{a.isReversed ? `Reversed: ${a.reversal?.reason ?? ''}` : 'Active'}</td>
        <td><button type="button" disabled={busy || !canManage || a.isReversed}
          onClick={() => void reverse(a)}>Reverse</button></td>
      </tr>)}</tbody></table></div>}
      {canManage && capabilities?.postingEnabled ? (
        <form onSubmit={e => void post(e)} className="ct-settlement-actions__form">
          <h4>Post verified scheme settlement</h4>
          <label>Amount (ZAR)<input type="number" min="0.01" step="0.01"
            max={maxAllocatable > 0 ? maxAllocatable : undefined} required
            value={amount} onChange={e => {setAmount(e.target.value);requestId.current=null}} /></label>
          <label>Verified bank evidence reference<input required maxLength={300}
            value={evidence} onChange={e => {setEvidence(e.target.value);requestId.current=null}} /></label>
          <label className="ct-settlement-actions__wide">Notes<textarea maxLength={1000}
            value={notes} onChange={e => {setNotes(e.target.value);requestId.current=null}} /></label>
          <button type="submit" disabled={busy || maxAllocatable <= 0}>
            {busy ? 'Processing…' : `Allocate up to ${money(maxAllocatable)}`}</button>
        </form>
      ) : <p className="ct-settlement-actions__locked">
        Settlement posting is disabled for this practice environment. Preview and history are read-only.
      </p>}
    </section>
  )
}
