import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
/** Canonical customer tabs — 3 instead of 9. */
export type CustomerTab = 'ueberblick' | 'arbeiten' | 'historie'

/** Clients page view mode: card board vs. filtered list (Smart Lists). */
export type ClientsView = 'board' | 'list'

/** Tasks page tab. */
export type TasksTab = 'list' | 'board' | 'focus'

/** Legacy CustomerTab values, kept for backwards-compat with deep-link callers. */
export type LegacyCustomerTab = 'dashboard' | 'kommunikation' | 'aktivitaeten' | 'informationen' | 'sales' | 'workflow' | 'arbeitsraum' | 'dateien' | 'finanzen'

/** Map legacy tab IDs onto the new three-tab model. */
export function mapLegacyCustomerTab(tab: string): CustomerTab {
  switch (tab) {
    case 'ueberblick':
    case 'arbeiten':
    case 'historie':
      return tab as CustomerTab
    case 'dashboard':
    case 'informationen':
    case 'sales':
    case 'finanzen':
      return 'ueberblick'
    case 'workflow':
    case 'arbeitsraum':
    case 'dateien':
      return 'arbeiten'
    case 'kommunikation':
    case 'aktivitaeten':
    default:
      return 'historie'
  }
}
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'sales'     | 'invoices'  | 'inbox'
  | 'settings'
  | 'pipeline'  | 'calendar'   | 'mail' | 'followups' | 'leads'

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
      activeCustomerTab: 'ueberblick',
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
