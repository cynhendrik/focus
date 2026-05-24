import { create } from 'zustand'
import { CalendarService } from '@/services/calendar.service'
import { log } from '@/lib/logger'
import type { CalendarEvent, UpsertCalendarEventPayload } from '@/types/calendar.types'

export type CalendarView = 'day' | 'week' | 'month'

interface CalendarState {
  events: CalendarEvent[]
  view: CalendarView
  currentDate: Date
  isLoading: boolean
  error: string | null
  todayEvents: CalendarEvent[]
  isTodayLoading: boolean
  loadToday: (workspaceId: string) => Promise<void>

  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertCalendarEventPayload) => Promise<CalendarEvent>
  remove: (id: string, workspaceId: string) => Promise<void>
  setView: (view: CalendarView) => void
  navigate: (dir: 'prev' | 'next' | 'today', workspaceId: string) => void
}

// Lokales ISO-8601 ohne Timezone-Offset — muss zum Format der gespeicherten start_at-Werte passen
function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function rangeForDate(date: Date, view: CalendarView): { from: string; to: string } {
  const d = new Date(date)
  if (view === 'day') {
    const from = new Date(d); from.setHours(0, 0, 0, 0)
    const to   = new Date(d); to.setHours(23, 59, 59, 0)
    return { from: localIso(from), to: localIso(to) }
  }
  if (view === 'week') {
    const dow = (d.getDay() + 6) % 7  // Mo=0
    const mon = new Date(d); mon.setDate(d.getDate() - dow); mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 0)
    return { from: localIso(mon), to: localIso(sun) }
  }
  // month — ±1 Woche Puffer für Grid-Zellen außerhalb des Monats
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const from  = new Date(first); from.setDate(first.getDate() - 7); from.setHours(0, 0, 0, 0)
  const to    = new Date(last);  to.setDate(last.getDate() + 7);    to.setHours(23, 59, 59, 0)
  return { from: localIso(from), to: localIso(to) }
}

export const useCalendarStore = create<CalendarState>()((set, get) => ({
  events: [],
  view: 'week',
  currentDate: new Date(),
  isLoading: false,
  error: null,
  todayEvents: [],
  isTodayLoading: false,

  load: async (workspaceId) => {
    const { view, currentDate } = get()
    const { from, to } = rangeForDate(currentDate, view)
    set({ isLoading: true, error: null })
    try {
      const events = await CalendarService.getEvents(workspaceId, from, to)
      set({ events, isLoading: false })
    } catch (err) {
      log.error('calendar load failed', { err })
      set({ isLoading: false, error: String(err) })
    }
  },

  loadToday: async (workspaceId) => {
    const today = new Date()
    const from = localIso(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0))
    const to   = localIso(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59))
    set({ isTodayLoading: true })
    try {
      const todayEvents = await CalendarService.getEvents(workspaceId, from, to)
      set({ todayEvents: todayEvents.sort((a, b) => a.startAt.localeCompare(b.startAt)), isTodayLoading: false })
    } catch (err) {
      log.error('calendar loadToday failed', { err })
      set({ isTodayLoading: false })
    }
  },

  upsert: async (payload) => {
    const event = await CalendarService.upsert(payload)
    set(s => {
      const filtered      = s.events.filter(e => e.id !== event.id)
      const filteredToday = s.todayEvents.filter(e => e.id !== event.id)
      const todayPrefix   = localIso(new Date()).slice(0, 10)   // "YYYY-MM-DD"
      const isToday       = event.startAt.startsWith(todayPrefix)
      return {
        events:      [...filtered, event].sort((a, b) => a.startAt.localeCompare(b.startAt)),
        todayEvents: isToday
          ? [...filteredToday, event].sort((a, b) => a.startAt.localeCompare(b.startAt))
          : filteredToday,
      }
    })
    return event
  },

  remove: async (id, workspaceId) => {
    await CalendarService.delete(id, workspaceId)
    set(s => ({
      events:      s.events.filter(e => e.id !== id),
      todayEvents: s.todayEvents.filter(e => e.id !== id),
    }))
  },

  setView: (view) => set({ view }),

  navigate: (dir, workspaceId) => {
    const { view, currentDate } = get()
    const d = new Date(currentDate)
    if (dir === 'today') {
      set({ currentDate: new Date() })
    } else {
      const delta = dir === 'next' ? 1 : -1
      if (view === 'day')   d.setDate(d.getDate() + delta)
      if (view === 'week')  d.setDate(d.getDate() + delta * 7)
      if (view === 'month') d.setMonth(d.getMonth() + delta)
      set({ currentDate: d })
    }
    setTimeout(() => get().load(workspaceId), 0)
  },
}))
