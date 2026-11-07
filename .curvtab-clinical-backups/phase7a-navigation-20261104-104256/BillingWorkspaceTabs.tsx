import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Wallet,
  Receipt,
  Users,
  FileText,
  Calculator,
} from 'lucide-react'
import './BillingWorkspaceTabs.css'

type BillingTab =
  | 'checkout'
  | 'ledger'
  | 'balances'
  | 'invoices'
  | 'expenses'

type Props = {
  checkout: ReactNode
  ledger: ReactNode
  balances: ReactNode
  invoices: ReactNode
  expenses: ReactNode
}

const tabs = [
  { id: 'checkout', label: 'Checkout', Icon: Wallet },
  { id: 'ledger', label: 'Cash Ledger', Icon: Receipt },
  { id: 'balances', label: 'Patient Balances', Icon: Users },
  {
    id: 'invoices',
    label: 'Invoices & Payment Allocations',
    Icon: FileText,
  },
  {
    id: 'expenses',
    label: 'Expenses & Cash Sign-Off',
    Icon: Calculator,
  },
] as const

export default function BillingWorkspaceTabs({
  checkout,
  ledger,
  balances,
  invoices,
  expenses,
}: Props) {
  const [activeTab, setActiveTab] =
    useState<BillingTab>('checkout')

  const content: Record<BillingTab, ReactNode> = {
    checkout,
    ledger,
    balances,
    invoices,
    expenses,
  }

  return (
    <div className="ct-billing-workspace">
      <div className="ct-billing-workspace-heading">
        <span>FRONT DESK · FINANCE</span>
        <h1>Checkout & Payments</h1>
        <p>
          Manage checkout, receipts, patient accounts,
          invoices and practice expenses.
        </p>
      </div>

      <nav
        className="ct-billing-tabs"
        aria-label="Financial sections"
      >
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={activeTab === id ? 'page' : undefined}
            className={
              'ct-billing-tab' +
              (activeTab === id ? ' active' : '')
            }
            onClick={() => setActiveTab(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div
        className="ct-billing-tab-content"
        key={activeTab}
      >
        {content[activeTab]}
      </div>
    </div>
  )
}
