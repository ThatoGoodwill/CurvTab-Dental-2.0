import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity, Banknote, CalendarCheck2, CheckCircle2, ClipboardCheck, CreditCard,
  FileText, HeartPulse, History, Plus, RefreshCw, Search, ShieldCheck,
  Stethoscope, Wallet, X, AlertTriangle
} from 'lucide-react'
import { apiRequest } from '../services/api'
import ReceptionCheckoutPage from './ReceptionCheckoutPage'
import PlanAccountsPanel from './PlanAccountsPanel'
import InvoicesPanel from './InvoicesPanel'
import PatientBalancesPanel from './PatientBalancesPanel'
import MedicalAidPanel from './MedicalAidPanel'
import './ClientBillingWorkspace.css'

export type BillingSection = 'today' | 'cash-private' | 'medical-aid' | 'cash-close' | 'medical-signoff'
export const billingSidebarSections: ReadonlyArray<{ id: BillingSection; label: string }> = [
  { id: 'today', label: "Today's Billing" },
  { id: 'cash-private', label: 'Cash & Private' },
  { id: 'medical-aid', label: 'Medical Aid' },
  { id: 'cash-close', label: 'Cash Day Close' },
  { id: 'medical-signoff', label: 'Medical Aid Day Sign-Off' },
]

type ClaimAttempt = {
  claimId: string; patientId: string; claimNumber: string
  patientName: string; schemeName: string; amount: number
  status: string; attemptId: string; submittedAtUtc: string
  externalReference: string | null
}
type ClaimActivity = {
  patientsTreated: number; uniqueClaims: number; submissionAttempts: number
  submittedValue: number; actionsPending: number; submittedClaims: ClaimAttempt[]
}
type ExpenseRow = {
  id: string; category: string; description: string; method: string
  amount: number; reference?: string | null; recordedAtUtc: string
  recordedByUserId: string
}
type DailyData = {
  businessDate: string; actualReceipts: number; actualPayouts: number
  cashReceived: number; cardReceived: number; eftReceived: number
  schemeBankDeposits: number; cashExpenses: number; nonCashExpenses: number
  refunds: number; netActualMovements: number; claimsSubmittedValue: number
  claimActivity: ClaimActivity; expenses: ExpenseRow[]
  cashDayClose: { id: string; revision: number; countedCash: number; variance: number } | null
  medicalAidDaySignoff: { id: string; signedAtUtc: string } | null
}
type Count = {
  id: string; revision: number; businessDate: string
  openingFloat: number; cashReceipts: number; cashExpenses: number
  cashRefunds: number; expectedCash: number; countedCash: number
  variance: number; submittedAtUtc: string; submittedByUserId: string
}
type CountEvent = {
  id: string; cashCountId: string; action: string
  notes: string; evidenceReference: string; atUtc: string; actorUserId: string
}
type CashData = {
  businessDate: string; actualCashReceipts: number
  cashExpenses: number; cashRefunds: number; cardReceipts: number
  eftReceipts: number; schemeBankDeposits: number; cardExpenses: number
  eftExpenses: number; labPayoutsAlreadyRecordedAsExpenses: number
  counts: Count[]; events: CountEvent[]
}
type MedicalDay = {
  businessDate: string; activity: ClaimActivity
  signed: null | {
    id: string; signedAtUtc: string; signedByUserId: string
    uniqueClaims: number; submissionAttempts: number; submittedValue: number
    actionPending: number; snapshotJson: string; notes: string
  }
}
type Props = {
  role: string
  section: BillingSection
  onSectionChange: (next: BillingSection) => void
}
type Note = { kind: 'error' | 'success'; text: string }
const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value)
const todaySA = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
const problem = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Unable to complete this action.'
const randId = () => crypto.randomUUID()

function Notice({ value }: { value: Note | null }) {
  return value && <p className={'ct-day-notice ct-day-' + value.kind} role={value.kind === 'error' ? 'alert' : 'status'}>{value.text}</p>
}
function Kpi({ label, value, note, tone }: {
  label: string; value: string; note: string; tone?: 'purple' | 'teal' | 'gold' | 'blue'
}) {
  return <div className={'ct-day-kpi ct-day-kpi-' + (tone || 'blue')}>
    <span>{label}</span><strong>{value}</strong><small>{note}</small>
  </div>
}
function DateSelect({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return <label className="ct-day-date">Business date
    <input aria-label="Billing business date" type="date" value={date}
      max={todaySA()} onChange={e => setDate(e.target.value)} />
  </label>
}
function Header({ title, subtitle, date, setDate, refresh }: {
  title: string; subtitle: string; date: string
  setDate: (date: string) => void; refresh: () => void
}) {
  return <header className="ct-day-header">
    <div><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="ct-day-header-actions">
      <DateSelect date={date} setDate={setDate}/>
      <button type="button" onClick={refresh} className="ct-day-icon-action" title="Refresh">
        <RefreshCw size={16}/> Refresh
      </button>
    </div>
  </header>
}
function Popup({ title, subtitle, children, onClose }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void
}) {
  return <div className="ct-day-popup-backdrop"
    onMouseDown={e => { if (e.currentTarget === e.target) onClose() }}>
    <section className="ct-day-popup" role="dialog" aria-modal="true" aria-label={title}>
      <header className="ct-day-popup-head"><div><strong>{title}</strong><small>{subtitle}</small></div>
        <button className="ct-day-icon-action" type="button" onClick={onClose}
          aria-label={'Close ' + title}><X size={17}/></button>
      </header>
      {children}
    </section>
  </div>
}
function Status({ label, good }: { label: string; good: boolean }) {
  return <span className={'ct-day-status ' + (good ? 'ct-day-status-good' : 'ct-day-status-attention')}>{label}</span>
}

export default function ClientBillingWorkspace({ role, section, onSectionChange }: Props) {
  const [date, setDate] = useState(todaySA)
  const [revision, setRevision] = useState(0)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const manager = role === 'PracticeAdmin'
  const refresh = () => setRevision(v => v + 1)

  const labels: Record<BillingSection, string> = {
    today: "Today's Billing",
    'cash-private': 'Cash & Private',
    'medical-aid': 'Medical Aid',
    'cash-close': 'Cash Day Close',
    'medical-signoff': 'Medical Aid Day Sign-Off',
  }

  return <div className="ct-client-billing">
    <div className="ct-day-breadcrumb"><Wallet size={15}/> Billing <span>/</span>
      <strong>{labels[section]}</strong></div>
    {section === 'today' && <TodayBilling date={date} setDate={setDate} revision={revision}
      refresh={refresh} onGo={onSectionChange} onExpense={() => setExpenseOpen(true)}/>}
    {section === 'cash-private' && <CashPrivate manager={manager}
      onRefund={() => setRefundOpen(true)} />}
    {section === 'medical-aid' && <MedicalAidActivity date={date} setDate={setDate}
      revision={revision} refresh={refresh} manager={manager}/>}
    {section === 'cash-close' && <CashDayClose date={date} setDate={setDate}
      revision={revision} refresh={refresh} manager={manager}/>}
    {section === 'medical-signoff' && <MedicalAidDaySignoff date={date} setDate={setDate}
      revision={revision} refresh={refresh}/>}
    {expenseOpen && <ExpenseDrawer date={date} manager={manager} onClose={() => {
      setExpenseOpen(false); refresh()
    }} />}
    {refundOpen && <RefundDrawer date={date} onClose={() => {
      setRefundOpen(false); refresh()
    }} />}
  </div>
}

function TodayBilling({ date, setDate, revision, refresh, onGo, onExpense }: {
  date: string; setDate: (d: string) => void; revision: number; refresh: () => void
  onGo: (d: BillingSection) => void; onExpense: () => void
}) {
  const [daily, setDaily] = useState<DailyData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null)
  useEffect(() => {
    let alive = true
    setLoading(true)
    apiRequest<DailyData>('/billing/daily?date=' + encodeURIComponent(date))
      .then(x => { if (alive) { setDaily(x); setError('') } })
      .catch(x => { if (alive) { setDaily(null); setError(problem(x)) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [date, revision])
  return <>
    <Header title="Billing – Today's Billing"
      subtitle="Actual patient money and claim activity are reported separately."
      date={date} setDate={setDate} refresh={refresh}/>
    {loading && <p>Loading today's financial movements…</p>}
    <Notice value={error ? {kind:'error',text:error}:null}/>
    {daily && <>
      <div className="ct-day-kpis">
        <Kpi tone="blue" label="Money received" value={money(daily.actualReceipts)}
          note="Cash, card, EFT and bank-confirmed scheme deposits"/>
        <Kpi tone="gold" label="Expenses & refunds" value={money(daily.actualPayouts)}
          note="Actual outflows, recorded once"/>
        <Kpi tone="teal" label="Net movement" value={money(daily.netActualMovements)}
          note="Receipts minus paid outflows"/>
        <Kpi tone="purple" label="Claims submitted" value={money(daily.claimsSubmittedValue)}
          note="Operational value only — NOT cash received"/>
      </div>
      <div className="ct-day-actions">
        <button className="primary-button" type="button" onClick={() => onGo('cash-private')}>
          <Plus size={15}/> Record patient payment
        </button>
        <button className="secondary-button" type="button" onClick={onExpense}>
          <FileText size={15}/> Record expense
        </button>
        <button className="secondary-button" type="button" onClick={() => onGo('cash-close')}>
          <Banknote size={15}/> Cash Day Close
        </button>
        <button className="secondary-button" type="button" onClick={() => onGo('medical-signoff')}>
          <ClipboardCheck size={15}/> Medical Aid Sign-Off
        </button>
      </div>
      <div className="ct-day-two-col">
        <section className="ct-day-panel">
          <h2>Today's transactions</h2>
          <div className="ct-day-table-scroll"><table><thead><tr>
            <th>Transaction</th><th>Method</th><th>Amount</th><th>Details</th>
          </tr></thead><tbody>
            {daily.expenses.map(e => <tr key={e.id}>
              <td>{e.description}</td><td>{e.method}</td>
              <td className="ct-negative">−{money(e.amount)}</td>
              <td><button type="button" className="ct-day-link"
                onClick={() => setSelectedExpense(e)}>Inspect</button></td>
            </tr>)}
            {!daily.expenses.length && <tr><td colSpan={4}>No posted expenses on this date.</td></tr>}
          </tbody></table></div>
          <small className="ct-day-muted">Receipts are recorded in Cash & Private. Expense rows are read from the existing Finances ledger.</small>
        </section>
        <aside className="ct-day-panel">
          <h2>Today at a glance</h2>
          <div className="ct-day-stat-row"><span>Cash receipts</span><strong>{money(daily.cashReceived)}</strong></div>
          <div className="ct-day-stat-row"><span>Card receipts</span><strong>{money(daily.cardReceived)}</strong></div>
          <div className="ct-day-stat-row"><span>EFT receipts</span><strong>{money(daily.eftReceived)}</strong></div>
          <div className="ct-day-stat-row"><span>Scheme bank deposits</span><strong>{money(daily.schemeBankDeposits)}</strong></div>
          <div className="ct-day-stat-row"><span>Claim submission attempts</span><strong>{daily.claimActivity.submissionAttempts}</strong></div>
          <div className="ct-day-stat-row"><span>Unique claims submitted</span><strong>{daily.claimActivity.uniqueClaims}</strong></div>
          <div className="ct-day-stat-row"><span>Cash Day Close</span>
            <Status good={!!daily.cashDayClose} label={daily.cashDayClose ? 'Count recorded' : 'Not counted'}/></div>
          <div className="ct-day-stat-row"><span>Medical Aid Sign-Off</span>
            <Status good={!!daily.medicalAidDaySignoff}
              label={daily.medicalAidDaySignoff ? 'Signed' : 'Not signed'}/></div>
        </aside>
      </div>
      {selectedExpense && <Popup title="Expense transaction details" subtitle="Existing financial record — no duplicate posting"
        onClose={() => setSelectedExpense(null)}>
        <div className="ct-day-detail">
          <div><span>Description</span><strong>{selectedExpense.description}</strong></div>
          <div><span>Category</span><strong>{selectedExpense.category}</strong></div>
          <div><span>Payment method</span><strong>{selectedExpense.method}</strong></div>
          <div><span>Amount paid</span><strong>{money(selectedExpense.amount)}</strong></div>
          <div><span>Reference</span><strong>{selectedExpense.reference || 'Not recorded'}</strong></div>
          <div><span>Operator ID</span><strong>{selectedExpense.recordedByUserId}</strong></div>
          <div><span>Posted at</span><strong>{dateTime(selectedExpense.recordedAtUtc)}</strong></div>
          <p className="ct-day-muted">To correct a posted expense, use an audited reversal/adjustment process; do not silently edit it.</p>
        </div>
      </Popup>}
    </>}
  </>
}

function CashPrivate({ manager, onRefund }: { manager: boolean; onRefund: () => void }) {
  const [tab, setTab] = useState<'checkout'|'invoices'|'balances'|'plans'>('checkout')
  const tabs = [
    { id:'checkout', label:'Patient checkout' }, { id:'invoices', label:'Invoices' },
    { id:'balances', label:'Balances' }, { id:'plans', label:'Treatment plans' },
  ] as const
  return <>
    <div className="ct-day-header"><div><h1>Cash & Private</h1>
      <p>Money moves only when staff record an actual payment or refund.</p></div>
      {manager && <button type="button" className="secondary-button" onClick={onRefund}>Record actual refund</button>}
    </div>
    <nav className="ct-day-tabs" aria-label="Cash and private sections">
      {tabs.map(x => <button type="button" key={x.id} className={tab===x.id?'active':''}
        onClick={()=>setTab(x.id)}>{x.label}</button>)}
    </nav>
    <div className="ct-day-existing-module">
      {tab==='checkout' && <ReceptionCheckoutPage/>}
      {tab==='invoices' && <InvoicesPanel canIssue={manager}/>}
      {tab==='balances' && <PatientBalancesPanel/>}
      {tab==='plans' && <PlanAccountsPanel/>}
    </div>
  </>
}

const denominations = [200,100,50,20,10,5,2,1,.5,.2,.1,.05]
function CashDayClose({ date, setDate, revision, refresh, manager }: {
  date: string; setDate:(d:string)=>void; revision:number; refresh:()=>void; manager:boolean
}) {
  const [data, setData] = useState<CashData|null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<Note|null>(null)
  const [float, setFloat] = useState('0.00')
  const [quantities, setQuantities] = useState<Record<string,number>>({})
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [managerAction, setManagerAction] = useState<'Approved'|'Rejected'|'Escalated'>('Approved')
  const countRequest = useRef<string|null>(null)
  const eventRequest = useRef<string|null>(null)
  const [showCount, setShowCount] = useState(false)
  const [showEvent, setShowEvent] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiRequest<CashData>('/billing/cash-day-close?date=' + encodeURIComponent(date))
      .then(x => { if (alive) { setData(x); setNote(null) } })
      .catch(x => { if (alive) { setData(null); setNote({kind:'error',text:problem(x)}) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [date, revision])
  const current = data?.counts[0] || null
  const events = (data?.events || []).filter(x => x.cashCountId === current?.id)
  const managerEvent = events.find(x => ['Approved','Rejected','Escalated'].includes(x.action))
  const hasExplanation = events.some(x => x.action === 'Explanation')
  const canCount = !current || managerEvent?.action === 'Rejected'
  const entered = denominations.reduce((s,v)=>s+v*(quantities[String(v)]||0),0)

  async function submitCount(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNote(null)
    countRequest.current ||= randId()
    try {
      await apiRequest('/billing/cash-day-close/count','POST',{
        requestId:countRequest.current, businessDate:date,
        openingFloat:Number(float),
        denominations:denominations.map(value=>({value,quantity:quantities[String(value)]||0}))
      })
      countRequest.current = null; setShowCount(false); refresh()
    } catch(err) {setNote({kind:'error',text:problem(err)})}
    finally {setBusy(false)}
  }
  async function submitEvent(event: FormEvent, action: string) {
    event.preventDefault()
    if (!current) return
    setBusy(true); setNote(null)
    eventRequest.current ||= randId()
    try {
      await apiRequest('/billing/cash-day-close/'+encodeURIComponent(current.id)+'/event','POST',{
        requestId:eventRequest.current,action,notes:reason,evidenceReference:evidence
      })
      eventRequest.current=null;setShowEvent(false);setReason('');setEvidence('');refresh()
    }catch(err){setNote({kind:'error',text:problem(err)})}
    finally{setBusy(false)}
  }
  return <>
    <Header title="Billing – Cash Day Close"
      subtitle="Separate cash drawer reconciliation; submitted medical aid claims never count as receipts."
      date={date} setDate={setDate} refresh={refresh}/>
    <Notice value={note}/>
    {loading && <p>Loading real cash movement records…</p>}
    {data && <>
      <div className="ct-day-steps"><span className="active">1 Review movements</span>
        <span className={current?'complete':''}>2 Blind cash count</span>
        <span className={current?'active':''}>3 Explain variance</span>
        <span className={managerEvent?'complete':''}>4 Manager review</span></div>
      <div className="ct-day-kpis">
        <Kpi label="Cash receipts" value={money(data.actualCashReceipts)} note="Actual cash paid"/>
        <Kpi tone="gold" label="Cash expenses" value={money(data.cashExpenses)} note="Includes laboratory expenses already posted"/>
        <Kpi tone="purple" label="Cash refunds" value={money(data.cashRefunds)} note="Evidence-linked actual refunds"/>
        <Kpi tone="teal" label="Card and EFT" value={money(data.cardReceipts+data.eftReceipts+data.schemeBankDeposits)}
          note="Reconciled separately; not physical drawer cash"/>
      </div>
      <div className="ct-day-two-col">
        <section className="ct-day-panel">
          <h2>Reconciliation summary</h2>
          <div className="ct-day-stat-row"><span>Cash receipts</span><strong>{money(data.actualCashReceipts)}</strong></div>
          <div className="ct-day-stat-row"><span>Cash expenses</span><strong>−{money(data.cashExpenses)}</strong></div>
          <div className="ct-day-stat-row"><span>Cash refunds</span><strong>−{money(data.cashRefunds)}</strong></div>
          <div className="ct-day-stat-row"><span>Card receipts / spending</span><strong>{money(data.cardReceipts)} / {money(data.cardExpenses)}</strong></div>
          <div className="ct-day-stat-row"><span>EFT / scheme deposits</span><strong>{money(data.eftReceipts)} / {money(data.schemeBankDeposits)}</strong></div>
          <div className="ct-day-stat-row"><span>EFT spending</span><strong>{money(data.eftExpenses)}</strong></div>
          <p className="ct-day-muted">Card, EFT and scheme deposits are never used for the physical till expectation. A laboratory payout already posted as an expense is not posted a second time.</p>
        </section>
        <section className="ct-day-panel">
          <h2>Cash count & review</h2>
          {!current && <><Status label="Not submitted" good={false}/>
            <p className="ct-day-muted">Blind count: the server will reveal its expected cash and variance only after you submit the denominations.</p></>}
          {current && <>
            <Status good={managerEvent?.action==='Approved'}
              label={managerEvent?.action || 'Submitted — manager review pending'}/>
            <div className="ct-day-stat-row"><span>Submitted drawer cash</span><strong>{money(current.countedCash)}</strong></div>
            <div className="ct-day-stat-row"><span>Expected drawer cash</span><strong>{money(current.expectedCash)}</strong></div>
            <div className="ct-day-stat-row"><span>Variance</span>
              <strong className={current.variance<0?'ct-negative':''}>
                {current.variance<0?'Shortage: ':current.variance>0?'Over: ':'Balanced: '}
                {money(Math.abs(current.variance))}</strong></div>
            <small>Revision {current.revision} · Submitted {dateTime(current.submittedAtUtc)}</small>
            {events.map(evt=><p className="ct-day-event" key={evt.id}><strong>{evt.action}:</strong> {evt.notes} <small>{dateTime(evt.atUtc)}</small></p>)}
          </>}
          {canCount && <button type="button" className="primary-button" onClick={()=>setShowCount(true)}>
            <Banknote size={16}/>{current?'Start audited recount':'Start Blind Cash Count'}</button>}
          {current && !managerEvent && <>
            {current.variance!==0&&!hasExplanation && <button type="button" className="secondary-button"
              onClick={()=>{setManagerAction('Approved');setShowEvent(true)}}>
              Add discrepancy explanation
            </button>}
            {manager && (current.variance===0||hasExplanation) && <button type="button" className="primary-button"
              onClick={()=>setShowEvent(true)}><ShieldCheck size={15}/> Manager review</button>}
          </>}
        </section>
      </div>
      {showCount && <Popup title="Blind cash count"
        subtitle="Enter each note / coin quantity. Expected cash is deliberately hidden." onClose={()=>{if(!busy)setShowCount(false)}}>
        <form className="ct-day-form" onSubmit={submitCount}>
          <label>Opening float (ZAR)<input required type="number" step=".01" min="0"
            value={float} onChange={e=>{setFloat(e.target.value);countRequest.current=null}} /></label>
          <div className="ct-day-denominations">
            {denominations.map(value=><label key={value}>
              <span>{money(value)}</span><input type="number" inputMode="numeric" min="0" max="100000"
                value={quantities[String(value)]??0} onChange={e=>{
                  setQuantities(old=>({...old,[String(value)]:Math.max(0,Number(e.target.value)||0)}))
                  countRequest.current=null
                }}/></label>)}
          </div>
          <div className="ct-day-stat-row"><span>Physical counted total</span><strong>{money(entered)}</strong></div>
          <button disabled={busy||!float||entered<0} className="primary-button" type="submit">
            {busy?'Submitting…':'Submit immutable blind count'}</button>
        </form>
      </Popup>}
      {showEvent && current && <Popup title={manager && (current.variance===0||hasExplanation)?'Manager decision':'Discrepancy explanation'}
        subtitle="The original count cannot be overwritten." onClose={()=>{if(!busy)setShowEvent(false)}}>
        <form className="ct-day-form" onSubmit={e=>void submitEvent(e,
          manager&&(current.variance===0||hasExplanation)?managerAction:'Explanation')}>
          {manager && (current.variance===0||hasExplanation) && <label>Decision
            <select value={managerAction} onChange={e=>setManagerAction(e.target.value as typeof managerAction)}>
              <option>Approved</option><option>Rejected</option><option>Escalated</option>
            </select></label>}
          <label>Explanation / manager decision notes<textarea required minLength={5}
            value={reason} onChange={e=>{setReason(e.target.value);eventRequest.current=null}} rows={3}/></label>
          <label>Evidence reference (required for rejection or escalation)
            <input value={evidence} onChange={e=>{setEvidence(e.target.value);eventRequest.current=null}}
              placeholder="e.g. till report or photograph reference"/></label>
          <button className="primary-button" type="submit" disabled={busy}>Record audited event</button>
        </form>
      </Popup>}
    </>}
  </>
}

function MedicalAidDaySignoff({date,setDate,revision,refresh}: {
  date:string;setDate:(d:string)=>void;revision:number;refresh:()=>void
}) {
  const [data,setData]=useState<MedicalDay|null>(null)
  const [loading,setLoading]=useState(true)
  const [note,setNote]=useState<Note|null>(null)
  const [checks,setChecks]=useState([false,false,false,false])
  const [notes,setNotes]=useState('')
  const [busy,setBusy]=useState(false)
  const requestId=useRef<string|null>(null)
  useEffect(()=>{
    let alive=true;setLoading(true)
    apiRequest<MedicalDay>('/billing/medical-aid-day?date='+encodeURIComponent(date))
      .then(x=>{if(alive){setData(x);setNote(null)}})
      .catch(x=>{if(alive){setData(null);setNote({kind:'error',text:problem(x)})}})
      .finally(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[date,revision])
  async function signoff(e:FormEvent){
    e.preventDefault();setBusy(true);setNote(null);requestId.current||=randId()
    try{
      await apiRequest('/billing/medical-aid-day/signoff','POST',{
        requestId:requestId.current,businessDate:date,
        encountersAccountedFor:checks[0],responsesRecorded:checks[1],
        exceptionsListed:checks[2],noCashPostedForClaims:checks[3],notes
      })
      requestId.current=null;setNote({kind:'success',text:'Medical aid activity signed. No cash receipt was posted.'});refresh()
    }catch(err){setNote({kind:'error',text:problem(err)})}
    finally{setBusy(false)}
  }
  return <>
    <Header title="Billing – Medical Aid Day Sign-Off"
      subtitle="Record claim activity and follow-up independently of the cash register."
      date={date} setDate={setDate} refresh={refresh}/>
    <Notice value={note}/>
    {loading && <p>Loading medical aid activity…</p>}
    {data && <>
      <div className="ct-day-kpis">
        <Kpi label="Patients treated" value={String(data.activity.patientsTreated)}
          note="Finalized clinical encounters"/>
        <Kpi tone="teal" label="Unique claims" value={String(data.activity.uniqueClaims)}
          note="One logical claim, even after resubmission"/>
        <Kpi tone="purple" label="Submitted value" value={money(data.activity.submittedValue)}
          note="NOT cash received"/>
        <Kpi tone="gold" label="Actions pending" value={String(data.activity.actionsPending)}
          note="Rejected, corrected and draft exceptions"/>
      </div>
      <div className="ct-day-two-col">
        <section className="ct-day-panel"><h2>Submitted today — historical event records</h2>
          <div className="ct-day-table-scroll"><table><thead><tr>
            <th>Patient</th><th>Scheme</th><th>Reference</th><th>Attempt</th><th>Claim value</th>
          </tr></thead><tbody>
            {data.activity.submittedClaims.map(x=><tr key={x.attemptId}>
              <td>{x.patientName}</td><td>{x.schemeName}</td>
              <td>{x.claimNumber}</td><td>{dateTime(x.submittedAtUtc)}</td>
              <td>{money(x.amount)}</td></tr>)}
            {!data.activity.submittedClaims.length&&<tr><td colSpan={5}>No externally reported submissions for this date.</td></tr>}
          </tbody></table></div>
          <p className="ct-day-muted">Every resubmission is an attempt on the same claim. Claim values never generate a cash receipt.</p>
        </section>
        <section className="ct-day-panel">
          <h2>Pre-sign-off checklist</h2>
          {data.signed?<><Status good label="Signed and immutable"/>
            <p>Signed {dateTime(data.signed.signedAtUtc)}</p>
            <div className="ct-day-stat-row"><span>Recorded claims</span><strong>{data.signed.uniqueClaims}</strong></div>
            <div className="ct-day-stat-row"><span>Submitted activity</span><strong>{money(data.signed.submittedValue)}</strong></div>
            <p className="ct-day-muted">Later rejections, corrections or remittances do not change this day's signed snapshot.</p>
          </>:<form className="ct-day-form" onSubmit={signoff}>
            {[
              'All encounters have been accounted for',
              'Submission responses and reference numbers recorded',
              'Exceptions listed with a follow-up action',
              'No financial cash receipts generated by claim submission'
            ].map((label,i)=><label key={label} className="ct-day-check">
              <input type="checkbox" checked={checks[i]} onChange={e=>setChecks(old=>old.map((v,j)=>j===i?e.target.checked:v))}/>
              {label}</label>)}
            <label>Outstanding exception follow-up notes
              <textarea rows={3} value={notes} onChange={e=>{setNotes(e.target.value);requestId.current=null}}
                placeholder="Required if there are outstanding exceptions"/></label>
            <button className="primary-button" type="submit" disabled={busy||checks.some(x=>!x)}>
              <ClipboardCheck size={16}/> {busy?'Recording…':'Submit Medical Aid Sign-Off'}
            </button>
          </form>}
        </section>
      </div>
    </>}
  </>
}


type ExpenseRequestRow = {
  id:string; supplier:string; expenseDate:string; category:string; description:string
  amount:number;method:string;reference:string;receiptReference:string
  requestedByUserId:string;requestedAtUtc:string
  decision: null|{id:string;decision:string;notes:string;postedExpenseId:string|null}
}
type ExpenseData = {pendingOrDecided:ExpenseRequestRow[];posted:ExpenseRow[]}
const expenseCategories = ['Dental Supplies','Laboratory','Equipment','Utilities','Maintenance','Rent','Staff Costs','Other']

function ExpenseDrawer({date,manager,onClose}:{
  date:string;manager:boolean;onClose:()=>void
}) {
  const [supplier,setSupplier]=useState('')
  const [category,setCategory]=useState('Dental Supplies')
  const [description,setDescription]=useState('')
  const [amount,setAmount]=useState('')
  const [method,setMethod]=useState('Cash')
  const [reference,setReference]=useState('')
  const [receipt,setReceipt]=useState('')
  const [data,setData]=useState<ExpenseData|null>(null)
  const [selected,setSelected]=useState<ExpenseRequestRow|null>(null)
  const [decisionNote,setDecisionNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [note,setNote]=useState<Note|null>(null)
  const [revision,refresh]=useState(0)
  const requestId=useRef<string|null>(null)
  const decisionId=useRef<string|null>(null)
  useEffect(()=>{
    let active=true
    apiRequest<ExpenseData>('/billing/expenses?date='+encodeURIComponent(date))
      .then(d=>{if(active)setData(d)})
      .catch(e=>{if(active)setNote({kind:'error',text:problem(e)})})
    return()=>{active=false}
  },[date,revision])
  const fieldChanged=()=>{requestId.current=null}
  async function submit(e:FormEvent){
    e.preventDefault();setNote(null);setBusy(true)
    requestId.current||=randId()
    try{
      await apiRequest('/billing/expenses','POST',{
        requestId:requestId.current,expenseDate:date,supplier,category,description,
        amount:Number(amount),method,reference,receiptReference:receipt
      })
      requestId.current=null
      setSupplier('');setDescription('');setAmount('');setReference('');setReceipt('')
      setNote({kind:'success',text:'Expense requested. Practice manager approval is required before it appears in the ledger.'})
      refresh(n=>n+1)
    }catch(err){setNote({kind:'error',text:problem(err)})}
    finally{setBusy(false)}
  }
  async function decide(decision:'Approved'|'Rejected'){
    if(!selected)return
    setNote(null);setBusy(true);decisionId.current||=randId()
    try{
      await apiRequest('/billing/expenses/'+encodeURIComponent(selected.id)+'/decision','POST',{
        requestId:decisionId.current,decision,notes:decisionNote
      })
      decisionId.current=null;setSelected(null);setDecisionNote('')
      setNote({kind:'success',text:decision==='Approved'?'Approved and posted once to Finances.':'Rejected without a ledger entry.'})
      refresh(n=>n+1)
    }catch(err){setNote({kind:'error',text:problem(err)})}
    finally{setBusy(false)}
  }
  return <Popup title="Record daily expense" subtitle="One pending request, one approved Finances expense" onClose={onClose}>
    <Notice value={note}/>
    <form className="ct-day-form" onSubmit={submit}>
      <div className="ct-day-form-grid">
        <label>Supplier<input required minLength={2} maxLength={120} value={supplier}
          placeholder="City Pharmacy" onChange={e=>{setSupplier(e.target.value);fieldChanged()}}/></label>
        <label>Category<select value={category} onChange={e=>{setCategory(e.target.value);fieldChanged()}}>
          {expenseCategories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Amount (ZAR)<input required type="number" step=".01" min=".01" value={amount}
          onChange={e=>{setAmount(e.target.value);fieldChanged()}}/></label>
        <label>Payment method<select value={method} onChange={e=>{setMethod(e.target.value);fieldChanged()}}>
          <option>Cash</option><option>Card</option><option>EFT</option></select></label>
        <label>Transaction reference<input value={reference} maxLength={100}
          required={method!=='Cash'} placeholder="Cash slip / card / EFT reference"
          onChange={e=>{setReference(e.target.value);fieldChanged()}}/></label>
        <label>Receipt / evidence reference<input required minLength={3} maxLength={300} value={receipt}
          placeholder="Receipts secure file ID or slip reference"
          onChange={e=>{setReceipt(e.target.value);fieldChanged()}}/></label>
      </div>
      <label>Description<textarea required minLength={5} maxLength={250} rows={2}
        value={description} onChange={e=>{setDescription(e.target.value);fieldChanged()}}
        placeholder="Why this purchase was needed"/></label>
      <button type="submit" className="primary-button" disabled={busy}>
        <Plus size={15}/> {busy?'Saving…':'Request expense approval'}
      </button>
      <p className="ct-day-muted">Reception may capture the expense, but only a manager's approval posts it into the existing financial ledger. Laboratory payouts already recorded there must not be entered twice.</p>
    </form>
    <section className="ct-day-subpanel">
      <h3>Daily expense approvals</h3>
      {!data&&<p>Loading expense requests…</p>}
      {data?.pendingOrDecided.map(x=><div className="ct-day-stat-row" key={x.id}>
        <span><strong>{x.supplier}</strong> · {x.category} · {money(x.amount)}
          <small>{x.receiptReference}</small></span>
        <div className="ct-day-inline">
          <Status good={x.decision?.decision==='Approved'} label={x.decision?.decision||'Pending approval'}/>
          {manager&&!x.decision&&<button className="ct-day-link" type="button"
            onClick={()=>{setSelected(x);setDecisionNote('');decisionId.current=null}}>Review</button>}
        </div>
      </div>)}
      {data?.pendingOrDecided.length===0&&<p>No approval requests on this date.</p>}
      <small className="ct-day-muted">{data?.posted.length||0} expenses already posted in the authoritative Finances ledger for this date.</small>
    </section>
    {selected&&<Popup title={'Manager approval: '+selected.supplier} subtitle="Review amount, supplier and evidence before posting" onClose={()=>setSelected(null)}>
      <div className="ct-day-detail">
        <div><span>Amount</span><strong>{money(selected.amount)}</strong></div>
        <div><span>Payment method</span><strong>{selected.method}</strong></div>
        <div><span>Receipt evidence</span><strong>{selected.receiptReference}</strong></div>
        <div><span>Description</span><strong>{selected.description}</strong></div>
      </div>
      <label className="ct-day-field">Authorisation or rejection reason
        <textarea minLength={5} required value={decisionNote} rows={3}
          onChange={e=>{setDecisionNote(e.target.value);decisionId.current=null}}/></label>
      <div className="ct-day-actions">
        <button type="button" className="primary-button" disabled={busy||decisionNote.trim().length<5}
          onClick={()=>void decide('Approved')}>Approve & post once</button>
        <button type="button" className="secondary-button" disabled={busy||decisionNote.trim().length<5}
          onClick={()=>void decide('Rejected')}>Reject</button>
      </div>
    </Popup>}
  </Popup>
}

type RefundRow = {id:string;paymentId:string;refundedOn:string;amount:number;method:string;reason:string;evidenceReference:string}
function RefundDrawer({date,onClose}:{date:string;onClose:()=>void}){
  const [paymentId,setPaymentId]=useState('')
  const [amount,setAmount]=useState('')
  const [reason,setReason]=useState('')
  const [evidence,setEvidence]=useState('')
  const [rows,setRows]=useState<RefundRow[]>([])
  const [revision,refresh]=useState(0)
  const [note,setNote]=useState<Note|null>(null)
  const [busy,setBusy]=useState(false)
  const request=useRef<string|null>(null)
  useEffect(()=>{
    let live=true
    apiRequest<RefundRow[]>('/billing/refunds?date='+encodeURIComponent(date))
      .then(x=>{if(live)setRows(x)}).catch(e=>{if(live)setNote({kind:'error',text:problem(e)})})
    return()=>{live=false}
  },[date,revision])
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);request.current||=randId()
    try{
      await apiRequest('/billing/refunds','POST',{
        requestId:request.current,paymentId,amount:Number(amount),
        refundedOn:date,reason,evidenceReference:evidence
      })
      request.current=null;setPaymentId('');setAmount('');setReason('');setEvidence('')
      setNote({kind:'success',text:'Actual refund declared against the original receipt. No second invoice or payment created.'})
      refresh(v=>v+1)
    }catch(err){setNote({kind:'error',text:problem(err)})}
    finally{setBusy(false)}
  }
  return <Popup title="Record actual refund" subtitle="Manager-approved, evidence-linked money outflow" onClose={onClose}>
    <Notice value={note}/>
    <form className="ct-day-form" onSubmit={submit}>
      <label>Original payment ID<input required value={paymentId} placeholder="Use payment ID from receipt"
        onChange={e=>{setPaymentId(e.target.value);request.current=null}}/></label>
      <label>Amount actually refunded (ZAR)<input type="number" required min=".01" step=".01" value={amount}
        onChange={e=>{setAmount(e.target.value);request.current=null}}/></label>
      <label>Reason<textarea required minLength={5} rows={2} value={reason}
        onChange={e=>{setReason(e.target.value);request.current=null}}/></label>
      <label>Evidence / bank or cash slip reference<input required minLength={3} value={evidence}
        onChange={e=>{setEvidence(e.target.value);request.current=null}}/></label>
      <button className="primary-button" disabled={busy} type="submit">Record verified money outflow</button>
      <p className="ct-day-muted">This is a record of funds already returned, not a payment gateway instruction or an automatic reversal of invoice allocations.</p>
    </form>
    <h3>Recorded refunds</h3>
    {rows.length===0&&<p>No refunds on the selected date.</p>}
    {rows.map(x=><div className="ct-day-stat-row" key={x.id}>
      <span>{x.method} · {x.reason}</span><strong>{money(x.amount)}</strong></div>)}
  </Popup>
}

type ClaimRow = {id:string;patientId:string;invoiceId:string;claimNumber:string
  patientName:string;schemeName:string;planName:string;claimedAmount:number;status:string}
type ClaimEvent = {id:string;toStatus:string;fromStatus:string;performedAtUtc:string
  externalReference:string|null;reason:string;evidenceReference:string}
type Correction = {id:string;version:number;previousCode:string;correctedCode:string
  reason:string;approvedAtUtc:string;evidenceReference:string}
type ClaimHistory = {claim:{id:string;status:string;claimedAmount:number
  externalReference:string|null};events:ClaimEvent[];corrections:Correction[]}
type InvoiceLine = {id:string;description:string;amount:number}
const allowedTransitions:Record<string,string[]> = {
  Draft:['SubmittedExternallyReported'],
  SubmittedExternallyReported:['AcknowledgedReported','ApprovedReported','PartiallyApprovedReported','RejectedReported'],
  AcknowledgedReported:['ApprovedReported','PartiallyApprovedReported','RejectedReported'],
  CorrectedPendingResubmission:['SubmittedExternallyReported']
}
function MedicalAidActivity({date,setDate,revision,refresh,manager}:{
  date:string;setDate:(date:string)=>void;revision:number;refresh:()=>void;manager:boolean
}){
  const [day,setDay]=useState<MedicalDay|null>(null)
  const [claims,setClaims]=useState<ClaimRow[]>([])
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState<'all'|'rejected'|'submitted'|'draft'|'approved'>('all')
  const [selected,setSelected]=useState<ClaimRow|null>(null)
  const [history,setHistory]=useState<ClaimHistory|null>(null)
  const [lines,setLines]=useState<InvoiceLine[]>([])
  const [loading,setLoading]=useState(true)
  const [notice,setNotice]=useState<Note|null>(null)
  const [toolsOpen,setToolsOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [target,setTarget]=useState('SubmittedExternallyReported')
  const [externalRef,setExternalRef]=useState('')
  const [approved,setApproved]=useState('0.00')
  const [evidence,setEvidence]=useState('')
  const [reason,setReason]=useState('')
  const [invoiceLine,setInvoiceLine]=useState('')
  const [oldCode,setOldCode]=useState('')
  const [newCode,setNewCode]=useState('')
  const [correctionOpen,setCorrectionOpen]=useState(false)
  const request=useRef<string|null>(null)
  const [localRevision,localRefresh]=useState(0)

  useEffect(()=>{
    let live=true;setLoading(true)
    Promise.all([
      apiRequest<MedicalDay>('/billing/medical-aid-day?date='+encodeURIComponent(date)),
      apiRequest<ClaimRow[]>('/finance/medical-aid/claims')
    ]).then(([d,c])=>{if(live){setDay(d);setClaims(c);setNotice(null)}})
      .catch(err=>{if(live)setNotice({kind:'error',text:problem(err)})})
      .finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[date,revision,localRevision])

  useEffect(()=>{
    if(!selected)return
    let live=true
    Promise.all([
      apiRequest<ClaimHistory>('/finance/medical-aid/claims/'+encodeURIComponent(selected.id)+'/workflow/history'),
      apiRequest<{lines:InvoiceLine[]}>('/finance/invoices/'+encodeURIComponent(selected.invoiceId))
    ]).then(([h,i])=>{if(live){setHistory(h);setLines(i.lines||[]);setInvoiceLine(i.lines?.[0]?.id||'')}})
      .catch(err=>{if(live)setNotice({kind:'error',text:problem(err)})})
    return()=>{live=false}
  },[selected?.id,selected?.invoiceId,localRevision])

  const filtered=useMemo(()=>claims.filter(c=>{
    const q=search.trim().toLowerCase()
    const matches= [c.patientName,c.claimNumber,c.schemeName,c.status].some(s=>s.toLowerCase().includes(q))
    return matches && (filter==='all'||
      filter==='rejected'&&(c.status==='RejectedReported'||c.status==='CorrectedPendingResubmission')||
      filter==='submitted'&&c.status==='SubmittedExternallyReported'||
      filter==='draft'&&c.status==='Draft'||
      filter==='approved'&&['ApprovedReported','PartiallyApprovedReported'].includes(c.status))
  }),[claims,filter,search])

  async function transition(e:FormEvent){
    e.preventDefault();if(!selected)return
    setBusy(true);setNotice(null);request.current||=randId()
    try{
      await apiRequest('/finance/medical-aid/claims/'+encodeURIComponent(selected.id)+'/workflow/transition','POST',{
        requestId:request.current,targetStatus:target,externalReference:externalRef||null,
        approvedAmount:['ApprovedReported','PartiallyApprovedReported','RejectedReported'].includes(target)
          ?Number(approved):null,
        evidenceReference:evidence,reason
      })
      request.current=null;setSelected(null);setHistory(null);localRefresh(n=>n+1);refresh()
      setNotice({kind:'success',text:'Claim event recorded on the original claim, without posting financial receipts.'})
    }catch(err){setNotice({kind:'error',text:problem(err)})}
    finally{setBusy(false)}
  }
  async function correct(e:FormEvent){
    e.preventDefault();if(!selected)return
    setBusy(true);setNotice(null);request.current||=randId()
    try{
      await apiRequest('/finance/medical-aid/claims/'+encodeURIComponent(selected.id)+'/corrections','POST',{
        requestId:request.current,invoiceLineId:invoiceLine,previousCode:oldCode,
        correctedCode:newCode,reason,evidenceReference:evidence
      })
      request.current=null;setCorrectionOpen(false);setSelected(null);setHistory(null)
      localRefresh(n=>n+1);refresh()
      setNotice({kind:'success',text:'Versioned correction recorded. Resubmit the SAME claim using a NEW submission reference.'})
    }catch(err){setNotice({kind:'error',text:problem(err)})}
    finally{setBusy(false)}
  }
  const options=selected?(allowedTransitions[selected.status]||[]):[]
  return <>
    <Header title="Billing – Medical Aid" subtitle="Claims are operations, NOT cash receipts. Follow every rejected claim to correction and resubmission."
      date={date} setDate={setDate} refresh={refresh}/>
    <Notice value={notice}/>
    {loading&&<p>Loading medical aid activity…</p>}
    {day&&<div className="ct-day-kpis">
      <Kpi label="Unique claims today" value={String(day.activity.uniqueClaims)} note="One original claim ID"/>
      <Kpi tone="purple" label="Claim value" value={money(day.activity.submittedValue)} note="Not money received"/>
      <Kpi tone="teal" label="Transmission attempts" value={String(day.activity.submissionAttempts)} note="Includes resubmissions"/>
      <Kpi tone="gold" label="Actions pending" value={String(day.activity.actionsPending)} note="Rejected / unsubmitted follow-up"/>
    </div>}
    <div className="ct-day-panel">
      <div className="ct-day-toolbar"><label><Search size={15}/><input type="search" value={search}
        onChange={e=>setSearch(e.target.value)} placeholder="Search patient, scheme, claim or status"/></label>
        <button className="secondary-button" type="button" onClick={()=>setToolsOpen(v=>!v)}>
          {toolsOpen?'Hide':'Open'} claims & remittance tools
        </button></div>
      <nav className="ct-day-tabs" aria-label="Claim status filters">
        {(['all','submitted','draft','approved','rejected'] as const).map(x=>
          <button type="button" key={x} className={filter===x?'active':''}
            onClick={()=>setFilter(x)}>{x==='rejected'?'Rejected / Needs correction':x}</button>)}
      </nav>
      <div className="ct-day-table-scroll"><table><thead><tr>
        <th>Patient</th><th>Scheme</th><th>Claim</th><th>Claimed</th><th>Status</th><th>Action</th>
      </tr></thead><tbody>
        {filtered.map(c=><tr key={c.id}>
          <td>{c.patientName}</td><td>{c.schemeName}</td>
          <td>{c.claimNumber}</td><td>{money(c.claimedAmount)}</td>
          <td><Status good={c.status==='ApprovedReported'} label={c.status.replaceAll('Reported','')}/></td>
          <td><button className="ct-day-link" type="button"
            onClick={()=>{setSelected(c);setHistory(null);setReason('');setEvidence('');
              setApproved(c.status==='RejectedReported'?'0.00':String(c.claimedAmount));
              setExternalRef('');setTarget((allowedTransitions[c.status]||[])[0]||'');
              setCorrectionOpen(false);request.current=null}}>
            Review / correct</button></td>
        </tr>)}
        {filtered.length===0&&<tr><td colSpan={6}>No claims match these filters.</td></tr>}
      </tbody></table></div>
    </div>
    {toolsOpen&&<section className="ct-day-existing-module">
      <MedicalAidPanel canManage={manager}/>
    </section>}
    {selected&&<Popup title={'Medical Aid – '+selected.claimNumber}
      subtitle={selected.patientName+' / '+selected.schemeName+' / '+money(selected.claimedAmount)}
      onClose={()=>setSelected(null)}>
      {!history?<p>Loading the original claim and its submission attempts…</p>:<>
        <div className="ct-day-inline">
          <Status good={selected.status==='ApprovedReported'} label={selected.status}/>
          <strong>One logical claim · {history.events.filter(e=>e.toStatus==='SubmittedExternallyReported').length} transmission attempts</strong>
        </div>
        <h3>Submission, rejection and correction history</h3>
        <div className="ct-day-timeline">
          {history.events.map(x=><div key={x.id}>
            <small>{dateTime(x.performedAtUtc)}</small>
            <strong>{x.toStatus}</strong>
            <p>{x.reason}</p>
            <small>Evidence: {x.evidenceReference} {x.externalReference?' · Scheme ref '+x.externalReference:''}</small>
          </div>)}
          {history.corrections?.map(x=><div key={x.id}>
            <small>{dateTime(x.approvedAtUtc)}</small>
            <strong>Correction v{x.version}: {x.previousCode} → {x.correctedCode}</strong>
            <p>{x.reason}</p><small>Evidence: {x.evidenceReference}</small>
          </div>)}
        </div>
        {selected.status==='RejectedReported'&&manager&&
          <button type="button" className="primary-button" onClick={()=>{setCorrectionOpen(true);request.current=null}}>
            Review / correct rejected claim</button>}
        {correctionOpen&&selected.status==='RejectedReported'&&manager&&
          <form className="ct-day-form" onSubmit={correct}>
            <h3>Approved code correction</h3>
            <label>Clinical invoice source line<select required value={invoiceLine}
              onChange={e=>{setInvoiceLine(e.target.value);request.current=null}}>
              {lines.map(l=><option key={l.id} value={l.id}>{l.description} · {money(l.amount)}</option>)}
            </select></label>
            <div className="ct-day-form-grid">
              <label>Rejected code<input required maxLength={40} value={oldCode}
                onChange={e=>{setOldCode(e.target.value);request.current=null}}/></label>
              <label>Corrected approved procedure code<input required maxLength={40} value={newCode}
                onChange={e=>{setNewCode(e.target.value);request.current=null}}/></label>
            </div>
            <label>Clinical verification & manager authorisation notes<textarea required minLength={10}
              value={reason} onChange={e=>{setReason(e.target.value);request.current=null}} rows={3}/></label>
            <label>Evidence reference<input required minLength={3} value={evidence}
              onChange={e=>{setEvidence(e.target.value);request.current=null}}/></label>
            <p className="ct-day-muted">This records a corrected claim-code version only. It does not alter the invoice, clinical history or original claim ID.</p>
            <button className="primary-button" type="submit" disabled={busy||!invoiceLine}>Save versioned correction</button>
          </form>}
        {!!options.length&&manager&&!(selected.status==='RejectedReported')&&
          <form className="ct-day-form" onSubmit={transition}>
            <h3>{selected.status==='CorrectedPendingResubmission'?'Resubmit corrected claim':'Record staff-reported scheme response'}</h3>
            <label>Next status<select value={target} onChange={e=>{setTarget(e.target.value);request.current=null}}>
              {options.map(x=><option key={x} value={x}>{x}</option>)}
            </select></label>
            {target==='SubmittedExternallyReported'&&<label>New external submission reference
              <input required minLength={2} value={externalRef} maxLength={120}
                onChange={e=>{setExternalRef(e.target.value);request.current=null}}/></label>}
            {['ApprovedReported','PartiallyApprovedReported','RejectedReported'].includes(target)&&
              <label>Reported scheme approved amount (R0 for rejection)
                <input type="number" min="0" step=".01" required value={approved}
                  onChange={e=>{setApproved(e.target.value);request.current=null}}/></label>}
            <label>Evidence / scheme response ID<input required minLength={3} value={evidence}
              onChange={e=>{setEvidence(e.target.value);request.current=null}}/></label>
            <label>Reason / response details<textarea required minLength={5} rows={2} value={reason}
              onChange={e=>{setReason(e.target.value);request.current=null}}/></label>
            <button type="submit" className="primary-button" disabled={busy}>Record event without posting cash</button>
          </form>}
        <p className="ct-day-muted">Scheme remittances are recorded and allocated only after the bank movement is verified. Open claims & remittance tools to match actual receipts.</p>
      </>}
    </Popup>}
  </>
}

