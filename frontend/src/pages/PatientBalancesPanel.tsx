import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { RefreshCw, Search, Wallet } from 'lucide-react'
import './PatientBalancesPanel.css'

type BalanceRow = {
  patientId: string
  patientName: string
  totalCharges: number
  totalPayments: number
  balance: number
  requiresReview: boolean
}

type BalanceResponse = {
  currency: string
  page: number
  pageSize: number
  totalPatients: number
  displayedPatients: number
  displayedCharges: number
  displayedPayments: number
  displayedBalance: number
  patients: BalanceRow[]
  scope: string
  note: string
}

function money(value: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)
}

export default function PatientBalancesPanel() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)

  const [data, setData] = useState<BalanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    const params = new URLSearchParams({
      search,
      page: String(page),
      pageSize: '25',
    })

    async function load() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(
          `/api/finance/patient-balances?${params.toString()}`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          let message = `Unable to load patient balances (${response.status}).`

          try {
            const result = await response.json() as {
              message?: string
              title?: string
            }
            message = result.message || result.title || message
          } catch {
            // Keep the HTTP error.
          }

          throw new Error(message)
        }

        const result = await response.json() as BalanceResponse

        if (active) {
          setData(result)
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          setData(null)
          setError(cause instanceof Error
            ? cause.message
            : 'Unable to load patient accounts.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [search, page, reload])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearch(input.trim())
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.totalPatients / data.pageSize))
    : 1

  return (
    <section className="panel ct-patient-balances">
      <header className="ct-patient-balances-header">
        <div>
          <div className="eyebrow">FINANCE · PATIENT ACCOUNTS</div>
          <h2>Patient Balances</h2>
          <p>Charges, receipts and balances by patient</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => setReload(value => value + 1)}
        >
          <RefreshCw size={16}/> Refresh
        </button>
      </header>

      <form className="ct-patient-balances-search"
        onSubmit={submitSearch}>
        <label htmlFor="balance-search">Search patients</label>

        <div>
          <input
            id="balance-search"
            value={input}
            maxLength={100}
            onChange={event => setInput(event.target.value)}
            placeholder="Search by patient name..."
          />

          <button type="submit" className="secondary-button">
            <Search size={16}/> Search
          </button>
        </div>
      </form>

      {error && <p role="alert" className="ct-patient-balances-error">
        {error}
      </p>}

      {loading && <p role="status">Loading patient balances…</p>}

      {data && !loading && (
        <>
          <p className="ct-patient-balances-notice">
            <Wallet size={16}/>
            Amounts below reflect finalized consultation charges and
            recorded appointment receipts. Orthodontic agreements
            are not included until invoiced.
          </p>

          <div className="ct-patient-balance-cards">
            <article>
              <span>Charges on this page</span>
              <strong>{money(data.displayedCharges)}</strong>
            </article>
            <article>
              <span>Receipts on this page</span>
              <strong>{money(data.displayedPayments)}</strong>
            </article>
            <article>
              <span>Net balance on this page</span>
              <strong>{money(data.displayedBalance)}</strong>
            </article>
          </div>

          <div className="ct-patient-balances-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Charges</th>
                  <th scope="col">Received</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Review</th>
                </tr>
              </thead>
              <tbody>
                {data.patients.map(patient => (
                  <tr key={patient.patientId}>
                    <td>{patient.patientName}</td>
                    <td>{money(patient.totalCharges)}</td>
                    <td>{money(patient.totalPayments)}</td>
                    <td className="ct-patient-balance-amount">
                      {money(patient.balance)}
                    </td>
                    <td>
                      {patient.requiresReview
                        ? 'Payment exceeds charges'
                        : patient.balance > 0
                          ? 'Outstanding'
                          : 'No positive balance'}
                    </td>
                  </tr>
                ))}

                {data.patients.length === 0 && (
                  <tr>
                    <td colSpan={5}>No patients found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ct-patient-balances-pagination">
            <span>
              Page {page} of {totalPages} ·{' '}
              {data.totalPatients} matching patients
            </span>

            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => setPage(value => value - 1)}
              >
                Previous
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={page >= totalPages}
                onClick={() => setPage(value => value + 1)}
              >
                Next
              </button>
            </div>
          </div>

          <p className="ct-patient-balances-footnote">
            {data.note} Page totals are not practice-wide totals.
            This report does not yet account for refunds,
            credit notes or payment reallocations.
          </p>
        </>
      )}
    </section>
  )
}
