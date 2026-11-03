#!/usr/bin/env python3
"""CurvTab Dental 2.0 / Phase 2 frontend — additive, verified-anchor installer.
Run from GitHub Codespaces repo root: python3 curvtab_phase2_frontend.py
Requires the previously installed Phase 1 frontend and Phase 2 backend.
Does not touch the database, Docker, payment records, or existing appointments screen.
"""
from pathlib import Path
import shutil
import sys
from datetime import datetime, timezone

root = Path.cwd()
app_path = root / 'frontend/src/App.tsx'
daily_path = root / 'frontend/src/pages/DailyPatientsPage.tsx'
clinical_controller = root / 'backend/CurvTabDental.API/Controllers/ConsultationsController.cs'
for p in (app_path, daily_path, clinical_controller):
    if not p.is_file():
        sys.exit(f'ERROR: Missing {p}. Run from the repository root after Phase 1 and Phase 2 backend installation. No changes made.')

if not all(s in clinical_controller.read_text(encoding='utf-8') for s in (
  '[HttpPut("consultations/by-appointment/{appointmentId:guid}")]',
  '[HttpGet("patients/{patientId:guid}/medical-history")]')):
    sys.exit('ERROR: Expected Phase 2 clinical endpoints not found. No changes made.')

app = app_path.read_text(encoding='utf-8')
daily = daily_path.read_text(encoding='utf-8')
if "import DentistConsultationsPage from './pages/DentistConsultationsPage'" in app:
    sys.exit('Already installed in App.tsx; no changes made.')


def replace_once(haystack: str, anchor: str, updated: str, label: str) -> str:
    found = haystack.count(anchor)
    if found != 1:
        sys.exit(f'ERROR: {label} anchor found {found} times instead of 1; no files changed.')
    return haystack.replace(anchor, updated, 1)

app = replace_once(app,
    "import DailyPatientsPage from './pages/DailyPatientsPage'",
    "import DentistConsultationsPage from './pages/DentistConsultationsPage'\nimport DentistMedicalRecordsPage from './pages/DentistMedicalRecordsPage'\nimport DailyPatientsPage from './pages/DailyPatientsPage'",
    'Phase 1 DailyPatients import')
# Phase 1 injected 'Daily Patients' into the section union. Extend only its first occurrence.
app = replace_once(app,
    "'Dashboard' | 'Daily Patients'",
    "'Dashboard' | 'Daily Patients' | 'Consultations' | 'Patient Medical Records'",
    'Section union')
app = replace_once(app,
    "  const [section, setSection] = useState<Section>('Dashboard')",
    "  const [section, setSection] = useState<Section>('Dashboard')\n  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null)\n  const [medicalRecordPatientId, setMedicalRecordPatientId] = useState<string | null>(null)",
    'section state')
app = replace_once(app,
    '        </nav>\n\n        <div className="sidebar-bottom">',
    '''          {role === 'Dentist' && (
            <>
              <button type="button"
                className={section === 'Consultations' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Consultations')}>
                <Stethoscope size={19} /> <span>Consultations</span>
              </button>
              <button type="button"
                className={section === 'Patient Medical Records' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Patient Medical Records')}>
                <DailyPatientsIcon size={19} /> <span>Patient Medical Records</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">''',
    'navigation')
app = replace_once(app,
    '          {/* DENTIST DAILY PATIENTS */}',
    '''          {/* PHASE 2: DENTIST CLINICAL RECORDS */}
          {section === 'Consultations' && role === 'Dentist' && (
            <DentistConsultationsPage
              selectedAppointmentId={selectedConsultationId}
              onSelectAppointment={setSelectedConsultationId}
              onOpenMedicalHistory={(patientId) => {
                setMedicalRecordPatientId(patientId)
                navigate('Patient Medical Records')
              }}
            />
          )}
          {section === 'Patient Medical Records' && role === 'Dentist' && (
            <DentistMedicalRecordsPage
              selectedPatientId={medicalRecordPatientId}
              onSelectPatient={setMedicalRecordPatientId}
            />
          )}

          {/* DENTIST DAILY PATIENTS */}''',
    'new clinical page location')
app = replace_once(app,
    "<DailyPatientsPage onOpenPatients={() => navigate('Patients')} />",
    '''<DailyPatientsPage
              onOpenPatients={() => navigate('Patients')}
              onOpenConsultation={(appointmentId) => {
                setSelectedConsultationId(appointmentId)
                navigate('Consultations')
              }}
            />''',
    'Daily Patients callback')
app = replace_once(app,
    "            (section === 'Daily Patients' && role !== 'Dentist') ||",
    "            (section === 'Consultations' && role !== 'Dentist') ||\n            (section === 'Patient Medical Records' && role !== 'Dentist') ||\n            (section === 'Daily Patients' && role !== 'Dentist') ||",
    'access restriction')

daily = replace_once(daily,
    'type Props = { onOpenPatients: () => void }',
    '''type Props = {
  onOpenPatients: () => void
  onOpenConsultation: (appointmentId: string) => void
}''',
    'DailyPatients props')
daily = replace_once(daily,
    'export default function DailyPatientsPage({ onOpenPatients }: Props)',
    'export default function DailyPatientsPage({ onOpenPatients, onOpenConsultation }: Props)',
    'DailyPatients props destructuring')
daily = replace_once(daily,
    '<span className="dentist-status">{item.status}</span>',
    '''<div className="dentist-actions">
                    <span className="dentist-status">{item.status}</span>
                    <button type="button" className="secondary-button"
                      onClick={() => onOpenConsultation(item.appointmentId)}>
                      Open Consultation
                    </button>
                  </div>''',
    'DailyPatients row button')

CONSULTATIONS = r'''import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardList, Plus, RefreshCw, Save, Stethoscope, Trash2 } from 'lucide-react'
import { apiRequest } from '../services/api'
import './DentistClinical.css'

type Visit = {
  appointmentId: string
  patientId: string
  patientName: string
  status: string
  reason: string | null
  consultationStartedAtUtc: string | null
}

type FieldName =
  | 'chiefComplaint' | 'symptoms' | 'examinationFindings' | 'diagnosis'
  | 'treatmentPerformed' | 'treatmentPlan' | 'prescriptionNotes' | 'followUpAdvice'
type ClinicalForm = Record<FieldName, string>
type Charge = { description: string; amount: string }
type StoredCharge = { id: string; description: string; amount: number }
type ConsultationRecord = Partial<ClinicalForm> & {
  isFinalized: boolean
  chargesConfirmed: boolean
  finalizedAtUtc: string | null
}
type Detail = {
  appointmentId: string
  patientId: string
  patientName: string
  appointmentStatus: string
  consultation: ConsultationRecord | null
  charges: StoredCharge[]
  amountDue: number
}

type Props = {
  selectedAppointmentId: string | null
  onSelectAppointment: (id: string) => void
  onOpenMedicalHistory: (patientId: string) => void
}

const emptyForm = (): ClinicalForm => ({
  chiefComplaint: '', symptoms: '', examinationFindings: '', diagnosis: '',
  treatmentPerformed: '', treatmentPlan: '', prescriptionNotes: '', followUpAdvice: '',
})
const fields: { key: FieldName; label: string; required?: boolean; hint: string }[] = [
  { key: 'chiefComplaint', label: 'Chief complaint', required: true, hint: 'Patient-reported reason for visit' },
  { key: 'symptoms', label: 'Symptoms', hint: 'Reported symptoms and relevant duration' },
  { key: 'examinationFindings', label: 'Examination findings', required: true, hint: 'Objective clinical findings' },
  { key: 'diagnosis', label: 'Diagnosis / assessment', required: true, hint: 'Clinical assessment' },
  { key: 'treatmentPerformed', label: 'Treatment performed', required: true, hint: 'Care provided during this visit' },
  { key: 'treatmentPlan', label: 'Treatment plan', hint: 'Planned next steps' },
  { key: 'prescriptionNotes', label: 'Prescription notes', hint: 'Document clinical instructions; not an e-prescription' },
  { key: 'followUpAdvice', label: 'Follow-up advice', hint: 'Instructions and follow-up recommendation' },
]

function localDate(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}
function dateRange(day: string) {
  const start = new Date(`${day}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return `fromUtc=${encodeURIComponent(start.toISOString())}&toUtc=${encodeURIComponent(end.toISOString())}`
}
function rand(value: number): string {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to complete the request.'
}

export default function DentistConsultationsPage({
  selectedAppointmentId, onSelectAppointment, onOpenMedicalHistory,
}: Props) {
  const [day, setDay] = useState(() => localDate(new Date()))
  const [visits, setVisits] = useState<Visit[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listRevision, setListRevision] = useState(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailsError, setDetailsError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ClinicalForm>(emptyForm)
  const [charges, setCharges] = useState<Charge[]>([])
  const [chargesConfirmed, setChargesConfirmed] = useState(false)
  const [detailRevision, setDetailRevision] = useState(0)

  useEffect(() => {
    if (!day) return
    let cancelled = false
    apiRequest<Visit[]>(`/dentist/daily-patients?${dateRange(day)}`)
      .then(rows => { if (!cancelled) setVisits(rows) })
      .catch(cause => { if (!cancelled) setError(errorText(cause)) })
      .finally(() => { if (!cancelled) setListLoading(false) })
    return () => { cancelled = true }
  }, [day, listRevision])

  useEffect(() => {
    if (!selectedAppointmentId) return
    let cancelled = false
    apiRequest<Detail>(`/dentist/consultations/by-appointment/${encodeURIComponent(selectedAppointmentId)}`)
      .then(result => {
        if (cancelled) return
        setDetail(result)
        setForm(Object.fromEntries(fields.map(({ key }) => [key, result.consultation?.[key] ?? ''])) as ClinicalForm)
        setCharges(result.charges.map(charge => ({ description: charge.description, amount: String(charge.amount) })))
        setChargesConfirmed(result.consultation?.chargesConfirmed ?? false)
        setDetailsError('')
      })
      .catch(cause => { if (!cancelled) setDetailsError(errorText(cause)) })
    return () => { cancelled = true }
  }, [selectedAppointmentId, detailRevision])

  const detailsLoading = Boolean(selectedAppointmentId && detail?.appointmentId !== selectedAppointmentId)
  const editable = Boolean(detail && detail.appointmentStatus === 'InConsultation' && !detail.consultation?.isFinalized)
  const total = charges.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  function chooseAppointment(id: string) {
    onSelectAppointment(id)
    setError('')
    setMessage('')
    setDetailsError('')
  }

  async function save(finish = false) {
    if (!selectedAppointmentId || !editable || saving) return
    const prepared: { description: string; amount: number }[] = []
    for (const charge of charges) {
      const amount = charge.amount.trim()
      const description = charge.description.trim()
      if (!description || description.length > 200 || !/^(?:\d+)(?:\.\d{1,2})?$/.test(amount) ||
          Number(amount) <= 0 || Number(amount) > 10000000) {
        setError('Every charge must have a description and a positive amount with at most two decimal places.')
        return
      }
      prepared.push({ description, amount: Number(amount) })
    }
    if (finish && (!chargesConfirmed ||
      fields.some(field => field.required && !form[field.key].trim()))) {
      setError('To finish, complete the complaint, examination, diagnosis, treatment and confirm all charges (including R0 visits).')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const path = `/dentist/consultations/by-appointment/${encodeURIComponent(selectedAppointmentId)}`
      await apiRequest(path, 'PUT', { ...form, charges: prepared, chargesConfirmed })
      if (finish) {
        await apiRequest(`${path}/finish`, 'POST')
        setMessage('Consultation finalized. Reception can now see the checkout amount.')
      } else {
        setMessage('Clinical draft and charges saved successfully.')
      }
      setDetailRevision(v => v + 1)
      setListRevision(v => v + 1)
      setListLoading(true)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save(false)
  }

  return (
    <div className="clinical-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLINICAL WORKSPACE</div>
          <h1>Consultations</h1>
          <p>Document the encounter, save a draft, and confirm treatment charges before completion.</p>
        </div>
        <button type="button" className="secondary-button"
          onClick={() => { setListLoading(true); setListRevision(v => v + 1) }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="clinical-columns">
        <aside className="panel clinical-visit-list">
          <div className="panel-header"><div><h2>Daily Visits</h2><p>Patients with started consultations</p></div><ClipboardList size={20}/></div>
          <label className="clinical-label">Visit date
            <input type="date" value={day} onChange={event => {
              setDay(event.target.value)
              setListLoading(true)
            }} />
          </label>
          {listLoading ? <p>Loading visits...</p> : visits.length === 0
            ? <p className="clinical-muted">No consultations started on this date.</p>
            : <div className="clinical-visits">{visits.map(visit => (
              <button type="button" key={visit.appointmentId}
                className={`clinical-visit ${selectedAppointmentId === visit.appointmentId ? 'clinical-visit-active' : ''}`}
                onClick={() => chooseAppointment(visit.appointmentId)}>
                <strong>{visit.patientName}</strong>
                <span>{visit.reason || 'Dental visit'}</span>
                <small>{visit.status.replace(/([a-z])([A-Z])/g, '$1 $2')}</small>
              </button>
            ))}</div>}
        </aside>

        <section className="panel clinical-editor">
          {!selectedAppointmentId ? (
            <div className="clinical-empty"><Stethoscope size={30}/>
              <h2>Select a consultation</h2>
              <p>Start a consultation from Appointments, then select the patient here or in Daily Patients.</p>
            </div>
          ) : detailsError ? (
            <div role="alert" className="clinical-error">{detailsError}</div>
          ) : detailsLoading ? (
            <p>Loading clinical record...</p>
          ) : detail ? (
            <>
              <div className="panel-header"><div><h2>{detail.patientName}</h2>
                <p>Status: {detail.appointmentStatus.replace(/([a-z])([A-Z])/g, '$1 $2')}</p></div>
                <button type="button" className="secondary-button"
                  onClick={() => onOpenMedicalHistory(detail.patientId)}>Medical History</button>
              </div>
              {error && <div role="alert" className="clinical-error">{error}</div>}
              {message && <div role="status" className="clinical-success">{message}</div>}
              {detail.consultation?.isFinalized && <p className="clinical-notice">Finalized record — read only. Corrections require an audited amendment process.</p>}
              {detail.appointmentStatus !== 'InConsultation' && !detail.consultation?.isFinalized &&
                <p className="clinical-notice">This visit is not currently in consultation. Open a Called patient and click Start Consultation first.</p>}
              <form onSubmit={submit} className="clinical-form">
                <h3>Clinical Notes</h3>
                <div className="clinical-field-grid">
                  {fields.map(field => (
                    <label className="clinical-label" key={field.key}>
                      {field.label}{field.required && <span aria-hidden="true"> *</span>}
                      <textarea rows={3} maxLength={6000}
                        placeholder={field.hint}
                        value={form[field.key]} disabled={!editable || saving}
                        onChange={event => setForm(previous => ({ ...previous, [field.key]: event.target.value }))}/>
                    </label>
                  ))}
                </div>
                <div className="clinical-charge-heading"><div><h3>Treatment Charges</h3>
                  <p>These charges are sent to reception after you finalize, but they are not payment receipts.</p></div>
                  {editable && <button type="button" className="secondary-button" disabled={saving || charges.length >= 50}
                    onClick={() => { setCharges(prev => [...prev, { description: '', amount: '' }]); setChargesConfirmed(false) }}>
                    <Plus size={16}/> Add Charge</button>}
                </div>
                {charges.length === 0 && <p className="clinical-muted">No treatment charges. For a free visit, confirm R0.00 below.</p>}
                {charges.map((row, index) => (
                  <div className="clinical-charge" key={`${index}-${charges.length}`}>
                    <label className="clinical-label">Treatment / service
                      <input value={row.description} maxLength={200} disabled={!editable || saving}
                        placeholder="e.g. Consultation"
                        onChange={event => { const value = event.target.value;
                          setCharges(prev => prev.map((item, i) => i === index ? { ...item, description: value } : item))
                          setChargesConfirmed(false)
                        }} />
                    </label>
                    <label className="clinical-label">Amount (ZAR)
                      <input type="text" inputMode="decimal" placeholder="350.00" value={row.amount}
                        disabled={!editable || saving} onChange={event => { const value = event.target.value;
                          setCharges(prev => prev.map((item, i) => i === index ? { ...item, amount: value } : item))
                          setChargesConfirmed(false)
                        }}/>
                    </label>
                    {editable && <button type="button" className="secondary-button"
                      aria-label={`Remove charge ${index + 1}`} disabled={saving}
                      onClick={() => { setCharges(prev => prev.filter((_, i) => i !== index)); setChargesConfirmed(false) }}>
                      <Trash2 size={17}/></button>}
                  </div>
                ))}
                <div className="clinical-total"><strong>Total due</strong><strong>{rand(total)}</strong></div>
                <label className="clinical-checkbox">
                  <input type="checkbox" checked={chargesConfirmed} disabled={!editable || saving}
                    onChange={event => setChargesConfirmed(event.target.checked)}/>
                  I have checked and confirmed all treatment charges, including a zero-charge visit.
                </label>
                {editable && <div className="clinical-actions">
                  <button type="submit" className="secondary-button" disabled={saving}>
                    <Save size={17}/>{saving ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button type="button" className="primary-button" disabled={saving || !chargesConfirmed}
                    onClick={() => void save(true)}>
                    <Stethoscope size={17}/> Finish Consultation
                  </button>
                </div>}
              </form>
            </>
          ) : <p>Record not found.</p>}
        </section>
      </div>
    </div>
  )
}
'''

MEDICAL = r'''import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { HeartPulse, RefreshCw, Save, Search } from 'lucide-react'
import { apiRequest } from '../services/api'
import './DentistClinical.css'

type PatientChoice = { id: string; name: string }
type HistoryForm = {
  allergies: string
  currentMedications: string
  medicalConditions: string
  dentalHistory: string
  additionalNotes: string
}
type HistoryResponse = Partial<HistoryForm> & { patientId: string; updatedAtUtc: string | null }
type PreviousConsultation = {
  id: string
  appointmentId: string
  chiefComplaint: string | null
  diagnosis: string | null
  treatmentPerformed: string | null
  finalizedAtUtc: string | null
  isFinalized: boolean
}
type Props = {
  selectedPatientId: string | null
  onSelectPatient: (id: string) => void
}
const emptyForm = (): HistoryForm => ({
  allergies: '', currentMedications: '', medicalConditions: '', dentalHistory: '', additionalNotes: '',
})
const historyFields: { key: keyof HistoryForm; label: string; hint: string }[] = [
  { key: 'allergies', label: 'Allergies and reactions', hint: 'Include any known drug or material allergies' },
  { key: 'currentMedications', label: 'Current medications', hint: 'Patient-reported or verified medications' },
  { key: 'medicalConditions', label: 'Medical conditions', hint: 'Relevant conditions and precautions' },
  { key: 'dentalHistory', label: 'Dental history', hint: 'Previous dental treatment and relevant history' },
  { key: 'additionalNotes', label: 'Additional medical notes', hint: 'Other relevant history and clinical alerts' },
]
function patientsFrom(response: unknown): PatientChoice[] {
  if (!response || typeof response !== 'object') throw new Error('Invalid patient directory response.')
  const obj = response as Record<string, unknown>
  const rows: unknown = Array.isArray(response) ? response : obj.items ?? obj.patients ?? obj.data ?? obj.results
  if (!Array.isArray(rows)) throw new Error('Unable to read the patient directory.')
  return rows.map((item: unknown) => {
    const p = item as Record<string, unknown>
    if (!p || typeof p.id !== 'string') throw new Error('Patient directory contains an invalid entry.')
    const first = typeof p.firstName === 'string' ? p.firstName : ''
    const last = typeof p.lastName === 'string' ? p.lastName : ''
    const full = typeof p.fullName === 'string' ? p.fullName : `${first} ${last}`.trim()
    return { id: p.id, name: full || 'Patient' }
  })
}
function displayDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-ZA') : 'Not finalized'
}
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Unable to complete request.' }

export default function DentistMedicalRecordsPage({ selectedPatientId, onSelectPatient }: Props) {
  const [patients, setPatients] = useState<PatientChoice[]>([])
  const [search, setSearch] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [form, setForm] = useState<HistoryForm>(emptyForm)
  const [previous, setPrevious] = useState<PreviousConsultation[]>([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiRequest<unknown>('/patients')
      .then(patientsFrom)
      .then(rows => { if (!cancelled) setPatients(rows) })
      .catch(cause => { if (!cancelled) setDirectoryError(errorText(cause)) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedPatientId) return
    let cancelled = false
    const path = `/dentist/patients/${encodeURIComponent(selectedPatientId)}`
    Promise.all([
      apiRequest<HistoryResponse>(`${path}/medical-history`),
      apiRequest<PreviousConsultation[]>(`${path}/consultations`),
    ]).then(([info, consultations]) => {
      if (cancelled) return
      setHistory(info)
      setForm(Object.fromEntries(historyFields.map(({ key }) => [key, info[key] ?? ''])) as HistoryForm)
      setPrevious(consultations)
      setHistoryError('')
    }).catch(cause => { if (!cancelled) setHistoryError(errorText(cause)) })
    return () => { cancelled = true }
  }, [selectedPatientId, revision])

  function choose(id: string) {
    onSelectPatient(id)
    setHistoryError('')
    setSuccess('')
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPatientId || saving) return
    setSaving(true)
    setSuccess('')
    setHistoryError('')
    try {
      await apiRequest(`/dentist/patients/${encodeURIComponent(selectedPatientId)}/medical-history`, 'PUT', form)
      setSuccess('Medical history saved to the patient record.')
      setRevision(n => n + 1)
    } catch (cause) {
      setHistoryError(errorText(cause))
    } finally { setSaving(false) }
  }
  const filtered = patients.filter(row => row.name.toLowerCase().includes(search.trim().toLowerCase()))
  const selected = patients.find(row => row.id === selectedPatientId)
  const loadingHistory = Boolean(selectedPatientId && !historyError && history?.patientId !== selectedPatientId)

  return (
    <div className="clinical-page">
      <div className="page-heading"><div><div className="eyebrow">CONFIDENTIAL CLINICAL RECORDS</div>
        <h1>Patient Medical Records</h1>
        <p>Review or update medical history and view previous consultations.</p></div>
        <HeartPulse size={28} />
      </div>
      <div className="clinical-columns">
        <aside className="panel clinical-visit-list">
          <div className="panel-header"><div><h2>Patients</h2><p>Registered in your practice</p></div><Search size={19}/></div>
          <label className="clinical-label">Search loaded patients
            <input type="search" placeholder="Search by patient name" value={search}
              onChange={event => setSearch(event.target.value)} />
          </label>
          {directoryError && <p role="alert" className="clinical-error">{directoryError}</p>}
          {filtered.length === 0 ? <p className="clinical-muted">No patients in the current directory response.</p>
            : <div className="clinical-visits">{filtered.map(patient => (
              <button type="button" key={patient.id}
                className={`clinical-visit ${selectedPatientId === patient.id ? 'clinical-visit-active' : ''}`}
                onClick={() => choose(patient.id)}><strong>{patient.name}</strong></button>
            ))}</div>}
        </aside>
        <section className="panel clinical-editor">
          {!selectedPatientId ? <div className="clinical-empty"><HeartPulse size={29}/><h2>Select a patient</h2></div>
            : loadingHistory ? <p>Loading patient medical history...</p>
            : historyError ? <p role="alert" className="clinical-error">{historyError}</p>
            : <>
              <div className="panel-header"><div><h2>{selected?.name ?? 'Patient Medical Record'}</h2>
                <p>Last updated: {history?.updatedAtUtc ? displayDate(history.updatedAtUtc) : 'No saved history yet'}</p></div>
                <button type="button" className="secondary-button" onClick={() => setRevision(v => v + 1)}><RefreshCw size={17}/> Refresh</button>
              </div>
              {historyError && <p role="alert" className="clinical-error">{historyError}</p>}
              {success && <p role="status" className="clinical-success">{success}</p>}
              <form onSubmit={submit} className="clinical-form"><h3>Medical History</h3>
                <div className="clinical-field-grid">{historyFields.map(field => (
                  <label key={field.key} className="clinical-label">{field.label}
                    <textarea rows={3} maxLength={4000} disabled={saving}
                      placeholder={field.hint} value={form[field.key]}
                      onChange={event => setForm(prev => ({ ...prev, [field.key]: event.target.value }))}/>
                  </label>
                ))}</div>
                <div className="clinical-actions"><button className="primary-button" type="submit" disabled={saving}>
                  <Save size={17}/>{saving ? 'Saving…' : 'Save Medical History'}
                </button></div>
              </form>
              <div className="clinical-history"><h3>Previous Consultations</h3>
                {previous.length === 0 ? <p className="clinical-muted">No previous consultations recorded.</p>
                  : previous.map(item => (
                    <article key={item.id} className="clinical-history-row">
                      <strong>{displayDate(item.finalizedAtUtc)}</strong>
                      <p>{item.chiefComplaint || 'No complaint recorded'}</p>
                      <small>{item.diagnosis || 'No diagnosis recorded'} · {item.isFinalized ? 'Finalized' : 'Draft'}</small>
                    </article>
                  ))}
              </div>
            </>}
        </section>
      </div>
    </div>
  )
}
'''

STYLES = r'''.clinical-page { display:grid; gap:20px; }
.clinical-columns { display:grid; grid-template-columns:minmax(225px, 0.72fr) minmax(0, 2fr); gap:20px; align-items:start; }
.clinical-page .panel { min-width:0; }
.clinical-visit-list { display:grid; gap:12px; }
.clinical-visits { display:grid; gap:7px; max-height:590px; overflow-y:auto; }
.clinical-visit { display:grid; gap:5px; width:100%; text-align:left; padding:13px; border:1px solid #dbe5ec; border-radius:10px; background:transparent; color:inherit; cursor:pointer; }
.clinical-visit span,.clinical-visit small,.clinical-muted { color:#65798b; font-size:13px; }
.clinical-visit-active { border-color:#0c8b91; background:rgba(12,139,145,.07); }
.clinical-editor { display:grid; gap:16px; }
.clinical-empty { min-height:250px; display:flex; gap:12px; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:#5f7587; }
.clinical-form { display:grid; gap:16px; }
.clinical-form h3 { margin:8px 0; font-size:17px; }
.clinical-field-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }
.clinical-label { display:grid; gap:6px; font-weight:600; font-size:13px; color:inherit; }
.clinical-label textarea,.clinical-label input { padding:10px 12px; border:1px solid #cbd9e4; background:transparent; color:inherit; border-radius:9px; font:inherit; font-size:14px; width:100%; min-width:0; box-sizing:border-box; }
.clinical-label textarea { resize:vertical; }
.clinical-label textarea:disabled,.clinical-label input:disabled { opacity:0.7; }
.clinical-charge-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; border-top:1px solid #dce5ec; padding-top:18px; }
.clinical-charge-heading p { color:#697d8e; font-size:13px; }
.clinical-charge { display:grid; grid-template-columns:minmax(0, 2fr) minmax(100px,1fr) auto; gap:10px; align-items:end; }
.clinical-charge .secondary-button { min-height:42px; }
.clinical-total { display:flex; justify-content:space-between; padding:16px 0; border-block:1px solid #dce5ec; font-size:18px; }
.clinical-checkbox { display:flex; gap:10px; align-items:flex-start; font-size:13px; font-weight:600; }
.clinical-checkbox input { width:auto; margin-top:3px; }
.clinical-actions { display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; }
.clinical-error,.clinical-success,.clinical-notice { border-radius:9px; padding:13px 15px; font-size:13px; }
.clinical-error { color:#9b2733; background:rgba(233,74,74,.09); }
.clinical-success { color:#12734e; background:rgba(30,152,99,.09); }
.clinical-notice { color:#765600; background:rgba(226,166,36,.1); }
.clinical-history { display:grid; gap:12px; margin-top:24px; border-top:1px solid #dce5ec; padding-top:16px; }
.clinical-history-row { padding:12px 0; border-bottom:1px solid #e3ebef; }
.clinical-history-row p { margin:5px 0; }
.clinical-history-row small { color:#627888; }
@media(max-width:1000px) { .clinical-columns { grid-template-columns:1fr; } .clinical-visits { max-height:230px; } }
@media(max-width:650px) { .clinical-field-grid,.clinical-charge { grid-template-columns:1fr; } .clinical-actions { justify-content:stretch; } }
'''

new = {
    root/'frontend/src/pages/DentistConsultationsPage.tsx': CONSULTATIONS,
    root/'frontend/src/pages/DentistMedicalRecordsPage.tsx': MEDICAL,
    root/'frontend/src/pages/DentistClinical.css': STYLES,
}
for p in new:
    if p.exists():
        sys.exit(f'ERROR: Refusing to overwrite existing file {p}. No changes made.')

backup = root/'.phase2_frontend_backups'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(app_path, backup / 'App.tsx')
shutil.copy2(daily_path, backup / 'DailyPatientsPage.tsx')
for path, content in new.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
app_path.write_text(app, encoding='utf-8')
daily_path.write_text(daily, encoding='utf-8')
print('SUCCESS: Phase 2 React consultations and medical history installed.')
print(f'Backup: {backup}')
print('NEXT: cd frontend && npm run build && npm run lint')
print('NOTE: No payments/receipts functionality was added.')
