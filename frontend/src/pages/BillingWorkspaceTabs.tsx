import { useState } from 'react'
import type { ReactNode } from 'react'
import { ShieldCheck, Wallet, Users, ClipboardList, FileText } from 'lucide-react'
import './BillingWorkspaceTabs.css'

type BillingTab =
  | 'checkout'
  | 'plans'
  | 'balances'
  | 'invoices'
  | 'medicalAid'

type Props = {
  checkout: ReactNode
  plans: ReactNode
  balances: ReactNode
  invoices: ReactNode
  medicalAid: ReactNode
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
  }

  return (
    <div className="ct-billing-workspace">
      <div className="ct-billing-workspace-heading">
        <span>FRONT DESK · BILLING</span>
        <h1>Billing</h1>
        <p>
          Check out patients by cash, card, split payment or
          medical aid, and view patient balances.
        </p>
      </div>

      <nav
        className="ct-billing-tabs"
        aria-label="Billing sections"
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
