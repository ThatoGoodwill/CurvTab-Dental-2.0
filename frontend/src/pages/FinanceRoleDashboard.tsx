import { useEffect, useState } from 'react'
import { Banknote, Wallet } from 'lucide-react'
import RoleDashboardCarousel from './RoleDashboardCarousel'
import './RoleOperationsDashboard.css'

type Summary = {
  cashReceived: number
  cashReceiptCount: number
  cashExpenses: number
  cashExpenseCount: number
  signoff: { id: string } | null
  changedAfterSignoff: boolean
}
const dateSA = () => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date())
const zar = (value: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR'
}).format(value)

export default function FinanceRoleDashboard({ onOpenFinances }: { onOpenFinances: () => void }) {
  const [summary,setSummary] = useState<Summary|null>(null)
  const [busy,setBusy] = useState(true)
  const [error,setError] = useState('')
  const [reload,setReload] = useState(0)

  useEffect(()=>{
    let active = true
    setBusy(true)
    fetch(`/api/finance/operations?date=${encodeURIComponent(dateSA())}`, {
      credentials:'include',cache:'no-store'
    }).then(async response=>{
      if (!response.ok) throw new Error(`Financial summary unavailable (${response.status}).`)
      return response.json() as Promise<Summary>
    }).then(data=>{
      if (!active) return
      setSummary(data); setError('')
    }).catch((cause:unknown)=>{
      if (!active) return
      setSummary(null)
      setError(cause instanceof Error ? cause.message : 'Financial summary unavailable.')
    }).finally(()=>{ if(active) setBusy(false) })
    return ()=>{active=false}
  },[reload])
  const refresh=()=>setReload(v=>v+1)
  const amount=(value:number|undefined)=> busy || value===undefined ? '—' : zar(value)
  return <section className="ct-role-dashboard ct-finance-dashboard">
    <RoleDashboardCarousel eyebrow="FINANCE · AUTHORISED RECORDS" loading={busy} onRefresh={refresh}
      slides={[
        {title:'Cash & Expenses',content:<div className="ct-role-panel">
          <header><div><h2>Today's financial activity</h2><p>{dateSA()} · Recorded cash only, not medical-aid submissions.</p></div>
            <button type="button" className="primary-button" onClick={onOpenFinances}><Wallet size={15}/> Open Finances</button>
          </header>
          {error && <p className="ct-role-alert" role="alert">{error}</p>}
          <div className="ct-clinical-progress">
            <div><Banknote size={17}/><span>Cash received</span><strong>{amount(summary?.cashReceived)}</strong></div>
            <div><Wallet size={17}/><span>Cash expenses</span><strong>{amount(summary?.cashExpenses)}</strong></div>
            <div><span>Receipts</span><strong>{busy || !summary ? '—' : summary.cashReceiptCount}</strong></div>
            <div><span>Expense records</span><strong>{busy || !summary ? '—' : summary.cashExpenseCount}</strong></div>
          </div>
        </div>},
        {title:'Cash Close Status',content:<div className="ct-role-panel">
          <header><div><h2>Reconciliation status</h2><p>Manager sign-off and subsequent changes, from recorded finance data.</p></div>
            <button type="button" className="secondary-button" onClick={onOpenFinances}>Open financial controls</button>
          </header>
          {error ? <p className="ct-role-alert" role="alert">{error}</p> :
            <div className="ct-clinical-progress">
              <div><span>Cash close</span><strong className="ct-role-status-text">{busy || !summary ? 'Unavailable' : summary.signoff ? 'Signed' : 'Not signed'}</strong></div>
              <div><span>Changes after sign-off</span><strong className="ct-role-status-text">{busy || !summary ? 'Unavailable' : summary.changedAfterSignoff ? 'Review required' : 'None recorded'}</strong></div>
            </div>}
        </div>}
      ]}/>
  </section>
}
