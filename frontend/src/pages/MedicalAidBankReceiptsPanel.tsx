import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useConfirmDialog } from '../components/useConfirmDialog'
import './MedicalAidBankReceiptsPanel.css'

type BankReceipt = {
  id: string
  schemeName: string
  bankReference: string
  amount: number
  receivedOn: string
  evidenceReference: string
  notes: string
  recordedAtUtc: string
}

const endpoint = '/api/finance/medical-aid/bank-receipts'

const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)

function today() {
  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function errorText(response: Response) {
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

export default function MedicalAidBankReceiptsPanel({
  canManage,
}: {
  canManage: boolean
}) {
  const { confirm, confirmationDialog } = useConfirmDialog()

  const [receipts, setReceipts] = useState<BankReceipt[]>([])
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [schemeName, setSchemeName] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [amount, setAmount] = useState('')
  const [receivedOn, setReceivedOn] = useState(today())
  const [evidenceReference, setEvidenceReference] = useState('')
  const [notes, setNotes] = useState('')

  const requestId = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    async function load() {
      try {
        const response = await fetch(endpoint, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(await errorText(response))
        }

        const data: unknown = await response.json()

        if (!Array.isArray(data)) {
          throw new Error('Unexpected bank receipt response.')
        }

        if (!controller.signal.aborted) {
          setReceipts(data as BankReceipt[])
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error
            ? cause.message
            : 'Could not load bank receipts.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [reload])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canManage || busy) return

    const scheme = schemeName.trim()
    const reference = bankReference.trim()
    const evidence = evidenceReference.trim()
    const numericAmount = Number(amount)

    if (
      scheme.length < 2 ||
      reference.length < 3 ||
      evidence.length < 3 ||
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      numericAmount > 10000000 ||
      !receivedOn
    ) {
      setError('Check the scheme, reference, amount, date and evidence.')
      return
    }

    const accepted = await confirm({
      title: 'Record medical aid bank receipt',
      message:
        `Scheme: ${scheme}\n` +
        `Bank reference: ${reference}\n` +
        `Amount: ${money(numericAmount)}\n` +
        `Received on: ${receivedOn}\n` +
        `Evidence: ${evidence}\n\n` +
        'Only record funds verified against a real bank transaction. ' +
        'This does not settle invoices or match remittance advice.',
      confirmLabel: 'Record receipt',
    })

    if (!accepted) return

    setBusy(true)
    setError('')
    setNotice('')
    requestId.current ??= crypto.randomUUID()

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          requestId: requestId.current,
          schemeName: scheme,
          bankReference: reference,
          amount: numericAmount,
          receivedOn,
          evidenceReference: evidence,
          notes: notes.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error(await errorText(response))
      }

      requestId.current = null
      setSchemeName('')
      setBankReference('')
      setAmount('')
      setReceivedOn(today())
      setEvidenceReference('')
      setNotes('')
      setNotice('Bank receipt recorded. No invoice was settled.')
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Failed to record bank receipt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ct-bank-receipts">
      {confirmationDialog}

      <div className="ct-bank-card">
        <h3>Scheme Bank Receipts</h3>
        <p>
          Record verified medical aid bank deposits.
          Deposits are not automatically allocated to invoices.
        </p>
      </div>

      {error && <p role="alert" className="ct-bank-error">{error}</p>}
      {notice && <p role="status" className="ct-bank-success">{notice}</p>}

      {canManage && (
        <form className="ct-bank-card ct-bank-form" onSubmit={submit}>
          <h3>Record verified bank deposit</h3>

          <div className="ct-bank-grid">
            <label>
              Medical aid scheme
              <input
                required
                maxLength={160}
                value={schemeName}
                onChange={e => {
                  setSchemeName(e.target.value)
                  requestId.current = null
                }}
                placeholder="e.g. GEMS"
              />
            </label>

            <label>
              Bank reference
              <input
                required
                maxLength={120}
                value={bankReference}
                onChange={e => {
                  setBankReference(e.target.value)
                  requestId.current = null
                }}
                placeholder="Bank transaction reference"
              />
            </label>

            <label>
              Amount (ZAR)
              <input
                required
                type="number"
                min="0.01"
                max="10000000"
                step="0.01"
                value={amount}
                onChange={e => {
                  setAmount(e.target.value)
                  requestId.current = null
                }}
                placeholder="0.00"
              />
            </label>

            <label>
              Date received
              <input
                required
                type="date"
                value={receivedOn}
                onChange={e => {
                  setReceivedOn(e.target.value)
                  requestId.current = null
                }}
              />
            </label>

            <label className="ct-bank-wide">
              Evidence reference
              <input
                required
                maxLength={300}
                value={evidenceReference}
                onChange={e => {
                  setEvidenceReference(e.target.value)
                  requestId.current = null
                }}
                placeholder="Bank statement evidence"
              />
            </label>

            <label className="ct-bank-wide">
              Notes (optional)
              <textarea
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={e => {
                  setNotes(e.target.value)
                  requestId.current = null
                }}
              />
            </label>
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Recording…' : 'Record Scheme Bank Receipt'}
          </button>
        </form>
      )}

      <div className="ct-bank-card">
        <div className="ct-bank-toolbar">
          <h3>Recorded bank receipts</h3>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReload(n => n + 1)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading && <p>Loading receipts…</p>}

        {!loading && receipts.length === 0 && (
          <p>No scheme bank receipts recorded.</p>
        )}

        {!loading && receipts.length > 0 && (
          <div className="ct-bank-scroll">
            <table>
              <thead>
                <tr>
                  <th>Scheme</th>
                  <th>Bank reference</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Evidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(item => (
                  <tr key={item.id}>
                    <td>{item.schemeName}</td>
                    <td>{item.bankReference}</td>
                    <td>{item.receivedOn}</td>
                    <td>{money(Number(item.amount))}</td>
                    <td>{item.evidenceReference}</td>
                    <td>Recorded — not allocated</td>
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
