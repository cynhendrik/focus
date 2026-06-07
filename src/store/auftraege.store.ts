import { create } from 'zustand'
import type { Auftrag, Zeiteintrag, CreateAuftragPayload, AddZeiteintragPayload } from '@/types/auftrag.types'

const KEY_AUFTRAEGE     = 'cynera-auftraege-v1'
const KEY_ZEITEINTRAEGE = 'cynera-zeiteintraege-v1'

function load<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

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

export const useAuftraege = create<AuftraegeState>()((set, get) => ({
  auftraege:     load<Auftrag>(KEY_AUFTRAEGE),
  zeiteintraege: load<Zeiteintrag>(KEY_ZEITEINTRAEGE),

  createAuftrag(payload) {
    const auftrag: Auftrag = {
      id: `auf_${uid()}`, ...payload,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    const next = [auftrag, ...get().auftraege]
    save(KEY_AUFTRAEGE, next)
    set({ auftraege: next })
  },

  updateAuftrag(id, partial) {
    const next = get().auftraege.map(a => a.id === id ? { ...a, ...partial } : a)
    save(KEY_AUFTRAEGE, next)
    set({ auftraege: next })
  },

  deleteAuftrag(id) {
    const auftraege = get().auftraege.filter(a => a.id !== id)
    const zeiteintraege = get().zeiteintraege.map(z =>
      z.auftragId === id ? { ...z, auftragId: null } : z
    )
    save(KEY_AUFTRAEGE, auftraege)
    save(KEY_ZEITEINTRAEGE, zeiteintraege)
    set({ auftraege, zeiteintraege })
  },

  addZeiteintrag(payload) {
    const entry: Zeiteintrag = {
      id: `ze_${uid()}`, ...payload,
      billed: false, invoiceId: null,
    }
    const next = [entry, ...get().zeiteintraege]
    save(KEY_ZEITEINTRAEGE, next)
    set({ zeiteintraege: next })
  },

  removeZeiteintrag(id) {
    const next = get().zeiteintraege.filter(z => z.id !== id)
    save(KEY_ZEITEINTRAEGE, next)
    set({ zeiteintraege: next })
  },

  markBilledForAccount(accountId, invoiceId) {
    const zeiteintraege = get().zeiteintraege.map(z =>
      z.accountId === accountId && !z.billed
        ? { ...z, billed: true, invoiceId }
        : z
    )
    save(KEY_ZEITEINTRAEGE, zeiteintraege)
    set({ zeiteintraege })
  },

  markBilledEntries(entryIds, invoiceId) {
    const idSet = new Set(entryIds)
    const zeiteintraege = get().zeiteintraege.map(z =>
      idSet.has(z.id) ? { ...z, billed: true, invoiceId } : z
    )
    save(KEY_ZEITEINTRAEGE, zeiteintraege)
    set({ zeiteintraege })
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
