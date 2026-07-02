import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface NotificationSettings {
  briefingEnabled: boolean
  briefingTime: string
  moneyEventsEnabled: boolean
  teamEventsEnabled: boolean
  quietHoursEnabled: boolean
  quietFrom: string
  quietUntil: string
  weekendQuiet: boolean
  closeToTray: boolean
  lastBriefingDate: string
  notifiedOverdueIds: string[]
}

interface NotificationSettingsState extends NotificationSettings {
  set: (patch: Partial<NotificationSettings>) => void
  markBriefingFired: (dateIso: string) => void
  markOverdueNotified: (ids: string[]) => void
}

export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      briefingEnabled: true,
      briefingTime: '08:30',
      moneyEventsEnabled: true,
      teamEventsEnabled: true,
      quietHoursEnabled: true,
      quietFrom: '18:00',
      quietUntil: '07:00',
      weekendQuiet: true,
      closeToTray: true,
      lastBriefingDate: '',
      notifiedOverdueIds: [],

      set: (patch) => set(patch),
      markBriefingFired: (dateIso) => set({ lastBriefingDate: dateIso }),
      // Deckel bei 500 IDs — alte Rechnungen fallen raus, kein unbegrenztes Wachstum.
      markOverdueNotified: (ids) => set(s => ({
        notifiedOverdueIds: [...new Set([...s.notifiedOverdueIds, ...ids])].slice(-500),
      })),
    }),
    { name: 'cultera-notification-settings' },
  ),
)
