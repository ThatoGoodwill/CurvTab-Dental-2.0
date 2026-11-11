import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Banknote, Check, ChevronDown, ClipboardList, CreditCard,
  FileText, LayoutGrid, Receipt, ShieldCheck, Users, Wallet,
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
  Icon: LucideIcon
}

const sections: BillingDestination[] = [
  { id: 'today', label: "Today's Billing", Icon: LayoutGrid },
  { id: 'cashPrivate', label: 'Cash & Private', Icon: Wallet },
  { id: 'medicalAid', label: 'Medical Aid', Icon: ShieldCheck },
  { id: 'cashClose', label: 'Cash Day Close', Icon: Banknote },
  { id: 'aidClose', label: 'Medical Aid Day Sign-Off', Icon: ClipboardList },
]

const privateSections: PrivateDestination[] = [
  { id: 'checkout', label: 'Patient Checkout', Icon: CreditCard },
  { id: 'invoices', label: 'Invoices & Allocations', Icon: FileText },
  { id: 'plans', label: 'Treatment Plans', Icon: ClipboardList },
  { id: 'balances', label: 'Patient Balances', Icon: Users },
  { id: 'ledger', label: 'Payments Ledger', Icon: Receipt },
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
  const selectedLabel = section === 'cashPrivate'
    ? privateSections.find(item => item.id === cashTab)?.label ?? 'Cash & Private'
    : sections.find(item => item.id === section)?.label ?? 'Billing'

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

  function goToPrivateTab(destination: CashPrivateTab) {
    setCashTab(destination)
    onSectionChange('cashPrivate')
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
        <h2>{section === 'cashPrivate' ? 'Cash & Private' : selectedLabel}</h2>
        <p>{descriptions[section]}</p>
      </div>
      <div className="ct-billing-menu-tools" ref={menuRef}>
        <span className="ct-billing-current" aria-live="polite">{selectedLabel}</span>
        <button
          ref={menuTriggerRef}
          type="button"
          className="ct-billing-menu-trigger"
          aria-expanded={menuOpen}
          aria-controls="ct-billing-all-menu"
          aria-haspopup="true"
          onClick={() => setMenuOpen(open => !open)}
        >
          <LayoutGrid size={15} aria-hidden="true" />
          <span>All Billing</span>
          <ChevronDown size={14} aria-hidden="true" className={menuOpen ? 'ct-billing-chevron-open' : ''}/>
        </button>

        {menuOpen && (
          <nav id="ct-billing-all-menu" className="ct-billing-menu" aria-label="Choose Billing section or action">
            <div className="ct-billing-menu-heading">BILLING SECTIONS</div>
            {sections.map(({ id, label, Icon }) => {
              const current = section === id && (id !== 'cashPrivate' || cashTab === 'checkout')
              return <button key={id} type="button"
                className={'ct-billing-menu-item' + (current ? ' active' : '')}
                aria-current={current ? 'page' : undefined}
                onClick={() => goToSection(id)}
              ><Icon size={15} aria-hidden="true"/><span>{label}</span>
                {current && <Check size={15} className="ct-billing-menu-check" aria-hidden="true"/>}
              </button>
            })}
            <div className="ct-billing-menu-heading">CASH & PRIVATE</div>
            {privateSections.map(({ id, label, Icon }) => {
              const current = section === 'cashPrivate' && cashTab === id
              return <button key={id} type="button"
                className={'ct-billing-menu-item' + (current ? ' active' : '')}
                aria-current={current ? 'page' : undefined}
                onClick={() => goToPrivateTab(id)}
              ><Icon size={15} aria-hidden="true"/><span>{label}</span>
                {current && <Check size={15} className="ct-billing-menu-check" aria-hidden="true"/>}
              </button>
            })}
            <div className="ct-billing-menu-heading">QUICK ACTION</div>
            <button type="button" className="ct-billing-menu-item" onClick={openExpense}>
              <Receipt size={15} aria-hidden="true"/><span>Record Expense</span>
            </button>
          </nav>
        )}
      </div>
    </header>

    {section === 'today' && <BillingTodayPage key={reload}/>}
    {section === 'cashPrivate' && (
      <section className="ct-billing-private-panel" aria-label={selectedLabel} key={cashTab}>
        {cashContent[cashTab]}
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
