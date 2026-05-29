import { useMemo } from 'react'
import { Calendar as CalIcon, CheckCircle2, AlertTriangle, MapPin, Coffee } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCalendarStore } from '@/store/calendar.store'
import { useTodosStore } from '@/store/todos.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Todo } from '@/types/todo.types'

// ─────────────────────────────────────────────────────────────────────────────
// Types

type EntryKind = 'event' | 'task' | 'now' | 'gap'

interface BaseEntry {
  id: string
  kind: EntryKind
  /** Minutes since 00:00. */
  startMin: number
  /** Optional duration in minutes (events only). */
  durationMin?: number
}

interface EventEntry extends BaseEntry {
  kind: 'event'
  event: CalendarEvent
}

interface TaskEntry extends BaseEntry {
  kind: 'task'
  todo: Todo
  customerName?: string
}

interface NowEntry extends BaseEntry {
  kind: 'now'
}

interface GapEntry extends BaseEntry {
  kind: 'gap'
  label: string
}

type Entry = EventEntry | TaskEntry | NowEntry | GapEntry

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function minutesOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nowMinutesLocal(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function isTodayIso(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Optional cap — show only first N entries. */
  limit?: number
}

/**
 * Combines calendar events + tasks due today into a single time-ordered
 * timeline. Renders a tasteful visual with a "now" marker and lunch-break
 * detection in the middle of the day.
 */
export function DayTimeline({ limit }: Props) {
  const todayEvents = useCalendarStore(s => s.todayEvents)
  const allTodos    = useTodosStore(s => s.allTodos)
  const customers   = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView  = useUiStore(s => s.setAppView)

  const entries: Entry[] = useMemo(() => {
    const result: Entry[] = []
    const todayIso = new Date().toISOString().slice(0, 10)

    // Events today
    for (const ev of todayEvents) {
      if (ev.allDay) continue
      const startMin = minutesOfDay(ev.startAt)
      const endMin   = minutesOfDay(ev.endAt)
      result.push({
        id: `ev:${ev.id}`,
        kind: 'event',
        startMin,
        durationMin: Math.max(15, endMin - startMin),
        event: ev,
      })
    }

    // Tasks due today (with a time, otherwise pinned to 09:00 as a default)
    const customerById = new Map(customers.map(c => [c.id, c]))
    for (const t of allTodos) {
      if (t.status === 'done' || !t.dueDate) continue
      if (!t.dueDate.startsWith(todayIso)) continue
      const cust = customerById.get(t.customerId)
      // If dueDate contains a time, use it; otherwise default to 09:00.
      const hasTime = t.dueDate.length >= 16 && t.dueDate.includes('T')
      const startMin = hasTime ? minutesOfDay(t.dueDate) : 9 * 60
      result.push({
        id: `task:${t.id}`,
        kind: 'task',
        startMin,
        todo: t,
        customerName: cust?.name,
      })
    }

    // Sort by start time
    result.sort((a, b) => a.startMin - b.startMin)

    // Insert NOW marker
    const nowMin = nowMinutesLocal()
    const nowIdx = result.findIndex(e => e.startMin > nowMin)
    const nowEntry: NowEntry = { id: 'now', kind: 'now', startMin: nowMin }
    if (nowIdx === -1) result.push(nowEntry)
    else result.splice(nowIdx, 0, nowEntry)

    // Insert lunch gap if there's a gap of ≥45min around 12-14
    const withGap: Entry[] = []
    for (let i = 0; i < result.length; i++) {
      const cur = result[i]
      const next = result[i + 1]
      withGap.push(cur)
      if (next && cur.kind !== 'gap' && cur.kind !== 'now') {
        const curEnd = cur.startMin + (cur.kind === 'event' ? (cur.durationMin ?? 60) : 30)
        const gap = next.startMin - curEnd
        const overlapsLunch = curEnd < 14 * 60 && next.startMin > 12 * 60
        if (gap >= 45 && overlapsLunch) {
          withGap.push({
            id: `gap:${cur.id}`,
            kind: 'gap',
            startMin: curEnd,
            label: 'Lunch · frei',
          })
        }
      }
    }

    return limit ? withGap.slice(0, limit) : withGap
  }, [todayEvents, allTodos, customers, limit])

  if (entries.length <= 1) {
    // Just the NOW marker — no real entries
    return (
      <div className="card" style={{ padding: '32px 28px', textAlign: 'center' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, margin: '0 auto 14px',
          background: 'var(--accent-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)',
        }}>
          <Coffee size={20} />
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>
          Heute ist frei.
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
          Keine Termine, keine Deadlines. Tiefen-Arbeit oder Spaziergang.
        </div>
      </div>
    )
  }

  function openCustomer(id: string | undefined) {
    if (!id) return
    setSelected(id)
  }

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 600, margin: 0, letterSpacing: '-0.005em' }}>
          Tagesplan
        </h2>
        <button
          onClick={() => setAppView('calendar')}
          style={{
            fontSize: 11.5, color: 'var(--fg-muted)', background: 'none',
            border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          Im Kalender öffnen →
        </button>
      </div>

      <div style={{ position: 'relative', paddingLeft: 64 }}>
        {/* Vertical rail */}
        <div style={{
          position: 'absolute',
          left: 56, top: 8, bottom: 8,
          width: 1, background: 'var(--border)',
        }} />

        {entries.map((e, i) => (
          <TimelineRow
            key={e.id}
            entry={e}
            isLast={i === entries.length - 1}
            onCustomerClick={openCustomer}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row

const KIND_VISUAL: Record<Exclude<EntryKind, 'now' | 'gap'>, { icon: LucideIcon; bg: string; color: string }> = {
  event: { icon: CalIcon,        bg: 'var(--accent-soft)',                color: 'var(--accent)' },
  task:  { icon: CheckCircle2,   bg: 'oklch(78% 0.13 235 / 0.18)',         color: 'var(--info)'   },
}

function TimelineRow({ entry, onCustomerClick }: {
  entry: Entry
  isLast: boolean
  onCustomerClick: (id: string | undefined) => void
}) {
  if (entry.kind === 'now') {
    return <NowRow startMin={entry.startMin} />
  }
  if (entry.kind === 'gap') {
    return <GapRow startMin={entry.startMin} label={entry.label} />
  }

  const meta = KIND_VISUAL[entry.kind]
  const Icon = meta.icon

  if (entry.kind === 'event') {
    const ev = entry.event
    const endMin = entry.startMin + (entry.durationMin ?? 60)
    const isPast = nowMinutesLocal() > endMin && isTodayIso(ev.endAt)
    return (
      <div
        style={{
          position: 'relative',
          display: 'grid', gridTemplateColumns: '56px 1fr',
          gap: 18,
          padding: '10px 0',
          opacity: isPast ? 0.55 : 1,
          cursor: ev.accountId ? 'pointer' : 'default',
        }}
        onClick={() => ev.accountId && onCustomerClick(ev.accountId)}
      >
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11.5,
          color: 'var(--fg-muted)', letterSpacing: '0.04em',
          alignSelf: 'flex-start', paddingTop: 6,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span>{fmtTime(entry.startMin)}</span>
          <span style={{ color: 'var(--fg-dim)', fontSize: 10 }}>{fmtTime(endMin)}</span>
        </div>
        <div style={{
          position: 'relative',
          padding: '10px 14px', borderRadius: 12,
          background: meta.bg,
          border: `1px solid ${meta.bg}`,
        }}>
          <div style={{
            position: 'absolute', left: -28, top: 14,
            width: 18, height: 18, borderRadius: 6,
            background: meta.color, color: 'var(--accent-ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={11} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.005em' }}>
            {ev.title}
          </div>
          {ev.location && (
            <div style={{
              marginTop: 3, fontSize: 11.5, color: 'var(--fg-muted)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <MapPin size={10} /> {ev.location}
            </div>
          )}
        </div>
      </div>
    )
  }

  // task
  const t = entry.todo
  const isOverdue = (() => {
    if (!t.dueDate) return false
    return new Date(t.dueDate).getTime() < Date.now()
  })()
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: '56px 1fr',
        gap: 18,
        padding: '8px 0',
        cursor: t.customerId ? 'pointer' : 'default',
      }}
      onClick={() => t.customerId && onCustomerClick(t.customerId)}
    >
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11.5,
        color: 'var(--fg-muted)', letterSpacing: '0.04em',
        alignSelf: 'flex-start', paddingTop: 4,
      }}>
        {fmtTime(entry.startMin)}
      </div>
      <div style={{
        position: 'relative',
        padding: '8px 14px', borderRadius: 12,
        background: 'oklch(50% 0 0 / 0.04)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          position: 'absolute', left: -28, top: 12,
          width: 18, height: 18, borderRadius: 6,
          background: isOverdue ? 'var(--danger)' : meta.color,
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isOverdue ? <AlertTriangle size={11} /> : <Icon size={11} />}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{t.title}</div>
        {entry.customerName && (
          <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1 }}>{entry.customerName}</div>
        )}
      </div>
    </div>
  )
}

function NowRow({ startMin }: { startMin: number }) {
  return (
    <div style={{
      position: 'relative',
      display: 'grid', gridTemplateColumns: '56px 1fr',
      gap: 18,
      padding: '4px 0',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
        color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase',
        alignSelf: 'center',
      }}>
        {fmtTime(startMin)} ·
      </div>
      <div style={{
        position: 'relative',
        height: 1, background: 'var(--accent)',
        marginTop: 8,
      }}>
        <div style={{
          position: 'absolute', left: -29, top: -3,
          width: 9, height: 9, borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 0 4px var(--accent-soft)',
        }} className="now-ring" />
        <span style={{
          position: 'absolute', right: 0, top: -8,
          fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
          background: 'var(--accent)', color: 'var(--accent-ink)',
          padding: '2px 6px', borderRadius: 99,
          letterSpacing: '0.08em',
        }}>
          JETZT
        </span>
      </div>
    </div>
  )
}

function GapRow({ startMin, label }: { startMin: number; label: string }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '56px 1fr',
      gap: 18,
      padding: '8px 0',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11.5,
        color: 'var(--fg-dim)', letterSpacing: '0.04em',
        alignSelf: 'center', fontStyle: 'italic',
      }}>
        {fmtTime(startMin)}
      </div>
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11.5, color: 'var(--fg-dim)', fontStyle: 'italic',
        paddingLeft: 4,
      }}>
        <Coffee size={11} /> {label}
      </div>
    </div>
  )
}
