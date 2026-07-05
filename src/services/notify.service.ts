import { isQuietTime, type BriefingConfig } from '@/lib/notifications/quiet-hours'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'
import { log } from '@/lib/logger'

export type NotifyKind = 'briefing' | 'money' | 'team'

export type GateSettings = BriefingConfig & { moneyEventsEnabled: boolean; teamEventsEnabled: boolean }

/**
 * Pure Gating-Regel: Kind-Schalter + Ruhezeiten. Das Briefing prüft die
 * Ruhezeit bereits in shouldFireBriefing — hier nur money/team.
 */
export function shouldNotify(kind: NotifyKind, now: Date, s: GateSettings): boolean {
  if (kind === 'briefing' && !s.briefingEnabled) return false
  if (kind === 'money' && !s.moneyEventsEnabled) return false
  if (kind === 'team' && !s.teamEventsEnabled) return false
  if (kind !== 'briefing' && isQuietTime(now, s)) return false
  return true
}

/**
 * Sendet eine System-Notification, wenn die Regeln es erlauben.
 * Wirft nie — eine gescheiterte Notification darf keinen Flow brechen.
 */
export async function notify(kind: NotifyKind, title: string, body: string): Promise<void> {
  try {
    const s = useNotificationSettingsStore.getState()
    if (!shouldNotify(kind, new Date(), s)) return
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import('@tauri-apps/plugin-notification')
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
    if (!granted) return
    await sendNotification({ title, body })
  } catch (err) {
    log.warn('notify failed', { kind, err })
  }
}
