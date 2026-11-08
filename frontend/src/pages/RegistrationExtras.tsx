import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import './RegistrationExtras.css'

export interface RegistrationExtrasState {
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
const answers = ['Unknown','No','Yes']
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
      <Field label="Responsible person ID / passport (optional)" value={v.responsibleIdNumber} onChange={s=>update(v,cb,'responsibleIdNumber',s)}/>
      <Field label="Responsible person's address" maxLength={500} value={v.responsibleAddress} onChange={s=>update(v,cb,'responsibleAddress',s)}/>
      <Field label="Home telephone (optional)" type="tel" value={v.homePhone} onChange={s=>update(v,cb,'homePhone',s)}/>
      <Field label="Work telephone (optional)" type="tel" value={v.workPhone} onChange={s=>update(v,cb,'workPhone',s)}/>
      <Field label="Occupation (optional)" value={v.occupation} onChange={s=>update(v,cb,'occupation',s)}/>
      <Field label="Employer (optional)" value={v.employer} onChange={s=>update(v,cb,'employer',s)}/>
    </div>
  </section>
}
export function RegistrationMedicalScreen({value:v,onChange:cb}:Omit<Props,'isMinor'>) {
  const questionFields: Array<[keyof RegistrationExtrasState,string]> = [
    ['diabetes','Diabetes'],['hypertension','High blood pressure'],
    ['bleedingDisorder','Bleeding disorder / anticoagulants'],
    ['heartCondition','Heart condition'],['infectiousCondition','Relevant infectious conditions'],
  ]
  return <section className="ct-wizard-section ct-reg-section"><h3>Step 4 — Patient-supplied medical history</h3>
    <p>Ask the patient or guardian. These answers are confidential and must be reviewed and verified by a dentist. Select “Unknown” when unsure.</p>
    <div className="ct-reg-grid">
      {questionFields.map(([key,label])=><label key={key} className="ct-reg-label">{label}<select value={String(v[key])} onChange={e=>update(v,cb,key,e.target.value)}>{answers.map(a=><option key={a}>{a}</option>)}</select></label>)}
      <label className="ct-reg-label">Pregnancy / relevant considerations (optional)<select value={v.pregnancy} onChange={e=>update(v,cb,'pregnancy',e.target.value)}>{['Not disclosed','No','Yes','Not applicable','Unsure'].map(s=><option key={s}>{s}</option>)}</select></label>
    </div>
    <div className="ct-reg-grid"><TextArea label="Allergies and reactions (or none / unknown)" value={v.allergies} onChange={s=>update(v,cb,'allergies',s)}/>
      <TextArea label="Current medicines and dosages" value={v.medications} onChange={s=>update(v,cb,'medications',s)}/>
      <TextArea label="Other medical conditions / surgeries" value={v.medicalConditions} onChange={s=>update(v,cb,'medicalConditions',s)}/>
      <TextArea label="Previous dental treatment / concerns" value={v.dentalHistory} onChange={s=>update(v,cb,'dentalHistory',s)}/>
    </div>
    <TextArea label="Other clinical information supplied by patient" value={v.medicalNotes} onChange={s=>update(v,cb,'medicalNotes',s)}/>
    <p className="ct-reg-note">Only the dentist should access the saved medical history. Reception staff may capture patient-supplied answers but must not treat them as clinical diagnoses.</p>
  </section>
}
function SignaturePad({label,value,onChange}:{label:string,value:string,onChange:(v:string)=>void}) {
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
    <small>Draw with mouse, touchscreen or pen. The signature is stored with a timestamp and staff audit record.</small>
  </div>
}
export function RegistrationDeclarationScreen({value:v,onChange:cb,isMinor}:Props) {
  return <section className="ct-wizard-section ct-reg-section"><h3>Step 6 — Declaration and signatures</h3>
    <div className="ct-reg-declaration">
      <strong>Patient / parent / guardian declaration</strong>
      <p>I confirm that the information provided in this registration and medical-history form is accurate to the best of my knowledge. I understand that incomplete or incorrect medical information may affect safe dental care, and I will notify the practice of material changes.</p>
      <p>I acknowledge that the dental practice will collect, use and protect my personal and health information for patient registration, clinical care and related administration in accordance with its privacy notice and applicable law. I understand that consent for a specific dental procedure, and any required verification of guardian authority, are separate from this registration declaration.</p>
    </div>
    <label className="ct-reg-check"><input type="checkbox" checked={v.declarationAccepted} onChange={e=>update(v,cb,'declarationAccepted',e.target.checked)}/>I confirm the information supplied is accurate to the best of my knowledge. *</label>
    <label className="ct-reg-check"><input type="checkbox" checked={v.informationConsent} onChange={e=>update(v,cb,'informationConsent',e.target.checked)}/>I acknowledge the privacy notice and consent to the described processing of my personal information. *</label>
    <div className="ct-reg-grid"><Field label="Full name of person signing" required value={v.signerName} onChange={s=>update(v,cb,'signerName',s)}/>
      <label className="ct-reg-label">Signing as<select value={v.signerCapacity} onChange={e=>update(v,cb,'signerCapacity',e.target.value)}><option value="Patient">Patient</option><option value="ParentOrGuardian">Parent or guardian</option><option value="Representative">Authorised representative</option></select></label>
    </div>
    {isMinor&&<p className="ct-reg-note">Minor patient: record parent/guardian details and verify any required legal authority separately before treatment.</p>}
    <SignaturePad label="Patient / parent / guardian signature *" value={v.signatureDataUrl} onChange={s=>update(v,cb,'signatureDataUrl',s)}/>
    <Field label="Staff witness name (optional)" value={v.witnessName} onChange={s=>update(v,cb,'witnessName',s)}/>
    <SignaturePad label="Staff witness signature (optional)" value={v.witnessSignatureDataUrl} onChange={s=>update(v,cb,'witnessSignatureDataUrl',s)}/>
    <p className="ct-reg-note">A drawn signature records acknowledgement. The practice must verify identity and legal requirements; this form is not informed consent for a clinical procedure.</p>
  </section>
}
export function RegistrationExtrasReview({value:v}:{value:RegistrationExtrasState}) {
  return <div className="ct-reg-review"><h4>Responsible person</h4><p>{v.responsibleName || 'Not supplied'} — {v.responsibleRelationship || 'Relationship not supplied'}</p>
    <h4>Patient-supplied clinical information</h4><p>Allergies: {v.allergies || 'Not specified'}; Medications: {v.medications || 'Not specified'}</p>
    <p>Medical responses will be held in the dentist-only record.</p>
    <h4>Declaration</h4><p>Signed by: {v.signerName || 'Not supplied'} ({v.signerCapacity})</p>
    <p>Declaration: {v.declarationAccepted?'Acknowledged':'Not acknowledged'}; Privacy: {v.informationConsent?'Acknowledged':'Not acknowledged'}; Signature: {v.signatureDataUrl?'Captured':'Missing'}</p>
  </div>
}
