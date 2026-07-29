import type { Todo } from '@/types/todo.types'

/** Lokales Heute-Datum als YYYY-MM-DD. EINE Quelle für Dashboard-KPI und
 *  HEUTE-Queue, damit die beiden Zahlen nicht mehr divergieren. */
export function todayLocalIso(): string {
  return new Date().toLocaleDateString('sv')
}

/**
 * Ein Todo gehört zu „heute", wenn es offen ist UND heute terminiert, eingeplant
 * oder in Arbeit ist. EINE gemeinsame Definition für die KPI „Heute fällig" und
 * die HEUTE-Queue.
 *
 * Schließt den Capture-Bug: `setScheduledAt` setzt `scheduledAt`, aber NICHT den
 * `bucket`. Ein auf heute geplantes Todo im Bucket 'backlog' zählte bisher in der
 * KPI (dueDate/scheduledAt), fiel aber aus der bucket-basierten Queue. Jetzt
 * lesen beide dieselbe Menge.
 */
export function isTodoForToday(t: Todo, todayIso: string): boolean {
  if (t.status === 'done') return false
  return (
    t.bucket === 'today' ||
    t.bucket === 'in_progress' ||
    t.dueDate === todayIso ||
    (!!t.scheduledAt && t.scheduledAt.slice(0, 10) === todayIso)
  )
}

/** Gesamtzahl offener Punkte fuer Tray-Badge und Sidebar — EINE Quelle fuer beide. */
export function computeOpenCount(overdueCount: number, unreadMails: number, todayTodos: number): number {
  return overdueCount + unreadMails + todayTodos
}
