import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface StapelSettingsState {
  suppressedRuleIds: string[]
  dismissCounts: Record<string, number>
  suppressRule: (ruleId: string) => void
  bumpDismiss: (ruleId: string) => number
}

export const useStapelSettingsStore = create<StapelSettingsState>()(
  persist(
    (set, get) => ({
      suppressedRuleIds: [],
      dismissCounts: {},
      suppressRule: (ruleId) => set(s => ({
        suppressedRuleIds: [...new Set([...s.suppressedRuleIds, ruleId])],
      })),
      bumpDismiss: (ruleId) => {
        const next = (get().dismissCounts[ruleId] ?? 0) + 1
        set(s => ({ dismissCounts: { ...s.dismissCounts, [ruleId]: next } }))
        return next
      },
    }),
    { name: 'cultera-stapel-settings' },
  ),
)
