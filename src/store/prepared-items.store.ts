import { create } from 'zustand'
import { PreparedItemsGateway } from '@/data/prepared-items.gateway'
import { toastError } from '@/store/toast.store'
import { log } from '@/lib/logger'
import type { PreparedItem, PreparedItemPayload, PreparedItemStatus } from '@/types/prepared-item.types'

interface PreparedItemsState {
  items: PreparedItem[]
  weekApproved: PreparedItem[]
  loading: boolean
  load: (workspaceId: string) => Promise<void>
  loadWeekApproved: (workspaceId: string) => Promise<void>
  applyStatus: (id: string, status: PreparedItemStatus, opts?: { snoozeUntil?: string | null; approvedAt?: string | null }) => Promise<void>
  applyPayload: (id: string, payload: PreparedItemPayload) => Promise<void>
  applyAssignee: (id: string, assignee: string | null) => Promise<void>
}

function startOfWeekIso(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const usePreparedItemsStore = create<PreparedItemsState>()((set, get) => ({
  items: [],
  weekApproved: [],
  loading: false,

  load: async (workspaceId) => {
    set({ loading: true })
    try {
      const items = await PreparedItemsGateway.listActive(workspaceId)
      set({ items, loading: false })
    } catch (err) {
      log.error('prepared items load failed', { err })
      toastError('Stapel konnte nicht geladen werden.')
      set({ loading: false })
    }
  },

  loadWeekApproved: async (workspaceId) => {
    try {
      set({ weekApproved: await PreparedItemsGateway.approvedSince(workspaceId, startOfWeekIso()) })
    } catch (err) {
      log.warn('weekApproved load failed', { err })
    }
  },

  // Optimistisch: Karte verschwindet sofort; bei Gateway-Fehler zurückrollen + Toast
  // (Vertrauens-Schicht: kein stilles Scheitern).
  applyStatus: async (id, status, opts) => {
    const prev = get().items
    set(s => ({ items: s.items.filter(i => i.id !== id) }))
    try {
      await PreparedItemsGateway.updateStatus(id, status, opts)
    } catch (err) {
      log.error('applyStatus failed', { id, status, err })
      set({ items: prev })
      toastError('Aktion konnte nicht gespeichert werden — Karte bleibt im Stapel.')
    }
  },

  applyPayload: async (id, payload) => {
    const prev = get().items
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, payload } : i) }))
    try {
      await PreparedItemsGateway.updatePayload(id, payload)
    } catch (err) {
      log.error('applyPayload failed', { id, err })
      set({ items: prev })
      toastError('Entwurf konnte nicht gespeichert werden.')
    }
  },

  applyAssignee: async (id, assignee) => {
    const prev = get().items
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, assignee } : i) }))
    try {
      await PreparedItemsGateway.setAssignee(id, assignee)
    } catch (err) {
      log.error('applyAssignee failed', { id, err })
      set({ items: prev })
      toastError('Übergabe konnte nicht gespeichert werden.')
    }
  },
}))
