import { describe, it, expect, beforeEach, vi } from 'vitest'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem:  (k: string) => store[k] ?? null,
  setItem:  (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

describe('auftraege store', () => {
  beforeEach(async () => {
    Object.keys(store).forEach(k => delete store[k])
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.setState({ auftraege: [], zeiteintraege: [] })
  })

  it('createAuftrag legt Auftrag an', async () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({
      title: 'Website', defaultHourlyRate: 90, notes: '',
    })
    const { auftraege } = useAuftraege.getState()
    expect(auftraege).toHaveLength(1)
    expect(auftraege[0].title).toBe('Website')
    expect(auftraege[0].status).toBe('active')
  })

  it('addZeiteintrag bucht Zeit auf Auftrag', async () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({ title: 'Test', defaultHourlyRate: 100, notes: '' })
    const { auftraege } = useAuftraege.getState()
    useAuftraege.getState().addZeiteintrag({
      auftragId: auftraege[0].id, accountId: 'acc1',
      date: '2026-06-06', minutes: 90, description: 'Setup', hourlyRate: null,
    })
    const { zeiteintraege } = useAuftraege.getState()
    expect(zeiteintraege).toHaveLength(1)
    expect(zeiteintraege[0].billed).toBe(false)
    expect(zeiteintraege[0].minutes).toBe(90)
  })

  it('markBilledForAccount setzt alle Einträge des Kunden auf billed', async () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({ title: 'Test', defaultHourlyRate: 100, notes: '' })
    const id = useAuftraege.getState().auftraege[0].id
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 60, description: 'A', hourlyRate: null })
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 30, description: 'B', hourlyRate: null })
    useAuftraege.getState().markBilledForAccount('acc1', 'inv_123')
    const { zeiteintraege } = useAuftraege.getState()
    expect(zeiteintraege.every(e => e.billed && e.invoiceId === 'inv_123')).toBe(true)
  })

  it('unbilledMinutes berechnet nur nicht-abgerechnete Minuten', async () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({ title: 'Test', defaultHourlyRate: 100, notes: '' })
    const id = useAuftraege.getState().auftraege[0].id
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 60, description: 'A', hourlyRate: null })
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 30, description: 'B', hourlyRate: null })
    expect(useAuftraege.getState().unbilledMinutes(id)).toBe(90)
    useAuftraege.getState().markBilledForAccount('acc1', 'inv_1')
    expect(useAuftraege.getState().unbilledMinutes(id)).toBe(0)
  })
})
