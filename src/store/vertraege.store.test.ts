import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CreateVertragPayload } from '@/types/vertrag.types'

const storage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem:  (k: string) => storage[k] ?? null,
  setItem:  (k: string, v: string) => { storage[k] = v },
  removeItem: (k: string) => { delete storage[k] },
})

vi.mock('@/services/finance.service', () => ({
  FinanceService: {
    createInvoice: vi.fn().mockResolvedValue({ invoice: { id: 'inv_mock' }, items: [] }),
  },
}))

const base: CreateVertragPayload = {
  accountId: 'acc1', title: 'Retainer', intervalValue: 1, intervalUnit: 'months',
  startDate: '2026-06-01', endDate: null, taxMode: 'standard', notes: '',
  items: [{ title: 'Beratung', quantity: 1, unitPrice: 2000, taxRate: 19 }],
}

describe('vertraege store', () => {
  beforeEach(async () => {
    Object.keys(storage).forEach(k => delete storage[k])
    vi.clearAllMocks()
    const { useVertraege } = await import('./vertraege.store')
    useVertraege.setState({ vertraege: [] })
  })

  it('createVertrag legt Vertrag an mit nextBillingDate = startDate', async () => {
    const { useVertraege } = await import('./vertraege.store')
    useVertraege.getState().createVertrag(base)
    const { vertraege } = useVertraege.getState()
    expect(vertraege).toHaveLength(1)
    expect(vertraege[0].nextBillingDate).toBe('2026-06-01')
    expect(vertraege[0].status).toBe('active')
  })

  it('checkAndCreateDueInvoices erstellt Rechnung wenn fällig', async () => {
    const { useVertraege } = await import('./vertraege.store')
    const { FinanceService } = await import('@/services/finance.service')
    useVertraege.getState().createVertrag({ ...base, startDate: '2026-05-01' })
    const count = await useVertraege.getState().checkAndCreateDueInvoices('ws1', 'u1')
    expect(count).toBeGreaterThan(0)
    expect(FinanceService.createInvoice).toHaveBeenCalled()
  })

  it('checkAndCreateDueInvoices überspringt nicht-fällige Verträge', async () => {
    const { useVertraege } = await import('./vertraege.store')
    const { FinanceService } = await import('@/services/finance.service')
    useVertraege.getState().createVertrag({ ...base, startDate: '2099-01-01' })
    const count = await useVertraege.getState().checkAndCreateDueInvoices('ws1', 'u1')
    expect(count).toBe(0)
    expect(FinanceService.createInvoice).not.toHaveBeenCalled()
  })

  it('checkAndCreateDueInvoices aktualisiert nextBillingDate nach Erstellung', async () => {
    const { useVertraege } = await import('./vertraege.store')
    useVertraege.getState().createVertrag({ ...base, startDate: '2026-05-01' })
    await useVertraege.getState().checkAndCreateDueInvoices('ws1', 'u1')
    const { vertraege } = useVertraege.getState()
    expect(vertraege[0].nextBillingDate > new Date().toLocaleDateString('sv')).toBe(true)
  })
})
