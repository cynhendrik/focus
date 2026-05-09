export type CustomerTab = 'workflow' | 'dashboard' | 'crm' | 'zeit' | 'ablage' | 'kommunikation' | 'ai'

const LABELS: Record<CustomerTab, string> = {
  workflow: 'Workflow',
  dashboard: 'Dashboard',
  crm: 'CRM',
  zeit: 'Zeit',
  ablage: 'Ablage',
  kommunikation: 'Kommunikation',
  ai: 'FOCUS AI',
}

const TABS: CustomerTab[] = ['workflow', 'dashboard', 'crm', 'zeit', 'ablage', 'kommunikation', 'ai']

interface Props {
  active: CustomerTab
  onChange: (tab: CustomerTab) => void
}

export function CustomerTabs({ active, onChange }: Props) {
  return (
    <div className="flex border-b border-[var(--border)]">
      {TABS.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors
            ${active === tab
              ? 'border-primary text-primary'
              : 'border-transparent text-[var(--text2)] hover:text-[var(--text)]'
            }`}
        >
          {LABELS[tab]}
        </button>
      ))}
    </div>
  )
}
