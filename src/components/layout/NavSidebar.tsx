import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import {
  Home, Users, CreditCard, Target,
  Mail, Calendar, Clock, Plug,
  Settings, PanelLeftClose, PanelLeftOpen, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function NavItem({
  icon: Ic, label, active, onClick, badge, kbd,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; kbd?: string
}) {
  return (
    <div className="nav-item" data-active={String(active)} onClick={onClick} title={label}>
      <Ic size={16} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
      {kbd && !badge ? <span className="nav-kbd">{kbd}</span> : null}
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <div className="nav-section-label">{children}</div>
}

export function NavSidebar() {
  const appView         = useUiStore(s => s.appView)
  const setAppView      = useUiStore(s => s.setAppView)
  const collapsed       = useUiStore(s => s.sidebarCollapsed)
  const toggleSidebar   = useUiStore(s => s.toggleSidebar)
  const user            = useAuthStore(s => s.user)

  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )
  const newLeadsCount = useLeadsStore(s => s.newLeads().length)
  const unreadMails   = useMailStore(s => s.emails.filter(e => !e.isRead).length)
  const overdueCount  = useFinanceStore(s =>
    s.invoices.filter(i => {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
      return i.status === 'overdue' || new Date(i.dueDate) < new Date()
    }).length
  )
  const todayTodos = useTodosStore(s =>
    s.allTodos.filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length
  )

  const akquiseBadge  = (newLeadsCount + openDealCount) || undefined
  const corraBadge    = overdueCount + unreadMails + todayTodos || undefined
  const displayName   = user?.email?.split('@')[0] ?? 'Nutzer'
  const initials      = displayName.slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>

      {/* Brand */}
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

      {/* CORRA — prominent AI card */}
      <button
        type="button"
        className="nav-corra-card"
        data-active={appView === 'corra' ? 'true' : 'false'}
        onClick={() => setAppView('corra')}
        title="KORA Intelligence (⌘K)"
      >
        <div className="nav-corra-card__icon">
          <Sparkles size={15} />
        </div>
        <div className="nav-corra-card__body">
          <span className="nav-corra-card__title">KORA</span>
          <span className="nav-corra-card__sub">KI-ASSISTENT</span>
        </div>
        {corraBadge ? (
          <span className="nav-corra-card__badge">{corraBadge}</span>
        ) : null}
      </button>

      {/* HEUTE */}
      <div
        className="nav-item nav-item--primary"
        data-active={appView === 'dashboard' ? 'true' : 'false'}
        onClick={() => setAppView('dashboard')}
        title="Heute (H)"
      >
        <Home size={16} />
        <span>Heute</span>
        {!collapsed && <span className="nav-kbd">H</span>}
      </div>

      {/* WORKSPACE */}
      {!collapsed && <SectionLabel>Workspace</SectionLabel>}
      <NavItem icon={Users}      label="Kunden"   active={appView === 'clients'}
        onClick={() => setAppView('clients')} kbd="C" />
      <NavItem icon={Target}     label="Akquise"  active={appView === 'akquise'}
        onClick={() => setAppView('akquise')} badge={akquiseBadge} kbd="A" />
      <NavItem icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
        onClick={() => setAppView('invoices')} kbd="F" />

      {/* KOMMUNIKATION */}
      {!collapsed && <SectionLabel>Kommunikation</SectionLabel>}
      <NavItem icon={Mail}     label="Posteingang"    active={appView === 'posteingang'}
        onClick={() => setAppView('posteingang')} badge={unreadMails || undefined} />
      <NavItem icon={Calendar} label="Kalender"       active={appView === 'calendar'}
        onClick={() => setAppView('calendar')} />
      <NavItem icon={Clock}    label="Zeitmanagement" active={appView === 'zeitmanagement'}
        onClick={() => setAppView('zeitmanagement')} kbd="Z" />

      <div style={{ flex: 1 }} />

      <NavItem icon={Plug}     label="Integrationen" active={appView === 'integrations'}
        onClick={() => setAppView('integrations')} />
      <NavItem icon={Settings} label="Einstellungen" active={appView === 'settings'}
        onClick={() => setAppView('settings')} />

      {/* Profil + Einklappen */}
      <div className="sidebar-bottom">
        <div
          className="sidebar-profile"
          onClick={() => setAppView('profile')}
          title="Profil & Workspace"
        >
          <div className="sidebar-user-avatar">{initials}</div>
          {!collapsed && <span className="sidebar-user-name">{displayName}</span>}
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleSidebar}
          title={collapsed ? 'Ausklappen' : 'Einklappen'}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

    </aside>
  )
}
