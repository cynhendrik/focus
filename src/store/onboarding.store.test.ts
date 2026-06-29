import { describe, it, expect, beforeEach } from 'vitest'
import { useOnboardingStore, ONBOARDING_STEP_IDS, ONBOARDING_STEPS, selectAllDone } from './onboarding.store'
import { useUiStore } from './ui.store'
import { useCustomersStore } from './customers.store'
import { useNotesStore } from './notes.store'
import { useTodosStore } from './todos.store'
import { useLeadsStore } from './leads.store'
import { useDealsStore } from './deals.store'
import { PRIVATE_CUSTOMER_ID } from '@/types/customer.types'
import type { Customer } from '@/types/customer.types'
import type { Note } from '@/types/note.types'

const cust = (id: string): Customer => ({ id, name: id } as Customer)
const note = (id: string): Note => ({ id } as Note)

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({
    done: { kunde: false, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: false, companyDone: false, cardCollapsed: false, barDismissed: false, bootstrapped: false,
  })
  useCustomersStore.setState({ customers: [] })
  useNotesStore.setState({ notes: [] })
  useTodosStore.setState({ allTodos: [] })
  useLeadsStore.setState({ leads: [] })
  useDealsStore.setState({ deals: [] })
})

describe('onboarding.store', () => {
  it('has 5 steps with valid metadata', () => {
    expect(ONBOARDING_STEP_IDS).toEqual(['kunde', 'notiz', 'aufgabe', 'lead', 'corra'])
    expect(ONBOARDING_STEPS.map(s => s.id)).toEqual(ONBOARDING_STEP_IDS)
  })

  it('"notiz" öffnet Quick Capture statt einer eigenen Notizen-Ansicht', () => {
    const notiz = ONBOARDING_STEPS.find(s => s.id === 'notiz')!
    // Notizen leben nur noch in Quick Capture + Kunden-Tab → kein eigener 'notes'-AppView mehr.
    expect(notiz.view).toBeUndefined()
    expect(typeof notiz.action).toBe('function')
    useUiStore.setState({ quickCaptureOpen: false })
    notiz.action!()
    expect(useUiStore.getState().quickCaptureOpen).toBe(true)
  })

  it('latches "kunde" when a real customer exists (ignores Privat)', () => {
    useCustomersStore.setState({ customers: [cust(PRIVATE_CUSTOMER_ID)] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.kunde).toBe(false)

    useCustomersStore.setState({ customers: [cust(PRIVATE_CUSTOMER_ID), cust('c1')] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.kunde).toBe(true)
  })

  it('does not un-latch a step after data is removed', () => {
    useNotesStore.setState({ notes: [note('n1')] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.notiz).toBe(true)

    useNotesStore.setState({ notes: [] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.notiz).toBe(true)
  })

  it('latches "lead" from either a lead or a deal', () => {
    useDealsStore.setState({ deals: [{ id: 'd1' } as any] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.lead).toBe(true)
  })

  it('markCorraOpened latches the corra step', () => {
    useOnboardingStore.getState().markCorraOpened()
    expect(useOnboardingStore.getState().done.corra).toBe(true)
  })

  it('selectAllDone is true only when every step is done', () => {
    expect(selectAllDone(useOnboardingStore.getState())).toBe(false)
    useOnboardingStore.setState({ done: { kunde: true, notiz: true, aufgabe: true, lead: true, corra: true } })
    expect(selectAllDone(useOnboardingStore.getState())).toBe(true)
  })

  it('bootstrap on pre-existing data skips welcome and bar', () => {
    useCustomersStore.setState({ customers: [cust('c1')] })
    useOnboardingStore.getState().bootstrap()
    const s = useOnboardingStore.getState()
    expect(s.welcomeSeen).toBe(true)
    expect(s.companyDone).toBe(true)
    expect(s.cardCollapsed).toBe(true)
    expect(s.barDismissed).toBe(true)
    expect(s.bootstrapped).toBe(true)
    expect(s.done.kunde).toBe(true)
  })

  it('bootstrap on empty install keeps welcome (shows intro)', () => {
    useOnboardingStore.getState().bootstrap()
    const s = useOnboardingStore.getState()
    expect(s.welcomeSeen).toBe(false)
    expect(s.barDismissed).toBe(false)
    expect(s.bootstrapped).toBe(true)
  })

  it('bootstrap runs only once', () => {
    useOnboardingStore.getState().bootstrap()
    useCustomersStore.setState({ customers: [cust('c1')] })
    useOnboardingStore.getState().bootstrap() // no-op second time
    expect(useOnboardingStore.getState().welcomeSeen).toBe(false)
  })

  it('reconcile collapses the card once the first step is done', () => {
    expect(useOnboardingStore.getState().cardCollapsed).toBe(false)
    useNotesStore.setState({ notes: [note('n1')] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().cardCollapsed).toBe(true)
  })

  it('collapseCard collapses the pop-up card to the bar', () => {
    useOnboardingStore.getState().collapseCard()
    expect(useOnboardingStore.getState().cardCollapsed).toBe(true)
  })
})
