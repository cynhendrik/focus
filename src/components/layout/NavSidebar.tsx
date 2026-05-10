import { useUiStore, type AppView } from '@/store/ui.store'

function NavIcon({ paths }: { paths: string[] }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0"
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

const ICON_PATHS: Record<string, string[]> = {
  dashboard: [
    'M3 3h7v7H3z',
    'M14 3h7v7h-7z',
    'M14 14h7v7h-7z',
    'M3 14h7v7H3z',
  ],
  clients: [
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M23 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  invoices: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M16 13H8',
    'M16 17H8',
    'M10 9H8',
  ],
  tasks: [
    'M9 11l3 3L22 4',
    'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  ],
  kpis: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  insights: [
    'M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z',
    'M9 21h6',
    'M9 18h6',
  ],
  calendar: [
    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  ],
  mail: [
    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z',
    'M22 6l-10 7L2 6',
  ],
  crm: [
    'M4 6h16M4 12h16M4 18h16',
  ],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ],
}

const MAIN_NAV: { view: AppView; label: string; icon: string }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { view: 'clients',   label: 'Clients',   icon: 'clients' },
  { view: 'invoices',  label: 'Invoices',  icon: 'invoices' },
  { view: 'tasks',     label: 'Tasks',     icon: 'tasks' },
  { view: 'kpis',      label: 'KPIs',      icon: 'kpis' },
  { view: 'insights',  label: 'Insights',  icon: 'insights' },
]

const BOTTOM_NAV: { view: AppView; label: string; icon: string }[] = [
  { view: 'calendar', label: 'Calendar', icon: 'calendar' },
  { view: 'mail',     label: 'Mail',     icon: 'mail' },
  { view: 'crm',      label: 'CRM',      icon: 'crm' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
]

function NavItem({
  view, label, icon, active, onClick,
}: {
  view: AppView; label: string; icon: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left
        ${active
          ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
          : 'text-[var(--text2)] hover:bg-[var(--bg1)] hover:text-[var(--text)] border-l-2 border-transparent'
        }`}
    >
      <NavIcon paths={ICON_PATHS[icon] ?? []} />
      <span>{label}</span>
    </button>
  )
}

export function NavSidebar() {
  const appView = useUiStore(s => s.appView)
  const setAppView = useUiStore(s => s.setAppView)

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-hidden"
      style={{ minHeight: 0 }}
    >
      {/* Logo */}
      <div
        data-tauri-drag-region
        className="px-4 py-4 border-b border-[var(--border)] flex items-center gap-2.5"
      >
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <span className="text-sm font-bold text-[var(--text)] tracking-tight">Cynera Focus</span>
      </div>

      {/* Profil */}
      <button
        onClick={() => setAppView('profile')}
        className={`mx-3 mt-3 mb-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors border border-transparent
          ${appView === 'profile'
            ? 'bg-primary/10 border-primary/20'
            : 'hover:bg-[var(--bg1)]'
          }`}
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-primary">P</span>
        </div>
        <div className="text-left min-w-0">
          <p className={`text-sm font-semibold truncate ${appView === 'profile' ? 'text-primary' : 'text-[var(--text)]'}`}>
            Profil
          </p>
          <p className="text-xs text-[var(--text2)] truncate">Privatbereich</p>
        </div>
      </button>

      <div className="h-px mx-3 bg-[var(--border)] my-2" />

      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3 overflow-y-auto">
        {MAIN_NAV.map(item => (
          <NavItem
            key={item.view}
            view={item.view}
            label={item.label}
            icon={item.icon}
            active={appView === item.view}
            onClick={() => setAppView(item.view)}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 px-3 pb-4 pt-2 border-t border-[var(--border)]">
        {BOTTOM_NAV.map(item => (
          <NavItem
            key={item.view}
            view={item.view}
            label={item.label}
            icon={item.icon}
            active={appView === item.view}
            onClick={() => setAppView(item.view)}
          />
        ))}
      </div>
    </aside>
  )
}
