import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Printer, RefreshCw, X } from 'lucide-react'
import { apiRequest } from '../services/api'
import './ClinicalDocumentsPanel.css'

type Encounter = {
  id: string; appointmentId: string; chiefComplaint: string | null
  createdAtUtc: string; finalizedAtUtc: string | null; isFinalized: boolean
}
type Prescription = {
  id: string; patientId: string; consultationId: string
  practitionerName: string; practitionerRegistrationNumber: string
  medicationName: string; strength: string; dosage: string; route: string
  frequency: string; duration: string; quantity: string
  instructions: string; clinicalIndication: string; authorizedAtUtc: string
}
type Certificate = {
  id: string; patientId: string; consultationId: string
  practitionerName: string; practitionerRegistrationNumber: string
  fromDate: string; throughDate: string; workCapacityStatement: string
  clinicalJustification: string; patientOrRepresentativeName: string; authorizedAtUtc: string
}
type PrescriptionDraft = {
  consultationId: string; practitionerRegistrationNumber: string
  medicationName: string; strength: string; dosage: string; route: string
  frequency: string; duration: string; quantity: string; instructions: string
  clinicalIndication: string; clinicianConfirmed: boolean
}
type CertificateDraft = {
  consultationId: string; practitionerRegistrationNumber: string
  fromDate: string; throughDate: string; workCapacityStatement: string
  clinicalJustification: string; patientOrRepresentativeName: string; clinicianConfirmed: boolean
}
const emptyRx: PrescriptionDraft = {
  consultationId: '', practitionerRegistrationNumber: '', medicationName: '',
  strength: '', dosage: '', route: '', frequency: '', duration: '',
  quantity: '', instructions: '', clinicalIndication: '', clinicianConfirmed: false,
}
const emptyCert: CertificateDraft = {
  consultationId: '', practitionerRegistrationNumber: '',
  fromDate: '', throughDate: '', workCapacityStatement: '',
  clinicalJustification: '', patientOrRepresentativeName: '', clinicianConfirmed: false,
}
const date = (s: string) => new Date(s).toLocaleDateString('en-ZA')
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Unable to save clinical document.'
const pair = (name: string, value: string) => <p><strong>{name}:</strong> {value || 'Not recorded'}</p>

export default function ClinicalDocumentsPanel({ patientId }: { patientId: string }) {
  const [view, setView] = useState<'prescriptions' | 'certificates'>('prescriptions')
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [rx, setRx] = useState<PrescriptionDraft>(emptyRx)
  const [cert, setCert] = useState<CertificateDraft>(emptyCert)
  const [form, setForm] = useState<'prescription' | 'certificate' | null>(null)
  const [printRecord, setPrintRecord] = useState<{ type: 'rx'; document: Prescription } | { type: 'cert'; document: Certificate } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const base = `/dentist/clinical-documents/patients/${encodeURIComponent(patientId)}`

  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([
      apiRequest<Encounter[]>(`/dentist/patients/${encodeURIComponent(patientId)}/consultations`),
      apiRequest<Prescription[]>(`${base}/prescriptions`),
      apiRequest<Certificate[]>(`${base}/certificates`),
    ]).then(([visits, savedRx, savedCert]) => {
      if (!mounted) return
      setEncounters(visits)
      setPrescriptions(savedRx)
      setCertificates(savedCert)
      setError('')
    }).catch(cause => { if (mounted) setError(errorText(cause)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [base, patientId, revision])

  function start(type: 'prescription' | 'certificate') {
    const latest = encounters[0]?.id ?? ''
    setRx({ ...emptyRx, consultationId: latest })
    setCert({ ...emptyCert, consultationId: latest })
    setForm(type); setError(''); setNotice('')
  }

  async function save(ev: FormEvent) {
    ev.preventDefault()
    if (!form || saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      if (form === 'prescription')
        await apiRequest(`${base}/prescriptions`, 'POST', rx)
      else
        await apiRequest(`${base}/certificates`, 'POST', cert)
      setForm(null)
      setNotice('Clinician-authorised document saved to this patient and consultation. A paper signature may still be required for external use.')
      setRevision(n => n + 1)
    } catch (cause) { setError(errorText(cause)) } finally { setSaving(false) }
  }

  function print(type: 'rx' | 'cert', document: Prescription | Certificate) {
    if (type === 'rx') setPrintRecord({ type: 'rx', document: document as Prescription })
    else setPrintRecord({ type: 'cert', document: document as Certificate })
    window.setTimeout(() => window.print(), 150)
  }

  return <section className="ct-clinical-documents" aria-label="Clinician authorised documents">
    <div className="ct-clinical-documents-heading">
      <div><h3>Clinical documents</h3><p>Only an authenticated treating dentist may authorise and save records.</p></div>
      <button type="button" className="secondary-button" onClick={() => setRevision(n => n + 1)}>
        <RefreshCw size={14}/> Refresh
      </button>
    </div>
    <div className="ct-clinical-documents-tabs">
      <button type="button" className={view === 'prescriptions' ? 'active' : ''}
        onClick={() => { setView('prescriptions'); setForm(null) }}>Prescriptions</button>
      <button type="button" className={view === 'certificates' ? 'active' : ''}
        onClick={() => { setView('certificates'); setForm(null) }}>Medical certificates</button>
    </div>
    {error && <p className="ct-clinical-documents-error" role="alert">{error}</p>}
    {notice && <p className="ct-clinical-documents-success" role="status">{notice}</p>}
    {loading ? <p>Loading clinical records…</p> : <>
      {view === 'prescriptions' && <>
        <div className="ct-clinical-documents-actions">
          <span>{prescriptions.length} saved prescription {prescriptions.length === 1 ? 'record' : 'records'}</span>
          <button type="button" className="primary-button" onClick={() => start('prescription')} disabled={!encounters.length}>+ New prescription</button>
        </div>
        {!encounters.length && <p>Save and start a clinical consultation before issuing a prescription.</p>}
        {prescriptions.length === 0 && <p>No authorised prescription documents on this patient's record yet.</p>}
        <div className="ct-clinical-documents-list">{prescriptions.map(item => <article key={item.id} className="ct-clinical-document-card">
          <div><strong>{item.medicationName} · {item.strength}</strong><small>{date(item.authorizedAtUtc)} · {item.practitionerName}</small>
            <p>{item.dosage} · {item.frequency} · {item.duration}</p></div>
          <button type="button" className="secondary-button" onClick={() => print('rx', item)}><Printer size={13}/> Print</button>
        </article>)}</div>
      </>}
      {view === 'certificates' && <>
        <div className="ct-clinical-documents-actions">
          <span>{certificates.length} saved medical {certificates.length === 1 ? 'certificate' : 'certificates'}</span>
          <button type="button" className="primary-button" onClick={() => start('certificate')} disabled={!encounters.length}>+ Medical certificate</button>
        </div>
        {certificates.length === 0 && <p>No authorised medical certificate records yet.</p>}
        <div className="ct-clinical-documents-list">{certificates.map(item => <article key={item.id} className="ct-clinical-document-card">
          <div><strong>{item.fromDate} to {item.throughDate}</strong><small>{date(item.authorizedAtUtc)} · {item.practitionerName}</small>
            <p>{item.workCapacityStatement}</p></div>
          <button type="button" className="secondary-button" onClick={() => print('cert', item)}><Printer size={13}/> Print</button>
        </article>)}</div>
      </>}
    </>}

    {form && <div className="ct-clinical-document-overlay" role="presentation">
      <div className="ct-clinical-document-dialog" role="dialog" aria-modal="true" aria-label={form === 'prescription' ? 'Issue clinical prescription' : 'Issue medical certificate'}>
        <div className="ct-clinical-document-dialog-head"><h3>{form === 'prescription' ? 'New prescription' : 'New medical certificate'}</h3>
          <button type="button" disabled={saving} onClick={() => setForm(null)} aria-label="Close"><X size={16}/></button></div>
        <form onSubmit={e => void save(e)}>
          <label>Consultation
            <select required value={form === 'prescription' ? rx.consultationId : cert.consultationId}
              onChange={e => form === 'prescription'
                ? setRx(v => ({ ...v, consultationId: e.target.value }))
                : setCert(v => ({ ...v, consultationId: e.target.value }))}>
              <option value="">Select saved consultation…</option>
              {encounters.map(c => <option key={c.id} value={c.id}>
                {date(c.createdAtUtc)} · {c.chiefComplaint || 'Dental visit'} · {c.isFinalized ? 'finalised' : 'in progress'}
              </option>)}
            </select>
          </label>
          <label>Practitioner registration number (HPCSA)
            <input required minLength={3} maxLength={60} value={form === 'prescription' ? rx.practitionerRegistrationNumber : cert.practitionerRegistrationNumber}
              onChange={e => form === 'prescription'
                ? setRx(v => ({ ...v, practitionerRegistrationNumber: e.target.value }))
                : setCert(v => ({ ...v, practitionerRegistrationNumber: e.target.value }))}/>
          </label>
          {form === 'prescription' ? <>
            <div className="ct-clinical-document-grid">
              {([
                ['medicationName','Medication name'], ['strength','Strength'],
                ['dosage','Dose'], ['route','Route'],
                ['frequency','Frequency'], ['duration','Duration'],
                ['quantity','Quantity'],
              ] as const).map(([field,label]) => <label key={field}>{label}
                <input required maxLength={field === 'dosage' ? 300 : 200} value={rx[field]}
                  onChange={e => setRx(v => ({ ...v, [field]: e.target.value }))} />
              </label>)}
            </div>
            <label>Clinical indication<textarea required minLength={4} maxLength={2000} rows={2} value={rx.clinicalIndication} onChange={e => setRx(v => ({ ...v, clinicalIndication: e.target.value }))}/></label>
            <label>Directions and safety instructions<textarea required minLength={4} maxLength={2000} rows={3} value={rx.instructions} onChange={e => setRx(v => ({ ...v, instructions: e.target.value }))}/></label>
          </> : <>
            <div className="ct-clinical-document-grid">
              <label>From date<input type="date" required value={cert.fromDate} onChange={e => setCert(v => ({...v,fromDate:e.target.value}))}/></label>
              <label>Through date<input type="date" required min={cert.fromDate || undefined} value={cert.throughDate} onChange={e => setCert(v => ({...v,throughDate:e.target.value}))}/></label>
            </div>
            <label>Patient / representative name<input required minLength={2} maxLength={200} value={cert.patientOrRepresentativeName} onChange={e => setCert(v => ({...v,patientOrRepresentativeName:e.target.value}))}/></label>
            <label>Work capacity statement<textarea required minLength={8} rows={2} maxLength={1000} value={cert.workCapacityStatement} onChange={e => setCert(v => ({...v,workCapacityStatement:e.target.value}))}/></label>
            <label>Clinical justification (restricted clinical record)<textarea required minLength={8} rows={3} maxLength={4000} value={cert.clinicalJustification} onChange={e => setCert(v => ({...v,clinicalJustification:e.target.value}))}/></label>
          </>}
          <label className="ct-doc-authorize">
            <input type="checkbox" required checked={form === 'prescription' ? rx.clinicianConfirmed : cert.clinicianConfirmed}
              onChange={e => form === 'prescription'
                ? setRx(v => ({ ...v, clinicianConfirmed: e.target.checked }))
                : setCert(v => ({ ...v, clinicianConfirmed: e.target.checked }))} />
            I am the treating dentist. I verified the patient, indication, instructions and dates. This record is saved under my authenticated account.
          </label>
          <div className="ct-clinical-document-footer">
            <button type="button" className="secondary-button" disabled={saving} onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Authorise and save'}</button>
          </div>
        </form>
      </div>
    </div>}

    {printRecord && createPortal(<div className="ct-clinical-document-print-portal" aria-hidden="true">
      <h1>CurvTab Dental · Clinical document</h1>
      <p><strong>Patient record ID:</strong> {patientId}</p>
      <p><strong>Consultation ID:</strong> {printRecord.document.consultationId}</p>
      <p><strong>Authorised:</strong> {date(printRecord.document.authorizedAtUtc)}</p>
      <p><strong>Practitioner:</strong> {printRecord.document.practitionerName}</p>
      <p><strong>Registration:</strong> {printRecord.document.practitionerRegistrationNumber}</p>
      {printRecord.type === 'rx' ? <>
        <h2>Medication prescription record</h2>
        {pair('Medication', printRecord.document.medicationName)}
        {pair('Strength', printRecord.document.strength)}
        {pair('Dosage', printRecord.document.dosage)}
        {pair('Route', printRecord.document.route)}
        {pair('Frequency', printRecord.document.frequency)}
        {pair('Duration', printRecord.document.duration)}
        {pair('Quantity', printRecord.document.quantity)}
        {pair('Directions', printRecord.document.instructions)}
        {pair('Indication', printRecord.document.clinicalIndication)}
      </> : <>
        <h2>Medical certificate</h2>
        {pair('For', printRecord.document.patientOrRepresentativeName)}
        {pair('From', printRecord.document.fromDate)}
        {pair('Through', printRecord.document.throughDate)}
        {pair('Work capacity', printRecord.document.workCapacityStatement)}
      </>}
      <p className="ct-doc-print-attestation">Authenticated clinical record. Practitioner registration and legally compliant signature must be verified before presentation externally. No electronic signature is claimed.</p>
    </div>, document.body)}
  </section>
}
