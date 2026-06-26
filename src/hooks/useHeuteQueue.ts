import { useState, useCallback, useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useDealsStore } from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCrmStore } from '@/store/crm.store'
import { useLeadsStore } from '@/store/leads.store'
import { useAuthStore } from '@/store/auth.store'
import { filterMine } from '@/lib/todos/ownership'
import { staticHeuteQueue } from '@/lib/ai/heute-queue'
import type { HeuteQueueItem } from '@/lib/ai/heute-queue'

export function useHeuteQueue() {
  const [items, setItems]     = useState<HeuteQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const myId = useAuthStore.getState().user?.id
    const input = {
      todos:          filterMine(useTodosStore.getState().allTodos, myId),
      invoices:       useFinanceStore.getState().invoices,
      emails:         useMailStore.getState().emails,
      deals:          useDealsStore.getState().deals,
      calendarEvents: useCalendarStore.getState().events,
      accounts:       useAccountsStore.getState().accounts,
      followUps:      useCrmStore.getState().allFollowUps,
      leads:          useLeadsStore.getState().leads,
    }
    // Deterministische Priorisierung ohne LLM-Call. Die Reihenfolge ist dieselbe,
    // die der KI-Prompt vorgegeben hatte (Mahnung→Follow-up→Mail→Todo); der
    // Sonnet-Aufruf pro Mount hat nur teuer umformuliert. reason-Texte liefert
    // staticHeuteQueue bereits selbst.
    setItems(staticHeuteQueue(input))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { items, loading, reshuffle: load }
}
