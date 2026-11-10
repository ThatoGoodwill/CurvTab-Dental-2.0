import type { ReactNode } from 'react'

export type FinanceTab = 'revenues' | 'expenses'

type Props = {
  tab: FinanceTab
  onTab: (tab: FinanceTab) => void
  revenues: ReactNode
  expenses: ReactNode
}

const tabs: { id: FinanceTab; label: string }[] = [
  { id: 'revenues', label: 'Revenues' },
  { id: 'expenses', label: 'Expenses' },
]

export default function FinanceWorkspaceTabs({ tab, onTab, revenues, expenses }: Props) {
  return (
    <div className="ct-finance-workspace">
      <nav className="ct-finance-tabs" role="tablist" aria-label="Finances">
        {tabs.map(item => (
          <button key={item.id} type="button" role="tab"
            aria-selected={tab === item.id}
            className={'ct-finance-tab' + (tab === item.id ? ' active' : '')}
            onClick={() => onTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="ct-finance-content" key={tab}>
        {tab === 'revenues' ? revenues : expenses}
      </div>
    </div>
  )
}
