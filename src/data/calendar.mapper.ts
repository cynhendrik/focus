import type { CalendarEvent, UpsertCalendarEventPayload, EventColor } from '@/types/calendar.types'

/** Supabase-`calendar_events`-Zeile → CalendarEvent (all_day smallint→bool). */
export function calendarRowToEvent(r: any): CalendarEvent {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    createdBy: r.created_by,
    accountId: r.account_id ?? undefined,
    title: r.title,
    description: r.description ?? undefined,
    location: r.location ?? undefined,
    startAt: r.start_at,
    endAt: r.end_at,
    allDay: r.all_day === 1 || r.all_day === true,
    color: (r.color ?? undefined) as EventColor | undefined,
    isPrivate: r.is_private === 1 || r.is_private === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * UpsertCalendarEventPayload → `calendar_events`-Row.
 * all_day ist Cloud-`smallint` (0/1). created_at weggelassen (DB-Default beim Insert,
 * Erhalt beim Update). Leerer accountId → null.
 */
export function eventPayloadToRow(
  p: UpsertCalendarEventPayload,
  ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    created_by: p.createdBy,
    account_id: p.accountId || null,
    title: p.title,
    description: p.description ?? null,
    location: p.location ?? null,
    start_at: p.startAt,
    end_at: p.endAt,
    all_day: p.allDay ? 1 : 0,
    color: p.color ?? null,
    is_private: p.isPrivate ?? false,
    updated_at: ctx.now,
  }
}
