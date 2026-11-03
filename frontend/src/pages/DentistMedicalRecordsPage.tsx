import { useEffect, useState } from 'react'
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
