import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useConfirmDialog } from '../components/useConfirmDialog'
import './MedicalAidRemittanceMatchingPanel.css'

type Receipt = {
  id: string
  schemeName: string
  bankReference: string
  amount: number
}

type Advice = {
  id: string
  claimId: string
  claimNumber: string
  remittanceReference: string
  advisedAmount: number
}

type Claim = {
  id: string
  schemeName: string
}

type Match = {
  id: string
  bankReceiptId: string
  remittanceAdviceId: string
  matchedAmount: number
  schemeName: string
  bankReference: string
  remittanceReference: string
  claimNumber: string
  matchedAtUtc: string
}


function canonicalScheme(value: string): string {
  const normalized = value.trim()
    .replace(/\\s+/g, ' ')
    .toUpperCase()

  if (
    normalized === 'GEMS' ||
    normalized === 'GOVERNMENT EMPLOYEES MEDICAL SCHEME' ||
    normalized === 'GOVERNMENT EMPLOYEES MEDICAL SCHEME (GEMS)'
  ) {
    return 'GEMS'
  }

  return normalized
}

const base = '/api/finance/medical-aid'

const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${base}/${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`Unable to load ${path} (${response.status}).`)
  }

  return response.json() as Promise<T>
}

async function readError(response: Response) {
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

export default function MedicalAidRemittanceMatchingPanel({
  canManage,
}: {
  canManage: boolean
}) {
  const { confirm, confirmationDialog } = useConfirmDialog()

  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [advices, setAdvices] = useState<Advice[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [matches, setMatches] = useState<Match[]>([])

  const [receiptId, setReceiptId] = useState('')
  const [adviceId, setAdviceId] = useState('')
  const [amount, setAmount] = useState('')
  const [evidence, setEvidence] = useState('')
  const [notes, setNotes] = useState('')

  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestId = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    async function load() {
      try {
        const [r, a, c, m] = await Promise.all([
          readJson<Receipt[]>('bank-receipts', controller.signal),
          readJson<Advice[]>('remittances', controller.signal),
          readJson<Claim[]>('claims', controller.signal),
          readJson<Match[]>('remittance-matches', controller.signal),
        ])

        if (!controller.signal.aborted) {
          if (![r, a, c, m].every(Array.isArray)) {
            throw new Error('Unexpected reconciliation API response.')
          }
          setReceipts(r)
          setAdvices(a)
          setClaims(c)
          setMatches(m)
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error
            ? cause.message : 'Unable to load reconciliation data.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [reload])

  const selectedReceipt = receipts.find(r => r.id === receiptId)
  const selectedAdvice = advices.find(a => a.id === adviceId)

  const remainingReceipt = selectedReceipt
    ? Number(selectedReceipt.amount) -
      matches
        .filter(m => m.bankReceiptId === receiptId)
        .reduce((sum, m) => sum + Number(m.matchedAmount), 0)
    : 0

  const remainingAdvice = selectedAdvice
    ? Number(selectedAdvice.advisedAmount) -
      matches
        .filter(m => m.remittanceAdviceId === adviceId)
        .reduce((sum, m) => sum + Number(m.matchedAmount), 0)
    : 0

  const matchingLimit = Math.max(
    0, Math.min(remainingReceipt, remainingAdvice)
  )

  const availableReceipts = receipts.filter(r => {
    const matched = matches
      .filter(m => m.bankReceiptId === r.id)
      .reduce((sum, m) => sum + Number(m.matchedAmount), 0)
    return Number(r.amount) - matched > 0
  })

  const availableAdvices = advices.filter(a => {
    const matched = matches
      .filter(m => m.remittanceAdviceId === a.id)
      .reduce((sum, m) => sum + Number(m.matchedAmount), 0)

    if (Number(a.advisedAmount) - matched <= 0) return false

    if (!selectedReceipt) return true

    const claim = claims.find(c => c.id === a.claimId)
    return Boolean(
      claim &&
      canonicalScheme(claim.schemeName) ===
        canonicalScheme(selectedReceipt.schemeName)
    )
  })

  function resetId() {
    requestId.current = null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canManage || busy || loading) return

    const numericAmount = Number(amount)
    const evidenceValue = evidence.trim()
    const notesValue = notes.trim()

    if (!selectedReceipt || !selectedAdvice) {
      setError('Select a bank receipt and remittance advice.')
      return
    }

    const claim = claims.find(c => c.id === selectedAdvice.claimId)

    if (
      !claim ||
      canonicalScheme(claim.schemeName) !==
        canonicalScheme(selectedReceipt.schemeName)
    ) {
      setError('The receipt and claim must belong to the same scheme.')
      return
    }

    if (matches.some(m =>
      m.bankReceiptId === receiptId &&
      m.remittanceAdviceId === adviceId
    )) {
      setError('This receipt and advice are already matched.')
      return
    }

    if (
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      numericAmount > matchingLimit ||
      evidenceValue.length < 3 ||
      evidenceValue.length > 300 ||
      notesValue.length > 1000
    ) {
      setError('Check the amount, remaining balances and evidence.')
      return
    }

    const accepted = await confirm({
      title: 'Match medical aid remittance',
      message:
        `Bank receipt: ${selectedReceipt.bankReference}\n` +
        `Remittance: ${selectedAdvice.remittanceReference}\n` +
        `Claim: ${selectedAdvice.claimNumber}\n` +
        `Amount: ${money(numericAmount)}\n` +
        `Evidence: ${evidenceValue}\n\n` +
        'Only confirm if these records describe the same verified ' +
        'transaction. Matching does not settle the patient invoice.',
      confirmLabel: 'Record match',
    })

    if (!accepted) return

    setBusy(true)
    setError('')
    setNotice('')
    requestId.current ??= crypto.randomUUID()

    try {
      const response = await fetch(`${base}/remittance-matches`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          requestId: requestId.current,
          bankReceiptId: receiptId,
          remittanceAdviceId: adviceId,
          matchedAmount: numericAmount,
          evidenceReference: evidenceValue,
          notes: notesValue,
        }),
      })

      if (!response.ok) throw new Error(await readError(response))

      requestId.current = null
      setReceiptId('')
      setAdviceId('')
      setAmount('')
      setEvidence('')
      setNotes('')
      setNotice('Remittance match recorded. No invoice payment allocated.')
      setReload(n => n + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Unable to save remittance match.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ct-reconcile">
      {confirmationDialog}

      <div className="ct-reconcile-card">
        <h3>Remittance Matching</h3>
        <p>
          Match verified medical aid bank receipts to scheme remittance
          advices. Matching does not create patient payments or settle invoices.
        </p>
      </div>

      {error && <p role="alert" className="ct-reconcile-error">{error}</p>}
      {notice && <p role="status" className="ct-reconcile-success">{notice}</p>}

      {loading && <p>Loading reconciliation records…</p>}

      {!loading && canManage && (
        <form className="ct-reconcile-card" onSubmit={submit}>
          <h3>Record remittance match</h3>

          <div className="ct-reconcile-fields">
            <label>
              Bank receipt
              <select required value={receiptId}
                onChange={e => {
                  setReceiptId(e.target.value)
                  setAdviceId('')
                  setAmount('')
                  resetId()
                }}>
                <option value="">Choose bank receipt</option>
                {availableReceipts.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.schemeName} · {r.bankReference} · {money(Number(r.amount))}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Remittance advice
              <select required value={adviceId}
                onChange={e => {
                  setAdviceId(e.target.value)
                  setAmount('')
                  resetId()
                }}>
                <option value="">Choose remittance advice</option>
                {availableAdvices.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.claimNumber} · {a.remittanceReference} ·
                    {' '}{money(Number(a.advisedAmount))}
                  </option>
                ))}
              </select>
            </label>

            <div className="ct-reconcile-balance">
              <span>Available receipt funds</span>
              <strong>{money(remainingReceipt)}</strong>
            </div>

            <div className="ct-reconcile-balance">
              <span>Remaining remittance advice</span>
              <strong>{money(remainingAdvice)}</strong>
            </div>

            <label>
              Amount to match (ZAR)
              <input required type="number" min="0.01" step="0.01"
                max={matchingLimit > 0 ? matchingLimit : undefined}
                value={amount}
                onChange={e => {
                  setAmount(e.target.value)
                  resetId()
                }}
                placeholder="0.00"
              />
            </label>

            <label>
              Evidence reference
              <input required maxLength={300} value={evidence}
                onChange={e => {
                  setEvidence(e.target.value)
                  resetId()
                }}
                placeholder="Verified matching evidence"
              />
            </label>

            <label className="ct-reconcile-wide">
              Notes (optional)
              <textarea maxLength={1000} rows={3} value={notes}
                onChange={e => {
                  setNotes(e.target.value)
                  resetId()
                }}
              />
            </label>
          </div>

          <button type="submit" className="primary-button"
            disabled={busy || matchingLimit <= 0}>
            {busy ? 'Recording…' : 'Record Remittance Match'}
          </button>
        </form>
      )}

      <div className="ct-reconcile-card">
        <div className="ct-reconcile-toolbar">
          <h3>Recorded matches</h3>
          <button type="button" className="secondary-button"
            onClick={() => setReload(n => n + 1)}>
            Refresh
          </button>
        </div>

        {!loading && matches.length === 0 && (
          <p>No remittance matches recorded yet.</p>
        )}

        {!loading && matches.length > 0 && (
          <div className="ct-reconcile-scroll">
            <table>
              <thead>
                <tr>
                  <th>Scheme</th>
                  <th>Bank reference</th>
                  <th>Remittance</th>
                  <th>Claim</th>
                  <th>Matched amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map(m => (
                  <tr key={m.id}>
                    <td>{m.schemeName}</td>
                    <td>{m.bankReference}</td>
                    <td>{m.remittanceReference}</td>
                    <td>{m.claimNumber}</td>
                    <td>{money(Number(m.matchedAmount))}</td>
                    <td>Matched — not allocated</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
