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
  Target, TrendingUp,
  Mail, Calendar, Inbox, UserPlus,
  Settings, PanelLeftClose, PanelLeftOpen, Sparkles, HelpCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function NavItem({
  icon: Ic, label, active, onClick, badge, kbd,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; kbd?: string
}) {
  return (
    <button
      type="button"
      className="nav-item"
      data-active={String(active)}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      title={label}
    >
      <Ic size={16} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
      {kbd && !badge ? <span className="nav-kbd">{kbd}</span> : null}
    </button>
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
  const setHelpOpen     = useUiStore(s => s.setHelpOpen)
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
  const displayName = ((user?.user_metadata?.full_name as string | undefined)?.trim().split(' ')[0])
    || user?.email?.split('@')[0]
    || 'Nutzer'
  const initials    = displayName.slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>

      {/* Brand */}
      <div className="sidebar-brand" data-tauri-drag-region>
        <div className="sidebar-brand-logo">
          <svg width="28" height="28" viewBox="0 0 160 160">
            <rect width="160" height="160" rx="36" fill="#3B6DF4"/>
            <g fill="#FFFFFF" transform="translate(1 0) skewX(-14)">
              <rect x="78" y="36" width="56" height="23" rx="11"/>
              <rect x="56" y="69" width="56" height="23" rx="11"/>
              <rect x="68" y="102" width="33" height="23" rx="11"/>
            </g>
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <strong>Focus</strong>
          <span>CULTERA · 2026</span>
        </div>
      </div>

      {/* KORA — der Dirigent über allem */}
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

      {/* ── AKQUISE — Leads → Deals, der Weg zum Neukunden ─────────────── */}
      {!collapsed && <SectionLabel>Akquise</SectionLabel>}
      <NavItem icon={Inbox}      label="Follow-Ups" active={appView === 'leverage_inbox'}
        onClick={() => setAppView('leverage_inbox')} />
      <NavItem icon={Target}     label="Leads"      active={appView === 'leverage_leads' || appView === 'leverage_lead_detail'}
        onClick={() => setAppView('leverage_leads')} badge={newLeadsCount || undefined} />
      <NavItem icon={TrendingUp} label="Pipeline"   active={appView === 'leverage_pipeline'}
        onClick={() => setAppView('leverage_pipeline')} badge={openDealCount || undefined} />
      <NavItem icon={UserPlus}   label="Newcomer"   active={appView === 'leverage_mail'}
        onClick={() => setAppView('leverage_mail')} />

      {/* ── KOMMUNIKATION ─────────────────────────────────────────────── */}
      {(mod('mail') || mod('kalender')) && !collapsed && <SectionLabel>Kommunikation</SectionLabel>}
      {mod('mail')     && <NavItem icon={Mail}     label="Mail"     active={appView === 'posteingang' || appView === 'mail'}
        onClick={() => setAppView('posteingang')} badge={unreadMails || undefined} />}
      {mod('kalender') && <NavItem icon={Calendar} label="Kalender" active={appView === 'calendar'}
        onClick={() => setAppView('calendar')} />}

      <div style={{ flex: 1 }} />

      <NavItem icon={HelpCircle} label="Hilfe" active={false}
        onClick={() => setHelpOpen(true)} />

      <NavItem icon={Settings} label="Einstellungen" active={appView === 'settings' || appView === 'integrations'}
        onClick={() => setAppView('settings')} />

      {/* Profil + Einklappen */}
      <div className="sidebar-bottom">
        <button
          type="button"
          className="sidebar-profile"
          onClick={() => setAppView('profile')}
          title="Profil & Workspace"
        >
          <div className="sidebar-user-avatar">{initials}</div>
          {!collapsed && <span className="sidebar-user-name">{displayName}</span>}
        </button>
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
