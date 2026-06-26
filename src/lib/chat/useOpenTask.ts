import { useCallback } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useUiStore } from '@/store/ui.store'

/**
 * Springt zu einer Aufgabe: hat sie einen Kunden → Kundenakte, Tab „tasks";
 * sonst → „Mein Tag". Gibt false zurück, wenn die Aufgabe (noch) nicht im
 * Store ist (verwaiste Referenz) — der Aufrufer rendert dann „Aufgabe gelöscht".
 */
export function useOpenTask(): (taskId: string) => boolean {
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const setAppView     = useUiStore(s => s.setAppView)
  return useCallback((taskId: string) => {
    const todo = useTodosStore.getState().allTodos.find(t => t.id === taskId)
    if (!todo) return false
    if (todo.customerId) openCustomerAt(todo.customerId, 'tasks')
    else setAppView('dashboard')
    return true
  }, [openCustomerAt, setAppView])
}
