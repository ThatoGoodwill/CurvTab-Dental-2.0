import { useState } from 'react'
import type { ReactNode } from 'react'
import { ShieldCheck, Wallet, Users, ClipboardList, FileText } from 'lucide-react'
import './BillingWorkspaceTabs.css'

type BillingTab =
  | 'checkout'
  | 'invoices'
  | 'plans'
  | 'balances'
  | 'medicalAid'

type Props = {
  checkout: ReactNode
  invoices: ReactNode
  plans: ReactNode
  balances: ReactNode
  medicalAid: ReactNode
}

const tabs = [
  { id: 'checkout', label: 'Checkout & Payments', description: 'Receive patient payments', Icon: Wallet },
  { id: 'invoices', label: 'Invoices', description: 'Issue and allocate invoices', Icon: FileText },
  { id: 'plans', label: 'Treatment Plans', description: 'Manage plan accounts', Icon: ClipboardList },
  { id: 'balances', label: 'Patient Balances', description: 'View outstanding balances', Icon: Users },
  {
    id: 'medicalAid',
    label: 'Medical Aid',
    description: 'Claims and settlements',
    Icon: ShieldCheck,
  },
] as const

export default function BillingWorkspaceTabs({
  checkout,
  invoices,
  plans,
  balances,
  medicalAid,
}: Props) {
  const [activeTab, setActiveTab] =
    useState<BillingTab>('checkout')

  const content: Record<BillingTab, ReactNode> = {
    checkout,
    invoices,
    plans,
    balances,
    medicalAid,
  }

  return (
    <div className="ct-billing-workspace ct-financial-workspace ct-financial-billing">
      <header className="ct-billing-workspace-heading ct-financial-hero">
        <div>
          <span>FRONT DESK · REVENUE CYCLE</span>
          <h1>Billing</h1>
          <p>Patient checkout, invoices, medical aid, treatment accounts and payments.</p>
        </div>
        <div className="ct-financial-hero-mark" aria-hidden="true"><Wallet size={22}/></div>
      </header>

      <nav className="ct-billing-tabs ct-financial-nav" aria-label="Billing sections" role="tablist">
        {tabs.map(({ id, label, description, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={
              'ct-billing-tab' +
              (activeTab === id ? ' active' : '')
            }
            onClick={() => setActiveTab(id)}
          >
            <span className="ct-financial-tab-icon"><Icon size={17} aria-hidden="true" /></span>
            <span className="ct-financial-tab-copy"><strong>{label}</strong><small>{description}</small></span>
          </button>
        ))}
      </nav>

      <section className="ct-billing-tab-content ct-financial-detail" key={activeTab} role="tabpanel"
        aria-label={tabs.find(tab => tab.id === activeTab)?.label}>
        {content[activeTab]}
      </section>
    </div>
  )
}
