import { useConfirmDialog } from '../components/useConfirmDialog'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './InvoiceCorrectionsPanel.css'

type Allocation = {
  id: string
  paymentId: string
  amount: number
  isReversed: boolean
}

type CreditNote = {
  id: string
  creditNoteNumber: string
  amount: number
  reason: string
  issuedAtUtc: string
}

type Reversal = {
  id: string
  allocationId: string
  paymentId: string
  amount: number
  reason: string
  reversedAtUtc: string
}

type History = {
  credits: CreditNote[]
  reversals: Reversal[]
}

type Props = {
  invoiceId: string
  availableCredit: number
  allocations: Allocation[]
  canManage: boolean
  onChanged: () => void
}

function money(value: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)
}

async function getError(response: Response) {
  try {
    const data = await response.json() as {
      message?: string
      title?: string
    }
    return data.message || data.title ||
      `Request failed (${response.status}).`
  } catch {
    return `Request failed (${response.status}).`
  }
}

export default function InvoiceCorrectionsPanel({
  const { confirm, confirmationDialog } = useConfirmDialog()
  invoiceId,
  availableCredit,
  allocations,
  canManage,
  onChanged,
}: Props) {
  const [history, setHistory] = useState<History | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const creditRequestId = useRef<string | null>(null)

  const [reversalId, setReversalId] = useState('')
  const [reversalReason, setReversalReason] = useState('')

  const endpoint =
    `/api/finance/invoices/${encodeURIComponent(invoiceId)}/corrections`

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(endpoint, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })

        if (!response.ok)
          throw new Error(await getError(response))

        const result = await response.json() as History

        if (!controller.signal.aborted)
          setHistory(result)
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error
            ? cause.message : 'Unable to load corrections.')
      }
    }

    void load()
    return () => controller.abort()
  }, [endpoint, reload])

  async function issueCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || busy) return

    const value = Number(creditAmount)

    if (
      !/^\d+(\.\d{1,2})?$/.test(creditAmount) ||
      value <= 0 || value > availableCredit ||
      creditReason.trim().length < 5
    ) {
      setError('Check the credit amount and reason.')
      return
    }

    if (!(await confirm({
      title: 'Issue credit note',
      message:
        `Credit amount: ${money(value)}\n` +
        `Reason: ${creditReason.trim()}\n\n` +
        'This permanently records a credit against the invoice. ' +
        'It does not refund money.',
      confirmLabel: 'Issue credit note',
      variant: 'danger',
    }))) return

    setBusy(true)
    setError('')
    setNotice('')
    creditRequestId.current ??= crypto.randomUUID()

    try {
      const response = await fetch(`${endpoint}/credit-notes`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          requestId: creditRequestId.current,
          amount: value,
          reason: creditReason.trim(),
        }),
      })

      if (!response.ok)
        throw new Error(await getError(response))

      creditRequestId.current = null
      setCreditAmount('')
      setCreditReason('')
      setNotice('Credit note issued and audited.')
      setReload(v => v + 1)
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Credit note failed.')
    } finally {
      setBusy(false)
    }
  }

  async function reverseAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || busy || !reversalId) return

    if (reversalReason.trim().length < 5) {
      setError('Enter a reason of at least five characters.')
      return
    }

    if (!(await confirm({
      title: 'Reverse payment allocation',
      message:
        `Reason: ${reversalReason.trim()}\n\n` +
        'The allocation will be reversed, but the original ' +
        'payment receipt will remain recorded. No refund occurs.',
      confirmLabel: 'Reverse allocation',
      variant: 'danger',
    }))) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(
        `${endpoint}/allocations/${encodeURIComponent(reversalId)}/reverse`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            reason: reversalReason.trim(),
          }),
        }
      )

      if (!response.ok)
        throw new Error(await getError(response))

      setReversalId('')
      setReversalReason('')
      setNotice('Allocation reversed. Original receipt preserved.')
      setReload(v => v + 1)
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Reversal failed.')
    } finally {
      setBusy(false)
    }
  }

  const activeAllocations = allocations.filter(a => !a.isReversed)

  return (
    <section className="ct-invoice-corrections">
      {confirmationDialog}
      <h3>Financial corrections & audit history</h3>

      {error && <p role="alert" className="ct-invoices-error">{error}</p>}
      {notice && <p role="status" className="ct-invoices-success">{notice}</p>}

      <div className="ct-invoice-correction-history">
        <h4>Credit notes</h4>
        {!history ? <p>Loading…</p> :
          history.credits.length === 0
            ? <p>No credit notes issued.</p>
            : history.credits.map(note => (
              <article key={note.id}>
                <strong>{note.creditNoteNumber}</strong>
                <span>{money(note.amount)}</span>
                <p>{note.reason}</p>
                <small>{new Date(note.issuedAtUtc).toLocaleString('en-ZA')}</small>
              </article>
            ))}

        <h4>Allocation reversals</h4>
        {history && (
          history.reversals.length === 0
            ? <p>No allocation reversals recorded.</p>
            : history.reversals.map(item => (
              <article key={item.id}>
                <strong>Reversed allocation</strong>
                <span>{money(item.amount)}</span>
                <p>{item.reason}</p>
                <small>
                  {new Date(item.reversedAtUtc).toLocaleString('en-ZA')}
                </small>
              </article>
            ))
        )}
      </div>

      {canManage && (
        <>
          <form onSubmit={event => void issueCredit(event)}
            className="ct-invoice-correction-form">
            <h4>Issue credit note</h4>
            <p>Maximum available credit: {money(availableCredit)}</p>

            <label>
              Credit amount (ZAR)
              <input required inputMode="decimal"
                value={creditAmount}
                onChange={event => {
                  setCreditAmount(event.target.value)
                  creditRequestId.current = null
                }}
                placeholder="0.00"/>
            </label>

            <label>
              Reason for credit
              <textarea required minLength={5} maxLength={1000}
                value={creditReason}
                onChange={event => {
                  setCreditReason(event.target.value)
                  creditRequestId.current = null
                }}/>
            </label>

            <button className="secondary-button" type="submit"
              disabled={busy || availableCredit <= 0}>
              Issue audited credit note
            </button>
          </form>

          <form onSubmit={event => void reverseAllocation(event)}
            className="ct-invoice-correction-form">
            <h4>Reverse payment allocation</h4>
            <p>This does not refund the payment.</p>

            <label>
              Active allocation
              <select required value={reversalId}
                onChange={event => setReversalId(event.target.value)}>
                <option value="">Choose allocation</option>
                {activeAllocations.map(a => (
                  <option key={a.id} value={a.id}>
                    {money(a.amount)} · {a.paymentId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Reason for reversal
              <textarea required minLength={5} maxLength={1000}
                value={reversalReason}
                onChange={event => setReversalReason(event.target.value)}/>
            </label>

            <button type="submit" className="secondary-button"
              disabled={busy || !reversalId}>
              Reverse selected allocation
            </button>
          </form>
        </>
      )}
    </section>
  )
}
