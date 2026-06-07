import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCompanyStore } from '@/store/company.store'
import {
  Home, Users, CreditCard,
  Target, TrendingUp, Reply,
  Mail, Calendar, Clock,
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

  const modules = useCompanyStore(s => s.modules)
  const mod = (key: keyof typeof modules, defaultOn = true) => {
    const v = modules[key]; return v === undefined ? defaultOn : !!v
  }

  const corraBadge  = overdueCount + unreadMails + todayTodos || undefined
  const displayName = user?.email?.split('@')[0] ?? 'Nutzer'
  const initials    = displayName.slice(0, 2).toUpperCase()

  // Sales views — any of the three counts as "sales active"
  const SALES_VIEWS = new Set(['akquise', 'leads', 'pipeline', 'followups', 'sales'])
  const inSales = SALES_VIEWS.has(appView)

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

      {/* KORA */}
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
        {corraBadge ? <span className="nav-corra-card__badge">{corraBadge}</span> : null}
      </button>

      {/* ── WORKSPACE ─────────────────────────────────────────────────── */}
      {!collapsed && <SectionLabel>Workspace</SectionLabel>}
      <NavItem icon={Home}       label="Heute"    active={appView === 'dashboard'}
        onClick={() => setAppView('dashboard')} kbd="H" />
      {mod('crm')      && <NavItem icon={Users}      label="Kunden"   active={appView === 'clients'}
        onClick={() => setAppView('clients')} kbd="C" />}
      {mod('finanzen') && <NavItem icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
        onClick={() => setAppView('invoices')} kbd="F" badge={overdueCount || undefined} />}

      {/* ── SALES ─────────────────────────────────────────────────────── */}
      {mod('crm') && (
        <>
          {!collapsed && <SectionLabel>Sales</SectionLabel>}
          <NavItem icon={Target}     label="Leads"      active={inSales && appView !== 'pipeline' && appView !== 'followups'}
            onClick={() => setAppView('leads')} badge={newLeadsCount || undefined} kbd="L" />
          <NavItem icon={Reply}      label="Follow-ups" active={appView === 'followups'}
            onClick={() => setAppView('followups')} />
          <NavItem icon={TrendingUp} label="Pipeline"   active={appView === 'pipeline'}
            onClick={() => setAppView('pipeline')} badge={openDealCount || undefined} />
        </>
      )}

      {/* ── INBOX ─────────────────────────────────────────────────────── */}
      {!collapsed && <SectionLabel>Inbox</SectionLabel>}
      {mod('mail')     && <NavItem icon={Mail}     label="Mail"      active={appView === 'posteingang' || appView === 'mail'}
        onClick={() => setAppView('posteingang')} badge={unreadMails || undefined} />}
      {mod('kalender') && <NavItem icon={Calendar} label="Kalender"  active={appView === 'calendar'}
        onClick={() => setAppView('calendar')} />}
      <NavItem icon={Clock}    label="Zeit"      active={appView === 'zeitmanagement'}
        onClick={() => setAppView('zeitmanagement')} kbd="Z" />

      <div style={{ flex: 1 }} />

      <NavItem icon={Settings} label="Einstellungen" active={appView === 'settings' || appView === 'integrations'}
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
