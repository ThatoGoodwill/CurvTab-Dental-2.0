import { useConfirmDialog } from '../components/useConfirmDialog'
import { useEffect, useState } from 'react'

type Agreement = {
  agreementId: string
  caseId: string
  caseTitle: string
  patientId: string
  patientName: string
  totalFee: number
  depositRequired: number
  currency: string
  agreementDate: string
}

type Props = {
  onIssued: (invoiceId: string) => void
}

const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)

async function readError(response: Response) {
  try {
    const data = await response.json() as {
      message?: string
      title?: string
    }
    return data.message || data.title ||
      `Request failed: ${response.status}`
  } catch {
    return `Request failed: ${response.status}`
  }
}

export default function OrthodonticInvoiceIssuingPanel({
  const { confirm, confirmationDialog } = useConfirmDialog()
  onIssued,
}: Props) {
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(
          '/api/finance/orthodontic-invoices/eligible',
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        )

        if (!response.ok) throw new Error(await readError(response))

        const rows = await response.json() as Agreement[]
        if (!controller.signal.aborted) {
          setAgreements(rows)
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error
            ? cause.message : 'Unable to load agreements.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [reload])

  async function issue(item: Agreement) {
    if (busy) return

    const accepted = await confirm({
      title: 'Issue orthodontic invoice',
      message:
        `Patient: ${item.patientName}\n` +
        `Treatment: ${item.caseTitle}\n` +
        `Agreed fee: ${money(item.totalFee)}\n` +
        `Required deposit: ${money(item.depositRequired)}\n\n` +
        'Confirm this treatment fee has not already been billed ' +
        'elsewhere. This action creates an invoice, not a payment.',
      confirmLabel: 'Issue invoice',
    })

    if (!accepted) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(
        `/api/finance/orthodontic-invoices/from-agreement/${encodeURIComponent(item.agreementId)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            confirmNoDuplicateBilling: true,
          }),
        }
      )

      if (!response.ok) throw new Error(await readError(response))

      const invoice = await response.json() as {
        id: string
      }

      setNotice('Orthodontic invoice issued. No payment recorded.')
      setReload(value => value + 1)
      onIssued(invoice.id)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Unable to issue the invoice.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ct-invoices-section">
      {confirmationDialog}
      <h3>Orthodontic agreements ready to invoice</h3>

      <p className="ct-invoices-note">
        The deposit and instalments are included in the agreed
        treatment fee. They are not additional charges or receipts.
      </p>

      {error && <p role="alert" className="ct-invoices-error">{error}</p>}
      {notice && <p role="status" className="ct-invoices-success">{notice}</p>}
      {loading && <p>Loading orthodontic agreements…</p>}

      {!loading && agreements.length === 0 && (
        <p>No uninvoiced orthodontic agreements found.</p>
      )}

      {!loading && agreements.map(item => (
        <article key={item.agreementId} className="ct-invoice-row">
          <div>
            <strong>{item.patientName}</strong>
            <small>{item.caseTitle}</small>
            <small>
              Deposit required: {money(item.depositRequired)}
            </small>
          </div>

          <strong>{money(item.totalFee)}</strong>

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void issue(item)}
          >
            Issue orthodontic invoice
          </button>
        </article>
      ))}
    </div>
  )
}
