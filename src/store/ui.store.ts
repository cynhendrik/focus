import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
export type CustomerTab = 'dashboard' | 'workflow' | 'kommunikation' | 'dateien' | 'historie' | 'sales'
export type AppView =
  | 'dashboard' | 'profile'   | 'workstation'
  | 'clients'   | 'pipeline'  | 'invoices'  | 'tasks'    | 'kpis' | 'insights'
  | 'calendar'  | 'mail'      | 'crm'       | 'settings' | 'followups'
  | 'smartlists'| 'chat'      | 'leads'

interface UiState {
  theme: Theme
  selectedCustomerId: string | null
  appView: AppView
  focusMode: boolean
  hasSeenIntro: boolean
  migrationDone: boolean
  cmdPaletteOpen: boolean
  activeCustomerTab: CustomerTab
  toggleTheme: () => void
  setSelectedCustomer: (id: string | null) => void
  setAppView: (view: AppView) => void
  toggleFocusMode: () => void
  markIntroSeen: () => void
  markMigrationDone: () => void
  setCmdPaletteOpen: (open: boolean) => void
  setActiveCustomerTab: (tab: CustomerTab) => void
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
      activeCustomerTab: 'dashboard',

      toggleTheme: () =>
        set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setSelectedCustomer: (id) =>
        set({ selectedCustomerId: id, appView: 'clients' }),

      setAppView: (view) =>
        set({ appView: view, selectedCustomerId: null }),

      toggleFocusMode: () =>
        set(s => ({ focusMode: !s.focusMode })),

      markIntroSeen: () =>
        set({ hasSeenIntro: true }),

      markMigrationDone: () =>
        set({ migrationDone: true }),

      setCmdPaletteOpen: (open) =>
        set({ cmdPaletteOpen: open }),

      setActiveCustomerTab: (tab) =>
        set({ activeCustomerTab: tab }),
    }),
    {
      name: 'focus-ui-v2',
      partialize: (s) => ({
        theme: s.theme,
        selectedCustomerId: s.selectedCustomerId,
        hasSeenIntro: s.hasSeenIntro,
        migrationDone: s.migrationDone,
      }),
    }
  )
)
