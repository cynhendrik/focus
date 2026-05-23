export type EventColor = 'accent' | 'warn' | 'ok' | 'danger'

export interface CalendarEvent {
  id: string
  workspaceId: string
  createdBy: string
  accountId?: string
  title: string
  description?: string
  location?: string
  startAt: string   // ISO 8601: "2026-05-23T14:00:00"
  endAt: string     // ISO 8601
  allDay: boolean
  color?: EventColor
  createdAt: string
  updatedAt: string
}

export interface UpsertCalendarEventPayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId?: string
  title: string
  description?: string
  location?: string
  startAt: string
  endAt: string
  allDay: boolean
  color?: EventColor
}
