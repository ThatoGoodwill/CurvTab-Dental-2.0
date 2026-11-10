import { Fragment, useEffect, useState } from 'react'
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
type CataloguePrice = { id: string; code: string; name: string; category: string; price: number; isActive: boolean }
type StoredCharge = { id: string; description: string; amount: number }
type ConsultationRecord = Partial<ClinicalForm> & {
  isFinalized: boolean
  chargesConfirmed: boolean
  finalizedAtUtc: string | null
}
type PatientConsultationSummary = { appointmentId: string; chiefComplaint?: string | null; createdAtUtc: string; isFinalized: boolean }

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
  patientId?: string
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

// Optional, editable clinical phrases. Never preselect these or treat them as diagnoses.
const clinicalSuggestions: Record<FieldName, readonly string[]> = {
  chiefComplaint: [
    'Routine dental examination / check-up',
    'Toothache — specify tooth and duration',
    'Sensitivity to hot or cold — specify tooth',
    'Bleeding gums',
    'Swelling in mouth or face — specify site',
    'Broken or chipped tooth — specify tooth',
    'Loose tooth — specify tooth',
    'Difficulty chewing',
    'Orthodontic / braces consultation',
    'Follow-up for previous treatment',
  ],
  symptoms: [
    'Pain when biting or chewing — specify site',
    'Pain with hot or cold stimuli — specify site',
    'Spontaneous pain — specify onset and duration',
    'Bleeding when brushing or flossing',
    'Swelling — specify onset and site',
    'Difficulty opening mouth',
    'Reported discomfort from orthodontic appliance',
    'Patient reports no current symptoms',
  ],
  examinationFindings: [
    'Caries observed — record tooth and surface',
    'Gingival inflammation observed — document sites',
    'Plaque / calculus noted — document sites',
    'Fractured tooth or restoration — record tooth',
    'Tenderness on percussion — specify tooth',
    'Soft-tissue finding — describe site and appearance',
    'No visible abnormalities on examination performed',
    'Further examination or imaging required — specify why',
  ],
  diagnosis: [
    'Dental caries — specify affected teeth',
    'Gingivitis — specify findings',
    'Periodontitis — specify staging and findings',
    'Tooth fracture — specify tooth and type',
    'Suspected pulpal pathology — confirm assessment',
    'Dental infection / abscess — specify site and evidence',
    'Malocclusion — specify classification and findings',
    'Diagnosis pending further evaluation',
  ],
  treatmentPerformed: [
    'Oral examination and consultation',
    'Scaling and polishing — specify sites',
    'Direct restoration — specify tooth, surfaces and material',
    'Extraction — specify tooth and procedure details',
    'Root canal procedure — specify tooth and stage',
    'Temporary restoration — specify tooth',
    'Radiograph obtained / reviewed — specify type and findings',
    'Oral hygiene education and instruction',
    'No procedure performed during this visit',
  ],
  treatmentPlan: [
    'Clinical review planned — specify interval',
    'Restoration planned — specify tooth and surfaces',
    'Professional cleaning planned',
    'Endodontic assessment / treatment considered',
    'Extraction assessment — specify tooth',
    'Orthodontic assessment recommended',
    'Further diagnostic imaging / tests planned',
    'Referral considered — specify indication',
    'No additional treatment planned at this visit',
  ],
  prescriptionNotes: [
    'No medication prescribed at this visit',
    'Medication discussed; details documented separately',
    'Signed prescription issued; document prescribed medicine and instructions',
    'Medication decision deferred pending clinical review',
    'Medication history reviewed; update medical record if required',
  ],
  followUpAdvice: [
    'Routine dental recall recommended — specify interval',
    'Follow-up appointment advised — specify date / interval',
    'Oral hygiene instructions provided',
    'Post-procedure care instructions provided — specify advice',
    'Return or contact practice if symptoms worsen',
    'Referral follow-up recommended — specify provider',
    'No scheduled follow-up required at this time',
  ],
}

// Charges are service descriptions only; pricing is entered and verified by staff.
const commonTreatments: readonly string[] = [
  'Dental consultation / examination',
  'Emergency dental consultation',
  'Scaling and polishing',
  'Composite filling / restoration — specify tooth',
  'Tooth extraction — specify tooth',
  'Root canal treatment — specify tooth and stage',
  'Dental radiograph / X-ray — specify type',
  'Temporary restoration — specify tooth',
  'Orthodontic consultation',
  'Orthodontic adjustment / follow-up',
  'Other service — specify details',
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
  patientId, selectedAppointmentId, onSelectAppointment, onOpenMedicalHistory,
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
  const [prices, setPrices] = useState<CataloguePrice[]>([])
  const [rxDrug, setRxDrug] = useState('')
  const [rxDose, setRxDose] = useState('')
  const [rxDays, setRxDays] = useState('7')

  // Practice price list from Configuration Center > Procedure Pricing.
  useEffect(() => {
    apiRequest<CataloguePrice[]>('/practice/procedure-prices')
      .then(rows => setPrices(rows.filter(row => row.isActive)))
      .catch(() => setPrices([]))
  }, [])

  function addPrescriptionLine() {
    const drug = rxDrug.trim()
    if (!drug) return
    const dose = rxDose.trim()
    const days = rxDays.trim()
    const line = `${drug}${dose ? ' ' + dose : ''}${days ? ' — ' + days + ' days' : ''}`
    setForm(previous => ({
      ...previous,
      prescriptionNotes: previous.prescriptionNotes.trim()
        ? previous.prescriptionNotes.trim() + '\n' + line : line,
    }))
    setRxDrug(''); setRxDose('')
  }

  useEffect(() => {
    if (!patientId && !day) return
    let cancelled = false
    const request = patientId
      ? apiRequest<PatientConsultationSummary[]>(`/dentist/patients/${encodeURIComponent(patientId)}/consultations`)
          .then(rows => rows.map(row => ({
            appointmentId: row.appointmentId,
            patientId,
            patientName: '',
            status: row.isFinalized ? 'Finalized' : 'InConsultation',
            reason: row.chiefComplaint || null,
            consultationStartedAtUtc: row.createdAtUtc,
          } satisfies Visit)))
      : apiRequest<Visit[]>(`/dentist/daily-patients?${dateRange(day)}`)
    request
      .then(rows => { if (!cancelled) { setVisits(rows); setError('') } })
      .catch(cause => { if (!cancelled) setError(errorText(cause)) })
      .finally(() => { if (!cancelled) setListLoading(false) })
    return () => { cancelled = true }
  }, [patientId, day, listRevision])

  useEffect(() => {
    if (!selectedAppointmentId) return
    let cancelled = false
    apiRequest<Detail>(`/dentist/consultations/by-appointment/${encodeURIComponent(selectedAppointmentId)}`)
      .then(result => {
        if (cancelled) return
        if (patientId && result.patientId !== patientId) {
          setDetail(null)
          setDetailsError('This consultation does not belong to the selected patient.')
          return
        }
        setDetail(result)
        setForm(Object.fromEntries(fields.map(({ key }) => [key, result.consultation?.[key] ?? ''])) as ClinicalForm)
        setCharges(result.charges.map(charge => ({ description: charge.description, amount: String(charge.amount) })))
        setChargesConfirmed(result.consultation?.chargesConfirmed ?? false)
        setDetailsError('')
      })
      .catch(cause => { if (!cancelled) setDetailsError(errorText(cause)) })
    return () => { cancelled = true }
  }, [selectedAppointmentId, detailRevision, patientId])

  const detailsLoading = Boolean(selectedAppointmentId && detail?.appointmentId !== selectedAppointmentId)
  const editable = Boolean(detail && detail.appointmentStatus === 'InConsultation' && !detail.consultation?.isFinalized)
  const total = charges.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  function chooseAppointment(id: string) {
    onSelectAppointment(id)
    setError('')
    setMessage('')
    setDetailsError('')
  }

  // Insert a quick option while preserving custom text and previous selections.
  function addClinicalSuggestion(field: FieldName, suggestion: string) {
    setForm(previous => {
      const current = previous[field].trim()
      if (current.split('\n').includes(suggestion)) return previous
      const updated = current ? `${current}\n${suggestion}` : suggestion
      if (updated.length > 6000) return previous
      return { ...previous, [field]: updated }
    })
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
          <h1>{patientId ? 'Patient Consultations' : 'Consultations'}</h1>
          <p>Review saved visits, document the encounter, and confirm treatment charges before completion.</p>
        </div>
        <button type="button" className="secondary-button"
          onClick={() => { setListLoading(true); setListRevision(v => v + 1) }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="clinical-columns">
        <aside className="panel clinical-visit-list">
          <div className="panel-header"><div><h2>{patientId ? 'Visit history' : 'Daily Visits'}</h2><p>{patientId ? 'Only this patient’s recorded consultations' : 'Patients with started consultations'}</p></div><ClipboardList size={20}/></div>
          {!patientId && <label className="clinical-label">Visit date
            <input type="date" value={day} onChange={event => {
              setDay(event.target.value)
              setListLoading(true)
            }} />
          </label>}
          {listLoading ? <p>Loading visits...</p> : visits.length === 0
            ? <p className="clinical-muted">{patientId ? 'No consultation records for this patient yet.' : 'No consultations started on this date.'}</p>
            : <div className="clinical-visits">{visits.map(visit => (
              <button type="button" key={visit.appointmentId}
                className={`clinical-visit ${selectedAppointmentId === visit.appointmentId ? 'clinical-visit-active' : ''}`}
                onClick={() => chooseAppointment(visit.appointmentId)}>
                <strong>{patientId && visit.consultationStartedAtUtc ? new Date(visit.consultationStartedAtUtc).toLocaleDateString('en-ZA') : visit.patientName}</strong>
                <span>{visit.reason || 'Dental visit'}</span>
                <small>{visit.status.replace(/([a-z])([A-Z])/g, '$1 $2')}</small>
              </button>
            ))}</div>}
        </aside>

        <section className="panel clinical-editor">
          {!selectedAppointmentId ? (
            <div className="clinical-empty"><Stethoscope size={30}/>
              <h2>Select a consultation</h2>
              <p>{patientId ? 'Select a recorded visit above, or start a new consultation from the Appointments queue.' : 'Start a consultation from Appointments, then select the patient here or in Daily Patients.'}</p>
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
                <p className="clinical-quick-help">
                  Quick options are optional prompts, not automatic findings or diagnoses.
                  Select only what you assessed or performed, then add tooth numbers, clinical
                  details and corrections in the editable notes before saving.
                </p>
                <div className="clinical-field-grid">
                  {fields.map(field => (
                    <Fragment key={field.key}>
                    <label className="clinical-label">
                      {field.label}{field.required && <span aria-hidden="true"> *</span>}
                      <select
                        defaultValue=""
                        aria-label={`Quick-select option for ${field.label}`}
                        disabled={!editable || saving}
                        onChange={event => {
                          const selected = event.currentTarget.value
                          if (selected) addClinicalSuggestion(field.key, selected)
                          event.currentTarget.value = ''
                        }}
                      >
                        <option value="">Choose a common option (optional)</option>
                        {clinicalSuggestions[field.key].map(option => (
                          <option value={option} key={option}>{option}</option>
                        ))}
                      </select>
                      <textarea rows={3} maxLength={6000}
                        placeholder={`${field.hint}. You may type or edit freely.`}
                        value={form[field.key]} disabled={!editable || saving}
                        onChange={event => setForm(previous => ({ ...previous, [field.key]: event.target.value }))}/>
                    </label>
                    {field.key === 'prescriptionNotes' && editable && (
                      <div className="clinical-label" role="group" aria-label="Prescription builder">
                        <span>Add prescription line</span>
                        <input value={rxDrug} maxLength={80} placeholder="Medicine, e.g. Amoxil 500 mg"
                          disabled={saving} onChange={event => setRxDrug(event.target.value)} />
                        <input value={rxDose} maxLength={80} placeholder="Dose, e.g. 1 capsule 3 times daily"
                          disabled={saving} onChange={event => setRxDose(event.target.value)} />
                        <input value={rxDays} inputMode="numeric" maxLength={3} placeholder="Days"
                          disabled={saving} onChange={event => setRxDays(event.target.value.replace(/\D/g, ''))} />
                        <button type="button" className="secondary-button" disabled={saving || !rxDrug.trim()}
                          onClick={addPrescriptionLine}><Plus size={16}/> Add to prescription</button>
                      </div>
                    )}
                    </Fragment>
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
                      <select
                        defaultValue=""
                        aria-label={`Choose treatment/service for charge ${index + 1}`}
                        disabled={!editable || saving}
                        onChange={event => {
                          const selected = event.currentTarget.value
                          if (selected.startsWith('price:')) {
                            const found = prices.find(price => price.id === selected.slice(6))
                            if (found) {
                              setCharges(prev => prev.map((item, i) =>
                                i === index ? { description: found.name, amount: found.price.toFixed(2) } : item))
                              setChargesConfirmed(false)
                            }
                          } else if (selected) {
                            setCharges(prev => prev.map((item, i) =>
                              i === index ? { ...item, description: selected } : item))
                            setChargesConfirmed(false)
                          }
                          event.currentTarget.value = ''
                        }}
                      >
                        <option value="">{prices.length ? 'Choose from practice price list' : 'Choose common service (optional)'}</option>
                        {prices.map(price => (
                          <option key={price.id} value={`price:${price.id}`}>
                            {price.name} — R{price.price.toFixed(2)}
                          </option>
                        ))}
                        {prices.length === 0 && commonTreatments.map(treatment => (
                          <option key={treatment} value={treatment}>{treatment}</option>
                        ))}
                      </select>
                      <input value={row.description} maxLength={200} disabled={!editable || saving}
                        placeholder="Describe treatment; include tooth/site if relevant"
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
