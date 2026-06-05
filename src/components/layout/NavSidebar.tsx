import { useEffect } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useCustomersStore } from '@/store/customers.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCompanyStore } from '@/store/company.store'
import { useMailStore } from '@/store/mail.store'
import {
  Home, Users, CreditCard, Target, Inbox,
  Settings, PanelLeftClose, PanelLeftOpen, PenLine, Sparkles,
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
      <Ic size={17} />
      <span>{label}</span>
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

export function NavSidebar() {
  const appView         = useUiStore(s => s.appView)
  const setAppView      = useUiStore(s => s.setAppView)
  const collapsed       = useUiStore(s => s.sidebarCollapsed)
  const setQuickCapture = useUiStore(s => s.setQuickCaptureOpen)
  const toggleSidebar   = useUiStore(s => s.toggleSidebar)
  const enterPrivate    = useUiStore(s => s.enterPrivate)
  const user            = useAuthStore(s => s.user)
  const modules         = useCompanyStore(s => s.modules)
  const isAdmin         = useCompanyStore(s => s.isAdmin)

  const clientsCount  = useCustomersStore(s => s.customers.length)
  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )
  const newLeadsCount = useLeadsStore(s => s.newLeads().length)
  const unreadMails   = useMailStore(s => s.emails.filter(e => !e.isRead).length)

  const mod = (key: keyof typeof modules, defaultOn = true) =>
    modules[key] === undefined ? defaultOn : !!modules[key]

  // Redirects: alte Views auf neue umleiten
  useEffect(() => {
    if (appView === 'leads' || appView === 'pipeline' || appView === 'followups') {
      setAppView('akquise')
    }
    if (appView === 'mail' || appView === 'calendar') {
      setAppView('posteingang')
    }
    if (!mod('crm') && (appView === 'clients' || appView === 'akquise')) {
      setAppView('dashboard')
    }
    if (!mod('finanzen') && appView === 'invoices') setAppView('dashboard')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, appView, setAppView])

  const akquiseBadge     = (newLeadsCount + openDealCount) || undefined
  const posteingangBadge = unreadMails || undefined

  const initials    = user?.email ? user.email.slice(0, 2).toUpperCase() : 'CY'
  const displayName = user?.email?.split('@')[0] ?? 'Nutzer'

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

      {/* Hauptnavigation */}
      <NavItem
        icon={Home} label="Heute" active={appView === 'dashboard'}
        onClick={() => setAppView('dashboard')} kbd="H"
      />

      {/* CORRA — prominenter Sonderstil */}
      <div
        className="corra-nav-button"
        data-active={appView === 'corra' ? 'true' : 'false'}
        onClick={() => setAppView('corra')}
        title="CORRA Intelligence (⌘K)"
      >
        <div className="corra-nav-orb">
          <Sparkles size={12} />
        </div>
        <div className="corra-nav-text">
          <span>CORRA</span>
          <small>Intelligence</small>
        </div>
      </div>

      <NavDivider />

      {mod('crm') && (
        <NavItem
          icon={Users} label="Kunden" active={appView === 'clients'}
          onClick={() => setAppView('clients')} kbd="K"
          badge={clientsCount || undefined}
        />
      )}
      {mod('crm') && (
        <NavItem
          icon={Target} label="Akquise" active={appView === 'akquise'}
          onClick={() => setAppView('akquise')} kbd="A"
          badge={akquiseBadge}
        />
      )}
      {mod('finanzen') && isAdmin && (
        <NavItem
          icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
          onClick={() => setAppView('invoices')} kbd="F"
        />
      )}
      {(mod('mail') || mod('kalender')) && (
        <NavItem
          icon={Inbox} label="Posteingang" active={appView === 'posteingang'}
          onClick={() => setAppView('posteingang')} kbd="P"
          badge={posteingangBadge}
        />
      )}

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
          transition: 'all 140ms',
          width: 'calc(100% - 16px)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--accent)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--fg-dim)'
        }}
      >
        <PenLine size={14} style={{ flexShrink: 0 }} />
        {!collapsed && <span>Quick Capture</span>}
      </button>

      {/* Sidebar collapse */}
      <button
        className="sidebar-collapse-btn"
        onClick={toggleSidebar}
        title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
      >
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>

      <NavItem
        icon={Settings} label="Einstellungen" active={appView === 'settings'}
        onClick={() => setAppView('settings')}
      />

      {/* Privater Raum */}
      <div
        className="sidebar-user"
        onClick={() => enterPrivate()}
        title="Privater Raum öffnen"
        style={{ cursor: 'pointer' }}
      >
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-text">
          <strong>{displayName}</strong>
          <span>Privater Raum</span>
        </div>
      </div>
    </aside>
  )
}
