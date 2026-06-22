import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { calendarRowToEvent, eventPayloadToRow } from './calendar.mapper'
import type { CalendarEvent, UpsertCalendarEventPayload } from '@/types/calendar.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const CalendarGateway = {
  async getEvents(workspaceId: string, from: string, to: string): Promise<CalendarEvent[]> {
    if (!shared()) return invoke<CalendarEvent[]>('get_calendar_events', { workspaceId, from, to })
    const { data, error } = await supabase.from('calendar_events').select('*')
      .eq('workspace_id', workspaceId)
      .gte('start_at', from).lte('start_at', to)
      .order('start_at', { ascending: true })
    if (error) fail(error)
    return (data ?? []).map(calendarRowToEvent)
  },

  async upsert(payload: UpsertCalendarEventPayload): Promise<CalendarEvent> {
    if (!shared()) return invoke<CalendarEvent>('upsert_calendar_event', { payload })
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = eventPayloadToRow(payload, { id, now })
    const { data, error } = await supabase.from('calendar_events').upsert(row, { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return calendarRowToEvent(data)
  },

  async delete(id: string, workspaceId: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_calendar_event', { id, workspaceId }); return }
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) fail(error)
  },
}
