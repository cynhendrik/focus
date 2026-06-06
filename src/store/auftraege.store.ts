import { create } from 'zustand'
import type { Auftrag, Zeiteintrag, CreateAuftragPayload, AddZeiteintragPayload, AuftragStatus } from '@/types/auftrag.types'

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

interface AuftraegeState {
  auftraege:     Auftrag[]
  zeiteintraege: Zeiteintrag[]

  createAuftrag:     (payload: CreateAuftragPayload) => void
  updateAuftrag:     (id: string, partial: Partial<Pick<Auftrag, 'title' | 'type' | 'hourlyRate' | 'fixedAmount' | 'notes' | 'status'>>) => void
  deleteAuftrag:     (id: string) => void
  addZeiteintrag:    (payload: AddZeiteintragPayload) => void
  removeZeiteintrag: (id: string) => void
  markBilled:        (auftragId: string, invoiceId: string) => void
  unbilledMinutes:   (auftragId: string) => number
  unbilledAmount:    (auftragId: string) => number
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
    const auftraege    = get().auftraege.filter(a => a.id !== id)
    const zeiteintraege = get().zeiteintraege.filter(z => z.auftragId !== id)
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

  markBilled(auftragId, invoiceId) {
    const zeiteintraege = get().zeiteintraege.map(z =>
      z.auftragId === auftragId && !z.billed
        ? { ...z, billed: true, invoiceId }
        : z
    )
    const auftraege = get().auftraege.map(a =>
      a.id === auftragId ? { ...a, status: 'billed' as AuftragStatus } : a
    )
    save(KEY_ZEITEINTRAEGE, zeiteintraege)
    save(KEY_AUFTRAEGE, auftraege)
    set({ zeiteintraege, auftraege })
  },

  unbilledMinutes(auftragId) {
    return get().zeiteintraege
      .filter(z => z.auftragId === auftragId && !z.billed)
      .reduce((s, z) => s + z.minutes, 0)
  },

  unbilledAmount(auftragId) {
    const auftrag = get().auftraege.find(a => a.id === auftragId)
    if (!auftrag) return 0
    if (auftrag.type === 'fixed') return auftrag.fixedAmount ?? 0
    const hours = get().unbilledMinutes(auftragId) / 60
    return Math.round(hours * (auftrag.hourlyRate ?? 0) * 100) / 100
  },
}))
