import { useUiStore, type AppView } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import {
  LayoutDashboard, Users, FileText, CheckSquare,
  Calendar, Mail, Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
  const appView   = useUiStore(s => s.appView)
  const setAppView = useUiStore(s => s.setAppView)
  const user      = useAuthStore(s => s.user)

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'CY'
  const displayName = user?.email?.split('@')[0] ?? 'User'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" data-tauri-drag-region>
        <div className="sidebar-brand-logo">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <path
              d="M58 18c-5 1-9 5-10 10-1 6 2 11 7 14 6 3 13 1 17-4 4-6 3-14-3-19-3-2-7-2-11-1Zm-22 38c-5 1-9 6-10 11-1 6 3 12 9 14 7 2 14-2 17-9 2-7-2-15-9-17-2-1-5-1-7 1Z"
              fill="oklch(15% 0 0)"
            />
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <strong>Focus</strong>
          <span>CYNERA · 2026</span>
        </div>
      </div>

      <div className="sidebar-section">Workspace</div>
      <SidebarNavItem icon={LayoutDashboard} label="Dashboard" active={appView === 'dashboard'} onClick={() => setAppView('dashboard')} kbd="H" />
      <SidebarNavItem icon={Users}           label="Clients"   active={appView === 'clients'}   onClick={() => setAppView('clients')}   kbd="C" />
      <SidebarNavItem icon={FileText}        label="Finanzen"  active={appView === 'invoices'}  onClick={() => setAppView('invoices')}  kbd="F" />
      <SidebarNavItem icon={CheckSquare}     label="Tasks"     active={appView === 'tasks'}     onClick={() => setAppView('tasks')}     kbd="T" />

      <div className="sidebar-section">Inbox</div>
      <SidebarNavItem icon={Calendar} label="Calendar" active={appView === 'calendar'} onClick={() => setAppView('calendar')} kbd="K" />
      <SidebarNavItem icon={Mail}     label="Mail"     active={appView === 'mail'}     onClick={() => setAppView('mail')}     kbd="M" />

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
