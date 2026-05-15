import { useEffect, useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore, type CustomerTab } from '@/store/ui.store'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import { useFilesStore } from '@/store/files.store'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { DashboardPane } from '@/components/customer/tabs/DashboardPane'
import { WorkflowPane } from '@/components/customer/tabs/WorkflowPane'
import { KommunikationPane } from '@/components/customer/tabs/KommunikationPane'
import { DateienPane } from '@/components/customer/tabs/DateienPane'
import { HistoriePane } from '@/components/customer/tabs/HistoriePane'
import { ProfilPane } from '@/components/customer/tabs/ProfilPane'
import { HealthPane } from '@/components/customer/tabs/HealthPane'

function avatarBg(name: string): string {
  const palette = ['bg-blue-600', 'bg-violet-600', 'bg-emerald-700', 'bg-orange-600', 'bg-pink-600', 'bg-teal-600']
  let h = 0
  for (const c of name) h += c.charCodeAt(0)
  return palette[h % palette.length]
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function TabIcon({ id }: { id: CustomerTab }) {
  const paths: Record<CustomerTab, string[]> = {
    dashboard:     ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
    workflow:      ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
    kommunikation: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    dateien:       ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
    historie:      ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
    profil:        ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    health:        ['M22 12h-4l-3 9L9 3l-3 9H2'],
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(paths[id] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

const TABS: { id: CustomerTab; label: string }[] = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'workflow',      label: 'Workflow / Tasks' },
  { id: 'kommunikation', label: 'Kommunikation' },
  { id: 'dateien',       label: 'Dateien' },
  { id: 'historie',      label: 'Historie' },
  { id: 'profil',        label: 'Profil' },
  { id: 'health',        label: 'Health / Insights' },
]

interface Props { customerId: string }

export function CustomerRoute({ customerId }: Props) {
  const customer    = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const activeTab   = useUiStore(s => s.activeCustomerTab)
  const setTab      = useUiStore(s => s.setActiveCustomerTab)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const [showEdit, setShowEdit] = useState(false)

  const loadTodos     = useTodosStore(s => s.loadForCustomer)
  const loadNotes     = useNotesStore(s => s.loadForCustomer)
  const loadDeadlines = useDeadlinesStore(s => s.loadForCustomer)
  const loadFollowUps = useCrmStore(s => s.loadForCustomer)
  const loadFolders   = useFilesStore(s => s.loadForCustomer)

  useEffect(() => {
    loadTodos(customerId)
    loadNotes(customerId)
    loadDeadlines(customerId)
    loadFollowUps(customerId)
    loadFolders(customerId)
  }, [customerId])

  if (!customer) return <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>

  const renderPane = () => {
    switch (activeTab) {
      case 'dashboard':     return <DashboardPane customerId={customerId} />
      case 'workflow':      return <WorkflowPane customerId={customerId} />
      case 'kommunikation': return <KommunikationPane customerId={customerId} />
      case 'dateien':       return <DateienPane customerId={customerId} />
      case 'historie':      return <HistoriePane customerId={customerId} />
      case 'profil':        return <ProfilPane customerId={customerId} />
      case 'health':        return <HealthPane customerId={customerId} />
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => setSelected(null)}
          className="w-8 h-8 rounded-full flex items-center justify-center border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)] flex-shrink-0 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>

        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${avatarBg(customer.name)}`}>
          {customer.name.slice(0, 1).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[var(--text)] truncate">{customer.name}</h1>
          <p className="text-xs text-[var(--text2)]">Letzte Aktivität: {relativeTime(customer.updatedAt)}</p>
        </div>

        <button
          onClick={() => setShowEdit(true)}
          className="px-4 py-2 rounded-xl bg-primary text-black text-sm font-semibold hover:bg-primary-dark flex-shrink-0 transition-colors"
        >
          + Neue Aktion
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border)] overflow-x-auto flex-shrink-0 scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0
              ${activeTab === tab.id
                ? 'bg-primary text-black'
                : 'text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)]'
              }`}
          >
            <TabIcon id={tab.id} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active pane */}
      <div className="flex-1 overflow-auto">
        {renderPane()}
      </div>

      {showEdit && (
        <CustomerModal customer={customer} onClose={() => setShowEdit(false)} />
      )}
    </div>
  )
}
