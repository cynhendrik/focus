import { describe, it, expect } from 'vitest'
import { calendarRowToEvent, eventPayloadToRow } from './calendar.mapper'
import type { UpsertCalendarEventPayload } from '@/types/calendar.types'

const fullRow = {
  id: 'e1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1',
  title: 'Call', description: 'Quartal', location: 'Zoom',
  start_at: '2026-05-23T14:00:00', end_at: '2026-05-23T15:00:00',
  all_day: 0, color: 'accent',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
}

describe('calendar.mapper', () => {
  it('calendarRowToEvent: mappt alle Spalten, all_day smallint→bool', () => {
    expect(calendarRowToEvent(fullRow)).toEqual({
      id: 'e1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
      title: 'Call', description: 'Quartal', location: 'Zoom',
      startAt: '2026-05-23T14:00:00', endAt: '2026-05-23T15:00:00',
      allDay: false, color: 'accent',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    })
  })

  it('calendarRowToEvent: all_day=1→true, null-Spalten→undefined', () => {
    const e = calendarRowToEvent({
      ...fullRow, all_day: 1, account_id: null, description: null, location: null, color: null,
    })
    expect(e.allDay).toBe(true)
    expect(e.accountId).toBeUndefined()
    expect(e.description).toBeUndefined()
    expect(e.color).toBeUndefined()
  })

  it('eventPayloadToRow: camelCase→snake_case, allDay→0/1, lässt created_at weg, setzt updated_at', () => {
    const p: UpsertCalendarEventPayload = {
      id: 'e1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
      title: 'Call', description: 'Quartal', location: 'Zoom',
      startAt: '2026-05-23T14:00:00', endAt: '2026-05-23T15:00:00', allDay: true, color: 'warn',
    }
    const row = eventPayloadToRow(p, { id: 'e1', now: '2026-06-22T10:00:00Z' })
    expect(row).toEqual({
      id: 'e1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1',
      title: 'Call', description: 'Quartal', location: 'Zoom',
      start_at: '2026-05-23T14:00:00', end_at: '2026-05-23T15:00:00',
      all_day: 1, color: 'warn', updated_at: '2026-06-22T10:00:00Z',
    })
    expect(row).not.toHaveProperty('created_at')
  })

  it('eventPayloadToRow: leerer accountId→null, allDay=false→0, optionale→null', () => {
    const p: UpsertCalendarEventPayload = {
      workspaceId: 'ws1', createdBy: 'u1', title: 'X',
      startAt: '2026-05-23T14:00:00', endAt: '2026-05-23T15:00:00', allDay: false,
    }
    const row = eventPayloadToRow(p, { id: 'e2', now: '2026-06-22T10:00:00Z' })
    expect(row.account_id).toBeNull()
    expect(row.all_day).toBe(0)
    expect(row.description).toBeNull()
    expect(row.color).toBeNull()
  })
})
