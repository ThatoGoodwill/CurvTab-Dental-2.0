#!/usr/bin/env python3
"""CurvTab Dental phase 7E.3: additive settlement UI/API and audit checks.
Run from repository root. Does not enable posting, seed patients, or alter PostgreSQL.
"""
from pathlib import Path
from datetime import datetime
import shutil, subprocess, sys

root = Path.cwd()
api = root / 'backend/CurvTabDental.API/Controllers/MedicalAidInvoiceSettlementController.cs'
page = root / 'frontend/src/pages/MedicalAidRemittanceMatchingPanel.tsx'
component = root / 'frontend/src/pages/MedicalAidSettlementActions.tsx'
css = root / 'frontend/src/pages/MedicalAidSettlementActions.css'
for p in (api, page):
    if not p.is_file():
        sys.exit(f'MISSING: {p}. Run from /workspaces/CurvTab-Dental-2.0')
backend = api.read_text()
frontend = page.read_text()
if 'CT_PHASE7E3_SETTLEMENT_POSTING' not in backend or 'CT_PHASE7E3_CLAIM_APPROVAL_CAP' not in backend:
    sys.exit('STOP: Settlement controller does not contain expected safeguards. No changes made.')
if 'CT_PHASE7E3_REVERSAL_AWARE' not in backend:
    sys.exit('STOP: Reversal-aware calculations are not installed. No changes made.')
if 'CT_PHASE7E3_IDEMPOTENCY_LOCK' not in backend:
    sys.exit('STOP: Idempotency lock missing. No changes made.')
if 'MedicalAidInvoiceAllocationReversal' not in (root / 'backend/CurvTabDental.API/Controllers/MedicalAidAllocationReversalsController.cs').read_text():
    sys.exit('STOP: Reversal controller not installed. No changes made.')
if component.exists() or css.exists() or 'MedicalAidSettlementActions' in frontend or 'CT_PHASE7E3_ALLOCATIONS_READ' in backend:
    sys.exit('STOP: This UI/API addition seems already installed. No files changed.')
if frontend.count("import './MedicalAidRemittanceMatchingPanel.css'") != 1:
    sys.exit('STOP: Matching panel CSS import changed. No files changed.')
anchor = '      {loading && <p>Loading reconciliation records…</p>}'
if frontend.count(anchor) != 1 or frontend.count('      {preview && (') != 1:
    sys.exit('STOP: Preview panel layout changed. No files changed.')
if backend.rstrip()[-1] != '}':
    sys.exit('STOP: Unexpected API controller ending. No files changed.')
# Append safe, read-only activity GET and capabilities endpoints.
addition = r'''
    // CT_PHASE7E3_ALLOCATIONS_READ
    [HttpGet("capabilities")]
    public IActionResult Capabilities([FromServices] IConfiguration configuration)
    {
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new
        {
            postingEnabled = configuration.GetValue<bool>(
                "Features:MedicalAidSettlementPostingEnabled"),
            reversalEnabled = User.IsInRole("PracticeAdmin")
        });
    }

    [HttpGet("allocations")]
    public async Task<IActionResult> Allocations(
        [FromQuery] Guid? matchId,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var query = _db.Set<MedicalAidInvoiceAllocation>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId);

        if (matchId.HasValue)
            query = query.Where(x => x.RemittanceMatchId == matchId.Value);

        var rows = await query
            .OrderByDescending(x => x.AllocatedAtUtc)
            .Take(100)
            .Select(x => new
            {
                x.Id,
                x.RemittanceMatchId,
                x.InvoiceId,
                x.Amount,
                x.EvidenceReference,
                x.Notes,
                x.AllocatedAtUtc
            })
            .ToListAsync(ct);

        var ids = rows.Select(x => x.Id).ToArray();
        var reversed = await _db.Set<MedicalAidInvoiceAllocationReversal>()
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId &&
                        ids.Contains(x.AllocationId))
            .Select(x => new
            {
                x.Id,
                x.AllocationId,
                x.Reason,
                x.ReversedAtUtc
            })
            .ToListAsync(ct);

        var reversalMap = reversed.ToDictionary(x => x.AllocationId);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(rows.Select(x => new
        {
            x.Id,
            x.RemittanceMatchId,
            x.InvoiceId,
            x.Amount,
            x.EvidenceReference,
            x.Notes,
            x.AllocatedAtUtc,
            isReversed = reversalMap.ContainsKey(x.Id),
            reversal = reversalMap.TryGetValue(x.Id, out var reversal)
                ? new { reversal.Id, reversal.Reason, reversal.ReversedAtUtc }
                : null
        }));
    }
'''
# New UI only renders on a selected match preview, preserving old matching form.
newfrontend = frontend.replace("import './MedicalAidRemittanceMatchingPanel.css'", "import MedicalAidSettlementActions from './MedicalAidSettlementActions'\nimport './MedicalAidRemittanceMatchingPanel.css'", 1)
newfrontend = newfrontend.replace(anchor, '''      {/* CT_PHASE7E3_ACTIONS_UI */}
      {preview && (
        <MedicalAidSettlementActions
          matchId={preview.matchId}
          claimNumber={preview.claimNumber}
          invoiceNumber={preview.invoiceNumber}
          maxAllocatable={preview.maxAllocatable}
          canManage={canManage}
          onUpdated={() => void openSettlementPreview(preview.matchId)}
        />
      )}

''' + anchor, 1)

ui = r'''import { useCallback, useEffect, useRef, useState } from 'react'
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
'''

styles = '''/* Phase 7E.3 – responsive settlement actions */
.ct-settlement-actions{width:100%;min-width:0;max-width:100%;box-sizing:border-box;padding:20px;background:var(--card-bg,#fff);border:1px solid #dce3eb;border-radius:12px;display:grid;gap:14px}
.ct-settlement-actions__head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ct-settlement-actions h3,.ct-settlement-actions h4{margin:0}
.ct-settlement-actions__scroll{overflow-x:auto;max-width:100%}
.ct-settlement-actions table{border-collapse:collapse;width:100%;text-align:left}
.ct-settlement-actions td,.ct-settlement-actions th{padding:10px;white-space:normal;overflow-wrap:anywhere;border-bottom:1px solid #e2e8f0;vertical-align:top}
.ct-settlement-actions__form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ct-settlement-actions__form label{min-width:0;display:grid;gap:7px;font-weight:600}
.ct-settlement-actions__form input,.ct-settlement-actions__form textarea{width:100%;min-width:0;box-sizing:border-box;border-radius:8px;border:1px solid #cbd5e1;padding:10px;font:inherit}
.ct-settlement-actions__wide{grid-column:1/-1}
.ct-settlement-actions button{max-width:100%;white-space:normal;overflow-wrap:anywhere}
.ct-settlement-actions__error{color:#991b1b;background:#fef2f2;padding:12px;border-radius:8px}
.ct-settlement-actions__notice{color:#065f46;background:#ecfdf5;padding:12px;border-radius:8px}
.ct-settlement-actions__locked{color:#92400e;background:#fffbeb;padding:12px;border-radius:8px}
@media(max-width:700px){.ct-settlement-actions__form{grid-template-columns:minmax(0,1fr)}.ct-settlement-actions{padding:14px}}
'''
# Atomicish edits: validate first, backup, then write. On failures build can be reverted from named backups.
backup = root / '.curvtab-clinical-backups'
backup.mkdir(exist_ok=True)
stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
for path in (api, page):
    dest = backup / f'{path.stem}-before-final-settlement-{stamp}{path.suffix}'
    shutil.copy2(path, dest)
    print('BACKUP', dest)
api.write_text(backend.rstrip()[:-1] + addition + '\n}\n')
page.write_text(newfrontend)
component.write_text(ui)
css.write_text(styles)
print('DONE: additive read-only API, capabilities, allocation history, posting/reversal UI.')
print('IMPORTANT: Posting is NOT enabled by this installer.')
print('RUN: dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj --nologo')
print('RUN: cd frontend && npm run build')
