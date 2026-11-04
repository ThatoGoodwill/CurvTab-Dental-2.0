import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  MEDICAL_AID_SCHEMES,
  OTHER_SCHEME,
} from './medicalAidCatalogue'
import MedicalAidAuthorisationsPanel from './MedicalAidAuthorisationsPanel'
import MedicalAidClaimProcessingPanel from './MedicalAidClaimProcessingPanel'
import './MedicalAidPanel.css'

type Patient = {
  id: string
  patientName: string
}

type Membership = {
  id: string
  patientId: string
  patientName: string
  schemeName: string
  planName: string
  memberNumberLast4: string
}

type Invoice = {
  id: string
  patientName: string
  invoiceNumber: string
  totalAmount: number
  membershipId: string
}

type Claim = {
  id: string
  claimNumber: string
  patientName: string
  schemeName: string
  planName: string
  claimedAmount: number
  status: string
  createdAtUtc: string
}

type Tab = 'claims' | 'memberships' | 'authorisations' | 'processing'

const money = (amount: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount)

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok)
    throw new Error(`Unable to load data (${response.status}).`)

  return response.json() as Promise<T>
}

async function postJson<T>(url: string, data: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    let error = `Request failed (${response.status}).`
    try {
      const body = await response.json() as { message?: string }
      error = body.message || error
    } catch {
      // Keep the HTTP error.
    }
    throw new Error(error)
  }

  return response.json() as Promise<T>
}

export default function MedicalAidPanel({
  canManage,
}: { canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('claims')
  const [patients, setPatients] = useState<Patient[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [claims, setClaims] = useState<Claim[]>([])

  const [patientId, setPatientId] = useState('')
  const [scheme, setScheme] = useState('')
  const [plan, setPlan] = useState('')
  const [otherScheme, setOtherScheme] = useState('')

  const selectedScheme = MEDICAL_AID_SCHEMES.find(
    item => item.name === scheme
  )
  const [last4, setLast4] = useState('')

  const [invoiceId, setInvoiceId] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [notes, setNotes] = useState('')
  const claimRequestId = useRef<string | null>(null)

  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [p, m, i, c] = await Promise.all([
          fetchJson<Patient[]>('/api/finance/medical-aid/patients'),
          fetchJson<Membership[]>('/api/finance/medical-aid/memberships'),
          fetchJson<Invoice[]>('/api/finance/medical-aid/eligible-invoices'),
          fetchJson<Claim[]>('/api/finance/medical-aid/claims'),
        ])

        if (!active) return

        setPatients(p)
        setMemberships(m)
        setInvoices(i)
        setClaims(c)
        setError('')
      } catch (cause) {
        if (active)
          setError(cause instanceof Error
            ? cause.message : 'Unable to load Medical Aid.')
      }
    }

    void load()
    return () => { active = false }
  }, [reload])

  async function registerMembership(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await postJson('/api/finance/medical-aid/memberships', {
        patientId,
        schemeName: scheme === OTHER_SCHEME
          ? otherScheme.trim()
          : scheme,
        planName: plan.trim(),
        memberNumberLast4: last4,
      })

      setPatientId('')
      setScheme('')
      setPlan('')
      setOtherScheme('')
      setLast4('')
      setNotice('Medical aid membership registered.')
      setReload(n => n + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Membership registration failed.')
    } finally {
      setBusy(false)
    }
  }

  async function createClaim(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    const invoice = invoices.find(x => x.id === invoiceId)
    const amount = Number(claimAmount)

    if (!invoice || !/^\d+(\.\d{1,2})?$/.test(claimAmount)
        || !Number.isFinite(amount) || amount <= 0) {
      setError('Choose an invoice and a valid claim amount.')
      return
    }

    if (!window.confirm(
      'Register this as a DRAFT claim only? ' +
      'No payment or medical aid submission will occur.'
    )) return

    setBusy(true)
    setError('')
    setNotice('')
    claimRequestId.current ??= crypto.randomUUID()

    try {
      await postJson('/api/finance/medical-aid/claims', {
        requestId: claimRequestId.current,
        invoiceId,
        membershipId: invoice.membershipId,
        claimedAmount: amount,
        notes,
      })

      claimRequestId.current = null
      setInvoiceId('')
      setClaimAmount('')
      setNotes('')
      setNotice('Draft claim created. Not submitted to the scheme.')
      setReload(n => n + 1)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message : 'Claim creation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel ct-medical-aid">
      <div>
        <div className="eyebrow">FINANCE · MEDICAL AID</div>
        <h2>Medical Aid Management</h2>
        <p>Register schemes and draft claims linked to existing invoices.</p>
      </div>

      <nav className="ct-medical-aid-tabs" aria-label="Medical aid sections">
        <button type="button" className={tab === 'claims' ? 'active' : ''}
          onClick={() => setTab('claims')}>Claims Ledger</button>
        <button type="button" className={tab === 'memberships' ? 'active' : ''}
          onClick={() => setTab('memberships')}>Memberships</button>
        <button type="button"
          className={tab === 'authorisations' ? 'active' : ''}
          onClick={() => setTab('authorisations')}>
          Authorisations
        </button>
        <button
          type="button"
          className={tab === 'processing' ? 'active' : ''}
          onClick={() => setTab('processing')}
        >
          Claim Processing
        </button>
        <button type="button" onClick={() => setReload(n => n + 1)}>
          Refresh
        </button>
      </nav>

      {error && <p role="alert" className="ct-medical-aid-error">{error}</p>}
      {notice && <p role="status" className="ct-medical-aid-success">{notice}</p>}

      {tab === 'authorisations' && (
        <MedicalAidAuthorisationsPanel canManage={canManage} />
      )}

      {tab === 'processing' && (
        <MedicalAidClaimProcessingPanel canManage={canManage} />
      )}

      {tab === 'memberships' && (
        <>
          <form className="ct-medical-aid-form"
            onSubmit={event => void registerMembership(event)}>
            <h3>Register patient medical aid</h3>
            <label>
              Patient
              <select required value={patientId}
                onChange={e => setPatientId(e.target.value)}>
                <option value="">Choose patient</option>
                {patients
                  .filter(p => !memberships.some(m => m.patientId === p.id))
                  .map(p => <option key={p.id} value={p.id}>
                    {p.patientName}
                  </option>)}
              </select>
            </label>
            <label>
              Medical aid scheme
              <select
                required
                value={scheme}
                onChange={event => {
                  setScheme(event.target.value)
                  setPlan('')
                  setOtherScheme('')
                }}
              >
                <option value="">Select a registered scheme</option>
                {MEDICAL_AID_SCHEMES.map(item => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
                <option value={OTHER_SCHEME}>
                  Other registered scheme — verify manually
                </option>
              </select>
            </label>

            {scheme === OTHER_SCHEME && (
              <label>
                Registered scheme name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={otherScheme}
                  onChange={event =>
                    setOtherScheme(event.target.value)
                  }
                  placeholder="Name as shown on membership card"
                />
              </label>
            )}

            <label>
              Medical aid benefit option / plan
              {selectedScheme ? (
                <select
                  required
                  value={plan}
                  onChange={event => setPlan(event.target.value)}
                >
                  <option value="">Select a benefit option</option>
                  {selectedScheme.plans.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={plan}
                  onChange={event => setPlan(event.target.value)}
                  placeholder="Verify the exact plan on membership card"
                  disabled={!scheme}
                />
              )}
            </label>

            {selectedScheme && (
              <p className="ct-medical-aid-info">
                Scheme information:{' '}
                <a href={selectedScheme.website}
                   target="_blank"
                   rel="noopener noreferrer">
                  Official scheme website
                </a>.
                Verify the patient's plan, eligibility and
                dental benefits before submitting any claim.
              </p>
            )}

            {scheme === OTHER_SCHEME && (
              <p className="ct-medical-aid-info">
                Confirm the scheme and plan against the
                Council for Medical Schemes register.
                This entry is not automatically verified.
              </p>
            )}
            <label>Last four membership digits
              <input required maxLength={4} minLength={4}
                inputMode="numeric" pattern="[0-9]{4}"
                value={last4}
                onChange={e =>
                  setLast4(
                    e.target.value.replace(/\\D/g, '').slice(0, 4)
                  )
                }
                placeholder="1234"/>
            </label>
            <button type="submit" className="primary-button" disabled={busy}>
              Register membership
            </button>
          </form>

          <h3>Registered memberships</h3>
          <div className="ct-medical-aid-table">
            <table>
              <thead><tr>
                <th>Patient</th><th>Scheme</th><th>Plan</th><th>Member suffix</th>
              </tr></thead>
              <tbody>
                {memberships.map(m => (
                  <tr key={m.id}>
                    <td>{m.patientName}</td>
                    <td>{m.schemeName}</td>
                    <td>{m.planName}</td>
                    <td>••••{m.memberNumberLast4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'claims' && (
        <>
          <p className="ct-medical-aid-info">
            Claims below are internal drafts only. No claim has been
            electronically submitted or marked paid by this module.
          </p>

          <form className="ct-medical-aid-form"
            onSubmit={event => void createClaim(event)}>
            <h3>Create draft claim</h3>
            <label>
              Invoice
              <select required value={invoiceId}
                onChange={e => {
                  setInvoiceId(e.target.value)
                  setClaimAmount('')
                  claimRequestId.current = null
                }}>
                <option value="">Choose eligible invoice</option>
                {invoices.map(invoice => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.patientName} · {invoice.invoiceNumber}
                    {' · '}{money(invoice.totalAmount)}
                  </option>
                ))}
              </select>
            </label>
            <label>Claim amount (ZAR)
              <input required inputMode="decimal"
                value={claimAmount}
                onChange={e => {
                  setClaimAmount(e.target.value)
                  claimRequestId.current = null
                }}
                placeholder="0.00"/>
            </label>
            <label>Internal notes (optional)
              <textarea maxLength={500} value={notes}
                onChange={e => {
                  setNotes(e.target.value)
                  claimRequestId.current = null
                }} rows={3}/>
            </label>
            <button type="submit" className="primary-button" disabled={busy}>
              Save draft claim
            </button>
          </form>

          <h3>Claims ledger</h3>
          <div className="ct-medical-aid-table">
            <table>
              <thead><tr>
                <th>Claim</th><th>Patient</th><th>Scheme</th>
                <th>Amount</th><th>Status</th>
              </tr></thead>
              <tbody>
                {claims.map(claim => (
                  <tr key={claim.id}>
                    <td>{claim.claimNumber}</td>
                    <td>{claim.patientName}</td>
                    <td>{claim.schemeName}</td>
                    <td>{money(claim.claimedAmount)}</td>
                    <td>{claim.status}</td>
                  </tr>
                ))}
                {claims.length === 0 && (
                  <tr><td colSpan={5}>No draft claims recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
