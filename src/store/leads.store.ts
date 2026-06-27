import { create } from 'zustand'
import { LeadsService } from '@/services/leads.service'
import { AccountsGateway } from '@/data/accounts.gateway'
import { usePipelineStore } from './pipeline.store'
import { useDealsStore } from './deals.store'
import { useCustomersStore } from './customers.store'
import { DealsService } from '@/services/deals.service'
import { log } from '@/lib/logger'
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload, PipelineStage } from '@/types/lead.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface LeadsState {
  leads: Lead[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertLeadPayload) => Promise<Lead>
  bulkUpdate: (payload: BulkUpdateLeadsPayload, workspaceId: string) => Promise<void>
  convertToClient: (id: string) => Promise<void>
  convertToDeal: (id: string, workspaceId: string, userId: string) => Promise<void>
  deleteLead: (id: string, workspaceId: string) => Promise<void>
  syncPending: (workspaceId: string) => Promise<void>
  updateStage: (id: string, stage: PipelineStage) => Promise<void>
  /** Board-Drag: Karte SOFORT lokal in die Zielspalte (leadStatus) setzen, dann im
   *  Hintergrund persistieren; bei Fehler zurückrollen. Kein await/Reload → kein Ruckeln. */
  moveLeadStage: (id: string, status: string) => void
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
      const leads = await AccountsGateway.getLeads(workspaceId)
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
      const lead = await AccountsGateway.upsertLead(payload)
      set(s => {
        const exists = s.leads.some(l => l.id === lead.id)
        return {
          leads: exists
            ? s.leads.map(l => l.id === lead.id ? lead : l)
            : [lead, ...s.leads],
        }
      })
      return lead
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
      await AccountsGateway.bulkUpdate(payload)
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
      await AccountsGateway.convertToClient(id)
      set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to convert lead to client', { error })
      throw err
    }
  },

  convertToDeal: async (id, workspaceId, userId) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead) throw new Error('Lead nicht gefunden')

    const stages = usePipelineStore.getState().activeStages()
    if (stages.length === 0) {
      throw new Error('Keine Pipeline-Stage konfiguriert')
    }
    const firstStage = stages[0]

    // 1) Convert lead → customer (changes account_type in DB)
    await AccountsGateway.convertToClient(id)

    // 2) Create deal pointing to the now-customer (same ID)
    const userIdSafe = userId || lead.workspaceId  // never empty, but createdBy is required
    const sourceNote = lead.leadSourceDetail
      ? `Lead-Quelle: ${lead.leadSourceDetail}`
      : `Lead-Quelle: ${lead.leadSource}`
    const deal = await DealsService.upsert({
      workspaceId,
      createdBy: userIdSafe,
      accountId: id,
      customerId: id,
      title: lead.name,
      stage: firstStage.name,
      value: 0,
      notes: sourceNote,
    })

    // 3) Refresh customers — the converted lead is now a customer in DB
    await useCustomersStore.getState().init()

    // 4) Update local state — remove lead, add deal
    useLeadsStore.setState(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    useDealsStore.setState(s => ({ deals: [...s.deals, deal] }))
  },

  deleteLead: async (id, workspaceId) => {
    set({ error: null })
    try {
      await AccountsGateway.deleteAccount(id, workspaceId)
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

  updateStage: async (id, stage) => {
    try {
      const lead = await AccountsGateway.updateStage(id, stage)
      set(s => ({ leads: s.leads.map(l => l.id === id ? lead : l) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  moveLeadStage: (id, status) => {
    const prev = get().leads
    // Optimistisch: Karte sofort verschieben (Board gruppiert nach leadStatus).
    set({ leads: prev.map(l => l.id === id ? { ...l, leadStatus: status } : l), error: null })
    // Persistenz im Hintergrund; Realtime echo't den Server-Stand zurück (kein Reload nötig).
    AccountsGateway.bulkUpdate({ ids: [id], status }).catch(err => {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      log.error('Failed to move lead stage', { error })
      set({ leads: prev, error })   // Rollback
    })
  },

  newLeads: () => get().leads.filter(l => l.pipelineStage === 'inbox'),
  attemptedLeads: () => get().leads.filter(l => l.pipelineStage === 'waiting_reply'),
  warmLeads: () => get().leads.filter(l => l.pipelineStage === 'replied'),
  lostLeads: () => get().leads.filter(l => l.pipelineStage === 'lost'),
  reEngageLeads: () => get().leads.filter(l => l.reEngageDate != null),
}))
