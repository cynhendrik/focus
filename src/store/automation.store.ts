import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { AutomationRule } from '@/types/automation.types'

interface AutomationState {
  rules: AutomationRule[]
  isLoading: boolean
  load: (workspaceId: string) => Promise<void>
  toggle: (id: string, workspaceId: string, isActive: boolean) => Promise<void>
}

export const useAutomationStore = create<AutomationState>()((set) => ({
  rules: [],
  isLoading: false,

  load: async (workspaceId) => {
    set({ isLoading: true })
    try {
      const rules = await invoke<AutomationRule[]>('cmd_get_automation_rules', { workspaceId })
      set({ rules, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  toggle: async (id, workspaceId, isActive) => {
    await invoke<void>('cmd_set_rule_active', { id, workspaceId, isActive })
    set(s => ({ rules: s.rules.map(r => r.id === id ? { ...r, isActive } : r) }))
  },
}))
