import { useEffect, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useCustomersStore } from '@/store/customers.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import {
  Home, Users, CreditCard, Target,
  Mail, Calendar, Clock, Plug,
  Settings, PanelLeftClose, PanelLeftOpen, PenLine, Sparkles,
  ChevronRight, Inbox, UserCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Basis-Nav-Item ────────────────────────────────────────────────────────────

function NavItem({
  icon: Ic, label, active, onClick, badge, kbd, indent,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; kbd?: string; indent?: boolean
}) {
  return (
    <div
      className="nav-item"
      data-active={String(active)}
      onClick={onClick}
      title={label}
      style={indent ? { paddingLeft: 28 } : undefined}
    >
      <Ic size={indent ? 15 : 17} />
      <span style={{ fontSize: indent ? 12.5 : undefined }}>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
      {kbd && !badge ? <span className="nav-kbd">{kbd}</span> : null}
    </div>
  )
}

function NavDivider() {
  return (
    <div style={{
      height: 1,
      background: 'rgba(255,255,255,0.06)',
      margin: '6px 12px',
    }} />
  )
}

// ── Inbox-Sektion: aufklappbar ────────────────────────────────────────────────

function InboxSection({
  appView, setAppView, unreadMails, sidebarCollapsed,
}: {
  appView: string
  setAppView: (v: string) => void
  unreadMails: number
  sidebarCollapsed: boolean
}) {
  const [open, setOpen] = useState(true)
  const inboxActive = ['posteingang', 'calendar', 'zeitmanagement'].includes(appView)

  if (sidebarCollapsed) {
    return (
      <NavItem
        icon={Inbox} label="Posteingang" active={inboxActive}
        onClick={() => setAppView('posteingang')}
        badge={unreadMails || undefined}
      />
    )
  }

  return (
    <>
      <div
        className="nav-item"
        data-active={String(inboxActive && !open)}
        onClick={() => setOpen(o => !o)}
        title="Inbox"
        style={{ userSelect: 'none' }}
      >
        <Inbox size={17} />
        <span style={{ flex: 1 }}>Inbox</span>
        {unreadMails > 0 && !open && <span className="nav-badge">{unreadMails}</span>}
        <ChevronRight
          size={11}
          style={{
            color: 'var(--fg-dim)',
            transition: 'transform 200ms',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </div>

      {open && (
        <>
          <NavItem
            icon={Mail} label="Posteingang" active={appView === 'posteingang'}
            onClick={() => setAppView('posteingang')}
            badge={unreadMails || undefined}
            indent
          />
          <NavItem
            icon={Calendar} label="Kalender" active={appView === 'calendar'}
            onClick={() => setAppView('calendar')}
            indent
          />
          <NavItem
            icon={Clock} label="Zeitmanagement" active={appView === 'zeitmanagement'}
            onClick={() => setAppView('zeitmanagement')}
            indent
          />
        </>
      )}
    </>
  )
}

// ── Haupt-Sidebar ─────────────────────────────────────────────────────────────

export function NavSidebar() {
  const appView         = useUiStore(s => s.appView)
  const setAppView      = useUiStore(s => s.setAppView)
  const collapsed       = useUiStore(s => s.sidebarCollapsed)
  const setQuickCapture = useUiStore(s => s.setQuickCaptureOpen)
  const toggleSidebar   = useUiStore(s => s.toggleSidebar)
  const user            = useAuthStore(s => s.user)

  const clientsCount  = useCustomersStore(s => s.customers.length)
  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )
  const newLeadsCount = useLeadsStore(s => s.newLeads().length)
  const unreadMails   = useMailStore(s => s.emails.filter(e => !e.isRead).length)

  const akquiseBadge = (newLeadsCount + openDealCount) || undefined

  const displayName = user?.email?.split('@')[0] ?? 'Nutzer'
  const initials    = displayName.slice(0, 2).toUpperCase()

  // Redirects: alte Views umleiten
  useEffect(() => {
    if (['leads', 'pipeline', 'followups'].includes(appView)) setAppView('akquise')
    if (appView === 'mail') setAppView('posteingang')
  }, [appView, setAppView])

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

      {/* CORRA — ganz oben */}
      <div
        className="corra-nav-button"
        data-active={appView === 'corra' ? 'true' : 'false'}
        onClick={() => setAppView('corra')}
        title="CORRA Intelligence (⌘K)"
      >
        <div className="corra-nav-orb"><Sparkles size={12} /></div>
        <div className="corra-nav-text">
          <span>CORRA</span>
          <small>Intelligence</small>
        </div>
      </div>

      <NavItem
        icon={Home} label="Heute" active={appView === 'dashboard'}
        onClick={() => setAppView('dashboard')} kbd="H"
      />

      <NavDivider />

      {/* Inbox */}
      <InboxSection
        appView={appView}
        setAppView={v => setAppView(v as Parameters<typeof setAppView>[0])}
        unreadMails={unreadMails}
        sidebarCollapsed={collapsed}
      />

      <NavDivider />

      <NavItem
        icon={Users} label="Kunden" active={appView === 'clients'}
        onClick={() => setAppView('clients')} kbd="K"
        badge={clientsCount || undefined}
      />
      <NavItem
        icon={Target} label="Akquise" active={appView === 'akquise'}
        onClick={() => setAppView('akquise')} kbd="A"
        badge={akquiseBadge}
      />
      <NavItem
        icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
        onClick={() => setAppView('invoices')} kbd="F"
      />

      <div style={{ flex: 1 }} />

      {/* Quick Capture */}
      <button
        type="button"
        onClick={() => setQuickCapture(true)}
        title="Quick Capture (⌘⇧N)"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed ? '10px 0' : '10px 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          margin: '0 8px 4px',
          borderRadius: 10, border: '1px dashed var(--border)',
          background: 'transparent', cursor: 'pointer',
          color: 'var(--fg-dim)', fontSize: 12,
          transition: 'all 140ms', width: 'calc(100% - 16px)',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-dim)' }}
      >
        <PenLine size={14} style={{ flexShrink: 0 }} />
        {!collapsed && <span>Quick Capture</span>}
      </button>

      <button
        className="sidebar-collapse-btn"
        onClick={toggleSidebar}
        title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
      >
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>

      <NavItem icon={Plug}        label="Integrationen" active={appView === 'integrations'} onClick={() => setAppView('integrations')} />
      <NavItem icon={Settings}    label="Einstellungen" active={appView === 'settings'}     onClick={() => setAppView('settings')} />

      {/* Profil — ersetzt Privater Raum */}
      <div
        className="sidebar-user"
        onClick={() => setAppView('profile')}
        title="Profil & Workspace"
        style={{ cursor: 'pointer' }}
      >
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-text">
          <strong>{displayName}</strong>
          <span>Profil & Workspace</span>
        </div>
      </div>
    </aside>
  )
}
