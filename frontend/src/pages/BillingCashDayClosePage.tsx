import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Wallet, ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import './BillingClientGuide.css'

type Cash = {
  id: string; openingFloat: number; cashReceived: number; cashExpenses: number
  expectedCash: number; countedCash: number; variance: number; explanation: string | null
  evidenceReference: string | null; submittedAtUtc: string; submittedByUserId: string
}
type Decision = { id:string; decision:string; reason:string; reviewedAtUtc:string; reviewedByUserId:string }
type Close = {
  submitted: boolean; status: string; businessDate:string
  cash?: Cash; decisions?: Decision[]; note?:string
  latestCountedCash?:number; latestVariance?:number
  recounts?: Array<{id:string;revisedCountedCash:number;reason:string;evidenceReference:string;recordedAtUtc:string}>
  nonCash?: { cardReceived:number; cardExpenses:number; eftReceived:number; eftExpenses:number; notice:string }
}
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date())
const money = (n:number) => new Intl.NumberFormat('en-ZA', {style:'currency',currency:'ZAR'}).format(n)
const errorOf = async (res:Response) => {
  const body=await res.json().catch(()=>null) as {message?:string}|null
  return body?.message ?? `Unable to complete cash day close (${res.status})`
}

export default function BillingCashDayClosePage({ isManager }: { isManager:boolean }) {
  const [date,setDate]=useState(today)
  const [reload,setReload]=useState(0)
  const [data,setData]=useState<Close|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [float,setFloat]=useState('')
  const [count,setCount]=useState('')
  const [explanation,setExplanation]=useState('')
  const [evidence,setEvidence]=useState('')
  const [reviewDecision,setReviewDecision]=useState<'Approve'|'Reject'|'Escalate'>('Approve')
  const [reviewReason,setReviewReason]=useState('')
  const requestId=useRef<string|null>(null)
  const [countVisible,setCountVisible]=useState(false)
  const [reviewVisible,setReviewVisible]=useState(false)
  const [recountVisible,setRecountVisible]=useState(false)
  const [recountAmount,setRecountAmount]=useState('')
  const [recountReason,setRecountReason]=useState('')
  const [recountEvidence,setRecountEvidence]=useState('')

  useEffect(()=>{
    let active=true;setLoading(true);setError('')
    fetch(`/api/billing/cash-day-close?date=${date}`,{credentials:'include',cache:'no-store'})
      .then(async res=>{if(!res.ok)throw new Error(await errorOf(res));return res.json() as Promise<Close>})
      .then(result=>{if(active)setData(result)})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Unable to load cash close')})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[date,reload])
  const canSubmit=!data?.submitted
  const latest=data?.decisions?.at(-1)

  async function submitBlindCount(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(busy||!/^(?:\d+)(?:\.\d{1,2})?$/.test(float)||!/^(?:\d+)(?:\.\d{1,2})?$/.test(count)){
      setError('Enter a valid opening float and counted cash, with at most two decimals.');return
    }
    setBusy(true);setError('');setNotice('')
    try{
      const res=await fetch('/api/billing/cash-day-close/submit-blind-count',{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({businessDate:date,openingFloat:Number(float),countedCash:Number(count),
          explanation:explanation.trim()||null,evidenceReference:evidence.trim()||null})
      })
      if(!res.ok)throw new Error(await errorOf(res))
      const result=await res.json() as Close
      setData(result);setCountVisible(false);setNotice('First blind count saved unchanged. Manager review is now available.')
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save blind count')}
    finally{setBusy(false)}
  }
  async function submitReview(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!isManager||!data?.cash||busy)return
    requestId.current ??= crypto.randomUUID()
    setBusy(true);setError('');setNotice('')
    try{
      const res=await fetch(`/api/billing/cash-day-close/${encodeURIComponent(data.cash.id)}/review`,{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({requestId:requestId.current,decision:reviewDecision,reason:reviewReason.trim()})
      })
      if(!res.ok)throw new Error(await errorOf(res))
      requestId.current=null;setReviewVisible(false);setReviewReason('')
      setNotice('Manager decision recorded in the audit history. Original count remains unchanged.')
      setReload(v=>v+1)
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to record review')}
    finally{setBusy(false)}
  }
  async function submitRecount(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(busy||!data?.cash)return
    setBusy(true);setError('');setNotice('')
    requestId.current ??= crypto.randomUUID()
    try{
      const res=await fetch(`/api/billing/cash-day-close/${encodeURIComponent(data.cash.id)}/recount`,{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({
          requestId:requestId.current,revisedCountedCash:Number(recountAmount),
          reason:recountReason.trim(),evidenceReference:recountEvidence.trim()
        })
      })
      if(!res.ok)throw new Error(await errorOf(res))
      requestId.current=null;setRecountVisible(false);setRecountAmount('')
      setNotice('Recount recorded without changing the original. Manager must review the new amount.')
      setReload(v=>v+1)
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to record recount')}
    finally{setBusy(false)}
  }

  return <section className="ct-guide-page">
    <header className="ct-guide-heading"><div><small>BILLING / RECEPTION</small><h2>Cash Day Close</h2>
      <p>Physical cash reconciliation and independent manager exception review.</p></div>
      <div className="ct-guide-heading-tools"><label>Business date<input type="date" max={today()}
        value={date} onChange={e=>{setDate(e.target.value);setCountVisible(false)}}/></label>
        <button type="button" className="secondary-button" disabled={loading} onClick={()=>setReload(v=>v+1)}>
          <RefreshCw size={16}/> Refresh</button></div>
    </header>
    <div className="ct-guide-steps"><span>1 · Blind cash count</span><span>2 · Server variance</span><span>3 · Manager review</span></div>
    <p className="ct-guide-status">Session: {loading?'Loading…':data?.status ?? 'Unavailable'}</p>
    {error&&<p className="ct-guide-error" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!loading&&canSubmit&&<section className="ct-guide-panel">
      <h3>Blind physical count</h3>
      <p>The expected cash and variance are deliberately hidden until your count is submitted. You cannot edit the original after submission.</p>
      {!countVisible?<button type="button" className="primary-button" onClick={()=>setCountVisible(true)}>
        <Wallet size={16}/> Start Blind Cash Count</button>:
      <form className="ct-guide-form" onSubmit={e=>void submitBlindCount(e)}>
        <label>Opening float (ZAR)<input required inputMode="decimal" value={float}
          onChange={e=>setFloat(e.target.value)} placeholder="500.00"/></label>
        <label>Physically counted cash (ZAR)<input required inputMode="decimal" value={count}
          onChange={e=>setCount(e.target.value)} placeholder="2600.00"/></label>
        <label>Count explanation (optional)<textarea rows={2} maxLength={1000} value={explanation}
          onChange={e=>setExplanation(e.target.value)} placeholder="Known cash movements or context"/></label>
        <label>Evidence reference (optional)<input maxLength={300} value={evidence}
          onChange={e=>setEvidence(e.target.value)} placeholder="Count sheet / register note"/></label>
        <p className="ct-guide-warning">Only actual cash receipts and posted cash expenses enter this provisional cash calculation. Confirm refunds and laboratory cash payouts are captured in the authoritative movements before manager approval.</p>
        <button type="submit" className="primary-button" disabled={busy}>{busy?'Submitting…':'Submit first blind count'}</button>
      </form>}
    </section>}
    {data?.submitted&&data.cash&&<div className="ct-guide-columns">
      <section className="ct-guide-panel">
        <h3>Submitted cash count · original preserved</h3>
        <div className="ct-guide-kpis" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>
          <article><span>Expected by system</span><strong>{money(data.cash.expectedCash)}</strong></article>
          <article><span>Physically counted</span><strong>{money(data.cash.countedCash)}</strong></article>
          <article><span>Variance</span><strong>{money(data.cash.variance)}</strong></article>
          <article><span>Opening float</span><strong>{money(data.cash.openingFloat)}</strong></article>
        </div>
        <p><strong>Cash receipts:</strong> {money(data.cash.cashReceived)} · <strong>Cash expense outflows:</strong> {money(data.cash.cashExpenses)}</p>
        <p>Submitted {new Date(data.cash.submittedAtUtc).toLocaleString('en-ZA')} · by {data.cash.submittedByUserId}</p>
        {data.recounts?.length ? <div>
          <h3>Controlled recount history · original unchanged</h3>
          {data.recounts.map(c=><p key={c.id}>Recount: {money(c.revisedCountedCash)} · {c.reason}
            <small>{new Date(c.recordedAtUtc).toLocaleString('en-ZA')} · Evidence: {c.evidenceReference}</small></p>)}
          <strong>Latest counted: {money(data.latestCountedCash ?? data.cash.countedCash)} ·
            Variance: {money(data.latestVariance ?? data.cash.variance)}</strong>
        </div> : null}
        {data.status === 'CorrectionRequired' && <button type="button" className="secondary-button"
          onClick={()=>setRecountVisible(true)}>Record controlled recount</button>}
        {data.cash.explanation&&<p>Explanation: {data.cash.explanation}</p>}
        {data.nonCash && <section className="ct-guide-panel" aria-label="Independent card and EFT movements">
          <h3>Card and EFT · separate reconciliation</h3>
          <p>Card received: {money(data.nonCash.cardReceived)} · Card outflows: {money(data.nonCash.cardExpenses)}</p>
          <p>EFT received: {money(data.nonCash.eftReceived)} · EFT outflows: {money(data.nonCash.eftExpenses)}</p>
          <p>{data.nonCash.notice}</p>
        </section>}
        <p className="ct-guide-warning">{data.note}</p>
      </section>
      <section className="ct-guide-panel">
        <h3>Manager exception review</h3>
        <p>Decision, actor and timestamp form an append-only history. Claim exceptions are not handled here.</p>
        {data.decisions?.map(d=><p key={d.id}><ShieldCheck size={13}/> {d.decision} · {d.reason}<small>{new Date(d.reviewedAtUtc).toLocaleString('en-ZA')}</small></p>)}
        {isManager&&latest?.decision!=='Approve'&&<button className="primary-button" type="button"
          onClick={()=>setReviewVisible(true)}><ClipboardCheck size={16}/> Review cash count</button>}
        {!isManager&&<p>Only a Practice Manager can approve, reject or escalate the cash exception.</p>}
      </section>
    </div>}
    {recountVisible&&data?.cash&&<div className="ct-guide-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setRecountVisible(false)}}>
      <aside className="ct-guide-drawer" role="dialog" aria-modal="true" aria-label="Corrected cash recount">
        <header><h3>Controlled cash recount</h3>
          <button type="button" className="secondary-button" disabled={busy} onClick={()=>setRecountVisible(false)}>Close ×</button></header>
        <p>The first physical count stays immutable. Record a new count only after manager rejection.</p>
        <form className="ct-guide-form" onSubmit={e=>void submitRecount(e)}>
          <label>New counted cash<input required inputMode="decimal" value={recountAmount} onChange={e=>{setRecountAmount(e.target.value);requestId.current=null}}/></label>
          <label>Reason<textarea required minLength={5} maxLength={1000} value={recountReason} onChange={e=>{setRecountReason(e.target.value);requestId.current=null}}/></label>
          <label>Count sheet / evidence reference<input required maxLength={300} value={recountEvidence} onChange={e=>{setRecountEvidence(e.target.value);requestId.current=null}}/></label>
          <button type="submit" className="primary-button" disabled={busy}>{busy?'Saving…':'Submit recount for review'}</button>
        </form>
      </aside>
    </div>}
    {reviewVisible&&data?.cash&&<div className="ct-guide-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setReviewVisible(false)}}>
      <aside className="ct-guide-drawer" role="dialog" aria-modal="true" aria-label="Manager cash review">
        <header><h3>Manager cash review</h3><button className="secondary-button" type="button" disabled={busy} onClick={()=>setReviewVisible(false)}>Close ×</button></header>
        <p>Expected: {money(data.cash.expectedCash)} · Latest counted: {money(data.latestCountedCash ?? data.cash.countedCash)} · Latest variance: {money(data.latestVariance ?? data.cash.variance)}</p>
        <form className="ct-guide-form" onSubmit={e=>void submitReview(e)}>
          <label>Decision<select value={reviewDecision} onChange={e=>{setReviewDecision(e.target.value as typeof reviewDecision);requestId.current=null}}>
            <option value="Approve">Approve</option><option value="Reject">Reject / recount needed</option>
            <option value="Escalate">Escalate</option></select></label>
          <label>Reason<textarea required minLength={5} maxLength={1000} rows={4} value={reviewReason} onChange={e=>{setReviewReason(e.target.value);requestId.current=null}}/></label>
          <p className="ct-guide-warning">A rejection does not delete or overwrite the first physical count.</p>
          <button className="primary-button" type="submit" disabled={busy}>{busy?'Saving…':'Record manager decision'}</button>
        </form>
      </aside>
    </div>}
  </section>
}
