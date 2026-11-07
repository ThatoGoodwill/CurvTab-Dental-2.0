import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle, ClipboardList, FileHeart, HeartPulse, Pencil,
  Pill, Save, ShieldCheck, Smile, X,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import './PatientMedicalCards.css'

type FieldKey = 'allergies' | 'currentMedications' | 'medicalConditions' | 'dentalHistory' | 'additionalNotes'
export type MedicalHistory = Partial<Record<FieldKey, string | null>>
type MedicalForm = Record<FieldKey, string>

type Props = {
  patientId: string
  history: MedicalHistory | null
  loading: boolean
  onSaved: (history: MedicalHistory) => void
}

const fields = [
  {
    key: 'allergies', title: 'Allergies & reactions', icon: AlertCircle,
    hint: 'Record known allergies and reactions; do not assume that an empty record means none',
  },
  {
    key: 'currentMedications', title: 'Current medication', icon: Pill,
    hint: 'Medication names and relevant patient-reported details',
  },
  {
    key: 'medicalConditions', title: 'Medical conditions', icon: HeartPulse,
    hint: 'Relevant health conditions and clinical precautions',
  },
  {
    key: 'dentalHistory', title: 'Dental history', icon: Smile,
    hint: 'Previous treatments, concerns and relevant dental background',
  },
  {
    key: 'additionalNotes', title: 'Additional clinical notes', icon: ClipboardList,
    hint: 'Other information for authorised clinical staff',
  },
] as const

function formFrom(history: MedicalHistory | null): MedicalForm {
  return {
    allergies: history?.allergies ?? '',
    currentMedications: history?.currentMedications ?? '',
    medicalConditions: history?.medicalConditions ?? '',
    dentalHistory: history?.dentalHistory ?? '',
    additionalNotes: history?.additionalNotes ?? '',
  }
}

function MedicalEditor({ patientId, history, onSaved, onCancel }: {
  patientId: string
  history: MedicalHistory | null
  onSaved: (history: MedicalHistory) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<MedicalForm>(() => formFrom(history))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await apiRequest<void>(
        `/dentist/patients/${encodeURIComponent(patientId)}/medical-history`,
        'PUT', form,
      )
      onSaved(form)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save medical history.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="ct-medical-edit" onSubmit={save}>
    <div className="ct-medical-heading">
      <div><h2>Edit medical history</h2><p>Confirm each entry with the patient before saving.</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
        <X size={16} /> Cancel
      </button>
    </div>
    <div className="ct-medical-grid">
      {fields.map(field => {
        const Icon = field.icon
        return <label className="ct-medical-card ct-medical-edit-card" key={field.key}>
          <span className="ct-medical-card-head"><span className="ct-medical-icon"><Icon size={21} /></span><strong>{field.title}</strong></span>
          <small>{field.hint}</small>
          <textarea
            value={form[field.key]}
            onChange={event => setForm(previous => ({ ...previous, [field.key]: event.target.value }))}
            maxLength={4000} rows={4}
            placeholder={`Enter ${field.title.toLowerCase()}...`}
          />
        </label>
      })}
    </div>
    {error && <p role="alert" className="ct-medical-error">{error}</p>}
    <div className="ct-medical-actions">
      <button type="submit" className="primary-button" disabled={busy}><Save size={17} /> {busy ? 'Saving…' : 'Save medical history'}</button>
    </div>
  </form>
}

export default function PatientMedicalCards({ patientId, history, loading, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  const saveHistory = (next: MedicalHistory) => {
    onSaved(next)
    setEditing(false)
    setSaved(true)
  }

  if (loading) {
    return <section className="ct-medical-shell" aria-busy="true">
      <div className="ct-medical-heading"><h2>Medical Records</h2></div>
      <p>Loading this patient's medical history…</p>
    </section>
  }

  return <section className="ct-medical-shell" aria-label="Patient medical records">
    <div className="ct-medical-heading">
      <div>
        <div className="ct-medical-label"><FileHeart size={16}/> CONFIDENTIAL PATIENT RECORD</div>
        <h2>Medical Records</h2>
        <p>Clinical information for this patient, stored in the existing practice database.</p>
      </div>
      {!editing && <button type="button" className="primary-button" onClick={() => { setEditing(true); setSaved(false) }}>
        <Pencil size={16}/> Edit records
      </button>}
    </div>
    <div className="ct-medical-privacy"><ShieldCheck size={17} /> Available only to authorised Dentists. All changes are saved through the existing clinical API.</div>
    {saved && !editing && <p role="status" className="ct-medical-success">Medical history saved successfully.</p>}
    {editing ? <MedicalEditor patientId={patientId} history={history} onSaved={saveHistory} onCancel={() => setEditing(false)}/> :
      <div className="ct-medical-grid">
        {fields.map(field => {
          const Icon = field.icon
          const value = history?.[field.key]?.trim()
          return <article className="ct-medical-card" key={field.key}>
            <div className="ct-medical-card-head"><span className="ct-medical-icon"><Icon size={21}/></span><strong>{field.title}</strong></div>
            <p className={value ? 'ct-medical-value' : 'ct-medical-empty'}>{value || 'Not recorded yet'}</p>
            <small>{field.hint}</small>
          </article>
        })}
      </div>}
  </section>
}
