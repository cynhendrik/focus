import { create } from 'zustand'
import { AuftraegeGateway, KEY_AUFTRAEGE, KEY_ZEITEINTRAEGE } from '@/data/auftraege.gateway'
import { useWorkspaceStore } from '@/store/workspace.store'
import { log } from '@/lib/logger'
import type { Auftrag, Zeiteintrag, CreateAuftragPayload, AddZeiteintragPayload } from '@/types/auftrag.types'

const MIGRATED_KEY = 'cynera-auftraege-migrated-v1'

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function entryAmount(entry: Zeiteintrag, auftraege: Auftrag[]): number {
  const rate = entry.hourlyRate ?? auftraege.find(a => a.id === entry.auftragId)?.defaultHourlyRate ?? 0
  return Math.round((entry.minutes / 60) * rate * 100) / 100
}

export interface UnbilledSummary {
  entries:      Zeiteintrag[]
  totalMinutes: number
  totalAmount:  number
}

interface AuftraegeState {
  auftraege:     Auftrag[]
  zeiteintraege: Zeiteintrag[]
  loaded:        boolean

  loadAuftraege:        (workspaceId: string) => Promise<void>
  createAuftrag:        (payload: CreateAuftragPayload) => void
  updateAuftrag:        (id: string, partial: Partial<Pick<Auftrag, 'title' | 'defaultHourlyRate' | 'notes' | 'status'>>) => void
  deleteAuftrag:        (id: string) => void
  addZeiteintrag:       (payload: AddZeiteintragPayload) => void
  removeZeiteintrag:    (id: string) => void
  markBilledForAccount: (accountId: string, invoiceId: string) => void
  markBilledEntries:    (entryIds: string[], invoiceId: string) => void

  unbilledForAccount: (accountId: string) => UnbilledSummary
  unbilledMinutes:    (auftragId: string) => number
}

function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

export const useAuftraege = create<AuftraegeState>()((set, get) => ({
  auftraege:     [],
  zeiteintraege: [],
  loaded:        false,

  async loadAuftraege(workspaceId) {
    try {
      let data = await AuftraegeGateway.loadAll(workspaceId)

      // Einmalige Migration localStorage → Cloud (nur shared, Cloud leer, noch nicht migriert).
      if (useWorkspaceStore.getState().isActiveWorkspaceShared()
          && data.auftraege.length === 0 && data.zeiteintraege.length === 0
          && localStorage.getItem(MIGRATED_KEY) !== '1') {
        const legacyA = lsGet<Auftrag>(KEY_AUFTRAEGE)
        const legacyZ = lsGet<Zeiteintrag>(KEY_ZEITEINTRAEGE)
        if (legacyA.length > 0 || legacyZ.length > 0) {
          for (const a of legacyA) await AuftraegeGateway.upsertAuftrag(a).catch(e => log.error('Auftrag-Migration', { e }))
          for (const z of legacyZ) await AuftraegeGateway.upsertZeiteintrag(z).catch(e => log.error('Zeiteintrag-Migration', { e }))
          data = await AuftraegeGateway.loadAll(workspaceId)
          log.info('Aufträge aus localStorage migriert', { auftraege: legacyA.length, zeiteintraege: legacyZ.length })
        }
        localStorage.setItem(MIGRATED_KEY, '1')
      }

      set({ auftraege: data.auftraege, zeiteintraege: data.zeiteintraege, loaded: true })
    } catch (err) {
      log.error('Aufträge laden fehlgeschlagen', { err })
      set({ loaded: true })
    }
  },

  createAuftrag(payload) {
    const auftrag: Auftrag = {
      id: `auf_${uid()}`, ...payload,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    set({ auftraege: [auftrag, ...get().auftraege] })
    void AuftraegeGateway.upsertAuftrag(auftrag).catch(e => log.error('Auftrag speichern', { e }))
  },

  updateAuftrag(id, partial) {
    let updated: Auftrag | undefined
    set(s => ({ auftraege: s.auftraege.map(a => { if (a.id !== id) return a; updated = { ...a, ...partial }; return updated }) }))
    if (updated) void AuftraegeGateway.upsertAuftrag(updated).catch(e => log.error('Auftrag speichern', { e }))
  },

  deleteAuftrag(id) {
    set(s => ({
      auftraege: s.auftraege.filter(a => a.id !== id),
      zeiteintraege: s.zeiteintraege.map(z => z.auftragId === id ? { ...z, auftragId: null } : z),
    }))
    void AuftraegeGateway.deleteAuftrag(id).catch(e => log.error('Auftrag löschen', { e }))
  },

  addZeiteintrag(payload) {
    const entry: Zeiteintrag = {
      id: `ze_${uid()}`, ...payload,
      billed: false, invoiceId: null,
    }
    set({ zeiteintraege: [entry, ...get().zeiteintraege] })
    void AuftraegeGateway.upsertZeiteintrag(entry).catch(e => log.error('Zeiteintrag speichern', { e }))
  },

  removeZeiteintrag(id) {
    set(s => ({ zeiteintraege: s.zeiteintraege.filter(z => z.id !== id) }))
    void AuftraegeGateway.deleteZeiteintrag(id).catch(e => log.error('Zeiteintrag löschen', { e }))
  },

  markBilledForAccount(accountId, invoiceId) {
    set(s => ({
      zeiteintraege: s.zeiteintraege.map(z => z.accountId === accountId && !z.billed ? { ...z, billed: true, invoiceId } : z),
    }))
    void AuftraegeGateway.markBilledForAccount(accountId, invoiceId).catch(e => log.error('Abrechnung markieren', { e }))
  },

  markBilledEntries(entryIds, invoiceId) {
    const idSet = new Set(entryIds)
    set(s => ({ zeiteintraege: s.zeiteintraege.map(z => idSet.has(z.id) ? { ...z, billed: true, invoiceId } : z) }))
    void AuftraegeGateway.markBilled(entryIds, invoiceId).catch(e => log.error('Abrechnung markieren', { e }))
  },

  unbilledForAccount(accountId) {
    const { zeiteintraege, auftraege } = get()
    const entries      = zeiteintraege.filter(z => z.accountId === accountId && !z.billed)
    const totalMinutes = entries.reduce((s, z) => s + z.minutes, 0)
    const totalAmount  = Math.round(entries.reduce((s, z) => s + entryAmount(z, auftraege), 0) * 100) / 100
    return { entries, totalMinutes, totalAmount }
  },

  unbilledMinutes(auftragId) {
    return get().zeiteintraege
      .filter(z => z.auftragId === auftragId && !z.billed)
      .reduce((s, z) => s + z.minutes, 0)
  },
}))

// Trigger: laden bei App-Start und Workspace-Wechsel (ersetzt das alte synchrone
// localStorage-Hydrieren; kein App.tsx-Eingriff nötig).
const initialWs = useWorkspaceStore.getState().activeWorkspaceId
if (initialWs) void useAuftraege.getState().loadAuftraege(initialWs)
useWorkspaceStore.subscribe((s, prev) => {
  if (s.activeWorkspaceId && s.activeWorkspaceId !== prev.activeWorkspaceId) {
    void useAuftraege.getState().loadAuftraege(s.activeWorkspaceId)
  }
})
