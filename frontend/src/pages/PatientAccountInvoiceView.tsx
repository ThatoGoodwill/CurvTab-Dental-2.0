
import { useEffect, useState } from 'react'
import { apiRequest } from '../services/api'

type Invoice = {
  id: string
  patientId: string
  invoiceNumber: string
  totalAmount: number
  allocatedAmount: number
}

type Props = {
  patientId: string
  role: string
  section: 'Overview' | 'Invoices'
}

const zar = (value: number): string =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)

function validateInvoices(
  value: unknown,
  patientId: string
): Invoice[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected invoice API response.')
  }

  return value.map((item: unknown): Invoice => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item)
    ) {
      throw new Error('Invalid invoice record.')
    }

    const row = item as Record<string, unknown>

    if (
      typeof row.id !== 'string' ||
      typeof row.patientId !== 'string' ||
      row.patientId.toLowerCase() !== patientId.toLowerCase() ||
      typeof row.totalAmount !== 'number' ||
      typeof row.allocatedAmount !== 'number' ||
      !Number.isFinite(row.totalAmount) ||
      !Number.isFinite(row.allocatedAmount)
    ) {
      throw new Error(
        'Invoice data could not be verified for this patient.'
      )
    }

    return {
      id: row.id,
      patientId: row.patientId,
      invoiceNumber:
        typeof row.invoiceNumber === 'string'
          ? row.invoiceNumber
          : row.id.slice(0, 8),
      totalAmount: row.totalAmount,
      allocatedAmount: row.allocatedAmount,
    }
  })
}

export default function PatientAccountInvoiceView({
  patientId,
  role,
  section,
}: Props) {
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  const authorised =
    role === 'Receptionist' ||
    role === 'PracticeAdmin'

  useEffect(() => {
    if (!authorised) {
      setRows([])
      setLoading(false)
      return
    }

    let active = true

    setRows([])
    setLoading(true)
    setError('')

    apiRequest<unknown>(
      `/finance/invoices?patientId=${encodeURIComponent(patientId)}`
    )
      .then(response => {
        const invoices = validateInvoices(response, patientId)
        if (active) setRows(invoices)
      })
      .catch(cause => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to retrieve patient invoices.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [patientId, authorised, reload])

  if (!authorised) {
    return (
      <p className="ct-pa-v2-message" role="status">
        Financial records are available only to authorised
        Reception and Practice Administration staff.
      </p>
    )
  }

  if (loading) {
    return (
      <p className="ct-pa-v2-message" role="status">
        Loading patient financial information…
      </p>
    )
  }

  if (error) {
    return (
      <div className="ct-pa-v2-message" role="alert">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => setReload(value => value + 1)}
        >
          Retry
        </button>
      </div>
    )
  }

  const invoiced = rows.reduce(
    (sum, item) => sum + item.totalAmount,
    0
  )

  const allocated = rows.reduce(
    (sum, item) => sum + item.allocatedAmount,
    0
  )

  const outstanding = rows.reduce(
    (sum, item) =>
      sum + Math.max(
        0,
        item.totalAmount - item.allocatedAmount
      ),
    0
  )

  if (section === 'Overview') {
    return (
      <div className="ct-pa-v2">
        <div className="ct-pa-v2-grid">
          <article>
            <span>Total invoiced</span>
            <strong>{zar(invoiced)}</strong>
          </article>

          <article>
            <span>Allocated payments</span>
            <strong>{zar(allocated)}</strong>
          </article>

          <article>
            <span>Unpaid invoice balance</span>
            <strong>{zar(outstanding)}</strong>
          </article>

          <article>
            <span>Invoices</span>
            <strong>{rows.length}</strong>
          </article>
        </div>

        <p className="ct-pa-v2-note">
          Figures are based on existing patient invoices and
          allocations. Unallocated payments, refunds and
          medical-aid settlements are not included here.
        </p>
      </div>
    )
  }

  return (
    <div className="ct-pa-v2 ct-pa-v2-invoices">
      {rows.length === 0 ? (
        <p className="ct-pa-v2-message">
          No invoices returned for this patient.
        </p>
      ) : (
        rows.map(invoice => {
          const due = Math.max(
            0,
            invoice.totalAmount - invoice.allocatedAmount
          )

          return (
            <article className="ct-pa-v2-invoice" key={invoice.id}>
              <strong>{invoice.invoiceNumber}</strong>

              <div>
                <span>Invoiced: {zar(invoice.totalAmount)}</span>
                <span>Allocated: {zar(invoice.allocatedAmount)}</span>
                <strong>Due: {zar(due)}</strong>
              </div>
            </article>
          )
        })
      )}
    </div>
  )
}
