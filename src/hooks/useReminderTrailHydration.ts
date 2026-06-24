import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { isOverdue } from '@/lib/invoice-status'

/**
 * Lädt den erledigten Mahn-Trail (DONE send_reminder-To-dos) der Konten mit
 * überfälligen Rechnungen nach — sonst setzt die abgeleitete Mahnstufe nach
 * App-Neustart auf 0 zurück (To-do-loadAll lädt nur status='open').
 */
export function useReminderTrailHydration() {
  const invoices = useFinanceStore(s => s.invoices)
  const hydrate  = useTodosStore(s => s.hydrateReminderTrail)
  useEffect(() => {
    const accountIds = [...new Set(
      invoices.filter(i => isOverdue(i) && !i.isSuggestion).map(i => i.accountId),
    )].filter(Boolean)
    if (accountIds.length) void hydrate(accountIds)
  }, [invoices, hydrate])
}
