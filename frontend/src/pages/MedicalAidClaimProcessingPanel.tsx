import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useConfirmDialog } from '../components/useConfirmDialog'
import './MedicalAidClaimProcessingPanel.css'

type ClaimRow = {
  id: string
  claimNumber: string
  patientName: string
  schemeName: string
  planName: string
  claimedAmount: number
  status: string
}

type ClaimEvent = {
  id: string
  fromStatus: string
  toStatus: string
  approvedAmount: number | null
  externalReference: string | null
  evidenceReference: string
  reason: string
  performedByUserId: string
  performedAtUtc: string
}

type ClaimHistory = {
  claim: {
    id: string
    status: string
    claimedAmount: number
    approvedAmount: number | null
    externalReference: string | null
  }
  events: ClaimEvent[]
}

type Props = {
  canManage: boolean
}

const base = '/api/finance/medical-aid/claims'

const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)

const statusLabels: Record<string, string> = {
  Draft: 'Draft',
  SubmittedExternallyReported: 'Submission recorded',
  AcknowledgedReported: 'Acknowledged (reported)',
  ApprovedReported: 'Approved (reported)',
  PartiallyApprovedReported: 'Partially approved (reported)',
  RejectedReported: 'Rejected (reported)',
}

const transitions: Record<string, string[]> = {
  Draft: ['SubmittedExternallyReported'],
  SubmittedExternallyReported: [
    'AcknowledgedReported',
    'ApprovedReported',
    'PartiallyApprovedReported',
    'RejectedReported',
  ],
  AcknowledgedReported: [
    'ApprovedReported',
    'PartiallyApprovedReported',
    'RejectedReported',
  ],
}

async function readError(response: Response) {
  try {
    const body = await response.json() as {
      message?: string
      title?: string
    }
    return body.message || body.title ||
      `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export default function MedicalAidClaimProcessingPanel({
  canManage,
}: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()

  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [history, setHistory] = useState<ClaimHistory | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [targetStatus, setTargetStatus] = useState('')
  const [externalReference, setExternalReference] = useState('')
  const [approvedAmount, setApprovedAmount] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [reason, setReason] = useState('')

  const requestId = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(base, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(await readError(response))

        const rows = await response.json() as ClaimRow[]

        if (!controller.signal.aborted) {
          setClaims(rows)
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error
            ? cause.message : 'Could not load claims.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!selectedId) return

    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(
          `${base}/${encodeURIComponent(selectedId)}/workflow/history`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        )

        if (!response.ok) throw new Error(await readError(response))

        const data = await response.json() as ClaimHistory

        if (!controller.signal.aborted) {
          setHistory(data)
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error
            ? cause.message : 'Could not load claim history.')
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [selectedId, reload])

  const selected = claims.find(item => item.id === selectedId)
  const nextStatuses = selected
    ? transitions[selected.status] ?? []
    : []

  const isDecision = [
    'ApprovedReported',
    'PartiallyApprovedReported',
    'RejectedReported',
  ].includes(targetStatus)

  const requiresAmount =
    isDecision && targetStatus !== 'RejectedReported'

  function clearForm() {
    setTargetStatus('')
    setExternalReference('')
    setApprovedAmount('')
    setEvidenceReference('')
    setReason('')
    requestId.current = null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !targetStatus || busy || !canManage) return

    const amount = targetStatus === 'RejectedReported'
      ? 0
      : requiresAmount
        ? Number(approvedAmount)
        : null

    if (
      reason.trim().length < 5 ||
      evidenceReference.trim().length < 3 ||
      (targetStatus === 'SubmittedExternallyReported' &&
        !externalReference.trim()) ||
      (requiresAmount && (
        !/^\d+(\.\d{1,2})?$/.test(approvedAmount) ||
        !Number.isFinite(amount) ||
        amount === null ||
        amount <= 0 ||
        amount > selected.claimedAmount
      ))
    ) {
      setError('Check the status, evidence and amount.')
      return
    }

    const accepted = await confirm({
      title: 'Record medical aid claim status',
      message:
        `Claim: ${selected.claimNumber}\n` +
        `Patient: ${selected.patientName}\n` +
        `New status: ${statusLabels[targetStatus]}\n` +
        (isDecision ? `Reported approved amount: ${money(amount ?? 0)}\n` : '') +
        `Evidence: ${evidenceReference.trim()}\n\n` +
        'This records external correspondence only. ' +
        'No claim is electronically submitted and no payment is recorded.',
      confirmLabel: 'Record status',
    })

    if (!accepted) return

    setBusy(true)
    setError('')
    setNotice('')
    requestId.current ??= crypto.randomUUID()

    try {
      const response = await fetch(
        `${base}/${encodeURIComponent(selected.id)}/workflow/transition`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            requestId: requestId.current,
            targetStatus,
            externalReference:
              targetStatus === 'SubmittedExternallyReported'
                ? externalReference.trim()
                : null,
            approvedAmount: amount,
            evidenceReference: evidenceReference.trim(),
            reason: reason.trim(),
          }),
        }
      )

      if (!response.ok) throw new Error(await readError(response))

      clearForm()
      setNotice('Claim status and audit event recorded.')
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Unable to record claim status.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ct-claims-processing">
      {confirmationDialog}

      <div className="ct-claims-notice">
        <strong>Internal claims processing</strong>
        <p>
          Scheme responses and submission details are entered by staff.
          No live scheme communication or automatic payment settlement occurs.
        </p>
      </div>

      <div className="ct-claims-toolbar">
        <h3>Medical aid claims</h3>
        <button type="button" className="secondary-button"
          onClick={() => {
            setLoading(true)
            setReload(value => value + 1)
          }}>
          Refresh claims
        </button>
      </div>

      {error && <p className="ct-medical-aid-error" role="alert">{error}</p>}
      {notice && <p className="ct-medical-aid-success" role="status">{notice}</p>}

      {loading && <p>Loading claims…</p>}

      {!loading && claims.length === 0 && (
        <p>No claims found. Create a draft in Claims Ledger first.</p>
      )}

      <div className="ct-claims-register">
        {claims.map(claim => (
          <button
            key={claim.id}
            type="button"
            className={
              'ct-claims-row' +
              (selectedId === claim.id ? ' selected' : '')
            }
            onClick={() => {
              setSelectedId(claim.id)
              setHistory(null)
              clearForm()
              setError('')
              setNotice('')
            }}
          >
            <span className="ct-claims-identity">
              <strong>{claim.patientName}</strong>
              <small>{claim.schemeName} · {claim.claimNumber}</small>
            </span>
            <strong>{money(claim.claimedAmount)}</strong>
            <span className="ct-claims-status">
              {statusLabels[claim.status] ?? claim.status}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="ct-claims-details">
          <h3>Claim processing — {selected.claimNumber}</h3>

          <div className="ct-claims-summary">
            <span>
              <small>Claimed amount</small>
              <strong>{money(selected.claimedAmount)}</strong>
            </span>
            <span>
              <small>Current status</small>
              <strong>{statusLabels[selected.status] ?? selected.status}</strong>
            </span>
            <span>
              <small>Reported approval</small>
              <strong>
                {history?.claim.approvedAmount == null
                  ? 'Not recorded'
                  : money(history.claim.approvedAmount)}
              </strong>
            </span>
          </div>

          {history?.claim.externalReference && (
            <p>
              <strong>External claim reference:</strong>{' '}
              {history.claim.externalReference}
            </p>
          )}

          {canManage && nextStatuses.length > 0 && (
            <form className="ct-claims-form"
              onSubmit={event => void submit(event)}>
              <h4>Record claim status change</h4>

              <label>
                New status
                <select required value={targetStatus}
                  onChange={event => {
                    setTargetStatus(event.target.value)
                    setApprovedAmount('')
                    requestId.current = null
                  }}>
                  <option value="">Choose status</option>
                  {nextStatuses.map(status => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>

              {targetStatus === 'SubmittedExternallyReported' && (
                <label>
                  External submission reference
                  <input required maxLength={120}
                    value={externalReference}
                    onChange={event => {
                      setExternalReference(event.target.value)
                      requestId.current = null
                    }}
                    placeholder="Reference from actual submission"/>
                </label>
              )}

              {requiresAmount && (
                <label>
                  Reported approved amount (ZAR)
                  <input required inputMode="decimal"
                    value={approvedAmount}
                    onChange={event => {
                      setApprovedAmount(event.target.value)
                      requestId.current = null
                    }}
                    placeholder="0.00"/>
                </label>
              )}

              {targetStatus === 'RejectedReported' && (
                <p className="ct-claims-info">
                  Rejected claims record R0.00 approved.
                </p>
              )}

              <label>
                Scheme correspondence / evidence reference
                <input required minLength={3} maxLength={300}
                  value={evidenceReference}
                  onChange={event => {
                    setEvidenceReference(event.target.value)
                    requestId.current = null
                  }}
                  placeholder="Scheme email, document or EDI reference"/>
              </label>

              <label>
                Reason and notes
                <textarea required minLength={5} maxLength={1000}
                  value={reason}
                  rows={3}
                  onChange={event => {
                    setReason(event.target.value)
                    requestId.current = null
                  }}/>
              </label>

              <button type="submit" className="primary-button"
                disabled={!targetStatus || busy}>
                Record status
              </button>
            </form>
          )}

          <div className="ct-claims-history">
            <h4>Claim audit history</h4>

            {!history && <p>Loading history…</p>}

            {history && history.events.length === 0 && (
              <p>No status changes recorded. This claim is still a draft.</p>
            )}

            {history?.events.map(entry => (
              <article key={entry.id} className="ct-claims-event">
                <strong>
                  {statusLabels[entry.fromStatus] ?? entry.fromStatus}
                  {' → '}
                  {statusLabels[entry.toStatus] ?? entry.toStatus}
                </strong>

                <p>{entry.reason}</p>
                <small>Evidence: {entry.evidenceReference}</small>

                {entry.approvedAmount !== null && (
                  <small>
                    Reported amount: {money(entry.approvedAmount)}
                  </small>
                )}

                <small>
                  {new Date(entry.performedAtUtc)
                    .toLocaleString('en-ZA')}
                  {' · '}Staff ID: {entry.performedByUserId}
                </small>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
