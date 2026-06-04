import { useState, useCallback, useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useDealsStore } from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { fetchHeuteQueue, staticHeuteQueue } from '@/lib/ai/heute-queue'
import type { HeuteQueueItem } from '@/lib/ai/heute-queue'
import { MissingApiKeyError } from '@/lib/ai/briefing'
import { log } from '@/lib/logger'

export function useHeuteQueue() {
  const [items, setItems]     = useState<HeuteQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const invoices       = useFinanceStore(s => s.invoices)
  const todos          = useTodosStore(s => s.allTodos)
  const emails         = useMailStore(s => s.emails)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)

  const input = { todos, invoices, emails, deals, calendarEvents, accounts }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const queue = await fetchHeuteQueue(input)
      setItems(queue.length > 0 ? queue : staticHeuteQueue(input))
    } catch (e) {
      if (!(e instanceof MissingApiKeyError)) {
        log.warn('CORRA queue failed, using static fallback', { e })
      }
      setItems(staticHeuteQueue(input))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  return { items, loading, reshuffle: load }
}
