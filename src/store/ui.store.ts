import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
/**
 * Top-Level-Tabs im Customer-Detail. 7 statt 3 — eine Ebene tiefer war
 * dem User zu verschachtelt. Jeder Tab mappt 1:1 auf eine eigenstaendige
 * Pane, keine Sub-Tab-Navigation mehr darunter.
 */
export type CustomerTab =
  | 'cockpit'      // Briefing + Lead Score + Quick-Stats
  | 'tasks'        // Tasks (offene + erledigte)
  | 'notizen'      // Notebooks + Notes
  | 'dokumente'    // Dateien + Folder
  | 'kommunikation' // Mails + Chat + Calls
  | 'verlauf'      // Activity-Timeline
  | 'finanzen'     // Rechnungen + Angebote (gefiltert auf diesen Kunden)

/** Clients page view mode: card board vs. filtered list (Smart Lists). */

/** Tasks page tab. */
export type TasksTab = 'list' | 'board' | 'focus'

/** Dashboard "Heute" hat drei View-Modi:
 *  - workspace: alles auf einen Blick (Umsatz, Kunden, Tagesplan, Inbox)
 *  - sales: Pipeline-, Follow-Up- und Lead-Stats (nur bei aktivem Sales-Modul)
 *  - client: Top-Kunden heute (wo ist der meiste Druck) */
export type DashboardView = 'workspace' | 'sales' | 'client'

/** App-Modus: das normale Business-Layout oder der "Privater Raum"-Modus
 *  mit eigener Sidebar und eigenem Theme. */
export type AppMode = 'business' | 'private'

/** Sub-Routes innerhalb des Privaten Raums. */
export type PrivateView =
  | 'capture'  // Quick Capture (Inbox)
  | 'todos'    // Persoenliche To-Dos
  | 'notes'    // Persoenliche Notizen
  | 'journal'  // Tagebuch mit Stimmung
  | 'goals'    // Persoenliche Ziele mit Progress
  | 'review'   // Wochen-Review-Ritual
  | 'docs'     // Persoenliche Dokumente

/** Legacy CustomerTab values, kept for backwards-compat with deep-link callers. */
export type LegacyCustomerTab =
  | 'ueberblick' | 'arbeiten' | 'historie'         // 3-Tab-Aera
  | 'dashboard' | 'aktivitaeten' | 'informationen' // noch aeltere 9-Tab-Aera
  | 'sales' | 'workflow' | 'arbeitsraum' | 'dateien'

/** Map legacy tab IDs onto the new 7-tab model. */
export function mapLegacyCustomerTab(tab: string): CustomerTab {
  switch (tab) {
    // Schon im neuen Schema
    case 'cockpit':
    case 'tasks':
    case 'notizen':
    case 'dokumente':
    case 'kommunikation':
    case 'verlauf':
    case 'finanzen':
      return tab as CustomerTab
    // Mapping aus dem 3-Tab-Modell
    case 'ueberblick':
      return 'cockpit'
    case 'arbeiten':
      return 'tasks'
    case 'historie':
      return 'verlauf'
    // Mapping aus dem aelteren 9-Tab-Modell
    case 'dashboard':
    case 'sales':
    case 'informationen':
      return 'cockpit'
    case 'workflow':
      return 'tasks'
    case 'arbeitsraum':
      return 'notizen'
    case 'dateien':
      return 'dokumente'
    case 'aktivitaeten':
      // User-Wunsch: "nur Kommunikation ist bei Aktivitaeten"
      return 'kommunikation'
    default:
      return 'cockpit'
  }
}
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'sales'     | 'invoices'  | 'inbox'
  | 'settings'
  | 'pipeline'  | 'calendar'   | 'mail' | 'followups' | 'leads'
  | 'journal'

interface UiState {
  theme: Theme
  selectedCustomerId: string | null
  appView: AppView
  focusMode: boolean
  hasSeenIntro: boolean
  migrationDone: boolean
  cmdPaletteOpen: boolean
  activeCustomerTab: CustomerTab
  tasksTab: TasksTab
  dashboardView: DashboardView
  /** Sidebar im Icon-only-Modus (mehr Platz fuer die Workflaeche). Persistiert. */
  sidebarCollapsed: boolean
  /** Aktiver App-Modus — Business-Plattform oder Privater Raum. */
  appMode: AppMode
  /** Aktive Sub-Route innerhalb des Privaten Raums. */
  privateView: PrivateView
  toggleTheme: () => void
  setSelectedCustomer: (id: string | null) => void
  openCustomerAt: (id: string, tab?: CustomerTab | LegacyCustomerTab) => void
  setAppView: (view: AppView) => void
  toggleFocusMode: () => void
  markIntroSeen: () => void
  markMigrationDone: () => void
  setCmdPaletteOpen: (open: boolean) => void
  setActiveCustomerTab: (tab: CustomerTab) => void
  setTasksTab: (tab: TasksTab) => void
  setDashboardView: (view: DashboardView) => void
  toggleSidebar: () => void
  enterPrivate: (view?: PrivateView) => void
  leavePrivate: () => void
  setPrivateView: (view: PrivateView) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      selectedCustomerId: null,
      appView: 'dashboard',
      focusMode: false,
      hasSeenIntro: false,
      migrationDone: false,
      cmdPaletteOpen: false,
      activeCustomerTab: 'cockpit',
      tasksTab: 'list',
      dashboardView: 'workspace',
      sidebarCollapsed: false,
      appMode: 'business',
      privateView: 'capture',

      toggleTheme: () =>
        set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setSelectedCustomer: (id) =>
        set({ selectedCustomerId: id, appView: 'clients' }),

      openCustomerAt: (id, tab = 'ueberblick') =>
        set({ selectedCustomerId: id, appView: 'clients', activeCustomerTab: mapLegacyCustomerTab(tab) }),

      setAppView: (view) =>
        set({ appView: view }),

      toggleFocusMode: () =>
        set(s => ({ focusMode: !s.focusMode })),

      markIntroSeen: () =>
        set({ hasSeenIntro: true }),

      markMigrationDone: () =>
        set({ migrationDone: true }),

      setCmdPaletteOpen: (open) =>
        set({ cmdPaletteOpen: open }),

      setActiveCustomerTab: (tab) =>
        set({ activeCustomerTab: mapLegacyCustomerTab(tab) }),

      setTasksTab: (tab) =>
        set({ tasksTab: tab }),

      setDashboardView: (view) =>
        set({ dashboardView: view }),

      toggleSidebar: () =>
        set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      enterPrivate: (view) =>
        set(s => ({ appMode: 'private', privateView: view ?? s.privateView })),

      leavePrivate: () =>
        set({ appMode: 'business' }),

      setPrivateView: (view) =>
        set({ privateView: view }),
    }),
    {
      name: 'focus-ui-v2',
      partialize: (s) => ({
        theme: s.theme,
        selectedCustomerId: s.selectedCustomerId,
        hasSeenIntro: s.hasSeenIntro,
        migrationDone: s.migrationDone,
        tasksTab: s.tasksTab,
        dashboardView: s.dashboardView,
        sidebarCollapsed: s.sidebarCollapsed,
        appMode: s.appMode,
        privateView: s.privateView,
      }),
    }
  )
)
