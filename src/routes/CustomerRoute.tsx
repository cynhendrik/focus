import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, Mail as MailIcon, Phone, Plus } from 'lucide-react'
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
import { SalesPane } from '@/components/customer/tabs/SalesPane'
import { ActivitiesPane } from '@/components/customer/tabs/ActivitiesPane'

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
    sales:         ['M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
    activities:    ['M13 2H6a2 2 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M13 2v7h7'],
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
  { id: 'sales',         label: 'Sales' },
  { id: 'activities',    label: 'Activities' },
]

interface Props { customerId: string }

export function CustomerRoute({ customerId }: Props) {
  const customer    = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const activeTab   = useUiStore(s => s.activeCustomerTab)
  const setTab      = useUiStore(s => s.setActiveCustomerTab)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const [showEdit, setShowEdit] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

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

  const tabsRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 })

  useLayoutEffect(() => {
    const el = tabsRef.current
    if (!el) return
    const active = el.querySelector(`[data-active="true"]`) as HTMLElement | null
    if (!active) return
    const rect = active.getBoundingClientRect()
    const parentRect = el.getBoundingClientRect()
    setIndicator({ left: rect.left - parentRect.left, width: rect.width, opacity: 1 })
  }, [activeTab])

  if (!customer) return <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>

  const renderPane = () => {
    switch (activeTab) {
      case 'dashboard':     return <DashboardPane customerId={customerId} />
      case 'workflow':      return <WorkflowPane customerId={customerId} />
      case 'kommunikation': return <KommunikationPane customerId={customerId} />
      case 'dateien':       return <DateienPane customerId={customerId} />
      case 'historie':      return <HistoriePane customerId={customerId} />
      case 'sales':         return <SalesPane customerId={customerId} />
      case 'activities':    return <ActivitiesPane customerId={customerId} />
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="detail-head">
        <button className="back" onClick={() => setSelected(null)}>
          <ChevronLeft size={16} />
        </button>
        <div className="avatar" style={{ width: 56, height: 56, borderRadius: 16, fontSize: 18 }}>
          {customer.name.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h1>{customer.name}</h1>
          <div className="sub">
            Letzte Aktivität: {relativeTime(customer.updatedAt)} · {customer.status} · Score {customer.leadScore}
          </div>
        </div>
        <button className="btn-ghost"><Phone size={13} /> Anrufen</button>
        <button className="btn-ghost"><MailIcon size={13} /> Mail</button>
        <button className="btn-primary" onClick={() => setShowEdit(true)}>
          <Plus size={13} /> Neue Aktion
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ marginBottom: 22 }}>
        <div className="tabs glass" ref={tabsRef}>
          <div
            className="tab-indicator"
            style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
          />
          {TABS.map(t => (
            <div
              key={t.id}
              className="tab"
              data-active={String(activeTab === t.id)}
              onClick={() => setTab(t.id)}
            >
              <TabIcon id={t.id} />
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {/* Active pane */}
      <div className="flex-1 overflow-auto">
        {renderPane()}
      </div>

      {showEdit && (
        <CustomerModal customer={customer} onClose={() => setShowEdit(false)} />
      )}

      {showDetails && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetails(false)} />
          <div className="relative flex flex-col w-[480px] max-w-full h-full bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
              <h2 className="text-base font-bold text-[var(--text)]">Details</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ProfilPane customerId={customerId} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
