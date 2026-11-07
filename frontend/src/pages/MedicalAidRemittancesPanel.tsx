import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { useConfirmDialog } from '../components/useConfirmDialog'
import './MedicalAidRemittancesPanel.css'

type Claim = {
  id: string
  claimNumber: string
  patientName: string
  status: string
  approvedAmount: number | null
}

type Advice = {
  id: string
  claimId: string
  claimNumber: string
  remittanceReference: string
  advisedAmount: number
  evidenceReference: string
  notes: string
  recordedAtUtc: string
  status: string
}

type Props = {
  canManage: boolean
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount)

async function errorMessage(response: Response) {
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

function readArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]

  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>
    for (const key of ['items', 'claims', 'data', 'results']) {
      if (Array.isArray(data[key])) return data[key] as T[]
    }
  }

  throw new Error('Unexpected API response format.')
}

export default function MedicalAidRemittancesPanel({
  canManage,
}: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()

  const [claims, setClaims] = useState<Claim[]>([])
  const [advices, setAdvices] = useState<Advice[]>([])
  const [claimId, setClaimId] = useState('')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [evidence, setEvidence] = useState('')
  const [notes, setNotes] = useState('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestId = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)

      try {
        const requests = [
          fetch('/api/finance/medical-aid/remittances', {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch('/api/finance/medical-aid/claims', {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]

        const [adviceResponse, claimResponse] =
          await Promise.all(requests)

        if (!adviceResponse.ok) {
          throw new Error(await errorMessage(adviceResponse))
        }

        if (!claimResponse.ok) {
          throw new Error(await errorMessage(claimResponse))
        }

        const adviceData = readArray<Advice>(
          await adviceResponse.json()
        )

        const claimData = readArray<Claim>(
          await claimResponse.json()
        )

        if (controller.signal.aborted) return

        setAdvices(adviceData)
        setClaims(claimData)
        setError('')
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error
          ? cause.message
          : 'Unable to load medical aid remittances.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [reload])

  const eligibleClaims = claims.filter(
    claim =>
      (claim.status === 'ApprovedReported' ||
        claim.status === 'PartiallyApprovedReported') &&
      typeof claim.approvedAmount === 'number' &&
      claim.approvedAmount > 0
  )

  const selectedClaim = eligibleClaims.find(
    claim => claim.id === claimId
  )

  const alreadyAdvised = advices
    .filter(advice => advice.claimId === claimId)
    .reduce((sum, advice) => sum + advice.advisedAmount, 0)

  const remainingApproval = Math.max(
    0,
    (selectedClaim?.approvedAmount ?? 0) - alreadyAdvised
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || saving) return

    const value = Number(amount)

    if (
      !selectedClaim ||
      reference.trim().length < 3 ||
      evidence.trim().length < 3 ||
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > remainingApproval
    ) {
      setError(
        'Select an approved claim and provide valid advice ' +
        'details within its remaining approval.'
      )
      return
    }

    const accepted = await confirm({
      title: 'Record medical aid remittance advice',
      message:
        `Record ${money(value)} as scheme-reported advice ` +
        `for ${selectedClaim.patientName}? ` +
        'This does not confirm that money was received ' +
        'and does not settle an invoice.',
      confirmLabel: 'Record advice',
    })

    if (!accepted) return

    setSaving(true)
    setError('')
    setNotice('')

    requestId.current ??= crypto.randomUUID()

    try {
      const response = await fetch(
        '/api/finance/medical-aid/remittances',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            requestId: requestId.current,
            claimId,
            remittanceReference: reference.trim(),
            advisedAmount: value,
            evidenceReference: evidence.trim(),
            notes: notes.trim(),
          }),
        }
      )

      if (!response.ok) {
        throw new Error(await errorMessage(response))
      }

      requestId.current = null
      setClaimId('')
      setReference('')
      setAmount('')
      setEvidence('')
      setNotes('')
      setNotice(
        'Remittance advice recorded. No payment was created.'
      )
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Unable to record remittance advice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="ct-remittances">
      {confirmationDialog}

      <header className="ct-remittances-heading">
        <div>
          <div className="eyebrow">
            FINANCE · MEDICAL AID
          </div>
          <h3>Remittances & Settlement</h3>
          <p>
            Register scheme remittance advice and track reported
            amounts before bank reconciliation.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={loading || saving}
          onClick={() => setReload(value => value + 1)}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <div className="ct-remittances-notice">
        Remittance advice is not proof of money received.
        Recording advice does not generate a receipt,
        allocate a payment or change an invoice balance.
      </div>

      {error && <p role="alert" className="clinical-error">
        {error}
      </p>}

      {notice && <p role="status" className="clinical-success">
        {notice}
      </p>}

      {canManage && (
        <form
          className="ct-remittances-form"
          onSubmit={event => void submit(event)}
        >
          <h4>Record remittance advice</h4>

          <label>
            Approved medical aid claim
            <select
              required
              value={claimId}
              disabled={saving || loading}
              onChange={event => {
                setClaimId(event.target.value)
                setAmount('')
                requestId.current = null
              }}
            >
              <option value="">Choose approved claim</option>
              {eligibleClaims.map(claim => (
                <option key={claim.id} value={claim.id}>
                  {claim.patientName} · {claim.claimNumber}
                </option>
              ))}
            </select>
          </label>

          {selectedClaim && (
            <div className="ct-remittances-amounts">
              <span>
                Reported approval:
                <strong>
                  {money(selectedClaim.approvedAmount ?? 0)}
                </strong>
              </span>
              <span>
                Previously advised:
                <strong>{money(alreadyAdvised)}</strong>
              </span>
              <span>
                Remaining approval:
                <strong>{money(remainingApproval)}</strong>
              </span>
            </div>
          )}

          <label>
            Scheme remittance reference
            <input
              required
              minLength={3}
              maxLength={120}
              value={reference}
              disabled={saving}
              onChange={event => {
                setReference(event.target.value)
                requestId.current = null
              }}
              placeholder="Reference from remittance advice"
            />
          </label>

          <label>
            Advised amount (ZAR)
            <input
              required
              type="number"
              min="0.01"
              max={remainingApproval}
              step="0.01"
              value={amount}
              disabled={saving}
              onChange={event => {
                setAmount(event.target.value)
                requestId.current = null
              }}
              placeholder="0.00"
            />
          </label>

          <label>
            Evidence reference
            <input
              required
              minLength={3}
              maxLength={300}
              value={evidence}
              disabled={saving}
              onChange={event => {
                setEvidence(event.target.value)
                requestId.current = null
              }}
              placeholder="Scheme advice document/reference"
            />
          </label>

          <label>
            Internal notes (optional)
            <textarea
              maxLength={1000}
              rows={3}
              value={notes}
              disabled={saving}
              onChange={event => {
                setNotes(event.target.value)
                requestId.current = null
              }}
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={
              saving ||
              loading ||
              !selectedClaim ||
              remainingApproval <= 0
            }
          >
            {saving ? 'Recording...' : 'Record advice'}
          </button>
        </form>
      )}

      <div className="ct-remittances-register">
        <h4>Recorded remittance advice</h4>

        {loading ? (
          <p>Loading remittances...</p>
        ) : advices.length === 0 ? (
          <p>No remittance advice recorded yet.</p>
        ) : (
          <div className="ct-remittances-list">
            {advices.map(advice => (
              <article
                key={advice.id}
                className="ct-remittances-item"
              >
                <div>
                  <strong>{advice.claimNumber}</strong>
                  <p>{advice.remittanceReference}</p>
                  <small>
                    Evidence: {advice.evidenceReference}
                  </small>
                  <small>
                    {new Date(
                      advice.recordedAtUtc
                    ).toLocaleString('en-ZA')}
                  </small>
                </div>

                <div>
                  <strong>{money(advice.advisedAmount)}</strong>
                  <span className="ct-remittances-status">
                    Advice recorded
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
