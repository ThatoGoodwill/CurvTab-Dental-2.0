import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import './BillingClientGuide.css'
type ClaimRow={id:string;patientId:string;patientName:string;schemeName:string;status:string;claimNumber:string;claimedAmount:number;attemptsOnDate:number}
type Day={businessDate:string;signed:boolean;status:string;patientsTreated:number;uniqueClaims:number;submissionAttempts:number;submittedValue:number;actionsPending:number;claims?:ClaimRow[];snapshotJson?:string;signedAtUtc?:string;note?:string}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const money=(n:number)=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n)
export default function BillingMedicalAidDaySignoffPage({ businessDate }: { businessDate?: string }){
  const [date,setDate]=useState(businessDate ?? today())
  const [reload,setReload]=useState(0)
  const [day,setDay]=useState<Day|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [checks,setChecks]=useState([false,false,false,false])
  useEffect(()=>{
    let active=true;setLoading(true);setError('')
    fetch(`/api/billing/medical-aid-day-signoff?date=${date}`,{credentials:'include',cache:'no-store'})
      .then(async res=>{if(!res.ok)throw new Error(`Unable to load claim activity (${res.status})`);return res.json() as Promise<Day>})
      .then(v=>{if(active)setDay(v)})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Unable to load medical-aid activity')})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[date,reload])
  const snapshot=day?.signed&&day.snapshotJson?JSON.parse(day.snapshotJson) as Day:null
  const claims=day?.signed?(snapshot?.claims??[]):day?.claims??[]
  async function sign(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!checks.every(Boolean)||busy)return
    setBusy(true);setError('');setNotice('')
    try{
      const res=await fetch('/api/billing/medical-aid-day-signoff',{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({businessDate:date,encountersAccountedFor:checks[0],responsesRecorded:checks[1],
          exceptionsListed:checks[2],noCashReceiptsGenerated:checks[3]})
      })
      if(!res.ok){const d=await res.json().catch(()=>null) as {message?:string}|null;throw new Error(d?.message??`Sign-off failed (${res.status})`)}
      setDay(await res.json() as Day);setNotice('Medical Aid Day Sign-Off has been frozen and audited.')
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to sign off')}
    finally{setBusy(false)}
  }
  return <section className="ct-guide-page">
    <header className="ct-guide-heading"><div><small>BILLING / MEDICAL AID</small><h2>Medical Aid Day Sign-Off</h2>
      <p>Confirm claim submission activity independently from physical cash.</p></div>
      <div className="ct-guide-heading-tools"><label>Business date<input type="date" value={date} max={today()} onChange={e=>{setDate(e.target.value);setChecks([false,false,false,false])}}/></label>
        <button type="button" className="secondary-button" disabled={loading} onClick={()=>setReload(x=>x+1)}><RefreshCw size={15}/> Refresh</button></div>
    </header>
    {error&&<p className="ct-guide-error" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <p className="ct-guide-status">Medical-aid day status: {loading?'Loading…':day?.signed?'Signed — immutable':'Open'}</p>
    <div className="ct-guide-kpis">
      <article><span>Patients treated</span><strong>{day?.patientsTreated??'—'}</strong><small>Visit activity on the selected day</small></article>
      <article><span>Unique claims</span><strong>{day?.uniqueClaims??'—'}</strong><small>{day?.submissionAttempts??'—'} submission attempts</small></article>
      <article><span>Submitted value</span><strong>{day?money(day.submittedValue):'—'}</strong><small>Claims activity — NOT cash</small></article>
      <article><span>Actions pending</span><strong>{day?.actionsPending??'—'}</strong><small>Draft, rejected or correction work</small></article>
    </div>
    <div className="ct-guide-columns">
      <section className="ct-guide-panel"><h3>Today's claim submissions</h3>
        <p>Each logical claim is counted once, even when it has multiple attempts. Later rejections do not change a signed day's snapshot.</p>
        <div className="ct-guide-scroll"><table><thead><tr><th>Patient</th><th>Scheme</th><th>Claim</th><th>Attempts</th><th>Value</th></tr></thead>
          <tbody>{claims.map(c=><tr key={c.id}><td>{c.patientName}</td><td>{c.schemeName}</td><td>{c.claimNumber}</td><td>{c.attemptsOnDate}</td><td>{money(c.claimedAmount)}</td></tr>)}
            {!claims.length&&<tr><td colSpan={5}>{loading?'Loading…':'No claim submissions on this date.'}</td></tr>}
          </tbody></table></div>
      </section>
      <aside className="ct-guide-panel"><h3>Pre-sign-off checklist</h3>
        <p>A signed day is frozen. New scheme responses are recorded against the original claim on their actual event dates.</p>
        {day?.signed?<div><p><ShieldCheck size={16}/> Snapshot signed {day.signedAtUtc?new Date(day.signedAtUtc).toLocaleString('en-ZA'):''}</p>
          <p className="ct-guide-warning">No cash receipts were created by this sign-off.</p></div>:
          <form className="ct-guide-form" onSubmit={e=>void sign(e)}>
            <div className="ct-guide-checks">{[
              'All encounters have been accounted for',
              'Submission responses have been recorded',
              'Exceptions are listed for follow-up',
              'No cash receipts are generated by claims submission',
            ].map((label,i)=><label key={label}><input type="checkbox" checked={checks[i]} onChange={e=>setChecks(c=>c.map((v,j)=>i===j?e.target.checked:v))}/>{label}</label>)}</div>
            <button type="submit" className="primary-button" disabled={busy||!checks.every(Boolean)}>{busy?'Signing…':'Submit Medical Aid Sign-Off'}</button>
          </form>}
      </aside>
    </div>
  </section>
}
