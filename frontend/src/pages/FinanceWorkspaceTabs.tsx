import { useState } from 'react'
import type { ReactNode } from 'react'
import { Receipt, FileText, Calculator } from 'lucide-react'
import './BillingWorkspaceTabs.css'

type FinanceTab = 'revenue' | 'expenses' | 'invoices'

type Props = {
  revenue: ReactNode
  expenses: ReactNode
  invoices: ReactNode
}

const tabs = [
  { id: 'revenue', label: 'Revenue', Icon: Receipt },
  { id: 'expenses', label: 'Expenses & Cash Sign-Off', Icon: Calculator },
  { id: 'invoices', label: 'Invoices & Payment Allocations', Icon: FileText },
] as const

export default function FinanceWorkspaceTabs({ revenue, expenses, invoices }: Props) {
  const [activeTab, setActiveTab] = useState<FinanceTab>('revenue')
  const content: Record<FinanceTab, ReactNode> = { revenue, expenses, invoices }

  return (
    <div className="ct-billing-workspace">
      <div className="ct-billing-workspace-heading">
        <span>PRACTICE · FINANCE</span>
        <h1>Finance</h1>
        <p>Revenue received by cash, card and EFT, practice expenses, cash sign-off and invoices.</p>
      </div>
      <nav className="ct-billing-tabs" aria-label="Finance sections">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button"
            aria-current={activeTab === id ? 'page' : undefined}
            className={'ct-billing-tab' + (activeTab === id ? ' active' : '')}
            onClick={() => setActiveTab(id)}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="ct-billing-tab-content" key={activeTab}>{content[activeTab]}</div>
    </div>
  )
}
