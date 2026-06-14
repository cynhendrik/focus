import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCustomersStore } from '@/store/customers.store'
import { useNotesStore } from '@/store/notes.store'
import { useTodosStore } from '@/store/todos.store'
import { useLeadsStore } from '@/store/leads.store'
import { useDealsStore } from '@/store/deals.store'
import { PRIVATE_CUSTOMER_ID } from '@/types/customer.types'
import type { AppView } from '@/store/ui.store'

export type OnboardingStepId = 'kunde' | 'notiz' | 'aufgabe' | 'lead' | 'corra'

export interface OnboardingStepMeta {
  id: OnboardingStepId
  label: string
  hint: string
  view: AppView
}

/** Schritt-Metadaten — geteilt von OnboardingBar und HelpDrawer (DRY). */
export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  { id: 'kunde',   label: 'Kunde anlegen',     hint: 'Lege deinen ersten echten Kunden an.',        view: 'clients' },
  { id: 'notiz',   label: 'Notiz anlegen',     hint: 'Halte deine erste Notiz fest.',               view: 'notes' },
  { id: 'aufgabe', label: 'Aufgabe erstellen', hint: 'Erstelle deine erste Aufgabe.',               view: 'dashboard' },
  { id: 'lead',    label: 'Lead anlegen',      hint: 'Bring deinen ersten Lead in die Pipeline.',   view: 'leverage_leads' },
  { id: 'corra',   label: 'KI-Briefing öffnen',hint: 'Probier KORA — deinen KI-Assistenten.',       view: 'corra' },
]

export const ONBOARDING_STEP_IDS: OnboardingStepId[] = ONBOARDING_STEPS.map(s => s.id)

type DoneMap = Record<OnboardingStepId, boolean>
const EMPTY_DONE: DoneMap = { kunde: false, notiz: false, aufgabe: false, lead: false, corra: false }

interface OnboardingState {
  done: DoneMap
  corraOpened: boolean
  welcomeSeen: boolean
  /** Unternehmensdaten-Schritt (direkt nach dem Willkommen) erledigt/übersprungen? */
  companyDone: boolean
  /** Pop-up-Kachel-Karte zur schmalen Leiste eingeklappt? */
  cardCollapsed: boolean
  barDismissed: boolean
  bootstrapped: boolean
  markWelcomeSeen: () => void
  markCompanyDone: () => void
  collapseCard: () => void
  dismissBar: () => void
  markCorraOpened: () => void
  reconcile: () => void
  bootstrap: () => void
}

function hasRealCustomer(): boolean {
  return useCustomersStore.getState().customers.some(c => c.id !== PRIVATE_CUSTOMER_ID)
}

function hasAnyRealData(): boolean {
  return hasRealCustomer()
    || useNotesStore.getState().notes.length > 0
    || useTodosStore.getState().allTodos.length > 0
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      done: { ...EMPTY_DONE },
      corraOpened: false,
      welcomeSeen: false,
      companyDone: false,
      cardCollapsed: false,
      barDismissed: false,
      bootstrapped: false,

      markWelcomeSeen: () => set({ welcomeSeen: true }),
      markCompanyDone: () => set({ companyDone: true }),
      collapseCard: () => set({ cardCollapsed: true }),
      dismissBar: () => set({ barDismissed: true }),
      markCorraOpened: () => { set({ corraOpened: true }); get().reconcile() },

      reconcile: () => {
        const cur = get().done
        const next: DoneMap = {
          kunde:   cur.kunde   || hasRealCustomer(),
          notiz:   cur.notiz   || useNotesStore.getState().notes.length > 0,
          aufgabe: cur.aufgabe || useTodosStore.getState().allTodos.length > 0,
          lead:    cur.lead    || useLeadsStore.getState().leads.length > 0 || useDealsStore.getState().deals.length > 0,
          corra:   cur.corra   || get().corraOpened,
        }
        const changed = ONBOARDING_STEP_IDS.some(id => next[id] !== cur[id])
        // Sobald der erste Schritt erledigt ist, klappt die Pop-up-Karte in die Leiste.
        const collapseNow = ONBOARDING_STEP_IDS.some(id => next[id]) && !get().cardCollapsed
        if (changed || collapseNow) {
          set({
            ...(changed ? { done: next } : {}),
            ...(collapseNow ? { cardCollapsed: true } : {}),
          })
        }
      },

      bootstrap: () => {
        if (get().bootstrapped) return
        if (hasAnyRealData()) set({ welcomeSeen: true, companyDone: true, cardCollapsed: true, barDismissed: true })
        set({ bootstrapped: true })
        get().reconcile()
      },
    }),
    {
      name: 'cynera-onboarding-v1',
      partialize: (s) => ({
        done: s.done,
        corraOpened: s.corraOpened,
        welcomeSeen: s.welcomeSeen,
        companyDone: s.companyDone,
        cardCollapsed: s.cardCollapsed,
        barDismissed: s.barDismissed,
        bootstrapped: s.bootstrapped,
      }),
    }
  )
)

export function selectAllDone(s: OnboardingState): boolean {
  return ONBOARDING_STEP_IDS.every(id => s.done[id])
}

export function selectDoneCount(s: OnboardingState): number {
  return ONBOARDING_STEP_IDS.filter(id => s.done[id]).length
}
