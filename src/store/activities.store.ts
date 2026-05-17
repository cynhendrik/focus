import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import { useAccountsStore } from './accounts.store'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/activity.types'

interface ActivitiesState {
  activities: Activity[]
  openTasks: Activity[]
  isLoading: boolean
  loadByAccount: (accountId: string) => Promise<void>
  loadByDeal: (dealId: string) => Promise<void>
  loadOpenTasks: () => Promise<void>
  create: (payload: Omit<CreateActivityPayload, 'workspaceId' | 'createdBy'>) => Promise<Activity>
  update: (id: string, payload: UpdateActivityPayload) => Promise<Activity>
  remove: (id: string) => Promise<void>
}

export const useActivitiesStore = create<ActivitiesState>()((set) => ({
  activities: [],
  openTasks: [],
  isLoading: false,

  loadByAccount: async (accountId) => {
    set({ isLoading: true })
    try {
      const activities = await invoke<Activity[]>('get_activities_by_account', { accountId })
      set({ activities, isLoading: false })
    } catch { set({ isLoading: false }) }
  },

  loadByDeal: async (dealId) => {
    set({ isLoading: true })
    try {
      const activities = await invoke<Activity[]>('get_activities_by_deal', { dealId })
      set({ activities, isLoading: false })
    } catch { set({ isLoading: false }) }
  },

  loadOpenTasks: async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    try {
      const openTasks = await invoke<Activity[]>('get_open_tasks', { workspaceId })
      set({ openTasks })
    } catch {}
  },

  create: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const activity = await invoke<Activity>('create_activity', { payload: { ...payload, workspaceId, createdBy } })
    set(s => ({ activities: [activity, ...s.activities] }))
    if (payload.outcome) {
      await useAccountsStore.getState().init()
    }
    return activity
  },

  update: async (id, payload) => {
    const updated = await invoke<Activity>('update_activity', { id, payload })
    set(s => ({ activities: s.activities.map(a => a.id === id ? updated : a) }))
    if (payload.outcome) {
      await useAccountsStore.getState().init()
    }
    return updated
  },

  remove: async (id) => {
    await invoke<void>('delete_activity', { id })
    set(s => ({ activities: s.activities.filter(a => a.id !== id) }))
  },
}))
