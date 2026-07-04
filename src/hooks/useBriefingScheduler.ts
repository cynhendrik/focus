import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useCrmStore } from '@/store/crm.store'
import { useTodosStore } from '@/store/todos.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { shouldFireBriefing } from '@/lib/notifications/quiet-hours'
import { buildTodayLine } from '@/lib/notifications/briefing'
import { notify } from '@/services/notify.service'
import { snoozedInvoiceIds } from '@/lib/heute/snooze'
import { invoiceCategory } from '@/lib/finance/invoice-filters'
import { remaining, paidAmount } from '@/lib/invoice-status'

const TICK_MS = 60_000

/** Zeitpunkt des Modul-Loads — wird für die Hydrations-Schonfrist benötigt. */
const startedAt = Date.now()

/** 2 Minuten Schonfrist für Store-Hydration nach Kaltstart. */
export const HYDRATION_GRACE_MS = 2 * 60_000

function todayLocalIso(): string {
  return new Date().toLocaleDateString('sv')
}

/**
 * Leerer Briefing-Satz kurz nach dem Start bedeutet "Daten noch nicht geladen",
 * nicht "nichts zu tun". Der Tag darf erst nach der Schonfrist als gefeuert
 * markiert werden, damit kein Tick den Tag verbraucht bevor die Stores bereit sind.
 *
 * @returns true = diesen Tick überspringen, ohne den Tag zu verbrauchen.
 */
export function shouldDeferBriefing(line: string, uptimeMs: number, graceMs = HYDRATION_GRACE_MS): boolean {
  return !line && uptimeMs < graceMs
}

/**
 * Morgen-Briefing: prüft jede Minute, ob werktags die Briefing-Zeit erreicht ist,
 * und sendet den Tages-Satz als System-Notification — genau einmal pro Tag.
 * Leerer Tag → keine Notification (Stille ist die Belohnung), zählt aber als gefeuert
 * (erst nach Ablauf der Hydrations-Schonfrist).
 */
export function useBriefingScheduler() {
  useEffect(() => {
    const tick = () => {
      // Kaltstart-Guard: Workspace noch nicht geladen → Stores können leer sein.
      if (!useWorkspaceStore.getState().activeWorkspaceId) return

      const s = useNotificationSettingsStore.getState()
      const now = new Date()
      const todayIso = todayLocalIso()
      if (!shouldFireBriefing(now, s, s.lastBriefingDate, todayIso)) return

      const invoices = useFinanceStore.getState().invoices
      const payments = useFinanceStore.getState().payments
      const snoozed = snoozedInvoiceIds()
      const overdue = invoices.filter(i =>
        !i.isSuggestion && !snoozed.has(i.id) && invoiceCategory(i) === 'overdue')
      const followUps = useCrmStore.getState().allFollowUps
      const fusDue = followUps.filter(f => f.status === 'offen' && f.dueDate.slice(0, 10) <= todayIso).length
      const tasksDue = useTodosStore.getState().allTodos
        .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length
      const eventsToday = useCalendarStore.getState().todayEvents.length

      const line = buildTodayLine({
        overdueCount: overdue.length,
        overdueSum: overdue.reduce((sum, i) => sum + remaining(i, paidAmount(payments, i.id)), 0),
        fusDue, tasksDue, eventsToday,
      })

      // Hydrations-Guard: Leerer Satz kurz nach Start → Daten noch nicht geladen.
      // Erst nach der Schonfrist zählt ein leerer Satz als „nichts zu tun".
      if (shouldDeferBriefing(line, Date.now() - startedAt)) return

      // Erst als gefeuert markieren, dann senden — verhindert Doppel-Feuern bei langsamem notify.
      s.markBriefingFired(todayIso)
      if (line) void notify('briefing', 'Guten Morgen', line)
    }

    tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [])
}
