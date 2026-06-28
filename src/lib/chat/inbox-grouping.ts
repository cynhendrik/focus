import type { Notification, NotificationType } from '@/types/notification.types'

export interface NotificationGroup {
  key:    string
  type:   NotificationType
  refId:  string
  items:  Notification[]
}

const ORDER: NotificationType[] = ['assigned', 'mention', 'comment', 'completed', 'dm']

/**
 * Primär nach Typ, Priorität assigned→mention→comment→completed.
 * comment/mention zusätzlich nach refId zusammengefasst (eine aufklappbare Zeile
 * statt N) — assigned/completed bleiben einzeln (Aktion bzw. FYI pro Aufgabe).
 */
export function groupNotifications(list: Notification[]): {
  byType: Record<NotificationType, NotificationGroup[]>
  order:  NotificationType[]
} {
  const byType = { assigned: [], mention: [], comment: [], completed: [], dm: [] } as Record<NotificationType, NotificationGroup[]>
  const collapse = (t: NotificationType) => t === 'comment' || t === 'mention'

  for (const t of ORDER) {
    const ofType = list.filter(n => n.type === t)
    if (collapse(t)) {
      const map = new Map<string, NotificationGroup>()
      for (const n of ofType) {
        const g = map.get(n.refId) ?? { key: `${t}:${n.refId}`, type: t, refId: n.refId, items: [] }
        g.items.push(n)
        map.set(n.refId, g)
      }
      byType[t] = [...map.values()]
    } else {
      byType[t] = ofType.map(n => ({ key: `${t}:${n.id}`, type: t, refId: n.refId, items: [n] }))
    }
  }
  return { byType, order: ORDER }
}

/** Laute Zahl fürs Nav-Badge: nur ungelesene assigned + mention. */
export function loudUnreadCount(list: Notification[]): number {
  return list.filter(n => !n.readAt && (n.type === 'assigned' || n.type === 'mention')).length
}
