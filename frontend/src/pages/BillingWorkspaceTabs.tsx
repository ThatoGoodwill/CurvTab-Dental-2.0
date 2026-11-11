import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Check, ChevronDown, ClipboardCheck, ClipboardList, LayoutGrid, ShieldCheck, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import BillingTodayPage from './BillingTodayPage'
import BillingCashDayClosePage from './BillingCashDayClosePage'
import BillingMedicalAidDaySignoffPage from './BillingMedicalAidDaySignoffPage'
import BillingExpenseDrawer from './BillingExpenseDrawer'
import './BillingWorkspaceTabs.css'
import './BillingClientGuide.css'

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
  medicalAid: ReactNode
  ledger: ReactNode
}

type BillingDestination = {
  id: BillingSection
  label: string
  Icon: LucideIcon
}

type PrivateDestination = {
  id: CashPrivateTab
  label: string
}

const sections: BillingDestination[] = [
  { id: 'today', label: "Today's Billing", Icon: LayoutGrid },
  { id: 'cashPrivate', label: 'Cash & Private', Icon: Wallet },
  { id: 'medicalAid', label: 'Medical Aid', Icon: ShieldCheck },
  { id: 'cashClose', label: 'Cash Day Close', Icon: ClipboardCheck },
  { id: 'aidClose', label: 'Medical Aid Day Sign-Off', Icon: ClipboardList },
]

const privateSections: PrivateDestination[] = [
  { id: 'checkout', label: 'Checkout' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'plans', label: 'Treatment Plans' },
  { id: 'balances', label: 'Patient Balances' },
  { id: 'ledger', label: 'Payment Ledger' },
]

const descriptions: Record<BillingSection, string> = {
  today: 'Real receipts, expenses and medical-aid activity at a glance.',
  cashPrivate: 'Checkout, receipts, invoices and payment records for private patients.',
  medicalAid: 'Claims, authorisations and scheme settlement records.',
  cashClose: 'Blind physical cash count with audited manager review.',
  aidClose: 'Daily scheme activity sign-off, separate from money received.',
}

export default function BillingWorkspaceTabs({
  section, onSectionChange, isManager,
  checkout, invoices, plans, balances, medicalAid, ledger,
}: Props) {
  const [cashTab, setCashTab] = useState<CashPrivateTab>('checkout')
  const [menuOpen, setMenuOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)

  const cashContent: Record<CashPrivateTab, ReactNode> = {
    checkout, invoices, plans, balances, ledger,
  }
  const selectedLabel = sections.find(item => item.id === section)?.label ?? 'Billing'
  const selectedPrivateLabel = privateSections.find(item => item.id === cashTab)?.label ?? 'Checkout'

  useEffect(() => {
    if (!menuOpen) return
    const handleOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuTriggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  useEffect(() => { setMenuOpen(false) }, [section])

  function goToSection(destination: BillingSection) {
    onSectionChange(destination)
    setMenuOpen(false)
  }

  function openExpense() {
    setExpenseOpen(true)
    setMenuOpen(false)
  }

  return <section className="ct-billing-workspace ct-billing-client-module">
    <header className="ct-billing-compact-header">
      <div className="ct-billing-compact-title">
        <small>RECEPTION / BILLING</small>
        <h2>{selectedLabel}</h2>
        <p>{descriptions[section]}</p>
      </div>
    </header>
    <div className="ct-billing-navigation-row">
      <div className="ct-billing-menu-tools" ref={menuRef}>
        <button ref={menuTriggerRef} type="button" className="ct-billing-menu-trigger"
          aria-expanded={menuOpen} aria-haspopup="true" aria-controls="ct-billing-all-menu"
          onClick={() => setMenuOpen(open => !open)}>
          <LayoutGrid size={15} aria-hidden="true"/>
          <span>All Billing</span>
          <ChevronDown size={14} aria-hidden="true"
            className={menuOpen ? 'ct-billing-chevron-open' : ''}/>
        </button>
        {menuOpen && (
          <nav id="ct-billing-all-menu" className="ct-billing-menu"
            aria-label="Choose one of the five Billing sections">
            {sections.map(({ id, label, Icon }) => {
              const current = section === id
              return <button key={id} type="button"
                className={'ct-billing-menu-item' + (current ? ' active' : '')}
                aria-current={current ? 'page' : undefined}
                onClick={() => goToSection(id)}>
                <Icon size={15} aria-hidden="true"/>
                <span>{label}</span>
                {current && <Check size={15} className="ct-billing-menu-check" aria-hidden="true"/>}
              </button>
            })}
          </nav>
        )}
      </div>
      <span className="ct-billing-current" aria-live="polite">
        {section === 'cashPrivate' ? selectedPrivateLabel : selectedLabel}
      </span>
    </div>

    {section === 'today' && <BillingTodayPage key={reload} onRecordExpense={openExpense}/>}
    {section === 'cashPrivate' && (
      <section className="ct-billing-private-panel" aria-label="Cash and private billing">
        <div className="ct-billing-private-picker">
          <label htmlFor="ct-billing-private-view">View</label>
          <select id="ct-billing-private-view" value={cashTab}
            onChange={event => setCashTab(event.target.value as CashPrivateTab)}>
            {privateSections.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
        <div key={cashTab}>{cashContent[cashTab]}</div>
      </section>
    )}
    {section === 'medicalAid' && <section className="ct-billing-private-panel">{medicalAid}</section>}
    {section === 'cashClose' && <BillingCashDayClosePage isManager={isManager}/>}
    {section === 'aidClose' && <BillingMedicalAidDaySignoffPage/>}

    {expenseOpen && <BillingExpenseDrawer
      onClose={() => setExpenseOpen(false)}
      onRecorded={() => { setExpenseOpen(false); setReload(value => value + 1) }}
    />}
  </section>
}
