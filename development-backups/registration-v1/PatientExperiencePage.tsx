import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ChevronRight,
  Clock3, FileHeart, History, Mail, MapPin,
  Phone, Plus, RefreshCw, Search, ShieldCheck, Stethoscope, UserRound,
  Users,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import PatientsPage from './PatientsPage'
import PatientMedicalCards from './PatientMedicalCards'
import './PatientExperiencePage.css'

type Patient = {
  id: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  title?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  phoneNumber?: string | null
  email?: string | null
  address?: string | null
  idNumber?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  paymentMethod?: string | null
  medicalAidScheme?: string | null
  medicalAidOption?: string | null
  medicalAidMemberNumber?: string | null
  isArchived?: boolean
}

type Visit = {
  id: string
  patientId: string
  startUtc: string
  endUtc?: string
  status: string
  reason?: string | null
}

type HistoryRecord = {
  allergies?: string | null
  currentMedications?: string | null
  medicalConditions?: string | null
  dentalHistory?: string | null
  additionalNotes?: string | null
}

type PatientTab = 'Overview' | 'Medical Records' | 'Details' | 'Visit' | 'History'
type Props = { role: string; onOpenAppointments?: () => void; onOpenChart?: (patientId: string) => void }
const tabs: PatientTab[] = ['Overview', 'Medical Records', 'Details', 'Visit', 'History']

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function normalizePatient(value: unknown): Patient | null {
  const row = record(value)
  if (!row || typeof row.id !== 'string') return null
  return row as Patient
}
function parsePatients(result: unknown): Patient[] {
  const envelope = record(result)
  const items = Array.isArray(result) ? result :
    envelope?.items ?? envelope?.patients ?? envelope?.results ?? envelope?.data
  if (!Array.isArray(items)) throw new Error('The patient directory response was not recognised.')
  return items.map(normalizePatient).filter((p): p is Patient => p !== null)
}
function parsePatient(result: unknown): Patient | null {
  const wrapper = record(result)
  return normalizePatient(wrapper?.patient ?? wrapper?.data ?? result)
}
function patientName(patient: Patient): string {
  const full = patient.fullName?.trim()
  return full || [patient.title, patient.firstName, patient.lastName]
    .filter(Boolean).join(' ').trim() || 'Unnamed patient'
}
function initials(patient: Patient): string {
  return [patient.firstName, patient.lastName]
    .filter(Boolean).map(s => String(s).charAt(0).toUpperCase()).join('') || 'PT'
}
function age(date?: string | null): string {
  if (!date) return '—'
  const birth = new Date(date)
  if (Number.isNaN(birth.getTime())) return '—'
  const today = new Date()
  let years = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years -= 1
  return years >= 0 && years < 130 ? `${years} years` : '—'
}
function detailValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : 'Not recorded'
}
function formattedDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
function patientField(label: string, value: unknown) {
  return <div className="ct-patient-field" key={label}>
    <span>{label}</span><strong>{detailValue(value)}</strong>
  </div>
}

export default function PatientExperiencePage({ role, onOpenAppointments, onOpenChart }: Props) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Patient | null>(null)
  const [tab, setTab] = useState<PatientTab>('Overview')
  const [manage, setManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [reload, setReload] = useState(0)
  const [visits, setVisits] = useState<Visit[]>([])
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [medical, setMedical] = useState<HistoryRecord | null>(null)
  const [medicalLoading, setMedicalLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionNotice, setActionNotice] = useState('')

  const canManage = role === 'Receptionist' || role === 'PracticeAdmin'
  const isDentist = role === 'Dentist'

  useEffect(() => {
    let cancelled = false
    apiRequest<unknown>('/patients')
      .then(parsePatients)
      .then(items => { if (!cancelled) { setPatients(items); setError('') } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load patients.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    apiRequest<unknown>(`/patients/${encodeURIComponent(selected.id)}`)
      .then(parsePatient)
      .then(item => { if (!cancelled && item) { setSelected(item); setDetailError('') } })
      .catch(cause => { if (!cancelled) setDetailError(cause instanceof Error ? cause.message : 'Could not refresh this record.') })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    const now = Date.now()
    const fromPast = new Date(now - 89 * 86400000).toISOString()
    const nearFuture = new Date(now + 2 * 86400000).toISOString()
    const fromFuture = new Date(now).toISOString()
    const toFuture = new Date(now + 60 * 86400000).toISOString()
    const url = (from: string, to: string) =>
      `/appointments?fromUtc=${encodeURIComponent(from)}&toUtc=${encodeURIComponent(to)}`
    Promise.all([
      apiRequest<unknown>(url(fromPast, nearFuture)),
      apiRequest<unknown>(url(fromFuture, toFuture)),
    ]).then(results => {
      if (cancelled) return
      const byId = new Map<string, Visit>()
      for (const result of results) {
        if (!Array.isArray(result)) continue
        for (const value of result) {
          const entry = record(value)
          if (entry && typeof entry.id === 'string' &&
              typeof entry.patientId === 'string' && typeof entry.startUtc === 'string' &&
              typeof entry.status === 'string' && entry.patientId === selected.id) {
            byId.set(entry.id, value as Visit)
          }
        }
      }
      setVisits(Array.from(byId.values()).sort((a,b) => b.startUtc.localeCompare(a.startUtc)))
    }).catch(() => { if (!cancelled) setVisits([]) })
      .finally(() => { if (!cancelled) setVisitsLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id, reload])

  useEffect(() => {
    if (!selected || !isDentist || tab !== 'Medical Records') return
    let cancelled = false
    apiRequest<unknown>(`/dentist/patients/${encodeURIComponent(selected.id)}/medical-history`)
      .then(value => { if (!cancelled) setMedical(record(value) as HistoryRecord | null) })
      .catch(() => { if (!cancelled) setMedical(null) })
      .finally(() => { if (!cancelled) setMedicalLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id, isDentist, tab])

  const appointmentToCheckIn = canManage ? visits.find(visit =>
    visit.status === 'Scheduled' &&
    new Date(visit.startUtc).toDateString() === new Date().toDateString()) : undefined

  async function checkInPatient() {
    if (!appointmentToCheckIn) return
    setActionBusy(true)
    setActionNotice('')
    try {
      await apiRequest(`/appointments/${encodeURIComponent(appointmentToCheckIn.id)}/check-in`, 'POST')
      setActionNotice('Patient checked in successfully. The Dentist queue has been updated.')
      setVisitsLoading(true)
      setReload(count => count + 1)
    } catch (cause) {
      setActionNotice(cause instanceof Error ? cause.message : 'Check-in failed.')
    } finally {
      setActionBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const input = query.trim().toLowerCase()
    if (!input) return patients
    return patients.filter(patient =>
      [patientName(patient), patient.phoneNumber, patient.idNumber, patient.email]
        .some(value => typeof value === 'string' && value.toLowerCase().includes(input)))
  }, [patients, query])

  function openPatient(patient: Patient) {
    setSelected(patient)
    setTab('Overview')
    setManage(false)
    setDetailError('')
    setActionNotice('')
    setDetailLoading(true)
    setVisitsLoading(true)
    setMedicalLoading(true)
    setMedical(null)
    setVisits([])
  }

  function backToCards() {
    setSelected(null)
    setManage(false)
    setLoading(true)
    setReload(value => value + 1)
  }

  if (manage && canManage) {
    return <div className="ct-patients-experience">
      <div className="ct-patient-toolbar">
        <div><p className="ct-patient-eyebrow">PATIENT MANAGEMENT</p><h1>Register or manage patients</h1></div>
        <button type="button" className="secondary-button" onClick={backToCards}><ArrowLeft size={17}/> Back to patient cards</button>
      </div>
      <PatientsPage />
    </div>
  }

  if (!selected) {
    return <div className="ct-patients-experience">
      <div className="ct-patient-toolbar">
        <div><p className="ct-patient-eyebrow">PATIENT DIRECTORY</p><h1>Patients</h1><p>Open a patient card to view their full practice record.</p></div>
        {canManage && <button type="button" className="primary-button" onClick={() => setManage(true)}><Plus size={17}/> Quick Register / Manage</button>}
      </div>
      <div className="ct-patient-searchrow">
        <label className="ct-patient-search"><Search size={19}/><input aria-label="Search patients" value={query} placeholder="Search by name, phone or patient ID" onChange={event => setQuery(event.target.value)}/></label>
        <button type="button" className="secondary-button" onClick={() => { setLoading(true); setReload(value => value + 1) }} disabled={loading}><RefreshCw size={16}/> Refresh</button>
      </div>
      {error && <p className="ct-patient-message ct-patient-error" role="alert">{error}</p>}
      {loading ? <div className="ct-patient-message">Loading registered patients…</div> : filtered.length === 0 ?
        <div className="ct-patient-message"><Users size={25}/><h2>No matching patients</h2><p>{query ? 'Try a different search.' : 'There are no patients in the current directory response.'}</p></div> :
        <div className="ct-patient-grid">
          {filtered.map(patient => <button type="button" key={patient.id} className="ct-patient-card" onClick={() => openPatient(patient)}>
            <div className="ct-patient-card-top"><span className={patient.isArchived ? 'ct-patient-status ct-archived' : 'ct-patient-status'}>{patient.isArchived ? 'Archived' : 'Active'}</span><ChevronRight size={18}/></div>
            <div className="ct-patient-card-title"><div className="ct-patient-avatar">{initials(patient)}</div><div><strong>{patientName(patient)}</strong><small>Patient record</small></div></div>
            <div className="ct-patient-tags"><span>{age(patient.dateOfBirth)}</span><span>{detailValue(patient.gender)}</span><span>{detailValue(patient.paymentMethod)}</span></div>
            <p className="ct-patient-contact"><Phone size={14}/>{detailValue(patient.phoneNumber)}</p>
            <span className="ct-patient-open">Open patient record <ArrowRight size={15}/></span>
          </button>)}
        </div>}
      <p className="ct-patient-limit-note">Showing {filtered.length} of {patients.length} patient records returned by this request.</p>
    </div>
  }

  return <div className="ct-patients-experience">
    <div className="ct-patient-detail-header">
      <button type="button" className="secondary-button" onClick={backToCards}><ArrowLeft size={16}/> Patients</button>
      <div className="ct-patient-avatar ct-patient-avatar-large">{initials(selected)}</div>
      <div className="ct-patient-header-identity"><div><h1>{patientName(selected)}</h1><span className={selected.isArchived ? 'ct-patient-status ct-archived' : 'ct-patient-status'}>{selected.isArchived ? 'Archived' : 'Active'}</span></div><p>{detailValue(selected.gender)} · {age(selected.dateOfBirth)} · Patient file</p></div>
      {canManage && <button type="button" className="secondary-button" onClick={() => setManage(true)}>Manage record</button>}
    </div>

    {detailError && <p className="ct-patient-message ct-patient-error" role="alert">{detailError}</p>}
    {actionNotice && <p className="ct-patient-message" role="status">{actionNotice}</p>}
    {detailLoading && <p className="ct-patient-loading">Refreshing patient details…</p>}
    <div className="ct-patient-tabs" role="tablist" aria-label="Patient record sections">
      {tabs.filter(item => item !== 'Medical Records' || isDentist).map(item => <button type="button" key={item} role="tab" aria-selected={item === tab} className={tab === item ? 'ct-patient-tab selected' : 'ct-patient-tab'} onClick={() => setTab(item)}>{item}</button>)}
    </div>

    {tab === 'Overview' && <>
      <div className="ct-patient-subheading"><div><h2>At a glance</h2><p>Patient information and next steps</p></div></div>
      <div className="ct-patient-actions">
        {appointmentToCheckIn && <button type="button" className="primary-button" disabled={actionBusy} onClick={() => void checkInPatient()}><CheckCircle2 size={17}/> {actionBusy ? 'Checking in…' : 'Check in to queue'}</button>}
        {onOpenAppointments && <button type="button" className="primary-button" onClick={onOpenAppointments}><CalendarDays size={17}/> Book appointment</button>}
        <button type="button" className="secondary-button" onClick={() => setTab('Visit')}><Clock3 size={17}/> View visits</button>
        {isDentist && onOpenChart && <button type="button" className="secondary-button" onClick={() => onOpenChart(selected.id)}><Stethoscope size={17}/> Open dental chart</button>}
        {isDentist && <button type="button" className="secondary-button" onClick={() => setTab('Medical Records')}><FileHeart size={17}/> Clinical record</button>}
      </div>
      <div className="ct-patient-overview-grid">
        <section className="ct-patient-panel"><h3>Patient overview</h3><div className="ct-patient-field-list">
          {patientField('Full name', patientName(selected))}
          {patientField('Date of birth', formattedDate(selected.dateOfBirth))}
          {patientField('Phone', selected.phoneNumber)}
          {patientField('Payment method', selected.paymentMethod)}
        </div></section>
        <section className="ct-patient-panel"><h3>Contact</h3><div className="ct-patient-contact-stack">
          <p><Phone size={17}/>{detailValue(selected.phoneNumber)}</p><p><Mail size={17}/>{detailValue(selected.email)}</p><p><MapPin size={17}/>{detailValue(selected.address)}</p>
        </div></section>
        <section className="ct-patient-panel"><h3>Recent and upcoming visits</h3>
          {visitsLoading ? <p>Loading visits…</p> : visits.length === 0 ? <p>No visits found in the available date range.</p> : visits.slice(0,4).map(visit => <div className="ct-patient-visit" key={visit.id}><strong>{formattedDate(visit.startUtc)}</strong><span>{visit.status}</span></div>)}
          <button type="button" className="ct-patient-link" onClick={() => setTab('Visit')}>See visit history <ArrowRight size={15}/></button>
        </section>
        <section className="ct-patient-panel"><h3>Quick actions</h3>
          <button type="button" className="ct-patient-action" onClick={() => setTab('Details')}><UserRound size={17}/> View personal details <ChevronRight size={17}/></button>
          <button type="button" className="ct-patient-action" onClick={() => setTab('History')}><History size={17}/> View visit history <ChevronRight size={17}/></button>
          {isDentist && <button type="button" className="ct-patient-action" onClick={() => setTab('Medical Records')}><Stethoscope size={17}/> View medical history <ChevronRight size={17}/></button>}
        </section>
      </div>
    </>}

    {tab === 'Details' && <section className="ct-patient-panel"><h2>Patient details</h2><div className="ct-patient-field-list ct-patient-two-cols">
      {patientField('Name', patientName(selected))}
      {patientField('Date of birth', formattedDate(selected.dateOfBirth))}
      {patientField('Gender', selected.gender)}
      {patientField('ID number', selected.idNumber)}
      {patientField('Phone', selected.phoneNumber)}
      {patientField('Email', selected.email)}
      {patientField('Address', selected.address)}
      {patientField('Emergency contact', selected.emergencyContactName)}
      {patientField('Emergency phone', selected.emergencyContactPhone)}
      {patientField('Payment method', selected.paymentMethod)}
      {patientField('Medical aid', selected.medicalAidScheme)}
      {patientField('Medical aid option', selected.medicalAidOption)}
      {patientField('Member number', selected.medicalAidMemberNumber)}
    </div></section>}

    {tab === 'Visit' && <section className="ct-patient-panel"><div className="ct-patient-tab-heading"><div><h2>Appointments & visits</h2><p>Recent and upcoming bookings for this patient</p></div>{onOpenAppointments && <button type="button" className="primary-button" onClick={onOpenAppointments}><Plus size={16}/> Schedule visit</button>}</div>
      {visitsLoading ? <p>Loading appointments…</p> : visits.length === 0 ? <p>No appointments found within the available date range.</p> : visits.map(visit => <div className="ct-patient-visit" key={visit.id}><div><strong>{formattedDate(visit.startUtc)} · {new Date(visit.startUtc).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})}</strong><p>{visit.reason || 'Dental appointment'}</p></div><span>{visit.status}</span></div>)}
      <p className="ct-patient-limit-note">Visit results cover approximately the past 90 days and next 60 days, subject to API limits.</p>
    </section>}

    {tab === 'Medical Records' && (
      !isDentist ? <section className="ct-patient-panel ct-patient-protected">
        <ShieldCheck size={22}/><strong>Clinical records are restricted</strong>
      </section> :
      <PatientMedicalCards
        key={selected.id}
        patientId={selected.id}
        history={medical}
        loading={medicalLoading}
        onSaved={setMedical}
      />
    )}

    {tab === 'History' && <section className="ct-patient-panel"><h2>Patient visit history</h2>
      <p className="ct-patient-subtext">Visits remain stored in PostgreSQL; this screen displays the appointments in the available date window.</p>
      {visitsLoading ? <p>Loading history…</p> : visits.length === 0 ? <p>No visits found in this date range.</p> : visits.map(visit => <div className="ct-patient-visit" key={visit.id}><div><strong>{formattedDate(visit.startUtc)}</strong><p>{visit.reason || 'Dental appointment'}</p></div><span>{visit.status}</span></div>)}
    </section>}
  </div>
}
