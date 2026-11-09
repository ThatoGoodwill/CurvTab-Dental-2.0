
import { useEffect, useState } from 'react'
import { apiRequest } from '../services/api'

type Receipt = {
  paymentId: string
  appointmentId: string
  receiptNumber: string
  amount: number
  method: string
  reference: string | null
  receivedAtUtc: string
}

type Invoice = {
  id: string
  patientId: string
  invoiceNumber: string
  totalAmount: number
  issuedAtUtc?: string
}

type Entry = {
  id: string
  kind: 'Receipt' | 'Invoice'
  reference: string
  amount: number
  date: string | null
  detail: string
}

type Props = {
  patientId: string
  role: string
  section: 'Payments' | 'Transactions'
}

function money(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(value)
}

function readableDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return 'Date unavailable'
  }

  return new Date(value).toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function parseReceipts(value: unknown): Receipt[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected payment response.')
  }

  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Invalid payment record.')
    }

    const row = item as Record<string, unknown>

    if (
      typeof row.paymentId !== 'string' ||
      typeof row.appointmentId !== 'string' ||
      typeof row.receiptNumber !== 'string' ||
      typeof row.amount !== 'number' ||
      !Number.isFinite(row.amount) ||
      typeof row.method !== 'string' ||
      typeof row.receivedAtUtc !== 'string'
    ) {
      throw new Error('Payment record could not be verified.')
    }

    return {
      paymentId: row.paymentId,
      appointmentId: row.appointmentId,
      receiptNumber: row.receiptNumber,
      amount: row.amount,
      method: row.method,
      reference:
        typeof row.reference === 'string' ? row.reference : null,
      receivedAtUtc: row.receivedAtUtc
    }
  })
}

function parseInvoices(value: unknown, patientId: string): Invoice[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected invoice response.')
  }

  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Invalid invoice record.')
    }

    const row = item as Record<string, unknown>

    if (
      typeof row.id !== 'string' ||
      typeof row.patientId !== 'string' ||
      row.patientId.toLowerCase() !== patientId.toLowerCase() ||
      typeof row.totalAmount !== 'number' ||
      !Number.isFinite(row.totalAmount)
    ) {
      throw new Error('Invoice record could not be verified.')
    }

    return {
      id: row.id,
      patientId: row.patientId,
      invoiceNumber:
        typeof row.invoiceNumber === 'string'
          ? row.invoiceNumber
          : row.id.slice(0, 8),
      totalAmount: row.totalAmount,
      issuedAtUtc:
        typeof row.issuedAtUtc === 'string'
          ? row.issuedAtUtc
          : undefined
    }
  })
}

export default function PatientAccountActivityView({
  patientId,
  role,
  section
}: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  const authorised =
    role === 'Receptionist' || role === 'PracticeAdmin'

  useEffect(() => {
    if (!authorised) {
      setReceipts([])
      setInvoices([])
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError('')
    setReceipts([])
    setInvoices([])

    const load = async () => {
      try {
        const [paymentData, invoiceData] = await Promise.all([
          apiRequest<unknown>(
            `/finance/patients/${encodeURIComponent(patientId)}/payments`
          ),
          section === 'Transactions'
            ? apiRequest<unknown>(
                `/finance/invoices?patientId=${encodeURIComponent(patientId)}`
              )
            : Promise.resolve([])
        ])

        const parsedReceipts = parseReceipts(paymentData)
        const parsedInvoices = parseInvoices(invoiceData, patientId)

        if (active) {
          setReceipts(parsedReceipts)
          setInvoices(parsedInvoices)
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load patient account activity.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [patientId, section, authorised, revision])

  if (!authorised) {
    return (
      <p className="ct-pa-v3-message" role="status">
        Financial records are restricted to authorised
        Reception and Practice Administration staff.
      </p>
    )
  }

  if (loading) {
    return (
      <p className="ct-pa-v3-message" role="status">
        Loading patient account activity…
      </p>
    )
  }

  if (error) {
    return (
      <div className="ct-pa-v3-message" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => setRevision(n => n + 1)}>
          Retry
        </button>
      </div>
    )
  }

  const receivedTotal = receipts.reduce(
    (sum, receipt) => sum + receipt.amount, 0
  )

  const entries: Entry[] = [
    ...receipts.map(receipt => ({
      id: `payment-${receipt.paymentId}`,
      kind: 'Receipt' as const,
      reference: receipt.receiptNumber,
      amount: receipt.amount,
      date: receipt.receivedAtUtc,
      detail: receipt.method
    })),
    ...(section === 'Transactions' ? invoices.map(invoice => ({
      id: `invoice-${invoice.id}`,
      kind: 'Invoice' as const,
      reference: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      date: invoice.issuedAtUtc ?? null,
      detail: 'Issued invoice'
    })) : [])
  ].sort((a, b) => {
    const aTime = a.date ? Date.parse(a.date) : 0
    const bTime = b.date ? Date.parse(b.date) : 0
    return (Number.isFinite(bTime) ? bTime : 0) -
      (Number.isFinite(aTime) ? aTime : 0)
  })

  return (
    <div className="ct-pa-v3">
      {section === 'Payments' && (
        <div className="ct-pa-v3-totals">
          <div>
            <span>Recorded receipts</span>
            <strong>{receipts.length}</strong>
          </div>
          <div>
            <span>Total receipts</span>
            <strong>{money(receivedTotal)}</strong>
          </div>
        </div>
      )}

      <div className="ct-pa-v3-list">
        {entries.length === 0 ? (
          <p className="ct-pa-v3-message">
            No {section === 'Payments' ? 'payments' : 'transactions'}
            {' '}returned for this patient.
          </p>
        ) : entries.map(entry => (
          <article className="ct-pa-v3-entry" key={entry.id}>
            <div className="ct-pa-v3-entry-head">
              <strong>{entry.reference}</strong>
              <span>{entry.kind}</span>
            </div>

            <div className="ct-pa-v3-entry-meta">
              <span>{readableDate(entry.date)}</span>
              <span>{entry.detail}</span>
              <strong>{money(entry.amount)}</strong>
            </div>
          </article>
        ))}
      </div>

      <p className="ct-pa-v3-footnote">
        Read-only records. Receipts represent money recorded as received.
        Invoices represent charges, not additional cash receipts.
        Allocation reversals are not refunds.
      </p>
    </div>
  )
}
