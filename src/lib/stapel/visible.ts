import type { PreparedItem } from '@/types/prepared-item.types'

/** Sichtbare Karten: faellig + mir zugeordnet (oder niemandem). Eine Quelle fuer Sektion UND Tray. */
export function visiblePreparedItems(items: PreparedItem[], myId: string | undefined, nowIso: string): PreparedItem[] {
  return items.filter(i =>
    (i.status === 'pending' || (i.status === 'snoozed' && i.snoozeUntil != null && i.snoozeUntil <= nowIso))
    && (!i.assignee || i.assignee === myId))
}
