import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
export type AppView = 'customers' | 'company'

interface UiState {
  theme: Theme
  selectedCustomerId: string | null
  appView: AppView
  focusMode: boolean
  hasSeenIntro: boolean
  toggleTheme: () => void
  setSelectedCustomer: (id: string | null) => void
  setAppView: (view: AppView) => void
  toggleFocusMode: () => void
  markIntroSeen: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      selectedCustomerId: null,
      appView: 'customers',
      focusMode: false,
      hasSeenIntro: false,

      toggleTheme: () =>
        set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setSelectedCustomer: (id) =>
        set({ selectedCustomerId: id, appView: 'customers' }),

      setAppView: (view) =>
        set({ appView: view, selectedCustomerId: null }),

      toggleFocusMode: () =>
        set(s => ({ focusMode: !s.focusMode })),

      markIntroSeen: () =>
        set({ hasSeenIntro: true }),
    }),
    {
      name: 'focus-ui-v2',
      partialize: (s) => ({
        theme: s.theme,
        selectedCustomerId: s.selectedCustomerId,
        hasSeenIntro: s.hasSeenIntro,
      }),
    }
  )
)
