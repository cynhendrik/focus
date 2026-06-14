import { useEffect } from 'react'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useCustomersStore } from '@/store/customers.store'
import { useNotesStore } from '@/store/notes.store'
import { useTodosStore } from '@/store/todos.store'
import { useLeadsStore } from '@/store/leads.store'
import { useDealsStore } from '@/store/deals.store'
import { useUiStore } from '@/store/ui.store'

/**
 * Treibt die Onboarding-Reconciliation: abonniert die Daten-Stores und rastet
 * erfüllte Schritte ein; erkennt das Öffnen von KORA über appView.
 * Einmal in App.tsx mounten.
 */
export function useOnboardingSync(): void {
  useEffect(() => {
    const reconcile = () => useOnboardingStore.getState().reconcile()
    reconcile()
    const unsubs = [
      useCustomersStore.subscribe(reconcile),
      useNotesStore.subscribe(reconcile),
      useTodosStore.subscribe(reconcile),
      useLeadsStore.subscribe(reconcile),
      useDealsStore.subscribe(reconcile),
      useUiStore.subscribe((s) => {
        if (s.appView === 'corra' && !useOnboardingStore.getState().corraOpened) {
          useOnboardingStore.getState().markCorraOpened()
        }
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [])
}
