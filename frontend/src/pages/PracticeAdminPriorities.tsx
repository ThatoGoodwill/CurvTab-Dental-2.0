import { useEffect, useState } from 'react'
import { CalendarClock, ClipboardCheck, FlaskConical, UsersRound, RefreshCw } from 'lucide-react'
import { apiRequest } from '../services/api'
import './RoleOperationsDashboard.css'

type Counts = { checkout: number | null; staff: number | null; lab: number | null }
type Staff = { isActive: boolean }
type LabOrder = { status: string }
type Lab = { orders: LabOrder[] }

export default function PracticeAdminPriorities({
  onDayClose, onStaff, onLaboratory, onScheduling
}: {
  onDayClose: () => void
  onStaff: () => void
  onLaboratory: () => void
  onScheduling: () => void
}) {
  const [counts,setCounts] = useState<Counts>({checkout:null, staff:null,lab:null})
  const [refresh,setRefresh] = useState(0)
  const [loading,setLoading] = useState(false)
  useEffect(()=>{
    let active = true
    setLoading(true)
    Promise.allSettled([
      apiRequest<unknown[]>('/frontdesk/checkout-ready'),
      apiRequest<Staff[]>('/staff'),
      apiRequest<Lab>('/laboratory/dashboard')
    ]).then(([checkout,staff,lab])=>{
      if (!active) return
      setCounts({
        checkout:checkout.status === 'fulfilled' && Array.isArray(checkout.value) ? checkout.value.length : null,
        staff:staff.status === 'fulfilled' && Array.isArray(staff.value) ? staff.value.filter(x=>x.isActive).length : null,
        lab:lab.status === 'fulfilled' && Array.isArray(lab.value.orders)
          ? lab.value.orders.filter(x=>x.status !== 'Closed').length : null,
      })
    }).finally(()=>{ if(active) setLoading(false) })
    return ()=>{active=false}
  },[refresh])
  const actions = [
    {name:'Appointments',detail:'Manage today’s visits',value:null,Icon:CalendarClock,action:onScheduling},
    {name:'Day Close',detail:'Cash and claims sign-off',value:null,Icon:ClipboardCheck,action:onDayClose},
    {name:'Staff Management',detail:'Active staff',value:counts.staff,Icon:UsersRound,action:onStaff},
    {name:'Laboratory',detail:'Open lab orders',value:counts.lab,Icon:FlaskConical,action:onLaboratory}
  ]
  return <details className="ct-practice-actions">
    <summary aria-label="Open practice management actions">
      Practice actions <span aria-hidden="true">•••</span>
    </summary>
    <div className="ct-practice-actions-menu">
      <div className="ct-practice-actions-title">
        <strong>Practice management</strong>
        <button type="button" aria-label="Refresh practice management counts" disabled={loading}
          onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={14}/></button>
      </div>
      {actions.map(({name,detail,value,Icon,action})=>
        <button type="button" className="ct-practice-action" key={name} onClick={action}>
          <Icon size={15} aria-hidden="true"/>
          <span><strong>{name}</strong><small>{value === null ? detail : `${detail}: ${value}`}</small></span>
        </button>)}
      {counts.checkout !== null && counts.checkout > 0 &&
        <p className="ct-practice-checkout-note">{counts.checkout} checkout {counts.checkout===1?'visit needs':'visits need'} attention.</p>}
    </div>
  </details>
}
