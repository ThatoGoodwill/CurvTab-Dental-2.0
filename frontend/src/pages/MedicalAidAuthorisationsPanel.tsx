import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useConfirmDialog } from '../components/useConfirmDialog'
import './MedicalAidAuthorisationsPanel.css'

type Membership = {
  id: string
  patientName: string
  schemeName: string
  planName: string
}

type Authorisation = {
  id: string
  patientName: string
  schemeName: string
  planName: string
  treatmentDescription: string
  requestedAmount: number
  approvedAmount: number | null
  status: string
  authorisationNumber: string | null
  expiresOn: string | null
  evidenceReference: string | null
  isExpired: boolean
}

type HistoryEvent = {
  id: string
  eventType: string
  fromStatus: string
  toStatus: string
  reason: string
  evidenceReference: string | null
  authorisationNumber: string | null
  approvedAmount: number | null
  expiresOn: string | null
  performedByUserId: string
  performedAtUtc: string
}

type Props = {
  canManage: boolean
}

const base = '/api/finance/medical-aid'

const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(value)

async function requestJson<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      ...(options?.method
        ? {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          }
        : {}),
    },
  })

  if (!response.ok) {
    let reason = `Request failed (${response.status})`
    try {
      const body = await response.json() as {
        message?: string
        title?: string
      }
      reason = body.message || body.title || reason
    } catch {
      // Retain HTTP status.
    }
    throw new Error(reason)
  }

  return response.json() as Promise<T>
}

export default function MedicalAidAuthorisationsPanel({
  canManage,
}: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()

  const [memberships, setMemberships] = useState<Membership[]>([])
  const [rows, setRows] = useState<Authorisation[]>([])
  const [selected, setSelected] = useState('')
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestId = useRef<string | null>(null)

  const [membershipId, setMembershipId] = useState('')
  const [treatment, setTreatment] = useState('')
  const [requested, setRequested] = useState('')
  const [reason, setReason] = useState('')

  const [decision, setDecision] = useState('ApprovedReported')
  const [approved, setApproved] = useState('')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [evidence, setEvidence] = useState('')
  const [decisionReason, setDecisionReason] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [m, a] = await Promise.all([
          requestJson<Membership[]>(`${base}/memberships`),
          requestJson<Authorisation[]>(`${base}/authorisations`),
        ])
        if (!active) return
        setMemberships(m)
        setRows(a)
        setError('')
      } catch (cause) {
        if (active) setError(
          cause instanceof Error ? cause.message : 'Unable to load.'
        )
      }
    }

    void load()
    return () => { active = false }
  }, [reload])

  useEffect(() => {
    if (!selected) return
    let active = true

    async function load() {
      try {
        const events = await requestJson<HistoryEvent[]>(
          `${base}/authorisations/${encodeURIComponent(selected)}/history`
        )
        if (active) setHistory(events)
      } catch (cause) {
        if (active) setError(
          cause instanceof Error ? cause.message : 'History unavailable.'
        )
      }
    }

    void load()
    return () => { active = false }
  }, [selected, reload])

  const chosen = rows.find(x => x.id === selected)

  function validAmount(text: string) {
    return /^\d+(\.\d{1,2})?$/.test(text) &&
      Number.isFinite(Number(text))
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    if (!membershipId || !validAmount(requested) ||
        Number(requested) <= 0 || treatment.trim().length < 5 ||
        reason.trim().length < 5) {
      setError('Provide a membership, treatment, amount and reason.')
      return
    }

    if (!(await confirm({
      title: 'Confirm authorisation request',
      message:
        'Record this internal medical aid authorisation request? ' +
        'This does not submit anything to the medical aid scheme.',
      confirmLabel: 'Record request',
    }))) return

    setBusy(true)
    setError('')
    setNotice('')
    requestId.current ??= crypto.randomUUID()

    try {
      await requestJson(`${base}/authorisations`, {
        method: 'POST',
        body: JSON.stringify({
          requestId: requestId.current,
          membershipId,
          treatmentDescription: treatment.trim(),
          requestedAmount: Number(requested),
          reason: reason.trim(),
        }),
      })

      requestId.current = null
      setMembershipId('')
      setTreatment('')
      setRequested('')
      setReason('')
      setNotice('Internal authorisation request recorded.')
      setReload(v => v + 1)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Request failed.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function recordDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || !chosen || busy) return

    const amount = decision === 'DeclinedReported'
      ? 0
      : Number(approved)

    if (
      (decision !== 'DeclinedReported' &&
        (!validAmount(approved) || amount <= 0 ||
         amount > chosen.requestedAmount)) ||
      decisionReason.trim().length < 5 ||
      evidence.trim().length < 3 ||
      (decision !== 'DeclinedReported' && (!number.trim() || !expiry))
    ) {
      setError('Check the decision details and evidence.')
      return
    }

    if (!(await confirm({
      title: 'Record scheme decision',
      message:
        'This reported scheme decision will be saved with an ' +
        'audit history. Verify the approval details and scheme ' +
        'correspondence before continuing.',
      confirmLabel: 'Record decision',
    }))) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await requestJson(
        `${base}/authorisations/${encodeURIComponent(chosen.id)}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            approvedAmount: amount,
            authorisationNumber:
              decision === 'DeclinedReported' ? null : number.trim(),
            expiresOn:
              decision === 'DeclinedReported' ? null : expiry,
            evidenceReference: evidence.trim(),
            reason: decisionReason.trim(),
          }),
        }
      )

      setNotice('Reported decision saved with audit history.')
      setApproved('')
      setNumber('')
      setExpiry('')
      setEvidence('')
      setDecisionReason('')
      setReload(v => v + 1)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Decision failed.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ct-auths">
      {confirmationDialog}
      <p className="ct-auths-notice">
        This register records information supplied by the scheme.
        It does not submit requests, verify approvals or record payments.
      </p>

      {error && <p role="alert" className="ct-medical-aid-error">{error}</p>}
      {notice && <p role="status" className="ct-medical-aid-success">{notice}</p>}

      <form className="ct-auths-form" onSubmit={event => void create(event)}>
        <h3>Record authorisation request</h3>

        <label>
          Patient and medical aid
          <select required value={membershipId}
            onChange={e => setMembershipId(e.target.value)}>
            <option value="">Choose membership</option>
            {memberships.map(m => (
              <option key={m.id} value={m.id}>
                {m.patientName} · {m.schemeName} · {m.planName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Requested treatment
          <input required minLength={5} maxLength={300}
            value={treatment}
            onChange={e => setTreatment(e.target.value)}
            placeholder="e.g. Orthodontic treatment assessment"/>
        </label>

        <label>
          Requested amount (ZAR)
          <input required inputMode="decimal"
            value={requested}
            onChange={e => setRequested(e.target.value)}
            placeholder="0.00"/>
        </label>

        <label>
          Reason / request evidence
          <textarea required minLength={5} maxLength={1000}
            rows={3} value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Record how this request was made"/>
        </label>

        <button className="primary-button" disabled={busy} type="submit">
          Record request
        </button>
      </form>

      <div className="ct-auths-register">
        <h3>Authorisation register</h3>
        {rows.length === 0 && <p>No authorisation requests recorded.</p>}
        {rows.map(row => (
          <button key={row.id} type="button"
            className={`ct-auths-row ${selected === row.id ? 'selected' : ''}`}
            onClick={() => {
              setSelected(row.id)
              setHistory([])
            }}>
            <span>
              <strong>{row.patientName}</strong>
              <small>{row.schemeName} · {row.treatmentDescription}</small>
            </span>
            <span>{money(row.requestedAmount)}</span>
            <strong>
              {row.isExpired ? 'Expired' : row.status}
            </strong>
          </button>
        ))}
      </div>

      {chosen && (
        <section className="ct-auths-detail">
          <h3>Authorisation details</h3>
          <p><strong>Treatment:</strong> {chosen.treatmentDescription}</p>
          <p><strong>Requested:</strong> {money(chosen.requestedAmount)}</p>
          <p><strong>Reported approved:</strong>{' '}
            {chosen.approvedAmount === null
              ? 'Not recorded' : money(chosen.approvedAmount)}</p>
          <p><strong>Scheme reference:</strong>{' '}
            {chosen.authorisationNumber || 'Not recorded'}</p>
          <p><strong>Expiry:</strong>{' '}
            {chosen.expiresOn || 'Not recorded'}
            {chosen.isExpired ? ' · Expired' : ''}</p>
          <p><strong>Evidence:</strong>{' '}
            {chosen.evidenceReference || 'Not recorded'}</p>

          {canManage && chosen.status === 'RecordedPending' && (
            <form className="ct-auths-form"
              onSubmit={event => void recordDecision(event)}>
              <h3>Record reported scheme decision</h3>

              <label>
                Decision
                <select value={decision}
                  onChange={e => {
                    setDecision(e.target.value)
                    setApproved('')
                  }}>
                  <option value="ApprovedReported">
                    Approved (reported)
                  </option>
                  <option value="PartiallyApprovedReported">
                    Partially approved (reported)
                  </option>
                  <option value="DeclinedReported">
                    Declined (reported)
                  </option>
                </select>
              </label>

              {decision !== 'DeclinedReported' && (
                <>
                  <label>
                    Approved amount (ZAR)
                    <input required inputMode="decimal"
                      value={approved}
                      onChange={e => setApproved(e.target.value)}
                      placeholder="0.00"/>
                  </label>

                  <label>
                    Authorisation number
                    <input required maxLength={100}
                      value={number}
                      onChange={e => setNumber(e.target.value)}/>
                  </label>

                  <label>
                    Expiry date
                    <input required type="date" value={expiry}
                      onChange={e => setExpiry(e.target.value)}/>
                  </label>
                </>
              )}

              <label>
                Scheme correspondence reference
                <input required minLength={3} maxLength={300}
                  value={evidence}
                  onChange={e => setEvidence(e.target.value)}
                  placeholder="Email or document reference"/>
              </label>

              <label>
                Reason / decision notes
                <textarea required minLength={5} maxLength={1000}
                  rows={3} value={decisionReason}
                  onChange={e => setDecisionReason(e.target.value)}/>
              </label>

              <button type="submit" disabled={busy}
                className="primary-button">
                Record decision
              </button>
            </form>
          )}

          <h3>Audit history</h3>

          {history.length === 0 && <p>No history loaded.</p>}

          {history.map(item => (
            <article className="ct-auths-event" key={item.id}>
              <strong>{item.eventType}</strong>
              <p>{item.fromStatus || 'New'} → {item.toStatus}</p>
              <p>{item.reason}</p>
              {item.evidenceReference && (
                <p>Evidence: {item.evidenceReference}</p>
              )}
              <small>
                {new Date(item.performedAtUtc).toLocaleString('en-ZA')}
                {' · '}Staff ID: {item.performedByUserId}
              </small>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
