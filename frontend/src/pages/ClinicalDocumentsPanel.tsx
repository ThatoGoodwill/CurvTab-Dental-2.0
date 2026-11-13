import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { FileCheck2, FileText, Plus, Printer, RefreshCw, X } from 'lucide-react'
import { apiRequest } from '../services/api'
import './ClinicalDocumentsPanel.css'

type Visit = { id: string; appointmentId: string; createdAtUtc: string; dentistName: string; isFinalized: boolean }
type Prescription = {
  id: string; consultationId: string; dentistName: string; issuedAtUtc: string
  medication: string; dose: string; route: string; frequency: string; duration: string
  quantity: string; directions: string; clinicalRationale: string; medicalHistoryReviewed: boolean
}
type Certificate = {
  id: string; consultationId: string; dentistName: string; issuedAtUtc: string
  fromDate: string; toDate: string; clinicalJustification: string; workAdvice: string
}
type Data = {
  patient: { id: string; name: string }; practiceName: string
  consultations: Visit[]; prescriptions: Prescription[]; certificates: Certificate[]
}
const emptyRx = { medication: '', dose: '', route: '', frequency: '',
  duration: '', quantity: '', directions: '', clinicalRationale: '' }
const date = (v: string) => new Date(v).toLocaleDateString('en-ZA', {
  day: 'numeric', month: 'short', year: 'numeric'
})
const err = (e: unknown) => e instanceof Error ? e.message : 'Request failed.'

export default function ClinicalDocumentsPanel({ patientId }: { patientId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<'prescription' | 'certificate'>('prescription')
  const [editor, setEditor] = useState<'prescription' | 'certificate' | null>(null)
  const [consultation, setConsultation] = useState('')
  const [rx, setRx] = useState(emptyRx)
  const [historyReviewed, setHistoryReviewed] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [certificateReason, setCertificateReason] = useState('')
  const [workAdvice, setWorkAdvice] = useState('')
  const [authorised, setAuthorised] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [printDoc, setPrintDoc] = useState<{ kind: 'prescription' | 'certificate'; id: string } | null>(null)
  const requestId = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    apiRequest<Data>(`/dentist/patients/${encodeURIComponent(patientId)}/clinical-documents`)
      .then(value => { if (live) setData(value) })
      .catch(e => { if (live) setError(err(e)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [patientId, revision])

  function open(kind: 'prescription' | 'certificate') {
    setError(''); setNotice(''); setEditor(kind)
    setConsultation(data?.consultations[0]?.id ?? '')
    setRx(emptyRx); setHistoryReviewed(false); setAuthorised(false)
    setFromDate(''); setToDate(''); setCertificateReason(''); setWorkAdvice('')
    requestId.current = null
  }
  function changeRx(key: keyof typeof emptyRx, value: string) {
    setRx(prev => ({ ...prev, [key]: value }))
    requestId.current = null
  }

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!editor || busy || !consultation || !authorised) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID()
      if (editor === 'prescription') {
        await apiRequest(`/dentist/patients/${encodeURIComponent(patientId)}/clinical-documents/prescriptions`,
          'POST', { requestId: requestId.current, consultationId: consultation,
            medicalHistoryReviewed: historyReviewed, ...rx })
      } else {
        await apiRequest(`/dentist/patients/${encodeURIComponent(patientId)}/clinical-documents/certificates`,
          'POST', { requestId: requestId.current, consultationId: consultation,
            fromDate, toDate, clinicalJustification: certificateReason, workAdvice })
      }
      requestId.current = null
      setNotice('Document issued and saved under this patient and consultation. The issuing dentist is recorded.')
      setEditor(null); setRevision(v => v + 1)
    } catch (e) { setError(err(e)) }
    finally { setBusy(false) }
  }

  function print(kind: 'prescription' | 'certificate', id: string) {
    setPrintDoc({ kind, id })
    requestAnimationFrame(() => {
      window.print()
      setPrintDoc(null)
    })
  }
  const printRx = printDoc?.kind === 'prescription'
    ? data?.prescriptions.find(p => p.id === printDoc.id) : null
  const printCertificate = printDoc?.kind === 'certificate'
    ? data?.certificates.find(c => c.id === printDoc.id) : null

  return <section className="ct-documents" aria-label="Issued clinical documents">
    <header className="ct-documents-heading">
      <div><h2>Prescriptions & Medical Certificates</h2>
        <p>Authenticated dentist-issued documents linked to this patient's consultation.</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => setRevision(v => v + 1)}>
        <RefreshCw size={13}/> Refresh
      </button>
    </header>
    {error && <p role="alert" className="ct-documents-error">{error}</p>}
    {notice && <p role="status" className="ct-documents-note">{notice}</p>}
    {loading ? <p>Loading patient clinical documents…</p> : !data ? <p>Unable to load records.</p> : <>
      <div className="ct-documents-toolbar">
        <div className="ct-documents-tabs">
          <button type="button" className={tab === 'prescription' ? 'selected' : ''}
            onClick={() => setTab('prescription')}>Prescriptions ({data.prescriptions.length})</button>
          <button type="button" className={tab === 'certificate' ? 'selected' : ''}
            onClick={() => setTab('certificate')}>Medical Certificates ({data.certificates.length})</button>
        </div>
        <button type="button" className="primary-button" disabled={!data.consultations.length}
          onClick={() => open(tab)}><Plus size={13}/> Issue {tab === 'prescription' ? 'prescription' : 'certificate'}</button>
      </div>
      {!data.consultations.length && <p className="ct-documents-note">
        Start a patient consultation from Scheduling before issuing clinical documents.
      </p>}
      {tab === 'prescription' && (data.prescriptions.length ? data.prescriptions.map(p =>
        <article className="ct-documents-card" key={p.id}>
          <div><strong>{p.medication}</strong><small>{date(p.issuedAtUtc)} · Issued by {p.dentistName}</small>
            <p>{p.dose} · {p.route} · {p.frequency} · {p.duration}</p>
            <p>{p.directions}</p></div>
          <button type="button" className="secondary-button" onClick={() => print('prescription', p.id)}>
            <Printer size={13}/> Print
          </button>
        </article>) : <p className="ct-documents-empty"><FileText size={17}/> No issued prescriptions.</p>)}
      {tab === 'certificate' && (data.certificates.length ? data.certificates.map(c =>
        <article className="ct-documents-card" key={c.id}>
          <div><strong>Work certificate · {c.fromDate} to {c.toDate}</strong>
            <small>{date(c.issuedAtUtc)} · Issued by {c.dentistName}</small>
            <p>{c.workAdvice}</p></div>
          <button type="button" className="secondary-button" onClick={() => print('certificate', c.id)}>
            <Printer size={13}/> Print
          </button>
        </article>) : <p className="ct-documents-empty"><FileCheck2 size={17}/> No medical certificates issued.</p>)}
    </>}

    {editor && data && <div className="ct-documents-backdrop" role="presentation">
      <section className="ct-documents-modal" role="dialog" aria-modal="true"
        aria-label={editor === 'prescription' ? 'Issue prescription' : 'Issue medical certificate'}>
        <header><strong>{editor === 'prescription' ? 'Issue prescription' : 'Issue medical certificate'}</strong>
          <button type="button" disabled={busy} aria-label="Close"
            onClick={() => setEditor(null)}><X size={15}/></button></header>
        <form onSubmit={ev => void submit(ev)}>
          <label>Consultation
            <select value={consultation} required disabled={busy}
              onChange={e => { setConsultation(e.target.value); requestId.current = null }}>
              <option value="">Choose existing consultation…</option>
              {data.consultations.map(c => <option key={c.id} value={c.id}>
                {date(c.createdAtUtc)} · {c.dentistName} {c.isFinalized ? '(Finalized)' : '(In progress)'}
              </option>)}
            </select>
          </label>
          {editor === 'prescription' ? <>
            {(['medication', 'dose', 'route', 'frequency', 'duration', 'quantity', 'directions', 'clinicalRationale'] as const)
              .map(field => <label key={field}>{({
                medication: 'Medicine', dose: 'Dose', route: 'Route', frequency: 'Frequency',
                duration: 'Duration', quantity: 'Quantity', directions: 'Patient instructions',
                clinicalRationale: 'Clinical rationale / indication'
              })[field]}
                {field === 'directions' || field === 'clinicalRationale'
                  ? <textarea required rows={2} maxLength={field === 'directions' ? 2000 : 3000}
                      value={rx[field]} onChange={e => changeRx(field, e.target.value)} />
                  : <input required maxLength={field === 'route' ? 120 : 200}
                      value={rx[field]} onChange={e => changeRx(field, e.target.value)} />}
              </label>)}
            <label className="ct-documents-check"><input required type="checkbox" checked={historyReviewed}
              onChange={e => { setHistoryReviewed(e.target.checked); requestId.current = null }}/>
              I reviewed the patient's medical history, medications and allergies before prescribing.</label>
          </> : <>
            <label>From date<input required type="date" value={fromDate}
              onChange={e => { setFromDate(e.target.value); requestId.current = null }}/></label>
            <label>To date<input required type="date" min={fromDate || undefined} value={toDate}
              onChange={e => { setToDate(e.target.value); requestId.current = null }}/></label>
            <label>Clinical justification (confidential)
              <textarea required maxLength={3000} rows={2} value={certificateReason}
                onChange={e => { setCertificateReason(e.target.value); requestId.current = null }}/>
            </label>
            <label>Work advice / restrictions (printed on certificate)
              <textarea required maxLength={2000} rows={2} value={workAdvice}
                onChange={e => { setWorkAdvice(e.target.value); requestId.current = null }}/>
            </label>
          </>}
          <label className="ct-documents-check"><input type="checkbox" required checked={authorised}
            onChange={e => setAuthorised(e.target.checked)}/>
            I am the treating dentist and authorise issuing this clinical document.</label>
          <footer><button type="button" className="secondary-button" disabled={busy}
            onClick={() => setEditor(null)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={busy || !authorised ||
              (editor === 'prescription' && !historyReviewed)}>
              {busy ? 'Issuing…' : 'Issue & Save'}
            </button>
          </footer>
        </form>
      </section>
    </div>}
    {(printRx || printCertificate) && data && <div className="ct-documents-print">
      <h2>{data.practiceName}</h2><h3>{printRx ? 'Prescription' : 'Medical Certificate'}</h3>
      <p><strong>Patient:</strong> {data.patient.name}</p>
      <p><strong>Issuing dentist:</strong> {printRx?.dentistName ?? printCertificate?.dentistName}</p>
      <p><strong>Date issued:</strong> {date(printRx?.issuedAtUtc ?? printCertificate!.issuedAtUtc)}</p>
      {printRx && <>
        <p><strong>Medicine:</strong> {printRx.medication}</p>
        <p><strong>Dose:</strong> {printRx.dose}</p>
        <p><strong>Route:</strong> {printRx.route}</p>
        <p><strong>Frequency:</strong> {printRx.frequency}</p>
        <p><strong>Duration:</strong> {printRx.duration}</p>
        <p><strong>Quantity:</strong> {printRx.quantity}</p>
        <p><strong>Directions:</strong> {printRx.directions}</p>
      </>}
      {printCertificate && <>
        <p>This confirms that the above-named patient was assessed during a recorded clinical encounter.</p>
        <p><strong>Work period:</strong> {printCertificate.fromDate} – {printCertificate.toDate}</p>
        <p><strong>Work advice:</strong> {printCertificate.workAdvice}</p>
        <p>Clinical diagnosis is not disclosed on this employer-facing copy.</p>
      </>}
      <p><strong>Document reference:</strong> {printRx?.id ?? printCertificate?.id}</p>
      <p>Issued in CurvTab by the authenticated treating dentist; verify authenticity with the practice.</p>
    </div>}
  </section>
}
