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

// ADD_MOVEMENTS_AND_CLAIMS_BELOW
