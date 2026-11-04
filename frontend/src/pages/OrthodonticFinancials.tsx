import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, CreditCard, FileText, RefreshCw, Save } from 'lucide-react'
import './OrthodonticFinancials.css'

type Instalment = {
  id: string
  sequence: number
  dueDate: string
  amountDue: number
}

type Agreement = {
  id: string
  orthodonticCaseId: string
  totalFee: number
  depositRequired: number
  currency: string
  agreementDate: string
  terms: string | null
  createdAtUtc: string
  instalments: Instalment[]
}

type Props = {
  caseId: string
  caseTitle: string
}

function today(): string {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function money(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount)
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as {
      message?: string
      title?: string
    }
    return body.message || body.title || `Request failed (${response.status}).`
  } catch {
    return `Request failed (${response.status}).`
  }
}

export default function OrthodonticFinancials({ caseId, caseTitle }: Props) {
  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)

  const [totalFee, setTotalFee] = useState('')
  const [deposit, setDeposit] = useState('0.00')
  const [agreementDate, setAgreementDate] = useState(today())
  const [firstDueDate, setFirstDueDate] = useState(today())
  const [instalmentCount, setInstalmentCount] = useState('12')
  const [terms, setTerms] = useState('')

  const endpoint = `/api/finance/orthodontics/${encodeURIComponent(caseId)}/agreement`

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const response = await fetch(endpoint, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!active) return

        if (response.status === 404) {
          setAgreement(null)
          setError('')
          return
        }

        if (!response.ok) {
          throw new Error(await responseMessage(response))
        }

        const result = await response.json() as Agreement
        if (!active) return

        setAgreement(result)
        setError('')
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error
            ? cause.message
            : 'Unable to load financial agreement.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [endpoint, reload])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const fee = Number(totalFee)
    const depositAmount = Number(deposit)
    const count = Number(instalmentCount)

    if (
      !Number.isFinite(fee) ||
      !Number.isFinite(depositAmount) ||
      fee <= 0 ||
      depositAmount < 0 ||
      depositAmount >= fee ||
      !/^\\d+(\\.\\d{1,2})?$/.test(totalFee) ||
      !/^\\d+(\\.\\d{1,2})?$/.test(deposit) ||
      !Number.isInteger(count) ||
      count < 1 || count > 60
    ) {
      setError('Enter a valid treatment fee, deposit and 1–60 instalments.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          totalFee: fee,
          depositRequired: depositAmount,
          agreementDate,
          firstDueDate,
          instalmentCount: count,
          terms: terms.trim() || null,
        }),
      })

      if (!response.ok) {
        throw new Error(await responseMessage(response))
      }

      setNotice('Treatment agreement saved successfully.')
      setLoading(true)
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Unable to save treatment agreement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel ct-ortho-financials">
      <header className="ct-ortho-financials-heading">
        <div>
          <div className="eyebrow">ORTHODONTICS · FINANCIAL AGREEMENT</div>
          <h2>Case Financials</h2>
          <p>{caseTitle}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setReload(value => value + 1)
          }}
        >
          <RefreshCw size={16}/> Refresh
        </button>
      </header>

      {error && <p role="alert" className="ct-ortho-finance-error">{error}</p>}
      {notice && <p role="status" className="ct-ortho-finance-success">{notice}</p>}

      {loading ? (
        <p>Loading treatment agreement…</p>
      ) : agreement ? (
        <>
          <div className="ct-ortho-finance-cards">
            <article>
              <FileText size={20}/>
              <span>Agreed treatment fee</span>
              <strong>{money(agreement.totalFee)}</strong>
            </article>
            <article>
              <CreditCard size={20}/>
              <span>Required deposit</span>
              <strong>{money(agreement.depositRequired)}</strong>
            </article>
            <article>
              <CalendarDays size={20}/>
              <span>Scheduled after deposit</span>
              <strong>
                {money(agreement.totalFee - agreement.depositRequired)}
              </strong>
            </article>
          </div>

          <div className="ct-ortho-finance-note">
            These amounts describe the agreement and payment schedule.
            They are not proof of payment. Actual receipts and outstanding
            balances will be calculated by the billing ledger.
          </div>

          <div className="ct-ortho-finance-details">
            <p><strong>Agreement date:</strong> {agreement.agreementDate}</p>
            <p><strong>Currency:</strong> {agreement.currency}</p>
            <p><strong>Agreement recorded:</strong> {new Date(agreement.createdAtUtc).toLocaleString('en-ZA')}</p>
            {agreement.terms && (
              <p><strong>Terms:</strong> {agreement.terms}</p>
            )}
          </div>

          <h3>Instalment schedule</h3>
          <div className="ct-ortho-finance-table-wrap">
            <table className="ct-ortho-finance-table">
              <thead>
                <tr>
                  <th scope="col">Instalment</th>
                  <th scope="col">Due date</th>
                  <th scope="col">Amount due</th>
                </tr>
              </thead>
              <tbody>
                {agreement.instalments.map(item => (
                  <tr key={item.id}>
                    <td>{item.sequence}</td>
                    <td>{item.dueDate}</td>
                    <td>{money(item.amountDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !error ? (
        <>
          <div className="ct-ortho-finance-note">
            No treatment agreement is saved for this orthodontic case.
            Create one using the agreed terms. This action will not
            record or collect any payment.
          </div>

          <form className="ct-ortho-finance-form" onSubmit={event => void save(event)}>
            <label>
              Total treatment fee (ZAR)
              <input
                type="number"
                min="0.01"
                max="10000000"
                step="0.01"
                required
                value={totalFee}
                onChange={event => setTotalFee(event.target.value)}
                placeholder="18000.00"
              />
            </label>

            <label>
              Required deposit (ZAR)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={deposit}
                onChange={event => setDeposit(event.target.value)}
              />
            </label>

            <label>
              Agreement date
              <input
                type="date"
                required
                value={agreementDate}
                onChange={event => setAgreementDate(event.target.value)}
              />
            </label>

            <label>
              First instalment date
              <input
                type="date"
                required
                min={agreementDate}
                value={firstDueDate}
                onChange={event => setFirstDueDate(event.target.value)}
              />
            </label>

            <label>
              Number of monthly instalments
              <input
                type="number"
                required
                min="1"
                max="60"
                step="1"
                value={instalmentCount}
                onChange={event => setInstalmentCount(event.target.value)}
              />
            </label>

            <label className="ct-ortho-finance-full">
              Payment terms and notes
              <textarea
                rows={4}
                maxLength={2000}
                value={terms}
                onChange={event => setTerms(event.target.value)}
                placeholder="Record the approved payment terms…"
              />
            </label>

            <button className="primary-button" type="submit" disabled={busy}>
              <Save size={17}/>
              {busy ? 'Saving agreement…' : 'Save financial agreement'}
            </button>
          </form>
        </>
      ) : null}
    </section>
  )
}
