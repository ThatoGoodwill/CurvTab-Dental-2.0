import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import { apiRequest } from '../services/api'
import './ClientBillingWorkspace.css'

type CashCount = {
  id: string; revision: number; businessDate: string; expectedCash: number
  countedCash: number; variance: number; openingFloat: number
  cashReceipts: number; cashExpenses: number; cashRefunds: number
  submittedByUserId: string; submittedAtUtc: string
}
type CashEvent = {
  id: string; cashCountId: string; action: string
  notes: string; evidenceReference: string; atUtc: string
}
type CashData = {
  counts: CashCount[]; events: CashEvent[]; actualCashReceipts: number
  cardReceipts: number; eftReceipts: number; cashExpenses: number
  schemeBankDeposits: number
  changedAfterSubmission: boolean
}
type ExpenseRequest = {
  id: string; supplier: string; category: string; expenseDate: string
  amount: number; method: string; description: string; receiptReference: string
  reference: string; decision: null | { id: string; decision: string; notes: string; postedExpenseId: string | null }
}
type PostedExpense = { id: string; description: string; category: string; amount: number; method: string }
type ExpenseData = { pendingOrDecided: ExpenseRequest[]; posted: PostedExpense[] }
type MedicalData = { signed: null | { id: string; signedAtUtc: string }; activity: {
  submittedValue: number; uniqueClaims: number; actionsPending: number; submissionAttempts: number
} }
type Form = { notes: string; evidenceReference: string }
const money=(n:number)=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n)
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Johannesburg',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())

export default function BillingFinanceReviewPanel({ canApprove }: { canApprove: boolean }) {
  const [date,setDate]=useState(today)
  const [reload,setReload]=useState(0)
  const [cash,setCash]=useState<CashData|null>(null)
  const [expenses,setExpenses]=useState<ExpenseData|null>(null)
  const [medical,setMedical]=useState<MedicalData|null>(null)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [selectedCount,setSelectedCount]=useState<CashCount|null>(null)
  const [selectedExpense,setSelectedExpense]=useState<ExpenseRequest|null>(null)
  const [action,setAction]=useState<'Approved'|'Rejected'|'Escalated'>('Approved')
  const [form,setForm]=useState<Form>({notes:'',evidenceReference:''})
  const [busy,setBusy]=useState(false)
  const requestId=useRef<string|null>(null)
  useEffect(()=>{
    let active=true
    Promise.all([
      apiRequest<CashData>('/billing/cash-day-close?date='+date),
      apiRequest<ExpenseData>('/billing/expenses?date='+date),
      apiRequest<MedicalData>('/billing/medical-aid-day?date='+date)
    ]).then(([c,e,m])=>{
      if(!active)return
      setCash(c);setExpenses(e);setMedical(m);setError('')
    }).catch(e=>{
      if(active)setError(e instanceof Error?e.message:'Could not read financial review records.')
    })
    return()=>{active=false}
  },[date,reload])
  const pendingExpenses=(expenses?.pendingOrDecided||[]).filter(e=>!e.decision)
  const cashCount=cash?.counts[0]||null
  const cashEvents=cash?.events.filter(e=>e.cashCountId===cashCount?.id)||[]
  const countDecision=cashEvents.find(e=>['Approved','Rejected','Escalated'].includes(e.action))
  const explanation=cashEvents.find(e=>e.action==='Explanation')

  async function sendReview() {
    if(!canApprove||(!selectedExpense&&!selectedCount)||busy)return
    requestId.current ||= crypto.randomUUID()
    setBusy(true);setError('');setSuccess('')
    try{
      if(selectedCount){
        await apiRequest('/billing/cash-day-close/'+encodeURIComponent(selectedCount.id)+'/event','POST',{
          requestId:requestId.current,action,notes:form.notes,evidenceReference:form.evidenceReference
        })
        setSuccess('Cash variance decision saved with the original blind count and audit trail.')
      }else if(selectedExpense){
        await apiRequest('/billing/expenses/'+encodeURIComponent(selectedExpense.id)+'/decision','POST',{
          requestId:requestId.current,decision:action==='Approved'?'Approved':'Rejected',
          notes:form.notes
        })
        setSuccess('Expense approval recorded. The expense is posted once to the shared ledger only if approved.')
      }
      requestId.current=null
      setSelectedCount(null);setSelectedExpense(null)
      setForm({notes:'',evidenceReference:''})
      setReload(n=>n+1)
    }catch(e){
      setError(e instanceof Error?e.message:'Approval failed.')
    }finally{setBusy(false)}
  }

  return <section className="ct-client-billing">
    <header className="ct-day-header">
      <div><h1>Manager review & expenses</h1>
        <p>Review submitted cash counts and approve expenses; medical aid claims remain operational activity.</p>
      </div>
      <div className="ct-day-header-actions">
        <label className="ct-day-date">Business date
          <input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/>
        </label>
        <button className="ct-day-icon-action" type="button" onClick={()=>setReload(n=>n+1)}>
          <RefreshCw size={15}/> Refresh
        </button>
      </div>
    </header>
    {error&&<p role="alert" className="ct-day-notice ct-day-error">{error}</p>}
    {success&&<p role="status" className="ct-day-notice ct-day-success">{success}</p>}
    <div className="ct-day-kpis">
      <div className="ct-day-kpi"><span>Cash submitted</span>
        <strong>{cashCount?money(cashCount.countedCash):'—'}</strong>
        <small>{cashCount?'Count revision '+cashCount.revision:'No blind count submitted'}</small></div>
      <div className="ct-day-kpi ct-day-kpi-gold"><span>Variance</span>
        <strong>{cashCount?money(cashCount.variance):'—'}</strong>
        <small>{countDecision?.action||'Manager review pending'}</small></div>
      <div className="ct-day-kpi ct-day-kpi-teal"><span>Expenses pending approval</span>
        <strong>{pendingExpenses.length}</strong><small>Not yet posted to the ledger</small></div>
      <div className="ct-day-kpi ct-day-kpi-purple"><span>Medical aid sign-off</span>
        <strong>{medical?.signed?'Signed':'Not signed'}</strong><small>{medical?.activity.uniqueClaims??0} unique claims, not cash</small></div>
    </div>
    <div className="ct-day-two-col">
      <section className="ct-day-panel">
        <h2>Cash Day Close exception</h2>
        {!cashCount?<p>No cashier count has been submitted for this date.</p>:<>
          <div className="ct-day-stat-row"><span>Opening float</span><strong>{money(cashCount.openingFloat)}</strong></div>
          <div className="ct-day-stat-row"><span>Actual cash receipts</span><strong>{money(cashCount.cashReceipts)}</strong></div>
          <div className="ct-day-stat-row"><span>Cash expenses & refunds</span>
            <strong>−{money(cashCount.cashExpenses+cashCount.cashRefunds)}</strong></div>
          <div className="ct-day-stat-row"><span>Expected drawer</span><strong>{money(cashCount.expectedCash)}</strong></div>
          <div className="ct-day-stat-row"><span>Submitted count</span><strong>{money(cashCount.countedCash)}</strong></div>
          <div className="ct-day-stat-row"><span>Variance</span><strong>{money(cashCount.variance)}</strong></div>
          {cash?.changedAfterSubmission && <p role="alert" className="ct-day-notice ct-day-error">
            Cash movements changed after the original count. Reject it and request a new blind count.
          </p>}
          {cashEvents.map(e=><div className="ct-day-event" key={e.id}><strong>{e.action}</strong>
            <p>{e.notes}</p><small>{new Date(e.atUtc).toLocaleString('en-ZA')} · {e.evidenceReference}</small></div>)}
          {!countDecision && canApprove && (cashCount.variance===0||explanation) &&
            <button type="button" className="primary-button" onClick={()=>{
              setSelectedCount(cashCount);setSelectedExpense(null);setAction('Approved');setError('');requestId.current=null
            }}><ShieldCheck size={15}/> Review submitted count</button>}
          {cashCount.variance!==0&&!explanation&&!countDecision&&
            <p className="ct-day-muted">Reception must record the variance explanation in Billing → Cash Day Close before manager approval.</p>}
        </>}
        <p className="ct-day-muted">Card/EFT collections and real scheme deposits remain separate from physical cash counts.
          Medical Aid Day Sign-Off is independent of this review.</p>
      </section>
      <section className="ct-day-panel">
        <h2>Expense approvals</h2>
        {pendingExpenses.length===0&&<p>No pending expense requests on this date.</p>}
        {pendingExpenses.map(e=><div className="ct-day-stat-row" key={e.id}>
          <span><strong>{e.supplier}</strong> · {e.category}
            <small>{e.method} · receipt {e.receiptReference}</small></span>
          <div className="ct-day-inline">
            <strong>{money(e.amount)}</strong>
            {canApprove&&<button type="button" className="ct-day-link" onClick={()=>{
              setSelectedExpense(e);setSelectedCount(null);setAction('Approved');setError('');requestId.current=null
            }}>Review</button>}
          </div>
        </div>)}
        <div className="ct-day-stat-row"><span>Posted financial expenses</span>
          <strong>{money((expenses?.posted||[]).reduce((n,e)=>n+e.amount,0))}</strong></div>
        <p className="ct-day-muted">Approved requests become one immutable expense record in the same existing Finances ledger. Do not enter a laboratory payout twice.</p>
        <div className="ct-day-stat-row"><span>Actual scheme claims submitted</span>
          <strong>{money(medical?.activity.submittedValue??0)}</strong></div>
        <p className="ct-day-muted">Claim submission value is informational, not income. Only bank-confirmed remittances enter receipt reconciliation.</p>
      </section>
    </div>
    {(selectedCount||selectedExpense)&&<div className="ct-day-popup-backdrop"
      onMouseDown={e=>{if(e.currentTarget===e.target&&!busy){setSelectedCount(null);setSelectedExpense(null)}}}>
      <section className="ct-day-popup" role="dialog" aria-modal="true" aria-label="Manager approval">
        <header className="ct-day-popup-head">
          <div><strong>{selectedCount?'Cash variance manager review':'Expense manager approval'}</strong>
            <small>Actor and time are retained in the audit history</small></div>
          <button className="ct-day-icon-action" type="button"
            onClick={()=>{setSelectedCount(null);setSelectedExpense(null)}}>Close</button>
        </header>
        <div className="ct-day-form">
          <label>Decision<select value={action}
            onChange={e=>{setAction(e.target.value as typeof action);requestId.current=null}}>
            <option value="Approved">Approve</option><option value="Rejected">Reject / recount required</option>
            {!!selectedCount&&<option value="Escalated">Escalate</option>}
          </select></label>
          <label>Required rationale<textarea rows={4} minLength={5} value={form.notes}
            onChange={e=>{setForm(x=>({...x,notes:e.target.value}));requestId.current=null}}/></label>
          {!!selectedCount&&<label>Supporting evidence reference
            <input value={form.evidenceReference}
              onChange={e=>{setForm(x=>({...x,evidenceReference:e.target.value}));requestId.current=null}}
              placeholder="Cash slip, count sheet or supervisor report"/></label>}
          <button className="primary-button" type="button" disabled={busy||form.notes.trim().length<5}
            onClick={()=>void sendReview()}><ClipboardCheck size={16}/>
            {busy?'Saving…':'Save manager decision'}</button>
        </div>
      </section>
    </div>}
  </section>
}
