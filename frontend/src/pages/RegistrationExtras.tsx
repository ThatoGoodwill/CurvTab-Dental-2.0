// CT_MEDICAL_NOTE_SUGGESTIONS_V1
// CT_MEDICAL_COLLAPSIBLE_NOTES_V2
// CT_PRECISE_MEDICAL_FIX_V3
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import './RegistrationExtras.css'

export interface RegistrationExtrasState {
  orthodonticPatient: boolean
  activeTreatment: string
  title: string
  middleNames: string
  preferredName: string
  previousSurname: string
  pronouns: string
  language: string
  preferredContact: string
  extraConditions: string[]
  bpMedicine: string
  bpDose: string
  bpFrequency: string
  bpControlled: string
  bpRecent: string
  diabetesType: string
  diabetesManagement: string
  diabetesMedicine: string
  diabetesDose: string
  diabetesFrequency: string
  diabetesLowSugar: string
  guardianConsent: boolean

  homePhone: string
  workPhone: string
  occupation: string
  employer: string
  responsibleName: string
  responsibleRelationship: string
  responsiblePhone: string
  responsibleEmail: string
  responsibleAddress: string
  responsibleIdNumber: string
  allergies: string
  medications: string
  medicalConditions: string
  dentalHistory: string
  medicalNotes: string
  diabetes: string
  hypertension: string
  bleedingDisorder: string
  heartCondition: string
  infectiousCondition: string
  pregnancy: string
  declarationAccepted: boolean
  informationConsent: boolean
  signerName: string
  signerCapacity: 'Patient' | 'ParentOrGuardian' | 'Representative'
  signatureDataUrl: string
  witnessName: string
  witnessSignatureDataUrl: string
}
export const initialRegistrationExtras: RegistrationExtrasState = {
  orthodonticPatient:false,activeTreatment:'Unknown',title:'',middleNames:'',preferredName:'',previousSurname:'',pronouns:'',language:'English',preferredContact:'Phone call',extraConditions:[],
  bpMedicine:'',bpDose:'',bpFrequency:'',bpControlled:'Unknown',bpRecent:'',diabetesType:'Unknown',diabetesManagement:'',diabetesMedicine:'',diabetesDose:'',diabetesFrequency:'',diabetesLowSugar:'Unknown',guardianConsent:false,
  homePhone:'',workPhone:'',occupation:'',employer:'',responsibleName:'',
  responsibleRelationship:'',responsiblePhone:'',responsibleEmail:'',
  responsibleAddress:'',responsibleIdNumber:'',allergies:'',medications:'',
  medicalConditions:'',dentalHistory:'',medicalNotes:'',diabetes:'Unknown',
  hypertension:'Unknown',bleedingDisorder:'Unknown',heartCondition:'Unknown',
  infectiousCondition:'Unknown',pregnancy:'Not disclosed',declarationAccepted:false,
  informationConsent:false,signerName:'',signerCapacity:'Patient',
  signatureDataUrl:'',witnessName:'',witnessSignatureDataUrl:''
}

type Props = { value: RegistrationExtrasState; onChange: (value: RegistrationExtrasState) => void; isMinor: boolean }

const update = (v: RegistrationExtrasState, cb: Props['onChange'], key: keyof RegistrationExtrasState, value: string|boolean) => cb({...v,[key]:value})
function Field({label, value, onChange, type='text', maxLength=200, required=false}: {label:string,value:string,onChange:(s:string)=>void,type?:string,maxLength?:number,required?:boolean}) {
  return <label className="ct-reg-label">{label}{required?' *':''}<input required={required} type={type} maxLength={maxLength} value={value} onChange={e=>onChange(e.target.value)}/></label>
}
function TextArea({label, value, onChange}: {label:string,value:string,onChange:(s:string)=>void}) {
  return <label className="ct-reg-label">{label}<textarea maxLength={4000} rows={3} value={value} onChange={e=>onChange(e.target.value)}/></label>
}
export function RegistrationResponsibleScreen({value:v,onChange:cb,isMinor}:Props) {
  return <section className="ct-wizard-section ct-reg-section"><h3>Step 3 — Responsible person and next of kin</h3>
    <p>For a minor, record the parent or guardian. This does not by itself prove legal authority to consent to treatment.</p>
    <div className="ct-reg-grid">
      <Field label="Responsible person / parent / guardian" required={isMinor} value={v.responsibleName} onChange={s=>update(v,cb,'responsibleName',s)}/>
      <Field label="Relationship to patient" required={isMinor} value={v.responsibleRelationship} onChange={s=>update(v,cb,'responsibleRelationship',s)}/>
      <Field label="Responsible person phone" required={isMinor} type="tel" value={v.responsiblePhone} onChange={s=>update(v,cb,'responsiblePhone',s)}/>
      <Field label="Responsible person email" type="email" value={v.responsibleEmail} onChange={s=>update(v,cb,'responsibleEmail',s)}/>

      <Field label="Responsible person's address" maxLength={500} value={v.responsibleAddress} onChange={s=>update(v,cb,'responsibleAddress',s)}/>
      <Field label="Home telephone (optional)" type="tel" value={v.homePhone} onChange={s=>update(v,cb,'homePhone',s)}/>
      <Field label="Work telephone (optional)" type="tel" value={v.workPhone} onChange={s=>update(v,cb,'workPhone',s)}/>
      <Field label="Occupation (optional)" value={v.occupation} onChange={s=>update(v,cb,'occupation',s)}/>
      <Field label="Employer (optional)" value={v.employer} onChange={s=>update(v,cb,'employer',s)}/>
    </div>
  </section>
}
export function RegistrationMedicalScreen({value:v,onChange:cb}:Omit<Props,'isMinor'>) {
  const other=['Asthma','Heart disease','Epilepsy / seizures','Thyroid condition','Kidney disease','Liver disease','Arthritis','Cancer / cancer treatment','Autoimmune condition','Mental health condition','Other']
  const change=(key:keyof RegistrationExtrasState,value:string)=>update(v,cb,key,value)
  const yesNo=(key:keyof RegistrationExtrasState,label:string)=>
    <label className="ct-reg-v3-question ct-medical-small-question" key={key}>
        <span>{label}</span>
        <select
          value={String(v[key])}
          onChange={ev=>change(key,ev.target.value)}
        >
          {['Unknown','No','Yes'].map(x=><option key={x}>{x}</option>)}
        </select>
      </label>
  const detail=(label:string,key:keyof RegistrationExtrasState)=>
    <Field label={label} value={String(v[key])} onChange={s=>change(key,s)}/>
  return <section className="ct-wizard-section ct-reg-section ct-reg-v3-medical">
    <h3>Medical history</h3>
    {/* CT_ORTHODONTIC_PATIENT_V1 */}
    <div className="ct-reg-orthodontic">
      <div>
        <strong>Orthodontic patient?</strong>
        <small>Is the patient receiving or registering for orthodontic treatment?</small>
      </div>
      <label className="ct-reg-orthodontic-choice">
        <input
          type="checkbox"
          role="switch"
          aria-label="Orthodontic patient"
          checked={v.orthodonticPatient}
          onChange={event =>
            cb({...v, orthodonticPatient:event.target.checked})
          }
        />
        <span>{v.orthodonticPatient ? 'Yes' : 'No'}</span>
      </label>
    </div>

    <p>Patient-supplied answers. A clinician must review and verify them before treatment.</p>
    {yesNo('heartCondition','Heart condition?')}
    <strong>Select any conditions currently being treated</strong>
    <div className="ct-reg-v3-chips">{other.map(c=><label key={c} className={v.extraConditions.includes(c)?'selected':''}><input type="checkbox" checked={v.extraConditions.includes(c)} onChange={ev=>cb({...v,extraConditions:ev.target.checked?[...v.extraConditions,c]:v.extraConditions.filter(x=>x!==c)})}/>{c}</label>)}</div>
    <div className="ct-reg-v3-condition-grid">
      <div className="ct-reg-v3-condition">
        <h4>Hypertension (high blood pressure)</h4>
        {yesNo('hypertension','Taking medication for blood pressure?')}
        {v.hypertension==='Yes'&&<div className="ct-reg-v3-mini-grid">{detail('Medication name(s)','bpMedicine')}{detail('Dose / strength','bpDose')}{detail('How often','bpFrequency')}{detail('Most recent reading (if known)','bpRecent')}
          <label className="ct-reg-label">Blood pressure controlled?<select value={v.bpControlled} onChange={ev=>change('bpControlled',ev.target.value)}>{['Unknown','No','Yes'].map(x=><option key={x}>{x}</option>)}</select></label></div>}
      </div>
      <div className="ct-reg-v3-condition">
        <h4>Diabetes</h4>
        {yesNo('diabetes','Have you been diagnosed with diabetes?')}
        {v.diabetes==='Yes'&&<div className="ct-reg-v3-mini-grid">
          <label className="ct-reg-label">Diabetes type<select value={v.diabetesType} onChange={ev=>change('diabetesType',ev.target.value)}>{['Unknown','Type 1','Type 2','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
          {detail('Management (tablets, insulin, diet, other)','diabetesManagement')}{detail('Medication name(s)','diabetesMedicine')}{detail('Dose / strength','diabetesDose')}{detail('How often','diabetesFrequency')}
          <label className="ct-reg-label">Recent low blood sugar episode?<select value={v.diabetesLowSugar} onChange={ev=>change('diabetesLowSugar',ev.target.value)}>{['Unknown','No','Yes'].map(x=><option key={x}>{x}</option>)}</select></label>
        </div>}
      </div>
    </div>
    <div className="ct-reg-v3-mini-grid">{yesNo('bleedingDisorder','Bleeding disorder / blood thinners?')}{yesNo('infectiousCondition','Relevant infectious conditions?')}</div>
    <div className="ct-reg-v3-mini-grid ct-medical-notes-small">
    <details className="ct-medical-note-fold">
      <summary>
        <span>Allergies and reactions</span>
        <span className="ct-medical-note-status">
          {v.allergies.trim() ? 'Completed' : 'Add details'}
        </span>
      </summary>
      <div className="ct-medical-note-body">
        
      <select
        className="ct-medical-note-suggestions"
        aria-label="Common responses for Allergies and reactions"
        value=""
        onChange={event => {
          const selected = event.target.value
          if (!selected) return

          const entries = v.allergies
            .split(';')
            .map(x => x.trim())
            .filter(Boolean)

          if (!entries.some(
            x => x.toLowerCase() === selected.toLowerCase()
          )) {
            change('allergies', [...entries, selected].join('; '))
          }
        }}
      >
        <option value="">Choose a common response...</option>
          <option value="Penicillin">Penicillin</option>
          <option value="Other antibiotics">Other antibiotics</option>
          <option value="Latex">Latex</option>
          <option value="Local anaesthetic">Local anaesthetic</option>
          <option value="Food allergy">Food allergy</option>
          <option value="Other allergy">Other allergy</option>
      </select>
<TextArea label="Allergies and reactions" value={v.allergies} onChange={s=>change('allergies',s)}/>
      </div>
    </details>
    
      
    <details className="ct-medical-note-fold">
      <summary>
        <span>Other medications</span>
        <span className="ct-medical-note-status">
          {v.medications.trim() ? 'Completed' : 'Add details'}
        </span>
      </summary>
      <div className="ct-medical-note-body">
        
      <select
        className="ct-medical-note-suggestions"
        aria-label="Common responses for Other medications"
        value=""
        onChange={event => {
          const selected = event.target.value
          if (!selected) return

          const entries = v.medications
            .split(';')
            .map(x => x.trim())
            .filter(Boolean)

          if (!entries.some(
            x => x.toLowerCase() === selected.toLowerCase()
          )) {
            change('medications', [...entries, selected].join('; '))
          }
        }}
      >
        <option value="">Choose a common response...</option>
          <option value="Pain medication">Pain medication</option>
          <option value="Antibiotics">Antibiotics</option>
          <option value="Blood pressure medication">Blood pressure medication</option>
          <option value="Diabetes medication">Diabetes medication</option>
          <option value="Blood thinners">Blood thinners</option>
          <option value="Other medication">Other medication</option>
      </select>
<TextArea label="Other medications" value={v.medications} onChange={s=>change('medications',s)}/>
      </div>
    </details>
    
      
    <details className="ct-medical-note-fold">
      <summary>
        <span>Other conditions and operations</span>
        <span className="ct-medical-note-status">
          {v.medicalConditions.trim() ? 'Completed' : 'Add details'}
        </span>
      </summary>
      <div className="ct-medical-note-body">
        
      <select
        className="ct-medical-note-suggestions"
        aria-label="Common responses for Other conditions and operations"
        value=""
        onChange={event => {
          const selected = event.target.value
          if (!selected) return

          const entries = v.medicalConditions
            .split(';')
            .map(x => x.trim())
            .filter(Boolean)

          if (!entries.some(
            x => x.toLowerCase() === selected.toLowerCase()
          )) {
            change('medicalConditions', [...entries, selected].join('; '))
          }
        }}
      >
        <option value="">Choose a common response...</option>
          <option value="Previous surgery">Previous surgery</option>
          <option value="Previous hospitalisation">Previous hospitalisation</option>
          <option value="Chronic medical condition">Chronic medical condition</option>
          <option value="Recent illness">Recent illness</option>
          <option value="Other condition or operation">Other condition or operation</option>
      </select>
<TextArea label="Other conditions and operations" value={v.medicalConditions} onChange={s=>change('medicalConditions',s)}/>
      </div>
    </details>
    
      
    <details className="ct-medical-note-fold">
      <summary>
        <span>Previous dental history</span>
        <span className="ct-medical-note-status">
          {v.dentalHistory.trim() ? 'Completed' : 'Add details'}
        </span>
      </summary>
      <div className="ct-medical-note-body">
        
      <select
        className="ct-medical-note-suggestions"
        aria-label="Common responses for Previous dental history"
        value=""
        onChange={event => {
          const selected = event.target.value
          if (!selected) return

          const entries = v.dentalHistory
            .split(';')
            .map(x => x.trim())
            .filter(Boolean)

          if (!entries.some(
            x => x.toLowerCase() === selected.toLowerCase()
          )) {
            change('dentalHistory', [...entries, selected].join('; '))
          }
        }}
      >
        <option value="">Choose a common response...</option>
          <option value="Previous extraction">Previous extraction</option>
          <option value="Dental fillings">Dental fillings</option>
          <option value="Root canal treatment">Root canal treatment</option>
          <option value="Gum treatment">Gum treatment</option>
          <option value="Orthodontic treatment">Orthodontic treatment</option>
          <option value="Other dental treatment">Other dental treatment</option>
      </select>
<TextArea label="Previous dental history" value={v.dentalHistory} onChange={s=>change('dentalHistory',s)}/>
      </div>
    </details>
    </div>
    <div className="ct-medical-extra-small">
        
    <details className="ct-medical-note-fold">
      <summary>
        <span>Other relevant information</span>
        <span className="ct-medical-note-status">
          {v.medicalNotes.trim() ? 'Completed' : 'Add details'}
        </span>
      </summary>
      <div className="ct-medical-note-body">
        
      <select
        className="ct-medical-note-suggestions"
        aria-label="Common responses for Other relevant information"
        value=""
        onChange={event => {
          const selected = event.target.value
          if (!selected) return

          const entries = v.medicalNotes
            .split(';')
            .map(x => x.trim())
            .filter(Boolean)

          if (!entries.some(
            x => x.toLowerCase() === selected.toLowerCase()
          )) {
            change('medicalNotes', [...entries, selected].join('; '))
          }
        }}
      >
        <option value="">Choose a common response...</option>
          <option value="Dental anxiety">Dental anxiety</option>
          <option value="Smoking or tobacco use">Smoking or tobacco use</option>
          <option value="Previous anaesthetic reaction">Previous anaesthetic reaction</option>
          <option value="Pregnancy (if applicable)">Pregnancy (if applicable)</option>
          <option value="Other information">Other information</option>
      </select>
<TextArea
          label="Other relevant information"
          value={v.medicalNotes}
          onChange={s=>change('medicalNotes',s)}
        />
      </div>
    </details>
    
      </div>
  </section>
}
export function SignaturePad({label,value,onChange}:{label:string,value:string,onChange:(v:string)=>void}) {
  const canvas=useRef<HTMLCanvasElement|null>(null)
  const drawing=useRef(false)
  const [inked,setInked]=useState(false)
  useEffect(()=>{if(!value) {setInked(false); const c=canvas.current; if(c) c.getContext('2d')?.clearRect(0,0,c.width,c.height)}},[value])
  const point=(event:PointerEvent<HTMLCanvasElement>)=>{const c=event.currentTarget;const r=c.getBoundingClientRect();return {x:(event.clientX-r.left)*c.width/r.width,y:(event.clientY-r.top)*c.height/r.height}}
  function start(e:PointerEvent<HTMLCanvasElement>){const c=e.currentTarget;c.setPointerCapture(e.pointerId);const p=point(e);const ctx=c.getContext('2d');if(!ctx)return;ctx.strokeStyle='#142c4a';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+0.1,p.y+0.1);ctx.stroke();drawing.current=true;setInked(true)}
  function move(e:PointerEvent<HTMLCanvasElement>){if(!drawing.current)return;const ctx=e.currentTarget.getContext('2d');if(!ctx)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke()}
  function end(){if(!drawing.current)return;drawing.current=false;const c=canvas.current;if(c) onChange(c.toDataURL('image/png'))}
  function clear(){drawing.current=false;onChange('');setInked(false);const c=canvas.current;if(c)c.getContext('2d')?.clearRect(0,0,c.width,c.height)}
  return <div className="ct-reg-sign"><div className="ct-reg-sign-head"><strong>{label}</strong><button type="button" onClick={clear}>Clear</button></div>
    {value&& !inked && <img className="ct-reg-sign-preview" src={value} alt="Previously captured signature" />}
    <canvas ref={canvas} width={700} height={130} aria-label={label+' draw signature'} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>
    <small>Draw with mouse, touchscreen or pen.</small>
  </div>
}
export function RegistrationDeclarationScreen({value:v,onChange:cb,isMinor}:Props) {
  return <section className="ct-wizard-section ct-reg-section"><h3>Step 6 — Declaration and signatures</h3>
    <div className="ct-reg-declaration">
      <strong>{isMinor?'Parent/guardian declaration':'Patient registration declaration'}</strong>
      <p>I confirm that the information provided in this registration and medical-history form is accurate to the best of my knowledge. I understand that incomplete or incorrect medical information may affect safe dental care, and I will notify the practice of material changes.</p>
      <p>I acknowledge that the dental practice will collect, use and protect my personal and health information for patient registration, clinical care and related administration in accordance with its privacy notice and applicable law. I understand that consent for a specific dental procedure, and any required verification of guardian authority, are separate from this registration declaration.</p>
    </div>
    {isMinor && <label className="ct-reg-check"><input type="checkbox" checked={v.guardianConsent} onChange={event=>cb({...v,guardianConsent:event.target.checked,signerCapacity:'ParentOrGuardian'})}/>I am the parent or legally authorised guardian and I acknowledge that my authority may need verification before treatment. *</label>}
    <label className="ct-reg-check"><input type="checkbox" checked={v.declarationAccepted} onChange={e=>update(v,cb,'declarationAccepted',e.target.checked)}/>I confirm the information supplied is accurate to the best of my knowledge. *</label>
    <label className="ct-reg-check"><input type="checkbox" checked={v.informationConsent} onChange={e=>update(v,cb,'informationConsent',e.target.checked)}/>I acknowledge the privacy notice and consent to the described processing of my personal information. *</label>
    <div className="ct-reg-grid"><Field label="Full name of person signing" required value={v.signerName} onChange={s=>update(v,cb,'signerName',s)}/>
      <label className="ct-reg-label">Signing as<select value={v.signerCapacity} onChange={e=>update(v,cb,'signerCapacity',e.target.value)}>{!isMinor&&<option value="Patient">Patient</option>}<option value="ParentOrGuardian">Parent or guardian</option><option value="Representative">Authorised representative</option></select></label>
    </div>
    {isMinor&&<p className="ct-reg-note">Minor patient: record parent/guardian details and verify any required legal authority separately before treatment.</p>}
    <SignaturePad label="Patient / parent / guardian signature *" value={v.signatureDataUrl} onChange={s=>update(v,cb,'signatureDataUrl',s)}/>
    
    
    
  </section>
}
export function RegistrationExtrasReview({value:v}:{value:RegistrationExtrasState}) {
  return <div className="ct-reg-review"><h4>Responsible person</h4><p>{v.responsibleName || 'Not supplied'} — {v.responsibleRelationship || 'Relationship not supplied'}</p>
    <h4>Patient-supplied clinical information</h4>
    <p>Orthodontic patient: {v.orthodonticPatient ? 'Yes' : 'No'}</p><p>Allergies: {v.allergies || 'Not specified'}; Medications: {v.medications || 'Not specified'}</p>
    <p>Medical responses will be held in the dentist-only record.</p>
    <h4>Declaration</h4><p>Signed by: {v.signerName || 'Not supplied'} ({v.signerCapacity})</p>
    <p>Declaration: {v.declarationAccepted?'Acknowledged':'Not acknowledged'}; Privacy: {v.informationConsent?'Acknowledged':'Not acknowledged'}; Signature: {v.signatureDataUrl?'Captured':'Missing'}</p>
  </div>
}
