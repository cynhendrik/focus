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

const TABS: { id: CustomerTab; label: string }[] = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'workflow',      label: 'Workflow' },
  { id: 'kommunikation', label: 'Kommunikation' },
  { id: 'dateien',       label: 'Dateien' },
  { id: 'historie',      label: 'Historie' },
  { id: 'profil',        label: 'Profil' },
]

const STATUS_LABEL: Record<string, string> = {
  lead: 'Lead', aktiv: 'Aktiv', inaktiv: 'Inaktiv', lost: 'Lost',
}
const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-500',
  aktiv: 'bg-green-500/10 text-green-500',
  inaktiv: 'bg-gray-400/10 text-gray-400',
  lost: 'bg-red-400/10 text-red-400',
}

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
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-[var(--border)]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-[var(--text)]">{customer.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[customer.status] ?? ''}`}>
                {STATUS_LABEL[customer.status] ?? customer.status}
              </span>
              {customer.priority === 'high' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">Hohe Priorität</span>
              )}
            </div>
            {customer.company && (
              <p className="text-sm text-[var(--text2)] mt-0.5">{customer.company}</p>
            )}
            <div className="flex gap-3 mt-1">
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="text-xs text-[var(--text2)] hover:text-primary">{customer.email}</a>
              )}
              {customer.phone && (
                <span className="text-xs text-[var(--text2)]">{customer.phone}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)]"
            >
              Bearbeiten
            </button>
            <button
              onClick={() => setSelected(null)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[var(--text2)] hover:text-[var(--text)]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active pane */}
      <div className="flex-1 overflow-auto">
        {renderPane()}
      </div>

      {showEdit && (
        <CustomerModal
          customer={customer}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}
