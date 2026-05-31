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
export type ClientsView = 'board' | 'list'

/** Tasks page tab. */
export type TasksTab = 'list' | 'board' | 'focus'

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
  | 'pipeline'  | 'calendar'   | 'mail' | 'followups' | 'leads' | 'sales-cockpit'
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
  clientsView: ClientsView
  tasksTab: TasksTab
  toggleTheme: () => void
  setSelectedCustomer: (id: string | null) => void
  openCustomerAt: (id: string, tab?: CustomerTab | LegacyCustomerTab) => void
  setAppView: (view: AppView) => void
  toggleFocusMode: () => void
  markIntroSeen: () => void
  markMigrationDone: () => void
  setCmdPaletteOpen: (open: boolean) => void
  setActiveCustomerTab: (tab: CustomerTab) => void
  setClientsView: (view: ClientsView) => void
  setTasksTab: (tab: TasksTab) => void
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
      clientsView: 'board',
      tasksTab: 'list',

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

      setClientsView: (view) =>
        set({ clientsView: view }),

      setTasksTab: (tab) =>
        set({ tasksTab: tab }),
    }),
    {
      name: 'focus-ui-v2',
      partialize: (s) => ({
        theme: s.theme,
        selectedCustomerId: s.selectedCustomerId,
        hasSeenIntro: s.hasSeenIntro,
        migrationDone: s.migrationDone,
        clientsView: s.clientsView,
        tasksTab: s.tasksTab,
      }),
    }
  )
)
