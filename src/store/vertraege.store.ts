import { create } from 'zustand'
import { FinanceService } from '@/services/finance.service'
import { VertraegeService } from '@/services/vertraege.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { log } from '@/lib/logger'
import { addInterval, calcVertragTotals } from '@/types/vertrag.types'
import type { Vertrag, CreateVertragPayload } from '@/types/vertrag.types'

// Alt: Verträge lagen im localStorage. Jetzt in SQLite (Backup/GoBD-relevant).
// Der Legacy-Key wird beim ersten Laden einmalig in die DB migriert — und als
// Sicherheitsnetz NICHT gelöscht.
const LEGACY_KEY   = 'cynera-vertraege-v1'
const MIGRATED_KEY = 'cynera-vertraege-migrated-v1'

function uid() { return `vtg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
function todayISO() { return new Date().toLocaleDateString('sv') }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv')
}
function wsId(): string { return useWorkspaceStore.getState().activeWorkspaceId ?? '' }

/** Persistiert einen Vertrag in die DB (optimistisches UI bleibt synchron).
 *  try/catch fängt auch synchrone invoke-Würfe (z.B. außerhalb von Tauri/Tests). */
function persist(v: Vertrag) {
  try {
    VertraegeService.upsert({ ...v, workspaceId: wsId() })
      .catch(err => log.error('Vertrag speichern fehlgeschlagen', { id: v.id, err }))
  } catch (err) {
    log.error('Vertrag speichern fehlgeschlagen', { id: v.id, err })
  }
}

interface VertraegeState {
  vertraege: Vertrag[]
  loaded: boolean
  loadVertraege:   (workspaceId: string) => Promise<void>
  createVertrag:   (payload: CreateVertragPayload) => void
  updateVertrag:   (id: string, partial: Partial<Pick<Vertrag, 'title' | 'accountId' | 'intervalValue' | 'intervalUnit' | 'startDate' | 'endDate' | 'status' | 'taxMode' | 'notes' | 'items' | 'nextBillingDate'>>) => void
  deleteVertrag:   (id: string) => void
  checkAndCreateDueInvoices: (workspaceId: string, userId: string) => Promise<number>
}

export const useVertraege = create<VertraegeState>()((set, get) => ({
  vertraege: [],
  loaded: false,

  async loadVertraege(workspaceId) {
    try {
      let rows = await VertraegeService.getAll(workspaceId)

      // Einmalige Migration localStorage → DB (nur wenn DB leer & noch nicht migriert).
      if (rows.length === 0 && localStorage.getItem(MIGRATED_KEY) !== '1') {
        let legacy: Vertrag[] = []
        try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]') } catch { legacy = [] }
        if (legacy.length > 0) {
          for (const v of legacy) {
            await VertraegeService.upsert({ ...v, workspaceId })
              .catch(err => log.error('Vertrag-Migration fehlgeschlagen', { id: v.id, err }))
          }
          rows = await VertraegeService.getAll(workspaceId)
          log.info('Verträge aus localStorage migriert', { count: legacy.length })
        }
        localStorage.setItem(MIGRATED_KEY, '1')
      }

      set({ vertraege: rows, loaded: true })
    } catch (err) {
      log.error('Verträge laden fehlgeschlagen', { err })
      set({ loaded: true })
    }
  },

  createVertrag(payload) {
    const v: Vertrag = {
      id: uid(), ...payload,
      nextBillingDate: payload.startDate,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    set(s => ({ vertraege: [v, ...s.vertraege] }))
    persist(v)
  },

  updateVertrag(id, partial) {
    let updated: Vertrag | undefined
    set(s => ({
      vertraege: s.vertraege.map(v => {
        if (v.id !== id) return v
        updated = { ...v, ...partial }
        return updated
      }),
    }))
    if (updated) persist(updated)
  },

  deleteVertrag(id) {
    set(s => ({ vertraege: s.vertraege.filter(v => v.id !== id) }))
    try {
      VertraegeService.delete(id)
        .catch(err => log.error('Vertrag löschen fehlgeschlagen', { id, err }))
    } catch (err) {
      log.error('Vertrag löschen fehlgeschlagen', { id, err })
    }
  },

  async checkAndCreateDueInvoices(workspaceId, userId) {
    const today = todayISO()
    const active = get().vertraege.filter(v => {
      if (v.status !== 'active') return false
      if (v.endDate && v.endDate < today) return false
      return v.nextBillingDate <= today
    })

    let count = 0
    for (const vertrag of active) {
      let next = vertrag.nextBillingDate
      let iterations = 0
      while (next <= today && iterations < 24) {
        const totals = calcVertragTotals(vertrag.items, vertrag.taxMode)
        await FinanceService.createInvoice({
          workspaceId,
          createdBy: userId,
          accountId: vertrag.accountId,
          date: next,
          dueDate: addDays(next, 14),
          status: 'draft',
          taxMode: vertrag.taxMode,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          notes: vertrag.notes || undefined,
          items: vertrag.items.map((item, i) => ({
            title:     item.title,
            quantity:  item.quantity,
            unitPrice: item.unitPrice,
            taxRate:   item.taxRate,
            total:     Math.round(item.quantity * item.unitPrice * (1 + item.taxRate / 100) * 100) / 100,
            sortOrder: i,
          })),
        })
        count++
        iterations++
        next = addInterval(next, vertrag.intervalValue, vertrag.intervalUnit)
      }
      get().updateVertrag(vertrag.id, { nextBillingDate: next })
    }
    return count
  },
}))
