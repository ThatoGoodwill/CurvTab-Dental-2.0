import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardCheck, FileText, Plus, RefreshCw, ShieldCheck, Users, UserRoundCheck } from 'lucide-react'
import { apiRequest } from '../services/api'
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
type IntakeDocument = { id:string; category:string; originalFileName:string; sizeBytes:number; sha256:string; uploadedAtUtc:string }
type AppointmentOption = { id:string; startUtc:string; reason:string|null; status:string }
type AdvanceReceipt = { recorded:boolean; required?:boolean; amount?:number;currency:string; payment?:{
  id:string; receiptNumber:string;amount:number;method:string;receivedAtUtc:string
} }
type IntakeDetail = Intake & {
  referralReason: string | null; referralNotes: string | null
  previousProvider: string | null; existingAppliances: string | null
  previousTreatmentStartDate: string | null; previousTreatmentPlanSummary: string | null
  transferReason: string | null; previousRecordsSummary: string | null
  documentReferencesJson: string
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
const initialList = ['New Assessments','Internal Referrals','Transfer-In Reviews','Financial Interventions']

export default function OrthodonticIntakePanel({ role, onOpenPatient }: Props) {
  const isManager = role === 'PracticeAdmin'
  const isDentist = role === 'Dentist' || role === 'Orthodontist'
  const [cases,setCases] = useState<Intake[]>([])
  const [clinicians,setClinicians] = useState<Clinician[]>([])
  const [patients,setPatients] = useState<PatientOption[]>([])
  const [search,setSearch] = useState('')
  const [patientError,setPatientError] = useState('')
  const [form,setForm] = useState<CreateForm>(newForm)
  const [view,setView] = useState<'queue'|'create'|'review'>('queue')
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
  const [documents,setDocuments] = useState<IntakeDocument[]>([])
  const [docCategory,setDocCategory] = useState('XRAY')
  const [uploadFile,setUploadFile] = useState<File|null>(null)
  const [appointments,setAppointments] = useState<AppointmentOption[]>([])
  const [appointmentId,setAppointmentId] = useState('')
  const [advanceMethod,setAdvanceMethod] = useState<'Cash'|'EFT'>('Cash')
  const [bankReference,setBankReference] = useState('')
  const [fundsConfirmed,setFundsConfirmed] = useState(false)
  const [receipt,setReceipt] = useState<AdvanceReceipt|null>(null)
  const [reload,setReload] = useState(0)
  const [loading,setLoading] = useState(true)

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
    setSelected(item);setView('review');setError('');setSuccess('')
    setHistoryVerified(item.historyVerifiedByClinician)
    setMissing(missingItems(item.missingDocumentsJson).join('\n'))
    setNextAction(item.nextAction??'')
    setDueDate(item.dueDate?.slice(0,10)??'')
    setPolicy(item.advancePolicy)
    setDetail(null)
    setDocuments([])
    setReceipt(null)
    setAppointments([])
    setUploadFile(null)
    setFundsConfirmed(false)
    setBankReference('')
    setAppointmentId('')
    setApprovedTerms(null)
    setSignerName('')
    setSignatureData('')
    setTermsAcknowledged(false)
    try {
      const data=await apiRequest<IntakeDetail>('/orthodontics/intakes/'+encodeURIComponent(item.id))
      setDetail(data)
      const [docs,pay,bookings] = await Promise.all([
        apiRequest<IntakeDocument[]>('/orthodontics/intakes/'+encodeURIComponent(item.id)+'/documents'),
        (isManager || role==='Receptionist')
          ? apiRequest<AdvanceReceipt>('/orthodontics/intakes/'+encodeURIComponent(item.id)+'/advance')
          : Promise.resolve(null),
        (isManager || role==='Receptionist')
          ? apiRequest<AppointmentOption[]>('/orthodontics/intakes/'+encodeURIComponent(item.id)+'/advance/appointments')
          : Promise.resolve([])
      ])
      setDocuments(docs)
      setReceipt(pay)
      setAppointments(bookings)
      setAppointmentId(bookings[0]?.id ?? '')
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to load this intake.')}
  }
  useEffect(()=>{
    if(view !== 'review' || !selected?.termsApplicable || selected.termsAcceptedAtUtc) return
    let active=true
    apiRequest<{available:boolean;version?:string;fullText?:string;sha256?:string;message?:string}>('/orthodontics/intakes/approved-terms')
      .then(data=>{if(active)setApprovedTerms(data)})
      .catch(()=>{if(active)setApprovedTerms({available:false,message:'Unable to load approved intake terms.'})})
    return ()=>{active=false}
  },[view,selected?.id,selected?.termsApplicable,selected?.termsAcceptedAtUtc])

  async function downloadSecure(path:string, filename:string) {
    setError('')
    try {
      const response = await fetch('/api'+path,{
        credentials:'same-origin',
        headers:{'X-Requested-With':'XMLHttpRequest'}
      })
      if(!response.ok) {
        const problem=await response.json().catch(()=>null)
        throw new Error(problem?.message||problem?.title||'Download unavailable.')
      }
      const url=URL.createObjectURL(await response.blob())
      const link=document.createElement('a')
      link.href=url;link.download=filename;document.body.appendChild(link);link.click()
      link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to download private file.')}
  }
  async function uploadEvidence(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!selectedId||!uploadFile)return
    if(uploadFile.size>4_000_000){setError('Files must be 4 MB or smaller.');return}
    setWorking(true);setError('');setSuccess('')
    try {
      const formData=new FormData()
      formData.append('file',uploadFile)
      formData.append('category',docCategory)
      const response=await fetch('/api/orthodontics/intakes/'+encodeURIComponent(selectedId)+'/documents',{
        method:'POST',headers:{'X-Requested-With':'XMLHttpRequest'},credentials:'same-origin',body:formData
      })
      if(!response.ok){
        const data=await response.json().catch(()=>null)
        throw new Error(data?.message||data?.title||'Upload failed.')
      }
      setSuccess('Document saved securely to the patient intake. The specialist must still verify the content.')
      setUploadFile(null)
      const input=document.getElementById('ct-ortho-document-input') as HTMLInputElement|null
      if(input)input.value=''
      setDocuments(await apiRequest<IntakeDocument[]>('/orthodontics/intakes/'+encodeURIComponent(selectedId)+'/documents'))
    }catch(cause){setError(cause instanceof Error?cause.message:'Upload failed.')}
    finally{setWorking(false)}
  }
  async function recordAdvance() {
    if(!selectedId)return
    const saved=await run(()=>apiRequest('/orthodontics/intakes/'+encodeURIComponent(selectedId)+'/advance','POST',{
      appointmentId,method:advanceMethod,bankReference:bankReference||null,confirmedFundsReceived:fundsConfirmed
    }),'Advance recorded once in the existing billing ledger. Receipt is available below.')
    if(saved){
      setFundsConfirmed(false)
      setReceipt(await apiRequest<AdvanceReceipt>('/orthodontics/intakes/'+encodeURIComponent(selectedId)+'/advance'))
    }
  }

  const selectedId=selected?.id
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
        {role !== 'Orthodontist' && <button type="button" className="primary-button"
          onClick={()=>{setError('');setSuccess('');setForm({...newForm(),source:isDentist?'INTERNAL':'TRANSFER_IN'});setView('create')}}><Plus size={14}/> Add intake</button>}
      </div>
    </header>
    {error && <div className="ct-ortho-intake-error" role="alert">{error}</div>}
    {success && <div className="ct-ortho-intake-success" role="status">{success}</div>}
    {view==='create' && role !== 'Orthodontist' && <section className="ct-ortho-intake-dialog">
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
      {detail && <div className="ct-ortho-intake-details">
        {detail.referralReason && <p><strong>Referral:</strong> {detail.referralReason}</p>}
        {detail.referralNotes && <p><strong>Referring clinician notes:</strong> {detail.referralNotes}</p>}
        {detail.previousProvider && <p><strong>Previous provider:</strong> {detail.previousProvider}</p>}
        {detail.existingAppliances && <p><strong>Existing appliances:</strong> {detail.existingAppliances}</p>}
        {detail.transferReason && <p><strong>Transfer reason:</strong> {detail.transferReason}</p>}
        {detail.previousRecordsSummary && <p><strong>Records supplied:</strong> {detail.previousRecordsSummary}</p>}
        {detail.urgentConcerns && <p><strong>Urgent concerns:</strong> {detail.urgentConcerns}</p>}
      </div>}
      <details className="ct-ortho-intake-evidence" open>
        <summary>Clinical documents ({documents.length})</summary>
        <div className="ct-ortho-intake-doc-list">
          {documents.length===0 && <p>No evidence uploaded yet. Missing items are not treated as negative findings.</p>}
          {documents.map(doc=><div key={doc.id} className="ct-ortho-intake-document-row">
            <div><strong>{doc.originalFileName}</strong>
              <small>{doc.category.replaceAll('_',' ')} · {(doc.sizeBytes/1024).toFixed(0)} KB · SHA-256: {doc.sha256.slice(0,12)}…</small></div>
            <button type="button" className="secondary-button"
              onClick={()=>void downloadSecure('/orthodontics/intakes/'+selectedId+'/documents/'+doc.id,doc.originalFileName)}>
              Download
            </button>
          </div>)}
        </div>
        <form className="ct-ortho-intake-upload" onSubmit={uploadEvidence}>
          <label>Document type
            <select value={docCategory} onChange={e=>setDocCategory(e.target.value)}>
              <option value="XRAY">X-ray</option><option value="PHOTO">Photo</option>
              <option value="REFERRAL">Referral</option><option value="PREVIOUS_RECORD">Previous clinical record</option>
              <option value="CONSENT_EVIDENCE">Consent / guardian evidence</option>
              <option value="OTHER">Other clinical document</option>
            </select>
          </label>
          <label>PDF, PNG or JPEG (max 4 MB)
            <input id="ct-ortho-document-input" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={event=>setUploadFile(event.currentTarget.files?.[0]??null)}/>
          </label>
          <button type="submit" className="primary-button" disabled={working||!uploadFile}>Upload evidence</button>
        </form>
        <small>Documents are stored privately in the practice database, checked for integrity, and audited on download. Clinical verification remains a separate specialist action.</small>
      </details>
      {selected.termsAcceptedAtUtc && <div className="ct-ortho-signed-links">
        <strong>Signed intake agreement</strong>
        <button type="button" className="secondary-button"
          onClick={()=>void downloadSecure('/orthodontics/intakes/'+selectedId+'/signed-terms/pdf',
            'Orthodontic-Intake-'+selectedId+'.pdf')}>Download agreement PDF</button>
        <button type="button" className="secondary-button"
          onClick={()=>void downloadSecure('/orthodontics/intakes/'+selectedId+'/signed-terms/signature.png',
            'Orthodontic-Intake-Signature-'+selectedId+'.png')}>Download signature evidence</button>
      </div>}
      {(isManager||role==='Receptionist') && <details className="ct-ortho-advance-panel">
        <summary>Assessment advance · existing billing ledger</summary>
        {receipt?.recorded && receipt.payment ? <div className="ct-ortho-receipt">
          <strong>R {Number(receipt.payment.amount).toFixed(2)} received</strong>
          <span>Receipt {receipt.payment.receiptNumber} · {receipt.payment.method} · {new Date(receipt.payment.receivedAtUtc).toLocaleString('en-ZA')}</span>
          <small>Already entered in the existing appointment receipts ledger. Do not enter this payment again. It must be credited against the eventual accepted treatment quotation.</small>
        </div> : selected.advancePolicy!=='STANDARD_R2500' ?
          <p>Fee policy requires a manager decision or exemption. No automatic charge is allowed for transfer-in cases.</p>
          : !selected.termsAcceptedAtUtc ?
          <p>The R2,500 advance cannot be recorded until the approved intake terms are signed by an authorised person.</p>
          : <div className="ct-ortho-advance-form">
            <p>Only record money physically received or an EFT confirmed against the bank statement. This creates one real R2,500 receipt in the existing daily billing ledger.</p>
            <label>Existing patient appointment
              <select value={appointmentId} onChange={e=>setAppointmentId(e.target.value)}>
                <option value="">Select appointment</option>
                {appointments.map(ap=><option key={ap.id} value={ap.id}>
                  {new Date(ap.startUtc).toLocaleDateString('en-ZA')} · {ap.reason||'Dental appointment'} ({ap.status})
                </option>)}
              </select>
            </label>
            <label>Payment received by
              <select value={advanceMethod} onChange={e=>setAdvanceMethod(e.target.value as 'Cash'|'EFT')}>
                <option value="Cash">Cash (physically counted)</option>
                <option value="EFT">EFT (verified in bank)</option>
              </select>
            </label>
            {advanceMethod==='EFT' && <label>Confirmed bank reference
              <input value={bankReference} maxLength={55} onChange={e=>setBankReference(e.target.value)} />
            </label>}
            <label className="ct-ortho-intake-check">
              <input type="checkbox" checked={fundsConfirmed} onChange={e=>setFundsConfirmed(e.target.checked)}/>
              <span>I personally verified that R2,500 was actually received. I understand this creates an audited receipt and will appear in day close.</span>
            </label>
            <button type="button" className="primary-button" disabled={working||!appointmentId||!fundsConfirmed||
              (advanceMethod==='EFT'&&!bankReference.trim())}
              onClick={()=>void recordAdvance()}>Record R2,500 and issue receipt</button>
          </div>}
      </details>}
      {isManager && <>
        <label className="ct-ortho-intake-assign">Assign to an orthodontist or authorised specialist dentist
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
        <div className="ct-ortho-intake-policy">
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
        </div>
        <button type="button" className="secondary-button" disabled={working} onClick={()=>run(
          ()=>apiRequest('/orthodontics/intakes/sync-classifications','POST',{}),
          'Previously classified patients routed without duplicate registrations.')}>
          Route previously classified patients
        </button>
      </>}
      {selected.termsApplicable && !selected.termsAcceptedAtUtc && <details className="ct-ortho-terms">
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
      {isDentist && <>
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
      {onOpenPatient && <button type="button" className="secondary-button" onClick={()=>showPatient(selected.patientId)}>Open existing patient record</button>}
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
