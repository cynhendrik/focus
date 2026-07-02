import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useAuthStore } from '@/store/auth.store'
import { useMessagesStore } from '@/store/messages.store'
import { totalUnread } from '@/lib/chat/total-unread'
import { useCapability } from '@/hooks/useCapability'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCompanyStore } from '@/store/company.store'
import { WorkspaceSwitcher } from '@/core/workspace/WorkspaceSwitcher'
import { SyncStatusChip } from './SyncStatusChip'
import {
  Home, Users, CreditCard,
  Target, TrendingUp,
  Mail, Calendar, Inbox, UserPlus,
  Settings, PanelLeftClose, PanelLeftOpen, Sparkles, HelpCircle, MessagesSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function NavItem({
  icon: Ic, label, active, onClick, badge, badgeAccent, kbd,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; badgeAccent?: boolean; kbd?: string
}) {
  return (
    <button
      type="button"
      className="nav-item"
      data-active={String(active)}
      data-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      title={label}
    >
      <Ic size={18} strokeWidth={1.75} />
      <span className="nav-item__label">{label}</span>
      {badge != null
        ? <span className={badgeAccent ? 'nav-badge nav-badge--a' : 'nav-badge'}>{badge}</span>
        : kbd
          ? <span className="nav-kbd">{kbd}</span>
          : <span className="nav-item__slot" />}
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
  const canFinances = useCapability('finances')

  const chatOpen    = useChatOverlayStore(s => s.open)
  const openChatNav = useChatOverlayStore(s => s.openPanel)
  const selectChat  = useChatOverlayStore(s => s.select)

  const chatTotal = useMessagesStore(s => totalUnread(s.unreadTeam, s.conversations))

  const corraBadge  = overdueCount + unreadMails + todayTodos || undefined
  const displayName = ((user?.user_metadata?.full_name as string | undefined)?.trim().split(' ')[0])
    || user?.email?.split('@')[0]
    || 'Nutzer'
  const initials    = displayName.slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>

      {/* Kopf: Workspace + Einklappen — auf einer Linie */}
      <div className="nav-head">
        <WorkspaceSwitcher />
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleSidebar}
          title={collapsed ? 'Ausklappen' : 'Einklappen'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* KORA — leuchtende Hero-Karte, der Dirigent über allem */}
      <button
        type="button"
        className="nav-corra-card"
        data-active={appView === 'corra' ? 'true' : 'false'}
        onClick={() => setAppView('corra')}
        title="KORA Intelligence (⌘K)"
      >
        <span className="nav-corra-card__icon">
          <Sparkles size={19} strokeWidth={2} />
        </span>
        <span className="nav-corra-card__body">
          <span className="nav-corra-card__title">KORA</span>
          <span className="nav-corra-card__sub">KI-Assistent</span>
        </span>
        {corraBadge ? <span className="nav-corra-card__badge">{corraBadge}</span> : null}
      </button>

      {/* ── MENÜ ──────────────────────────────────────────────────────── */}
      {!collapsed && <SectionLabel>Menü</SectionLabel>}
      <NavItem icon={Home}       label="Mein Tag"    active={appView === 'dashboard'}
        onClick={() => setAppView('dashboard')} kbd="H" />
      {mod('crm')      && <NavItem icon={Users}      label="Kunden"   active={appView === 'clients'}
        onClick={() => setAppView('clients')} kbd="C" />}
      {mod('finanzen') && canFinances && <NavItem icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
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
        onClick={() => setAppView('posteingang')} badge={unreadMails || undefined} badgeAccent />}
      {mod('kalender') && <NavItem icon={Calendar} label="Kalender" active={appView === 'calendar'}
        onClick={() => setAppView('calendar')} />}
      <NavItem icon={MessagesSquare} label="Team" active={chatOpen}
        onClick={() => { selectChat('team'); openChatNav() }} badge={chatTotal || undefined} />

      <div className="nav-spacer" />
      <div className="nav-foot-divider" />

      <SyncStatusChip />

      <NavItem icon={HelpCircle} label="Hilfe" active={false}
        onClick={() => setHelpOpen(true)} />

      <NavItem icon={Settings} label="Einstellungen" active={appView === 'settings' || appView === 'integrations'}
        onClick={() => setAppView('settings')} />

      {/* Profil */}
      <button
        type="button"
        className="sidebar-profile"
        onClick={() => setAppView('profile')}
        title="Profil & Workspace"
      >
        <div className="sidebar-user-avatar">{initials}</div>
        <span className="sidebar-profile__body">
          <span className="sidebar-user-name">{displayName}</span>
          {user?.email && <span className="sidebar-user-mail">{user.email}</span>}
        </span>
      </button>

    </aside>
  )
}
