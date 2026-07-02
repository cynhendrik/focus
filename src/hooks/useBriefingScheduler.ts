import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useCrmStore } from '@/store/crm.store'
import { useTodosStore } from '@/store/todos.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'
import { shouldFireBriefing } from '@/lib/notifications/quiet-hours'
import { buildTodayLine } from '@/lib/notifications/briefing'
import { notify } from '@/services/notify.service'
import { snoozedInvoiceIds } from '@/lib/heute/snooze'

const TICK_MS = 60_000

function todayLocalIso(): string {
  return new Date().toLocaleDateString('sv')
}

/**
 * Morgen-Briefing: prüft jede Minute, ob werktags die Briefing-Zeit erreicht ist,
 * und sendet den Tages-Satz als System-Notification — genau einmal pro Tag.
 * Leerer Tag → keine Notification (Stille ist die Belohnung), zählt aber als gefeuert.
 */
export function useBriefingScheduler() {
  useEffect(() => {
    const tick = () => {
      const s = useNotificationSettingsStore.getState()
      const now = new Date()
      const todayIso = todayLocalIso()
      if (!shouldFireBriefing(now, s, s.lastBriefingDate, todayIso)) return

      const invoices = useFinanceStore.getState().invoices
      const snoozed = snoozedInvoiceIds()
      const overdue = invoices.filter(i =>
        !snoozed.has(i.id)
        && i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft'
        && (i.status === 'overdue' || i.dueDate.slice(0, 10) < todayIso))
      const followUps = useCrmStore.getState().allFollowUps
      const fusDue = followUps.filter(f => f.status === 'offen' && f.dueDate.slice(0, 10) <= todayIso).length
      const tasksDue = useTodosStore.getState().allTodos
        .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length
      const eventsToday = useCalendarStore.getState().todayEvents.length

      const line = buildTodayLine({
        overdueCount: overdue.length,
        overdueSum: overdue.reduce((sum, i) => sum + i.total, 0),
        fusDue, tasksDue, eventsToday,
      })

      // Erst als gefeuert markieren, dann senden — verhindert Doppel-Feuern bei langsamem notify.
      s.markBriefingFired(todayIso)
      if (line) void notify('briefing', 'Guten Morgen', line)
    }

    tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [])
}
