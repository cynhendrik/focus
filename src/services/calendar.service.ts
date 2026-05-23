import { invoke } from '@tauri-apps/api/core'
import type { CalendarEvent, UpsertCalendarEventPayload } from '@/types/calendar.types'

export const CalendarService = {
  getEvents(workspaceId: string, from: string, to: string): Promise<CalendarEvent[]> {
    return invoke('get_calendar_events', { workspaceId, from, to })
  },

  upsert(payload: UpsertCalendarEventPayload): Promise<CalendarEvent> {
    return invoke('upsert_calendar_event', { payload })
  },

  delete(id: string, workspaceId: string): Promise<void> {
    return invoke('delete_calendar_event', { id, workspaceId })
  },
}
