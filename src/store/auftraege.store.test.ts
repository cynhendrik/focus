import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuftraegeGateway } from '@/data/auftraege.gateway'
import { useToastStore } from './toast.store'

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

  it('markBilledEntries setzt nur die angegebenen Einträge auf billed', async () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({ title: 'Test', defaultHourlyRate: 100, notes: '' })
    const id = useAuftraege.getState().auftraege[0].id
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 60, description: 'A', hourlyRate: null })
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 30, description: 'B', hourlyRate: null })
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 45, description: 'C', hourlyRate: null })
    const { zeiteintraege: allEntries } = useAuftraege.getState()
    const entryA = allEntries.find(e => e.description === 'A')
    const entryB = allEntries.find(e => e.description === 'B')
    useAuftraege.getState().markBilledEntries([entryA!.id, entryB!.id], 'inv_456')
    const { zeiteintraege } = useAuftraege.getState()
    expect(zeiteintraege.find(e => e.id === entryA!.id)?.billed).toBe(true)
    expect(zeiteintraege.find(e => e.id === entryA!.id)?.invoiceId).toBe('inv_456')
    expect(zeiteintraege.find(e => e.id === entryB!.id)?.billed).toBe(true)
    expect(zeiteintraege.find(e => e.id === entryB!.id)?.invoiceId).toBe('inv_456')
    expect(zeiteintraege.find(e => e.description === 'C')?.billed).toBe(false)
    expect(zeiteintraege.find(e => e.description === 'C')?.invoiceId).toBe(null)
  })
})

describe('auftraege store — Abrechnung-Persistenz schlägt fehl (Doppel-Abrechnungs-Schutz)', () => {
  beforeEach(async () => {
    Object.keys(store).forEach(k => delete store[k])
    vi.restoreAllMocks()
    useToastStore.setState({ toasts: [] })
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.setState({ auftraege: [], zeiteintraege: [] })
  })

  it('markBilledForAccount: Persist-Fehler → Einträge bleiben billed (kein versehentliches Neu-Abrechnen) + lauter, wiederholbarer Fehler-Toast', async () => {
    const { useAuftraege } = await import('./auftraege.store')
    const spy = vi.spyOn(AuftraegeGateway, 'markBilledForAccount').mockRejectedValueOnce(new Error('network'))

    useAuftraege.getState().createAuftrag({ title: 'Test', defaultHourlyRate: 100, notes: '' })
    const id = useAuftraege.getState().auftraege[0].id
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 60, description: 'A', hourlyRate: null })

    useAuftraege.getState().markBilledForAccount('acc1', 'inv_x')

    // Optimistisch: sofort billed (verhindert In-Session-Neuabrechnung)
    expect(useAuftraege.getState().zeiteintraege.every(e => e.billed)).toBe(true)
    expect(spy).toHaveBeenCalledOnce()

    // Fehler darf NICHT still sein: Toast mit Fehler-Variante + Retry-Aktion
    await vi.waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))
    const toast = useToastStore.getState().toasts[0]
    expect(toast.variant).toBe('error')
    expect(toast.action).toBeTruthy()

    // Auch nach dem Fehler bleiben sie billed (nicht zurück auf offen → sonst Doppel-Abrechnung)
    expect(useAuftraege.getState().zeiteintraege.every(e => e.billed)).toBe(true)
  })

  it('markBilledEntries: Persist-Fehler → Fehler-Toast + Einträge bleiben billed', async () => {
    const { useAuftraege } = await import('./auftraege.store')
    vi.spyOn(AuftraegeGateway, 'markBilled').mockRejectedValueOnce(new Error('network'))

    useAuftraege.getState().createAuftrag({ title: 'Test', defaultHourlyRate: 100, notes: '' })
    const id = useAuftraege.getState().auftraege[0].id
    useAuftraege.getState().addZeiteintrag({ auftragId: id, accountId: 'acc1', date: '2026-06-06', minutes: 60, description: 'A', hourlyRate: null })
    const entryId = useAuftraege.getState().zeiteintraege[0].id

    useAuftraege.getState().markBilledEntries([entryId], 'inv_y')

    await vi.waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))
    expect(useToastStore.getState().toasts[0].variant).toBe('error')
    expect(useAuftraege.getState().zeiteintraege[0].billed).toBe(true)
  })
})
