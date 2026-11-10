import { useState } from 'react'
import type { ReactNode } from 'react'
import { ShieldCheck, Wallet, Users, ClipboardList, FileText } from 'lucide-react'
import { FileText, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import BillingTodayPage from './BillingTodayPage'
import BillingCashDayClosePage from './BillingCashDayClosePage'
import BillingMedicalAidDaySignoffPage from './BillingMedicalAidDaySignoffPage'
import BillingExpenseDrawer from './BillingExpenseDrawer'
import './BillingWorkspaceTabs.css'
import './BillingClientGuide.css'

type BillingTab =
  | 'checkout'
  | 'plans'
  | 'balances'
  | 'invoices'
  | 'medicalAid'
export type BillingSection = 'today' | 'cashPrivate' | 'medicalAid' | 'cashClose' | 'aidClose'
type CashPrivateTab = 'checkout' | 'invoices' | 'plans' | 'balances' | 'ledger'

type Props = {
  section: BillingSection
  onSectionChange: (section: BillingSection) => void
  isManager: boolean
  checkout: ReactNode
  invoices: ReactNode
  plans: ReactNode
  balances: ReactNode
  invoices: ReactNode
  medicalAid: ReactNode
  ledger: ReactNode
}

const tabs = [
  { id: 'checkout', label: 'Checkout', Icon: Wallet },
  { id: 'plans', label: 'Treatment Plan Accounts', Icon: ClipboardList },
  { id: 'balances', label: 'Patient Balances', Icon: Users },
  { id: 'invoices', label: 'Invoices & Payment Allocations', Icon: FileText },
  {
    id: 'medicalAid',
    label: 'Medical Aid',
    Icon: ShieldCheck,
  },
] as const

export default function BillingWorkspaceTabs({
  checkout,
  plans,
  balances,
  invoices,
  medicalAid,
}: Props) {
  const [activeTab, setActiveTab] =
    useState<BillingTab>('checkout')

  const content: Record<BillingTab, ReactNode> = {
    checkout,
    plans,
    balances,
    invoices,
    medicalAid,
const cashTabs = [
  { id:'checkout',label:'Patient Checkout', Icon:Wallet },
  { id:'invoices',label:'Invoices & Allocations',Icon:FileText },
  { id:'plans',label:'Treatment Plans',Icon:RefreshCw },
  { id:'balances',label:'Patient Balances',Icon:ShieldCheck },
  { id:'ledger',label:'Payments Ledger',Icon:Wallet },
] as const

export default function BillingWorkspaceTabs({
  section, onSectionChange, isManager,
  checkout, invoices, plans, balances, medicalAid, ledger,
}: Props) {
  const [cashTab, setCashTab] = useState<CashPrivateTab>('checkout')
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const cashContent: Record<CashPrivateTab, ReactNode> = {
    checkout, invoices, plans, balances, ledger,
  }
  const titles: Record<BillingSection,string> = {
    today:"Today's Billing", cashPrivate:'Cash & Private', medicalAid:'Medical Aid',
    cashClose:'Cash Day Close', aidClose:'Medical Aid Day Sign-Off',
  }
  return <section className="ct-billing-workspace ct-billing-client-module">
    <div className="ct-guide-heading">
      <div><small>CURVTAB DENTAL · RECEPTION</small>
        <h2>Billing — {titles[section]}</h2>
        <p>One Billing module. Actual receipts and medical-aid claims remain separate.</p></div>
      <button type="button" className="secondary-button" onClick={() => onSectionChange('today')}>
        Today's Billing</button>
    </div>
    {section === 'today' && <BillingTodayPage key={reload}
      onNavigate={onSectionChange} onRecordExpense={() => setExpenseOpen(true)}/>}
    {section === 'cashPrivate' && <div className="ct-guide-page">
      <div className="ct-guide-actions">
        {cashTabs.map(({id,label,Icon})=><button key={id} type="button"
          className={cashTab===id?'primary-button':'secondary-button'}
          onClick={()=>setCashTab(id)}><Icon size={16}/>{label}</button>)}
        <button type="button" className="secondary-button" onClick={()=>setExpenseOpen(true)}>
          <FileText size={16}/> Record Expense</button>
      </div>
      <section className="ct-billing-tab-content" key={cashTab}>{cashContent[cashTab]}</section>
    </div>}
    {section === 'medicalAid' && <section>{medicalAid}</section>}
    {section === 'cashClose' && <BillingCashDayClosePage isManager={isManager}/>}
    {section === 'aidClose' && <BillingMedicalAidDaySignoffPage/>}
    {expenseOpen && <BillingExpenseDrawer onClose={()=>setExpenseOpen(false)}
      onRecorded={()=>{setExpenseOpen(false);setReload(v=>v+1)}}/>}
  </section>
}
