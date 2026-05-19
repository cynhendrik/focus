import { create } from 'zustand'
import { LeadsService } from '@/services/leads.service'
import { log } from '@/lib/logger'
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload } from '@/types/lead.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface LeadsState {
  leads: Lead[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertLeadPayload) => Promise<void>
  bulkUpdate: (payload: BulkUpdateLeadsPayload, workspaceId: string) => Promise<void>
  convertToClient: (id: string) => Promise<void>
  deleteLead: (id: string, workspaceId: string) => Promise<void>
  syncPending: (workspaceId: string) => Promise<void>
  newLeads: () => Lead[]
  attemptedLeads: () => Lead[]
  warmLeads: () => Lead[]
  lostLeads: () => Lead[]
  reEngageLeads: () => Lead[]
}

export const useLeadsStore = create<LeadsState>()((set, get) => ({
  leads: [],
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const leads = await LeadsService.getAll(workspaceId)
      set({ leads, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load leads', { error })
    }
  },

  upsert: async (payload) => {
    set({ error: null })
    try {
      const lead = await LeadsService.upsert(payload)
      set(s => {
        const exists = s.leads.some(l => l.id === lead.id)
        return {
          leads: exists
            ? s.leads.map(l => l.id === lead.id ? lead : l)
            : [lead, ...s.leads],
        }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upsert lead', { error })
      throw err
    }
  },

  bulkUpdate: async (payload, workspaceId) => {
    set({ error: null })
    try {
      await LeadsService.bulkUpdate(payload)
      await get().load(workspaceId)
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to bulk update leads', { error })
      throw err
    }
  },

  convertToClient: async (id) => {
    set({ error: null })
    try {
      await LeadsService.convertToClient(id)
      set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to convert lead to client', { error })
      throw err
    }
  },

  deleteLead: async (id, workspaceId) => {
    set({ error: null })
    try {
      await LeadsService.deleteLead(id, workspaceId)
      set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to delete lead', { error })
      throw err
    }
  },

  syncPending: async (workspaceId) => {
    try {
      const count = await LeadsService.syncPending(workspaceId)
      if (count > 0) await get().load(workspaceId)
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      log.error('Sync pending leads failed', { error })
    }
  },

  newLeads: () => get().leads.filter(l => l.leadStatus === 'new'),
  attemptedLeads: () => get().leads.filter(l => l.leadStatus === 'attempted'),
  warmLeads: () => get().leads.filter(l => l.leadStatus === 'warm'),
  lostLeads: () => get().leads.filter(l => l.leadStatus === 'lost_reengage'),
  reEngageLeads: () => get().leads.filter(l => l.reEngageDate != null),
}))
