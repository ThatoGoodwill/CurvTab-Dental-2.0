import { useState } from 'react'
import type { ReactNode } from 'react'
import { Receipt, FileText, Calculator, Users, Wallet } from 'lucide-react'
import './BillingWorkspaceTabs.css'

type FinanceTab = 'revenue' | 'review' | 'invoices' | 'balances'

type Props = {
  revenue: ReactNode
  review: ReactNode
  invoices: ReactNode
  balances: ReactNode
}

const tabs = [
  { id: 'revenue', label: 'Revenue', description: 'Real receipts and cash collections', Icon: Receipt },
  { id: 'review', label: 'Manager Review & Expenses', description: 'Cash exceptions and approved expenses', Icon: Calculator },
  { id: 'invoices', label: 'Invoices & Allocations', description: 'Manage issued invoice settlement', Icon: FileText },
  { id: 'balances', label: 'Patient Balances', description: 'Review outstanding accounts', Icon: Users },
] as const

export default function FinanceWorkspaceTabs({ revenue, review, invoices, balances }: Props) {
  const [activeTab, setActiveTab] = useState<FinanceTab>('revenue')
  const content: Record<FinanceTab, ReactNode> = { revenue, review, invoices, balances }

  return (
    <div className="ct-billing-workspace ct-financial-workspace ct-financial-finance">
      <header className="ct-billing-workspace-heading ct-financial-hero">
        <div>
          <span>PRACTICE · FINANCIAL CONTROL</span>
          <h1>Finance</h1>
          <p>Track receipts, expenses, invoice allocations and daily reconciliation.</p>
        </div>
        <div className="ct-financial-hero-mark" aria-hidden="true"><Wallet size={22}/></div>
      </header>
      <nav className="ct-billing-tabs ct-financial-nav" aria-label="Finance sections" role="tablist">
        {tabs.map(({ id, label, description, Icon }) => (
          <button key={id} type="button"
            role="tab" aria-selected={activeTab === id}
            className={'ct-billing-tab' + (activeTab === id ? ' active' : '')}
            onClick={() => setActiveTab(id)}>
            <span className="ct-financial-tab-icon"><Icon size={17} aria-hidden="true" /></span>
            <span className="ct-financial-tab-copy"><strong>{label}</strong><small>{description}</small></span>
          </button>
        ))}
      </nav>
      <section className="ct-billing-tab-content ct-financial-detail" key={activeTab} role="tabpanel"
        aria-label={tabs.find(tab => tab.id === activeTab)?.label}>{content[activeTab]}</section>
    </div>
  )
}
