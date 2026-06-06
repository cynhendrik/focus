import { create } from 'zustand'
import { FinanceService } from '@/services/finance.service'
import { addInterval, calcVertragTotals } from '@/types/vertrag.types'
import type { Vertrag, CreateVertragPayload } from '@/types/vertrag.types'

const KEY = 'cynera-vertraege-v1'

function load(): Vertrag[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
function save(data: Vertrag[]) { localStorage.setItem(KEY, JSON.stringify(data)) }
function uid() { return `vtg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
function todayISO() { return new Date().toLocaleDateString('sv') }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv')
}

interface VertraegeState {
  vertraege: Vertrag[]
  createVertrag:   (payload: CreateVertragPayload) => void
  updateVertrag:   (id: string, partial: Partial<Pick<Vertrag, 'title' | 'accountId' | 'intervalValue' | 'intervalUnit' | 'startDate' | 'endDate' | 'status' | 'taxMode' | 'notes' | 'items' | 'nextBillingDate'>>) => void
  deleteVertrag:   (id: string) => void
  checkAndCreateDueInvoices: (workspaceId: string, userId: string) => Promise<number>
}

export const useVertraege = create<VertraegeState>()((set, get) => ({
  vertraege: load(),

  createVertrag(payload) {
    const v: Vertrag = {
      id: uid(), ...payload,
      nextBillingDate: payload.startDate,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    const next = [v, ...get().vertraege]
    save(next); set({ vertraege: next })
  },

  updateVertrag(id, partial) {
    const next = get().vertraege.map(v => v.id === id ? { ...v, ...partial } : v)
    save(next); set({ vertraege: next })
  },

  deleteVertrag(id) {
    const next = get().vertraege.filter(v => v.id !== id)
    save(next); set({ vertraege: next })
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
