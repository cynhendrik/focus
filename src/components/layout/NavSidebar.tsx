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
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Standard nav item
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

// Inbox sub-item
function SubItem({
  icon: Ic, label, active, onClick, badge,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void; badge?: number
}) {
  return (
    <div className="nav-item-sub" data-active={String(active)} onClick={onClick} title={label}>
      <Ic size={14} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </div>
  )
}

// Section label
function SectionLabel({ children }: { children: string }) {
  return <div className="nav-section-label">{children}</div>
}

// Aufklappbarer Inbox-Bereich
function InboxSection({
  appView, setAppView, unreadMails, collapsed,
}: {
  appView: string; setAppView: (v: string) => void
  unreadMails: number; collapsed: boolean
}) {
  const [open, setOpen] = useState(true)
  const inboxActive = ['posteingang', 'calendar'].includes(appView)

  if (collapsed) {
    return (
      <NavItem icon={Mail} label="Posteingang" active={inboxActive}
        onClick={() => setAppView('posteingang')} badge={unreadMails || undefined}
      />
    )
  }

  return (
    <div>
      <div
        className="nav-inbox-header"
        onClick={() => setOpen(o => !o)}
      >
        <Mail size={16} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Inbox</span>
        {unreadMails > 0 && !open && (
          <span className="nav-badge" style={{ marginLeft: 'auto' }}>{unreadMails}</span>
        )}
        <ChevronRight
          size={11}
          style={{
            color: 'var(--fg-dim)',
            transition: 'transform 200ms',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0,
            marginLeft: open || unreadMails === 0 ? 'auto' : 4,
          }}
        />
      </div>
      {open && (
        <>
          <SubItem icon={Mail}     label="Posteingang" active={appView === 'posteingang'}
            onClick={() => setAppView('posteingang')} badge={unreadMails || undefined}
          />
          <SubItem icon={Calendar} label="Kalender" active={appView === 'calendar'}
            onClick={() => setAppView('calendar')}
          />
        </>
      )}
    </div>
  )
}

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
  const displayName  = user?.email?.split('@')[0] ?? 'Nutzer'
  const initials     = displayName.slice(0, 2).toUpperCase()

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

      {/* CORRA — gleiche Form wie alle anderen, aber Lime-Sparkle-Icon */}
      <div
        className="corra-nav-item"
        data-active={appView === 'corra' ? 'true' : 'false'}
        onClick={() => setAppView('corra')}
        title="CORRA Intelligence (⌘K)"
      >
        <Sparkles size={16} className="corra-icon" />
        <span className="corra-label">CORRA</span>
        {!collapsed && <span className="corra-kbd">⌘K</span>}
      </div>

      {/* HEUTE — bold, Primär-Destination */}
      <div
        className="nav-item-heute"
        data-active={appView === 'dashboard' ? 'true' : 'false'}
        onClick={() => setAppView('dashboard')}
        title="Heute (H)"
      >
        <Home size={16} />
        <span>Heute</span>
        {!collapsed && <span className="nav-kbd">H</span>}
      </div>

      {/* ── INBOX ── */}
      {!collapsed && <SectionLabel>Inbox</SectionLabel>}

      <InboxSection
        appView={appView}
        setAppView={v => setAppView(v as Parameters<typeof setAppView>[0])}
        unreadMails={unreadMails}
        collapsed={collapsed}
      />

      <NavItem icon={Clock} label="Zeitmanagement"
        active={appView === 'zeitmanagement'}
        onClick={() => setAppView('zeitmanagement')} kbd="Z"
      />

      {/* ── WORKSPACE ── */}
      {!collapsed && <SectionLabel>Workspace</SectionLabel>}

      <NavItem icon={Users}      label="Kunden"   active={appView === 'clients'}
        onClick={() => setAppView('clients')}   badge={clientsCount || undefined} kbd="C" />
      <NavItem icon={Target}     label="Akquise"  active={appView === 'akquise'}
        onClick={() => setAppView('akquise')}  badge={akquiseBadge}              kbd="A" />
      <NavItem icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
        onClick={() => setAppView('invoices')}                                    kbd="F" />

      <div style={{ flex: 1 }} />

      {/* Quick Capture */}
      <button
        type="button"
        onClick={() => setQuickCapture(true)}
        title="Quick Capture (⌘⇧N)"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed ? '10px 0' : '9px 10px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          margin: '0 0 2px',
          borderRadius: 10, border: '1px dashed rgba(255,255,255,0.1)',
          background: 'transparent', cursor: 'pointer',
          color: 'var(--fg-dim)', fontSize: 13,
          transition: 'all 140ms', width: '100%',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--fg-dim)' }}
      >
        <PenLine size={15} style={{ flexShrink: 0 }} />
        {!collapsed && <span>Quick Capture</span>}
      </button>

      <button className="sidebar-collapse-btn" onClick={toggleSidebar}
        title={collapsed ? 'Ausklappen' : 'Einklappen'}>
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>

      <NavItem icon={Plug}     label="Integrationen" active={appView === 'integrations'} onClick={() => setAppView('integrations')} />
      <NavItem icon={Settings} label="Einstellungen" active={appView === 'settings'}     onClick={() => setAppView('settings')} />

      {/* Profil */}
      <div
        className="sidebar-user"
        onClick={() => setAppView('profile')}
        title="Profil & Workspace"
        style={{ cursor: 'pointer' }}
      >
        <div className="sidebar-user-avatar">{initials}</div>
        {!collapsed && (
          <div className="sidebar-user-text">
            <strong>{displayName}</strong>
            <span>Profil & Workspace</span>
          </div>
        )}
      </div>

    </aside>
  )
}
