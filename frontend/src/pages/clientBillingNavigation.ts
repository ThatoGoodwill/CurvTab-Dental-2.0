export type BillingSection = 'today' | 'cash-private' | 'medical-aid' | 'cash-close' | 'medical-signoff'
export const billingSidebarSections: ReadonlyArray<{ id: BillingSection; label: string }> = [
  { id: 'today', label: "Today's Billing" },
  { id: 'cash-private', label: 'Cash & Private' },
  { id: 'medical-aid', label: 'Medical Aid' },
  { id: 'cash-close', label: 'Cash Day Close' },
  { id: 'medical-signoff', label: 'Medical Aid Day Sign-Off' },
]
