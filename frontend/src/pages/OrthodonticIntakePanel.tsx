import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardCheck, FileText, Plus, RefreshCw, ShieldCheck, Users, UserRoundCheck } from 'lucide-react'
import { apiRequest, apiUpload, apiDownload } from '../services/api'
import { SignaturePad } from './RegistrationExtras'
import './OrthodonticIntakePanel.css'

type IntakeSource = 'DIRECT' | 'INTERNAL' | 'TRANSFER_IN'
type Intake = {
  id: string; patientId: string; patientName: string
  source: IntakeSource; status: string
  assignedOrthodontistUserId: string | null; referralAuthorUserId: string | null
  missingDocumentsJson: string; advancePolicy: string; termsApplicable: boolean
  termsAcceptedAtUtc: string | null; historyVerifiedByClinician: boolean
  nextAction: string | null; dueDate: string | null; urgentConcerns: string | null
  advanceRecorded: boolean
}
type PatientOption = { id: string; name: string }
type Clinician = { id: string; name: string }
type IntakeDocument = {
  id: string; originalFileName: string; category: string; contentType: string;
  sizeBytes: number; sha256: string; sourceProvider: string | null;
  uploadedAtUtc: string; reviewedAtUtc: string | null
}
type AdvanceReceipt = {
  id: string; receiptNumber: string; amount: number; method: string;
  reference: string | null; receivedAtUtc: string; creditAvailable: number
}

type IntakeDetail = Intake & {
  referralReason: string | null; referralNotes: string | null
  previousProvider: string | null; existingAppliances: string | null
  previousTreatmentStartDate: string | null; previousTreatmentPlanSummary: string | null
  transferReason: string | null; previousRecordsSummary: string | null
  documentReferencesJson: string
  patientProfile?: {id:string;patientName:string;dateOfBirth:string|null;paymentMethod:string}|null
  responsiblePerson?: { responsibleName:string|null; responsibleRelationship:string|null;
    responsiblePhone:string|null;responsibleEmail:string|null;guardianConsent:boolean|null }|null
  nextVisit?: {id:string;startUtc:string;endUtc:string;status:string;reason:string|null}|null
  medicalHistory?: {allergies:string|null;currentMedications:string|null;medicalConditions:string|null;
    dentalHistory:string|null;additionalNotes:string|null;updatedAtUtc:string}|null
}
type Props = {
  role: string
  onOpenPatient?: (patientId: string) => void
}
type CreateForm = {
  patientId: string; source: IntakeSource; referralReason: string; referralNotes: string
  previousProvider: string; existingAppliances: string; previousTreatmentStartDate: string
  previousTreatmentPlanSummary: string; transferReason: string; previousRecordsSummary: string
  urgentConcerns: string
}
const newForm = (): CreateForm => ({
  patientId:'',source:'INTERNAL',referralReason:'',referralNotes:'',
  previousProvider:'',existingAppliances:'',previousTreatmentStartDate:'',
  previousTreatmentPlanSummary:'',transferReason:'',previousRecordsSummary:'',urgentConcerns:''
})
function missingItems(value: string | undefined): string[] {
  try { const array = JSON.parse(value || '[]'); return Array.isArray(array) ? array.filter(x => typeof x === 'string') : [] }
  catch { return [] }
}
const sourceName = (source: IntakeSource) => ({
  DIRECT: 'Direct registration', INTERNAL: 'Internal referral', TRANSFER_IN: 'Transfer-in'
})[source]
const stateLabel = (state: string) => state.replaceAll('_',' ').toLowerCase()
const initialList = ['New Assessments','Internal Referrals','Transfer-In Reviews','Assessment In Progress','Financial Interventions']

export default function OrthodonticIntakePanel({ role, onOpenPatient }: Props) {
  const isManager = role === 'PracticeAdmin'
  const isDentist = role === 'Dentist'
  const [cases,setCases] = useState<Intake[]>([])
  const [clinicians,setClinicians] = useState<Clinician[]>([])
  const [patients,setPatients] = useState<PatientOption[]>([])
  const [search,setSearch] = useState('')
  const [patientError,setPatientError] = useState('')
  const [form,setForm] = useState<CreateForm>(newForm)
  const [view,setView] = useState<'queue'|'create'|'review'>('queue')
  const [reviewTab,setReviewTab] = useState<'Overview'|'Documents'|'Consent & Payments'|'Clinical Review'>('Overview')
  const [filter,setFilter] = useState('All')
  const [selected,setSelected] = useState<Intake | null>(null)
  const [detail,setDetail] = useState<IntakeDetail | null>(null)
  const [missing,setMissing] = useState('')
  const [historyVerified,setHistoryVerified] = useState(false)
  const [nextAction,setNextAction] = useState('')
  const [dueDate,setDueDate] = useState('')
  const [policy,setPolicy] = useState('REVIEW_REQUIRED')
  const [policyReason,setPolicyReason] = useState('')
  const [approvedTerms,setApprovedTerms] = useState<{ available:boolean; version?:string; fullText?:string; sha256?:string; message?:string }|null>(null)
  const [signerName,setSignerName] = useState('')
  const [signerCapacity,setSignerCapacity] = useState<'Patient'|'ParentOrGuardian'|'Representative'>('ParentOrGuardian')
  const [signatureData,setSignatureData] = useState('')
  const [termsAcknowledged,setTermsAcknowledged] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')
  const [working,setWorking] = useState(false)
  const [reload,setReload] = useState(0)
  const [loading,setLoading] = useState(true)
  const [documents,setDocuments] = useState<IntakeDocument[]>([])
  const [advanceReceipts,setAdvanceReceipts] = useState<AdvanceReceipt[]>([])
  const [uploadFile,setUploadFile] = useState<File|null>(null)
  const [documentCategory,setDocumentCategory] = useState('Radiograph')
  const [documentSource,setDocumentSource] = useState('')
  const [paymentMethod,setPaymentMethod] = useState('Cash')
  const [paymentReference,setPaymentReference] = useState('')
  const [confirmPayment,setConfirmPayment] = useState(false)
  const [paymentRequestId,setPaymentRequestId] = useState(() => crypto.randomUUID())
  const [documentLoadError,setDocumentLoadError] = useState('')


  useEffect(()=>{
    let active=true
    setLoading(true)
    apiRequest<Intake[]>('/orthodontics/intakes')
      .then(items => { if(active) setCases(Array.isArray(items)?items:[]) })
      .catch(cause=> { if(active) setError(cause instanceof Error?cause.message:'Unable to load orthodontic intake queue.') })
      .finally(()=> { if(active) setLoading(false) })
    return ()=>{ active=false }
  },[reload])
  useEffect(()=>{
    if (!isManager) return
    apiRequest<Clinician[]>('/orthodontics/intakes/clinicians')
      .then(setClinicians).catch(()=>setClinicians([]))
  },[isManager])
  useEffect(()=>{
    if (view!=='create') return
    let active=true
    const t=window.setTimeout(()=>{
      apiRequest<{items?: Array<{id:string; firstName?:string;lastName?:string;fullName?:string}>}>(
        '/patients?q='+encodeURIComponent(search.trim())+'&pageSize=40')
        .then(response=> {
          if(!active) return
          setPatients((response.items??[]).map(patient=>({
            id:patient.id,
            name:patient.fullName || [patient.firstName,patient.lastName].filter(Boolean).join(' ') || 'Patient'
          })))
          setPatientError('')
        })
        .catch(()=>{ if(active){setPatientError('Unable to search patients.');setPatients([])} })
    },250)
    return ()=> {active=false; window.clearTimeout(t)}
  },[search,view])

  const filtered=useMemo(()=>{
    const lower=filter.toLowerCase()
    if(filter==='All') return cases
    return cases.filter(c=> filter==='New Assessments' ? c.source==='DIRECT' && c.status!=='ASSESSMENT_IN_PROGRESS'
      : filter==='Internal Referrals' ? c.source==='INTERNAL'
      : filter==='Transfer-In Reviews' ? c.source==='TRANSFER_IN'
      : filter==='Assessment In Progress' ? c.status==='ASSESSMENT_IN_PROGRESS'
      : filter==='Financial Interventions' ? c.status==='PAYMENT_PENDING' || c.advancePolicy==='REVIEW_REQUIRED'
      : c.status.toLowerCase().includes(lower))
  },[cases,filter])

  async function run(action:()=>Promise<unknown>, successText:string): Promise<boolean> {
    setWorking(true);setError('');setSuccess('')
    try {
      await action()
      setSuccess(successText)
      setReload(i=>i+1)
      return true
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Could not save orthodontic intake.')
      return false
    } finally {setWorking(false)}
  }

  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!form.patientId) { setError('Select an existing patient first.');return }
    const saved = await run(()=>apiRequest('/orthodontics/intakes','POST',{
      ...form,previousTreatmentStartDate:form.previousTreatmentStartDate||null
    }), 'Intake queued against the existing patient record. No treatment or payment was created.')
    if (saved) setView('queue')
  }
  async function inspect(item:Intake) {
    setSelected(item);setView('review');setReviewTab('Overview');setError('');setSuccess('')
    setHistoryVerified(item.historyVerifiedByClinician)
    setMissing(missingItems(item.missingDocumentsJson).join('\n'))
    setNextAction(item.nextAction??'')
    setDueDate(item.dueDate?.slice(0,10)??'')
    setPolicy(item.advancePolicy)
    setDetail(null)
    setApprovedTerms(null)
    setSignerName('')
    setSignatureData('')
    setTermsAcknowledged(false)
    setUploadFile(null)
    setDocuments([])
    setAdvanceReceipts([])
    setDocumentLoadError('')
    setPaymentMethod('Cash')
    setPaymentReference('')
    setConfirmPayment(false)
    setPaymentRequestId(crypto.randomUUID())
  }
  useEffect(()=>{
    if(view !== 'review' || !selected?.termsApplicable || selected.termsAcceptedAtUtc) return
    let active=true
    apiRequest<{available:boolean;version?:string;fullText?:string;sha256?:string;message?:string}>('/orthodontics/intakes/approved-terms')
      .then(data=>{if(active)setApprovedTerms(data)})
      .catch(()=>{if(active)setApprovedTerms({available:false,message:'Unable to load approved intake terms.'})})
    return ()=>{active=false}
  },[view,selected?.id,selected?.termsApplicable,selected?.termsAcceptedAtUtc])

  const selectedId=selected?.id
  useEffect(() => {
    if (view !== 'review' || !selected?.id) return
    let active = true
    const id = selected.id
    const load = async () => {
      try {
        const [record, docs, receipts] = await Promise.all([
          apiRequest<IntakeDetail>('/orthodontics/intakes/' + encodeURIComponent(id)),
          apiRequest<IntakeDocument[]>('/orthodontics/intakes/' + encodeURIComponent(id) + '/documents'),
          isDentist ? Promise.resolve([] as AdvanceReceipt[]) :
            apiRequest<AdvanceReceipt[]>('/orthodontics/intakes/' + encodeURIComponent(id) + '/advance')
        ])
        if (!active) return
        setDetail(record)
        setDocuments(docs)
        setAdvanceReceipts(receipts)
        setDocumentLoadError('')
        setSelected(previous => previous?.id === id ? { ...previous, ...record } : previous)
      } catch (cause) {
        if (active) setDocumentLoadError(cause instanceof Error ? cause.message :
          'Unable to load patient intake documents.')
      }
    }
    void load()
    return () => { active = false }
  }, [view, selected?.id, reload, isDentist])

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId || !uploadFile) return
    const data = new FormData()
    data.append('file',uploadFile)
    data.append('category',documentCategory)
    data.append('sourceProvider',documentSource)
    const saved = await run(
      () => apiUpload('/orthodontics/intakes/' + selectedId + '/documents', data),
      'Clinical document uploaded to the patient intake. Specialist review is still required.')
    if (saved) { setUploadFile(null); setDocumentSource('') }
  }

  async function downloadDocument(file: IntakeDocument) {
    if (!selectedId) return
    await run(() => apiDownload('/orthodontics/intakes/' + selectedId +
      '/documents/' + file.id + '/file', file.originalFileName),
      'Document downloaded securely.')
  }

  async function downloadSignedTerms() {
    if (!selectedId) return
    await run(() => apiDownload('/orthodontics/intakes/' + selectedId +
      '/signed-terms.pdf', 'orthodontic-intake-' + selectedId + '.pdf'),
      'Signed versioned intake PDF downloaded.')
  }

  async function recordAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId || !confirmPayment) return
    const saved = await run(() => apiRequest(
      '/orthodontics/intakes/' + selectedId + '/advance','POST',{
        requestId:paymentRequestId,amount:2500,method:paymentMethod,
        reference:paymentMethod==='Cash'?null:paymentReference.trim(),
        confirmFundsReceived:confirmPayment
      }), 'The actual R2,500 advance was recorded once as patient credit. Print or download the verified receipt.')
    if (saved) { setConfirmPayment(false); setPaymentRequestId(crypto.randomUUID()) }
  }


  const change=(key:keyof CreateForm,value:string)=>setForm(old=>({...old,[key]:value}))
  const showPatient=(patientId:string)=>onOpenPatient?.(patientId)

  return <div className="ct-ortho-intake">
    <header className="ct-ortho-intake-header">
      <div><span>CURVTAB DENTAL · ORTHODONTICS · PHASE 1</span>
        <h2>Orthodontic Intake & Case Routing</h2>
        <p>{isDentist ? 'Your assigned orthodontic patients only.' : 'Route existing patients to a specialist without registering them again.'}</p>
      </div>
      <div className="ct-ortho-intake-header-buttons">
        <button type="button" className="secondary-button" disabled={loading}
          onClick={()=>{setError('');setReload(i=>i+1)}}><RefreshCw size={14}/> Refresh</button>
        <button type="button" className="primary-button"
          onClick={()=>{setError('');setSuccess('');setForm({...newForm(),source:isDentist?'INTERNAL':'TRANSFER_IN'});setView('create')}}><Plus size={14}/> Add intake</button>
      </div>
    </header>
    {error && <div className="ct-ortho-intake-error" role="alert">{error}</div>}
    {success && <div className="ct-ortho-intake-success" role="status">{success}</div>}
    {view==='create' && <section className="ct-ortho-intake-dialog">
      <div className="ct-ortho-intake-section-title"><h3>New intake for an existing patient</h3>
        <button type="button" onClick={()=>setView('queue')}>Close</button></div>
      <form className="ct-ortho-intake-form" onSubmit={create}>
        <label>Entry route
          <select value={form.source} onChange={e=>change('source',e.target.value)}>
            {(isDentist ? ['INTERNAL'] : ['DIRECT','TRANSFER_IN']).map(k=><option key={k} value={k}>{sourceName(k as IntakeSource)}</option>)}
          </select>
        </label>
        <label>Find an existing patient
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by patient name or ID" />
        </label>
        {patientError && <p role="alert">{patientError}</p>}
        <label>Patient (same CurvTab record)
          <select required value={form.patientId} onChange={e=>change('patientId',e.target.value)}>
            <option value="">Select registered patient</option>
            {patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {form.source==='DIRECT' && <p className="ct-ortho-intake-hint">
          Direct intake uses the Orthodontic patient = Yes answer already saved during registration. Existing cases will not be duplicated.
        </p>}
        {form.source==='INTERNAL' && <>
          <label>Reason for orthodontic referral *<textarea required maxLength={1000} value={form.referralReason}
            onChange={e=>change('referralReason',e.target.value)}/></label>
          <label>Clinician notes (optional)<textarea maxLength={4000} value={form.referralNotes}
            onChange={e=>change('referralNotes',e.target.value)}/></label>
        </>}
        {form.source==='TRANSFER_IN' && <>
          <label>Previous orthodontist or practice *<input required maxLength={250} value={form.previousProvider} onChange={e=>change('previousProvider',e.target.value)}/></label>
          <label>Existing appliances (if known)<input maxLength={1000} value={form.existingAppliances} onChange={e=>change('existingAppliances',e.target.value)}/></label>
          <label>Approximate previous treatment start date<input type="date" value={form.previousTreatmentStartDate} onChange={e=>change('previousTreatmentStartDate',e.target.value)}/></label>
          <label>Reason for transfer *<textarea required maxLength={2000} value={form.transferReason} onChange={e=>change('transferReason',e.target.value)}/></label>
          <label>Previous plan (if known)<textarea maxLength={4000} value={form.previousTreatmentPlanSummary} onChange={e=>change('previousTreatmentPlanSummary',e.target.value)}/></label>
          <label>Records supplied / unavailable<textarea maxLength={4000} value={form.previousRecordsSummary} onChange={e=>change('previousRecordsSummary',e.target.value)}/></label>
          <label>Urgent clinical concerns (if any)<textarea maxLength={2000} value={form.urgentConcerns} onChange={e=>change('urgentConcerns',e.target.value)}/></label>
          <p className="ct-ortho-intake-hint">Transferred treatment requires independent specialist acceptance. No external treatment plan or outstanding debt will be imported.</p>
        </>}
        <div className="ct-ortho-intake-actions"><button type="submit" className="primary-button" disabled={working}>{working?'Saving…':'Queue orthodontic intake'}</button>
          <button type="button" className="secondary-button" onClick={()=>setView('queue')}>Cancel</button></div>
      </form>
    </section>}

    {view==='review' && selected && <section className="ct-ortho-intake-dialog">
      <div className="ct-ortho-intake-section-title">
        <div><h3>{selected.patientName}</h3><p>{sourceName(selected.source)} · {stateLabel(selected.status)}</p></div>
        <button type="button" onClick={()=>setView('queue')}>Back to queue</button>
      </div>
      <div className="ct-ortho-intake-facts">
        <div><strong>Current next action</strong><span>{selected.nextAction||'Specialist review required'}</span></div>
        <div><strong>Assigned</strong><span>{clinicians.find(c=>c.id===selected.assignedOrthodontistUserId)?.name|| (selected.assignedOrthodontistUserId ? 'Assigned clinician' : 'Not assigned')}</span></div>
        <div><strong>Advance policy</strong><span>{selected.advancePolicy.replaceAll('_',' ')} (no payment implied)</span></div>
        <div><strong>Consent terms</strong><span>{selected.termsAcceptedAtUtc?'Versioned signature recorded':'Not yet signed'}</span></div>
      </div>
      <nav className="ct-ortho-review-tabs" aria-label="Orthodontic intake sections">
        {(['Overview','Documents','Consent & Payments', ...(isDentist?['Clinical Review']:[])] as Array<'Overview'|'Documents'|'Consent & Payments'|'Clinical Review'>).map(tab=>
          <button type="button" key={tab} className={reviewTab===tab?'is-active':''}
            onClick={()=>setReviewTab(tab)}>{tab}</button>
        )}
      </nav>
      {reviewTab==='Overview' && detail && <div className="ct-ortho-intake-details">
        {detail.patientProfile && <p><strong>Patient:</strong> {detail.patientProfile.patientName} ·
          DOB {detail.patientProfile.dateOfBirth ?? 'Unknown'} ·
          Payment category: {detail.patientProfile.paymentMethod}</p>}
        {detail.responsiblePerson && <p><strong>Responsible person / payer:</strong>
          {' '}{detail.responsiblePerson.responsibleName||'Not specified'} ·
          {' '}{detail.responsiblePerson.responsibleRelationship||'Relationship to verify'} ·
          {' '}{detail.responsiblePerson.responsiblePhone||'Phone missing'} ·
          Guardian authority: {detail.responsiblePerson.guardianConsent===true?'Recorded (verify identity)':'Not verified'}</p>}
        {detail.nextVisit && <p><strong>Next appointment:</strong>
          {' '}{new Date(detail.nextVisit.startUtc).toLocaleString('en-ZA')} · {detail.nextVisit.status}
          {' '}{detail.nextVisit.reason||''}</p>}
        {!detail.nextVisit && <p><strong>Next appointment:</strong> Not scheduled in the current clinical queue.</p>}
        {isDentist && detail.medicalHistory && <details><summary>Patient-supplied medical and dental history (clinical verification required)</summary>
          <p><strong>Allergies:</strong> {detail.medicalHistory.allergies||'Not recorded'}</p>
          <p><strong>Medications:</strong> {detail.medicalHistory.currentMedications||'Not recorded'}</p>
          <p><strong>Medical conditions:</strong> {detail.medicalHistory.medicalConditions||'Not recorded'}</p>
          <p><strong>Dental history:</strong> {detail.medicalHistory.dentalHistory||'Not recorded'}</p>
          <p><strong>Additional notes:</strong> {detail.medicalHistory.additionalNotes||'Not recorded'}</p>
        </details>}

        {detail.referralReason && <p><strong>Referral:</strong> {detail.referralReason}</p>}
        {detail.referralNotes && <p><strong>Referring clinician notes:</strong> {detail.referralNotes}</p>}
        {detail.previousProvider && <p><strong>Previous provider:</strong> {detail.previousProvider}</p>}
        {detail.existingAppliances && <p><strong>Existing appliances:</strong> {detail.existingAppliances}</p>}
        {detail.transferReason && <p><strong>Transfer reason:</strong> {detail.transferReason}</p>}
        {detail.previousRecordsSummary && <p><strong>Records supplied:</strong> {detail.previousRecordsSummary}</p>}
        {detail.urgentConcerns && <p><strong>Urgent concerns:</strong> {detail.urgentConcerns}</p>}
      </div>}
      {reviewTab==='Documents' && <section className="ct-ortho-intake-evidence">
        <div className="ct-ortho-intake-section-title">
          <div><h3>Clinical documents & evidence</h3>
            <p>Linked to the existing patient. Uploads are not treated as verified findings.</p>
          </div>
          <span>{documents.length} file(s)</span>
        </div>
        {documentLoadError && <p role="alert" className="ct-ortho-intake-error">{documentLoadError}</p>}
        {documents.length===0 ? <p className="ct-ortho-intake-hint">No supporting documents uploaded. Use the missing-items checklist below.</p> :
          <div className="ct-ortho-intake-doc-list">{documents.map(file=><div key={file.id} className="ct-ortho-intake-doc">
            <div><strong>{file.originalFileName}</strong>
              <small>{file.category} · {Math.ceil(file.sizeBytes/1024)} KB · {file.reviewedAtUtc?'Clinically reviewed':'Review pending'}</small>
              {file.sourceProvider && <small>Source: {file.sourceProvider}</small>}
            </div>
            <button type="button" className="secondary-button" disabled={working} onClick={()=>void downloadDocument(file)}>Download</button>
            {isDentist && !file.reviewedAtUtc &&
              <button type="button" className="secondary-button" disabled={working}
                onClick={()=>void run(()=>apiRequest('/orthodontics/intakes/'+selectedId+
                  '/documents/'+file.id+'/verify','PATCH',{}),'Document provenance clinically reviewed.')}>Mark reviewed</button>}
          </div>)}</div>}
        <form className="ct-ortho-intake-doc-form" onSubmit={uploadDocument}>
          <label>Document type
            <select value={documentCategory} onChange={e=>setDocumentCategory(e.target.value)}>
              {['Referral','TransferRecords','Radiograph','Photo','MedicalHistory','GuardianAuthority','Other'].map(x=><option key={x} value={x}>{x==='TransferRecords'?'Transfer records':x==='MedicalHistory'?'Medical history':x==='GuardianAuthority'?'Guardian authority':x}</option>)}
            </select>
          </label>
          <label>Source / previous provider (if known)
            <input value={documentSource} maxLength={250} onChange={e=>setDocumentSource(e.target.value)} placeholder="Practice or provider supplying records"/>
          </label>
          <label>PDF or clinical image, maximum 6 MB
            <input key={reload} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
              onChange={e=>setUploadFile(e.target.files?.[0]??null)} required/>
          </label>
          <button type="submit" className="primary-button" disabled={working || !uploadFile}>Upload evidence</button>
        </form>
      </section>}
      {reviewTab==='Consent & Payments' && selected.termsAcceptedAtUtc && <div className="ct-ortho-intake-signed">
        <div><strong>Signed electronic intake terms</strong><small>Exact recorded version, time, signer and checksum preserved.</small></div>
        <button type="button" className="secondary-button" disabled={working}
          onClick={()=>void downloadSignedTerms()}>Download signed PDF</button>
      </div>}
      {reviewTab==='Consent & Payments' && !isDentist && <section className="ct-ortho-intake-evidence">
        <h3>Initial orthodontic advance</h3>
        <p className="ct-ortho-intake-hint">For the standard assessment, R2,500 is a patient credit toward an agreed braces quotation. Transfer-in exceptions need an approved policy. Never record money that has not been received.</p>
        {advanceReceipts.map(r=><div key={r.id} className="ct-ortho-intake-signed">
          <div><strong>{r.receiptNumber} · R {r.amount.toLocaleString('en-ZA',{minimumFractionDigits:2})}</strong>
            <small>{r.method} · {new Date(r.receivedAtUtc).toLocaleString('en-ZA')} · Unallocated patient credit R {r.creditAvailable.toFixed(2)}</small></div>
          <button type="button" className="secondary-button" onClick={()=>void run(
            ()=>apiDownload('/orthodontics/intakes/'+selectedId+'/advance/'+r.id+'/receipt.pdf',
              r.receiptNumber+'.pdf'),'Official payment receipt downloaded.')}>Download receipt PDF</button>
        </div>)}
        {advanceReceipts.length===0 && selected.advancePolicy==='STANDARD_R2500' && selected.termsAcceptedAtUtc &&
          <form className="ct-ortho-intake-payment" onSubmit={recordAdvance}>
            <label>Received amount <input disabled readOnly value="R 2 500,00" /></label>
            <label>Tender method
              <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>
                <option value="Cash">Cash</option><option value="Card">Card</option><option value="EFT">EFT</option>
              </select>
            </label>
            {paymentMethod!=='Cash' && <label>Verified terminal / EFT reference
              <input required value={paymentReference} maxLength={100} onChange={e=>setPaymentReference(e.target.value)} placeholder="Never enter card numbers" />
            </label>}
            <label className="ct-ortho-intake-check ct-ortho-intake-full">
              <input type="checkbox" checked={confirmPayment} onChange={e=>setConfirmPayment(e.target.checked)}/>
              <span>I have independently confirmed that R2,500 was actually received, and the approved intake terms were signed before collection.</span>
            </label>
            <button type="submit" className="primary-button" disabled={working || !confirmPayment || (paymentMethod!=='Cash'&&!paymentReference.trim())}>Record actual advance & issue receipt</button>
          </form>}
        {advanceReceipts.length===0 && (!selected.termsAcceptedAtUtc || selected.advancePolicy!=='STANDARD_R2500') &&
          <p className="ct-ortho-intake-hint">
            {selected.advancePolicy==='REVIEW_REQUIRED'?'The advance policy has not yet been confirmed.':
              selected.advancePolicy==='NOT_APPLICABLE'?'No advance is required under the recorded exception.':
                'Approved signed terms are required before collecting R2,500.'}
          </p>}
      </section>}
      {reviewTab==='Overview' && isManager && <>
        <label className="ct-ortho-intake-assign">Assign to an authorised dentist
          <select value={selected.assignedOrthodontistUserId??''} onChange={e=>{
            const value=e.target.value
            if (!value) return
            void run(()=>apiRequest('/orthodontics/intakes/'+selectedId+'/assign','PATCH',{orthodontistUserId:value}),
              'Specialist assigned. Refresh to view updated queue.').then(saved => {
                if (saved) setSelected({...selected,assignedOrthodontistUserId:value})
              })
          }}>
            <option value="">Select dentist</option>
            {clinicians.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <button type="button" className="secondary-button" disabled={working} onClick={()=>run(
          ()=>apiRequest('/orthodontics/intakes/sync-classifications','POST',{}),
          'Previously classified patients routed without duplicate registrations.')}>
          Route previously classified patients
        </button>
      </>}
      {reviewTab==='Consent & Payments' && isManager &&         <div className="ct-ortho-intake-policy">
          <label>Advance policy
            <select value={policy} onChange={e=>setPolicy(e.target.value)}>
              <option value="STANDARD_R2500">Standard R2,500 assessment advance</option>
              <option value="REVIEW_REQUIRED">Needs policy review</option>
              <option value="NOT_APPLICABLE">Not applicable (approved exception)</option>
            </select>
          </label>
          <label>Reason for decision<input value={policyReason} onChange={e=>setPolicyReason(e.target.value)} maxLength={500}/></label>
          <button type="button" className="secondary-button" disabled={working||!policyReason.trim()}
            onClick={()=>run(()=>apiRequest('/orthodontics/intakes/'+selectedId+'/advance-policy','PATCH',
              {policy,reason:policyReason}), 'Policy decision recorded. No money has been collected.')}>Save policy</button>
        </div>}
      {reviewTab==='Consent & Payments' && selected.termsApplicable && !selected.termsAcceptedAtUtc && <details className="ct-ortho-terms">
        <summary>Electronic intake and advance terms · approval required</summary>
        {!approvedTerms ? <p>Checking approved document…</p>
          : !approvedTerms.available || !approvedTerms.version || !approvedTerms.fullText ?
            <p className="ct-ortho-intake-hint">{approvedTerms.message || 'Approved legal terms must be published by the practice before signatures can be collected.'}</p>
          : <>
            <div className="ct-ortho-terms-version">Version {approvedTerms.version} · integrity checksum: {approvedTerms.sha256}</div>
            <div className="ct-ortho-terms-document" tabIndex={0} aria-label="Approved orthodontic intake terms">
              {approvedTerms.fullText}
            </div>
            <div className="ct-ortho-terms-sign">
              <label>Full name of authorised person signing
                <input required value={signerName} maxLength={200}
                  onChange={e=>setSignerName(e.target.value)}/>
              </label>
              <label>Authority to sign
                <select value={signerCapacity}
                  onChange={e=>setSignerCapacity(e.target.value as 'Patient'|'ParentOrGuardian'|'Representative')}>
                  <option value="ParentOrGuardian">Parent or verified guardian</option>
                  <option value="Patient">Adult patient</option>
                  <option value="Representative">Legally authorised representative</option>
                </select>
              </label>
            </div>
            <SignaturePad label="Electronic intake agreement signature" value={signatureData} onChange={setSignatureData}/>
            <label className="ct-ortho-intake-check">
              <input type="checkbox" checked={termsAcknowledged} onChange={e=>setTermsAcknowledged(e.target.checked)}/>
              <span>I have read this exact intake-terms version and confirm my authority to sign. This is not the final orthodontic treatment contract.</span>
            </label>
            <button type="button" className="primary-button"
              disabled={working || !termsAcknowledged || !signerName.trim() || !signatureData}
              onClick={()=>{void run(()=>apiRequest('/orthodontics/intakes/'+selectedId+'/sign-terms','POST',{
                version:approvedTerms.version,signerName,signerCapacity,
                signatureDataUrl:signatureData,acceptanceMethod:'DrawnSignature'
              }), 'Exact approved intake document was signed and recorded. No payment was created.').then(saved=>{
                if(saved && selected) setSelected({...selected,termsAcceptedAtUtc:new Date().toISOString()})
              })}}>Sign approved intake terms</button>
          </>}
      </details>}
      {isDentist && reviewTab==='Clinical Review' && <>
        <div className="ct-ortho-intake-clinical">
          <h4>Clinical readiness review</h4>
          <label className="ct-ortho-intake-check">
            <input type="checkbox" checked={historyVerified} onChange={e=>setHistoryVerified(e.target.checked)}/>
            <span>I personally reviewed and verified this patient's clinical history.</span>
          </label>
          <label>Missing documents / actions (one per line)<textarea value={missing} onChange={e=>setMissing(e.target.value)} rows={4}/></label>
          <label>Next clinical action<input value={nextAction} maxLength={500} onChange={e=>setNextAction(e.target.value)}/></label>
          <label>Due date<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
          <button type="button" className="primary-button" disabled={working} onClick={()=>run(
            ()=>apiRequest('/orthodontics/intakes/'+selectedId+'/review','PATCH',{
              historyVerified,missingDocumentsJson:JSON.stringify(missing.split('\n').map(x=>x.trim()).filter(Boolean)),
              nextAction,dueDate:dueDate||null
            }), 'Readiness review saved; missing evidence remains explicitly pending.')}>Save clinical review</button>
          {selected.status==='ASSESSMENT_READY' && <button type="button" className="secondary-button" disabled={working}
            onClick={()=>run(()=>apiRequest('/orthodontics/intakes/'+selectedId+'/begin-assessment','POST',{}),
              'Specialist assessment started.')}>Begin assessment</button>}
        </div>
      </>}
      <div className="ct-ortho-intake-hint">
        <ShieldCheck size={15}/> Phase 1 does not activate a braces treatment agreement or instalment plan.
        Standard advances require approved guardian/payer terms and an actual existing-ledger receipt.
        A missing document is not treated as a negative finding.
      </div>
      {reviewTab==='Overview' && onOpenPatient && <button type="button" className="secondary-button" onClick={()=>showPatient(selected.patientId)}>Open existing patient record</button>}
    </section>}

    {view==='queue' && <>
      <div className="ct-ortho-intake-metrics">
        <div><Users size={16}/><span>Open intakes</span><strong>{loading?'…':cases.length}</strong></div>
        <div><ClipboardCheck size={16}/><span>Ready for assessment</span><strong>{loading?'…':cases.filter(c=>c.status==='ASSESSMENT_READY').length}</strong></div>
        <div><UserRoundCheck size={16}/><span>Unassigned</span><strong>{loading?'…':cases.filter(c=>!c.assignedOrthodontistUserId).length}</strong></div>
        <div><FileText size={16}/><span>Records pending</span><strong>{loading?'…':cases.filter(c=>c.status==='RECORDS_PENDING').length}</strong></div>
      </div>
      <div className="ct-ortho-intake-toolbar">
        <label>Queue
          <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="All">All assigned / authorized intakes</option>
            {initialList.map(label=><option key={label}>{label}</option>)}
          </select>
        </label>
        {isManager && <button type="button" className="secondary-button" disabled={working} onClick={()=>run(
          ()=>apiRequest('/orthodontics/intakes/sync-classifications','POST',{}),
          'Previously classified patients routed. Refresh to see the new queue.')}>Sync registrations</button>}
      </div>
      {loading ? <p className="ct-ortho-intake-empty">Loading orthodontic intake…</p>
        : filtered.length===0 ? <p className="ct-ortho-intake-empty">
          {isDentist?'No orthodontic intakes are currently assigned to your account.':'No cases in this queue.'}
        </p> :
        <div className="ct-ortho-intake-rows">{filtered.map(item=><button type="button" key={item.id}
          className="ct-ortho-intake-row" onClick={()=>inspect(item)}>
          <div><strong>{item.patientName}</strong><small>{sourceName(item.source)} · {stateLabel(item.status)}</small></div>
          <div><span>{item.assignedOrthodontistUserId?'Assigned specialist':'Assignment required'}</span>
            <small>{item.nextAction||'Review intake readiness'}</small></div>
          <div><span>{item.dueDate?.slice(0,10)||'No due date'}</span>
            <small>{missingItems(item.missingDocumentsJson).length} missing item(s){item.urgentConcerns?' · Urgent concerns':''}</small></div>
        </button>)}</div>}
    </>}
  </div>
}
