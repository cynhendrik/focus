import { useState, useEffect } from 'react'
import { useUiStore, type AppView } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useDealsStore } from '@/store/deals.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCompanyStore } from '@/store/company.store'
import {
  Monitor, Home, CheckSquare, Users, CreditCard,
  TrendingUp, ListFilter, Bell, Target,
  Calendar, Mail, MessageCircle, Settings,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type SectionKey = 'workspace' | 'sales' | 'inbox'

const SALES_VIEWS = new Set<string>(['leads', 'pipeline', 'smartlists', 'followups'])

function readExpanded(): Record<SectionKey, boolean> {
  try {
    const saved = localStorage.getItem('nav-sections-v1')
    if (saved) return JSON.parse(saved)
  } catch {}
  return { workspace: true, sales: true, inbox: true }
}

function SidebarSection({
  label,
  expanded,
  onToggle,
}: {
  label: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        padding: '14px 10px 6px', fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)',
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight
        size={10}
        style={{
          transition: 'transform 200ms',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          color: 'var(--fg-dim)',
          flexShrink: 0,
        }}
      />
    </button>
  )
}

function SidebarNavItem({
  icon: Ic, label, active, onClick, badge, kbd,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; kbd?: string
}) {
  return (
    <div className="nav-item" data-active={String(active)} onClick={onClick}>
      <Ic size={17} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
      {kbd && !badge ? <span className="nav-kbd">{kbd}</span> : null}
    </div>
  )
}

export function NavSidebar() {
  const appView    = useUiStore(s => s.appView)
  const setAppView = useUiStore(s => s.setAppView)
  const user       = useAuthStore(s => s.user)

  const clientsCount  = useCustomersStore(s => s.customers.length)
  const openTaskCount = useTodosStore(s => s.allTodos.length)
  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )
  const followupCount = useActivitiesStore(s => s.followups.length)
  const newLeadsCount = useLeadsStore(s => s.newLeads().length)
  const isAdmin = useCompanyStore(s => s.isAdmin)
  const modules = useCompanyStore(s => s.modules)

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>(readExpanded)

  useEffect(() => {
    if (modules.sales === false && SALES_VIEWS.has(appView)) {
      setAppView('dashboard')
    }
  }, [modules.sales, appView, setAppView])

  const toggle = (key: SectionKey) => {
    setExpanded(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('nav-sections-v1', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const initials    = user?.email ? user.email.slice(0, 2).toUpperCase() : 'CY'
  const displayName = user?.email?.split('@')[0] ?? 'User'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" data-tauri-drag-region>
        <div className="sidebar-brand-logo">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="22" fill="oklch(92% 0.2 125)"/>
            <rect x="36" y="19" width="40" height="13" rx="6.5" fill="oklch(15% 0 0)" transform="rotate(-28 56 25.5)"/>
            <rect x="24" y="46" width="44" height="13" rx="6.5" fill="oklch(15% 0 0)" transform="rotate(-23 46 52.5)"/>
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <strong>Focus</strong>
          <span>CYNERA · 2026</span>
        </div>
      </div>

      <SidebarSection label="Workspace" expanded={expanded.workspace} onToggle={() => toggle('workspace')} />
      {expanded.workspace && (
        <>
          <SidebarNavItem icon={Monitor}     label="Workstation" active={appView === 'workstation'} onClick={() => setAppView('workstation')} kbd="W" />
          <SidebarNavItem icon={Home}        label="Heute"       active={appView === 'dashboard'}   onClick={() => setAppView('dashboard')}   kbd="H" />
          <SidebarNavItem icon={CheckSquare} label="Tasks"       active={appView === 'tasks'}       onClick={() => setAppView('tasks')}       kbd="T" badge={openTaskCount || undefined} />
          <SidebarNavItem icon={Users}       label="Clients"     active={appView === 'clients'}     onClick={() => setAppView('clients')}     kbd="C" badge={clientsCount || undefined} />
          {isAdmin && <SidebarNavItem icon={CreditCard}  label="Finanzen"    active={appView === 'invoices'}    onClick={() => setAppView('invoices')}    kbd="F" />}
        </>
      )}

      {modules.sales !== false && (
        <>
          <SidebarSection label="Sales" expanded={expanded.sales} onToggle={() => toggle('sales')} />
          {expanded.sales && (
            <>
              <SidebarNavItem icon={Target}      label="Leads"       active={appView === 'leads'}       onClick={() => setAppView('leads')}       kbd="N" badge={newLeadsCount || undefined} />
              <SidebarNavItem icon={TrendingUp}  label="Pipeline"    active={appView === 'pipeline'}    onClick={() => setAppView('pipeline')}    kbd="P" badge={openDealCount || undefined} />
              <SidebarNavItem icon={ListFilter}  label="Smart Lists" active={appView === 'smartlists'}  onClick={() => setAppView('smartlists')}  kbd="L" />
              <SidebarNavItem icon={Bell}        label="Follow-Ups"  active={appView === 'followups'}   onClick={() => setAppView('followups')}   kbd="U" badge={followupCount || undefined} />
            </>
          )}
        </>
      )}

      <SidebarSection label="Inbox" expanded={expanded.inbox} onToggle={() => toggle('inbox')} />
      {expanded.inbox && (
        <>
          <SidebarNavItem icon={Calendar}      label="Kalender" active={appView === 'calendar'} onClick={() => setAppView('calendar')} kbd="K" />
          <SidebarNavItem icon={Mail}          label="Mail"     active={appView === 'mail'}     onClick={() => setAppView('mail')}     kbd="M" />
          <SidebarNavItem icon={MessageCircle} label="Chat"     active={appView === 'chat'}     onClick={() => setAppView('chat')} />
        </>
      )}

      <div style={{ flex: 1 }} />

      <SidebarNavItem icon={Settings} label="Settings" active={appView === 'settings'} onClick={() => setAppView('settings')} />

      <div className="sidebar-user" onClick={() => setAppView('profile' as AppView)}>
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-text">
          <strong>{displayName}</strong>
          <span>Cynera Focus</span>
        </div>
      </div>
    </aside>
  )
}
