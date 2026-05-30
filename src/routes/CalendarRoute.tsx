import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCalendarStore } from '@/store/calendar.store'
import { TagesplanCard } from '@/components/calendar/TagesplanCard'
import { useAccountsStore } from '@/store/accounts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { CalendarEvent, UpsertCalendarEventPayload, EventColor } from '@/types/calendar.types'

// ── Konstanten ────────────────────────────────────────────────────────────────

const HOUR_H   = 56          // px pro Stunde
const DAY_START = 8          // 08:00
const DAY_END   = 19         // 19:00
const HOURS     = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
const DE_DAYS   = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DE_MONTHS = ['Januar','Februar','März','April','Mai','Juni',
                   'Juli','August','September','Oktober','November','Dezember']
const DE_MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

// ── Farb-Helpers ──────────────────────────────────────────────────────────────

function evtBg(color?: string)     {
  if (color === 'accent') return 'var(--accent)'
  if (color === 'warn')   return 'oklch(82% 0.16 70 / 0.18)'
  if (color === 'ok')     return 'oklch(78% 0.18 145 / 0.18)'
  if (color === 'danger') return 'oklch(65% 0.22 25 / 0.18)'
  return 'var(--surface-2)'
}
function evtFg(color?: string)     {
  if (color === 'accent') return 'var(--accent-ink)'
  if (color === 'warn')   return 'var(--warn)'
  if (color === 'ok')     return 'var(--ok)'
  if (color === 'danger') return 'var(--danger)'
  return 'var(--fg)'
}
function evtBorder(color?: string) {
  if (color === 'accent') return 'transparent'
  if (color === 'warn')   return 'oklch(82% 0.16 70 / 0.4)'
  if (color === 'ok')     return 'oklch(78% 0.18 145 / 0.4)'
  if (color === 'danger') return 'oklch(65% 0.22 25 / 0.4)'
  return 'var(--border-strong)'
}

// ── Datum-Helpers ─────────────────────────────────────────────────────────────

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isToday(d: Date) {
  const n = new Date(); return isoDate(d) === isoDate(n)
}
function mondayOf(d: Date) {
  const c = new Date(d); const dow = (c.getDay() + 6) % 7; c.setDate(c.getDate() - dow); c.setHours(0,0,0,0); return c
}
function weekDays(anchor: Date): Date[] {
  const mon = mondayOf(anchor)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d })
}
function kwOf(d: Date) {
  const tmp = new Date(d); tmp.setHours(0,0,0,0); tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay()+6)%7))
  const jan4 = new Date(tmp.getFullYear(), 0, 4)
  return 1 + Math.round(((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay()+6)%7)) / 7)
}

// ── EventChip ─────────────────────────────────────────────────────────────────

interface EventChipProps {
  event: CalendarEvent
  onClick: () => void
  compact?: boolean
}
function EventChip({ event, onClick, compact }: EventChipProps) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        background: evtBg(event.color), color: evtFg(event.color),
        border: `1px solid ${evtBorder(event.color)}`,
        borderRadius: 6, padding: compact ? '2px 6px' : '5px 9px',
        fontSize: compact ? 11 : 11.5, lineHeight: 1.3,
        height: compact ? 22 : undefined,
        cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        transition: 'transform 140ms ease',
        fontWeight: 500,
        boxSizing: 'border-box' as const,
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = '')}
      title={event.title}
    >
      {event.title}
    </div>
  )
}

// ── WeekView helpers ──────────────────────────────────────────────────────────

function computeLanes(events: CalendarEvent[]): Array<{ event: CalendarEvent; lane: number; totalLanes: number }> {
  if (events.length === 0) return []
  const sorted = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt))
  const laneEnds: string[] = []
  const assigned: number[] = []
  for (const ev of sorted) {
    let lane = laneEnds.findIndex(end => end <= ev.startAt)
    if (lane === -1) lane = laneEnds.length  // open a new lane
    laneEnds[lane] = ev.endAt
    assigned.push(lane)
  }
  return sorted.map((event, i) => {
    const lane = assigned[i]
    let totalLanes = 1
    for (let j = 0; j < sorted.length; j++) {
      if (sorted[j].startAt < event.endAt && sorted[j].endAt > event.startAt) {
        totalLanes = Math.max(totalLanes, assigned[j] + 1)
      }
    }
    return { event, lane, totalLanes }
  })
}

// ── WeekView ──────────────────────────────────────────────────────────────────

function WeekView({
  events, days, onSlotClick, onEventClick,
}: {
  events: CalendarEvent[]
  days: Date[]
  onSlotClick: (date: Date, hour: number) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const nowRef = useRef<HTMLDivElement>(null)
  const [nowPct,  setNowPct]  = useState(0)
  const [nowTime, setNowTime] = useState('')

  useEffect(() => {
    function update() {
      const now  = new Date()
      const mins = (now.getHours() - DAY_START) * 60 + now.getMinutes()
      setNowPct(mins / ((DAY_END - DAY_START) * 60))
      setNowTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    }
    update()
    const t = setInterval(update, 60_000)
    return () => clearInterval(t)
  }, [])

  const eventsForDay = (day: Date) =>
    events.filter(e => {
      if (e.allDay) return false
      const start = new Date(e.startAt)
      return isoDate(start) === isoDate(day)
    })

  function eventTop(e: CalendarEvent) {
    const s = new Date(e.startAt)
    return ((s.getHours() - DAY_START) + s.getMinutes() / 60) * HOUR_H
  }
  function eventHeight(e: CalendarEvent) {
    const s = new Date(e.startAt), end = new Date(e.endAt)
    const dur = (end.getTime() - s.getTime()) / 3_600_000
    return Math.max(dur * HOUR_H - 4, 20)
  }

  const totalH = HOURS.length * HOUR_H
  const nowTop = nowPct * totalH

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)' }}>
      {/* Time column */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {HOURS.map(h => (
          <div key={h} style={{ height: HOUR_H, paddingRight: 10, paddingTop: 4, textAlign: 'right', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {String(h).padStart(2,'0')}:00
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((day, col) => {
        const dayEvents = eventsForDay(day)
        const today = isToday(day)

        return (
          <div
            key={col}
            style={{
              borderLeft: '1px solid var(--border)',
              position: 'relative',
              minHeight: totalH,
              background: today ? 'oklch(100% 0 0 / 0.012)' : 'transparent',
            }}
          >
            {/* Hour slots (clickable) */}
            {HOURS.map((h, hi) => (
              <div
                key={hi}
                onClick={() => onSlotClick(day, h)}
                style={{
                  height: HOUR_H,
                  borderBottom: hi < HOURS.length - 1 ? '1px solid oklch(100% 0 0 / 0.03)' : 'none',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'oklch(100% 0 0 / 0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'oklch(100% 0 0 / 0.02)', pointerEvents: 'none' }} />
              </div>
            ))}

            {/* Now-line */}
            {today && nowPct > 0 && nowPct < 1 && (
              <div ref={nowRef} style={{
                position: 'absolute', left: 0, right: 0,
                top: nowTop, height: 0,
                pointerEvents: 'none',
                zIndex: 10,
                overflow: 'visible',
              }}>
                {/* Gradient line */}
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: 0, height: 1,
                  background: 'linear-gradient(to right, var(--accent) 0%, transparent 92%)',
                }} />
                {/* Pulsing ring */}
                <div className="now-ring" style={{
                  position: 'absolute',
                  width: 14, height: 14,
                  borderRadius: '50%',
                  border: '1.5px solid var(--accent)',
                  top: -7, left: -7,
                }} />
                {/* Solid dot with glow */}
                <div style={{
                  position: 'absolute',
                  width: 9, height: 9,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 8px var(--accent-glow)',
                  top: -4.5, left: -4.5,
                }} />
                {/* Time badge */}
                <div style={{
                  position: 'absolute',
                  left: 12, top: -9,
                  background: 'var(--accent)',
                  color: 'var(--accent-ink)',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  padding: '1px 5px 2px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  lineHeight: 1.6,
                }}>
                  {nowTime}
                </div>
              </div>
            )}

            {/* Events */}
            {computeLanes(dayEvents).map(({ event: ev, lane, totalLanes }, ei) => (
              <div
                key={ei}
                style={{
                  position: 'absolute',
                  left: `calc(${lane / totalLanes * 100}% + 2px)`,
                  width: `calc(${100 / totalLanes}% - 4px)`,
                  top: eventTop(ev) + 2, height: eventHeight(ev),
                  background: evtBg(ev.color), color: evtFg(ev.color),
                  border: `1px solid ${evtBorder(ev.color)}`,
                  borderRadius: 8, padding: '5px 9px',
                  fontSize: 11.5, lineHeight: 1.3,
                  overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 140ms ease',
                  zIndex: 5,
                }}
                onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = '')}
              >
                <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </div>
                <div style={{ opacity: 0.7, fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
                  {new Date(ev.startAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── MonthView ─────────────────────────────────────────────────────────────────

function MonthView({
  events, anchor, onDayClick, onEventClick,
}: {
  events: CalendarEvent[]
  anchor: Date
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart    = mondayOf(firstOfMonth)

  const cells: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d
  })

  function eventsForDay(day: Date) {
    return events
      .filter(e => isoDate(new Date(e.startAt)) === isoDate(day))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
      {DE_DAYS.map(d => (
        <div key={d} style={{
          padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid var(--border)',
          borderLeft: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--fg-dim)', letterSpacing: '0.08em',
        }}>
          {d.toUpperCase()}
        </div>
      ))}

      {cells.map((day, i) => {
        const inMonth  = day.getMonth() === anchor.getMonth()
        const today    = isToday(day)
        const dayEvts  = eventsForDay(day)
        const overflow = dayEvts.length - 3

        return (
          <div
            key={i}
            onClick={() => onDayClick(day)}
            style={{
              minHeight: 110,
              borderLeft: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              padding: '8px 6px',
              opacity: inMonth ? 1 : 0.35,
              cursor: 'pointer',
              position: 'relative',
              background: today ? 'oklch(100% 0 0 / 0.02)' : 'transparent',
              transition: 'background 80ms',
            }}
            onMouseEnter={e => { if (!today) (e.currentTarget.style.background = 'oklch(100% 0 0 / 0.02)') }}
            onMouseLeave={e => { if (!today) (e.currentTarget.style.background = '') }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: today ? 700 : 400,
              background: today ? 'var(--accent)' : 'transparent',
              color: today ? 'var(--accent-ink)' : 'var(--fg)',
              marginBottom: 4, flexShrink: 0,
            }}>
              {day.getDate()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dayEvts.slice(0, 3).map((ev, ei) => (
                <EventChip key={ei} event={ev} onClick={() => onEventClick(ev)} compact />
              ))}
              {overflow > 0 && (
                <div
                  onClick={e => { e.stopPropagation(); onDayClick(day) }}
                  style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', paddingLeft: 2, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  +{overflow} mehr
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── DayView ───────────────────────────────────────────────────────────────────

function DayView({
  events, day, onSlotClick, onEventClick,
}: {
  events: CalendarEvent[]
  day: Date
  onSlotClick: (date: Date, hour: number) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const [nowPct,  setNowPct]  = useState(0)
  const [nowTime, setNowTime] = useState('')

  useEffect(() => {
    function update() {
      const now  = new Date()
      const mins = (now.getHours() - DAY_START) * 60 + now.getMinutes()
      setNowPct(mins / ((DAY_END - DAY_START) * 60))
      setNowTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    }
    update()
    const t = setInterval(update, 60_000)
    return () => clearInterval(t)
  }, [])

  const dayEvents = events.filter(e => !e.allDay && isoDate(new Date(e.startAt)) === isoDate(day))

  function eventTop(e: CalendarEvent) {
    const s = new Date(e.startAt)
    return ((s.getHours() - DAY_START) + s.getMinutes() / 60) * HOUR_H
  }
  function eventHeight(e: CalendarEvent) {
    const s = new Date(e.startAt), end = new Date(e.endAt)
    return Math.max((end.getTime() - s.getTime()) / 3_600_000 * HOUR_H - 4, 20)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {HOURS.map(h => (
          <div key={h} style={{ height: HOUR_H, paddingRight: 10, paddingTop: 4, textAlign: 'right', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {String(h).padStart(2,'0')}:00
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderLeft: '1px solid var(--border)', position: 'relative', minHeight: HOURS.length * HOUR_H }}>
        {HOURS.map((h, hi) => (
          <div
            key={hi}
            onClick={() => onSlotClick(day, h)}
            style={{
              height: HOUR_H,
              borderBottom: hi < HOURS.length - 1 ? '1px solid oklch(100% 0 0 / 0.03)' : 'none',
              cursor: 'pointer',
              position: 'relative',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'oklch(100% 0 0 / 0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'oklch(100% 0 0 / 0.02)', pointerEvents: 'none' }} />
          </div>
        ))}
        {/* Now-line */}
        {isToday(day) && nowPct > 0 && nowPct < 1 && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: nowPct * HOURS.length * HOUR_H, height: 0,
            pointerEvents: 'none',
            zIndex: 10,
            overflow: 'visible',
          }}>
            <div style={{
              position: 'absolute', left: 0, right: 0, top: 0, height: 1,
              background: 'linear-gradient(to right, var(--accent) 0%, transparent 92%)',
            }} />
            <div className="now-ring" style={{
              position: 'absolute',
              width: 14, height: 14,
              borderRadius: '50%',
              border: '1.5px solid var(--accent)',
              top: -7, left: -7,
            }} />
            <div style={{
              position: 'absolute',
              width: 9, height: 9,
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 8px var(--accent-glow)',
              top: -4.5, left: -4.5,
            }} />
            <div style={{
              position: 'absolute',
              left: 12, top: -9,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '1px 5px 2px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              lineHeight: 1.6,
            }}>
              {nowTime}
            </div>
          </div>
        )}

        {dayEvents.map((ev, ei) => (
          <div
            key={ei}
            style={{
              position: 'absolute', left: 8, right: 8,
              top: eventTop(ev) + 2, height: eventHeight(ev),
              background: evtBg(ev.color), color: evtFg(ev.color),
              border: `1px solid ${evtBorder(ev.color)}`,
              borderRadius: 8, padding: '6px 12px',
              fontSize: 12, cursor: 'pointer',
              transition: 'transform 140ms ease', zIndex: 5,
            }}
            onClick={e => { e.stopPropagation(); onEventClick(ev) }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = '')}
          >
            <div style={{ fontWeight: 600 }}>{ev.title}</div>
            <div style={{ fontSize: 11, opacity: 0.7, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {new Date(ev.startAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} –{' '}
              {new Date(ev.endAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {ev.location && <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: 2 }}>📍 {ev.location}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── EventForm ─────────────────────────────────────────────────────────────────

const COLOR_OPTIONS: { value: EventColor | ''; label: string; bg: string }[] = [
  { value: '',       label: 'Standard', bg: 'var(--surface-2)' },
  { value: 'accent', label: 'Grün',     bg: 'var(--accent)' },
  { value: 'ok',     label: 'Blau',     bg: 'var(--ok)' },
  { value: 'warn',   label: 'Gelb',     bg: 'var(--warn)' },
  { value: 'danger', label: 'Rot',      bg: 'var(--danger)' },
]

interface EventFormProps {
  initial?: CalendarEvent
  defaultDate?: Date
  defaultHour?: number
  onClose: () => void
  onSaved: () => void
}

function EventForm({ initial, defaultDate, defaultHour, onClose, onSaved }: EventFormProps) {
  const upsert      = useCalendarStore(s => s.upsert)
  const remove      = useCalendarStore(s => s.remove)
  const accounts    = useAccountsStore(s => s.accounts)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user        = useAuthStore(s => s.user)

  const baseDate = defaultDate ?? (initial ? new Date(initial.startAt) : new Date())
  const baseHour = defaultHour ?? (initial ? new Date(initial.startAt).getHours() : 10)

  function toDatetimeLocal(iso: string) {
    return iso.slice(0, 16)
  }
  function fromDatetimeLocal(val: string): string {
    return val.length === 16 ? val + ':00' : val
  }

  const defaultStart = initial
    ? toDatetimeLocal(initial.startAt)
    : `${isoDate(baseDate)}T${String(baseHour).padStart(2,'0')}:00`
  const defaultEnd = initial
    ? toDatetimeLocal(initial.endAt)
    : `${isoDate(baseDate)}T${String(baseHour + 1).padStart(2,'0')}:00`

  const [title,       setTitle]       = useState(initial?.title ?? '')
  const [startAt,     setStartAt]     = useState(defaultStart)
  const [endAt,       setEndAt]       = useState(defaultEnd)
  const [allDay,      setAllDay]      = useState(initial?.allDay ?? false)
  const [accountId,   setAccountId]   = useState(initial?.accountId ?? '')
  const [location,    setLocation]    = useState(initial?.location ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color,       setColor]       = useState<EventColor | ''>(initial?.color ?? '')
  const [isSaving,    setIsSaving]    = useState(false)
  const [isDeleting,  setIsDeleting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const handleSave = async () => {
    if (!title.trim()) { setError('Titel ist Pflichtfeld'); return }
    const start = fromDatetimeLocal(startAt)
    const end   = fromDatetimeLocal(endAt)
    if (!allDay && end <= start) { setError('Ende muss nach Start liegen'); return }
    setIsSaving(true); setError(null)
    try {
      const payload: UpsertCalendarEventPayload = {
        id: initial?.id,
        workspaceId,
        createdBy: user?.id ?? '',
        accountId: accountId || undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startAt: allDay ? `${startAt.slice(0,10)}T00:00:00` : start,
        endAt:   allDay ? `${startAt.slice(0,10)}T23:59:59` : end,
        allDay,
        color: color || undefined,
      }
      await upsert(payload)
      onSaved()
    } catch (e) { setError(String(e)) }
    finally { setIsSaving(false) }
  }

  const handleDelete = async () => {
    if (!initial) return
    if (!window.confirm(`"${initial.title}" wirklich löschen?`)) return
    setIsDeleting(true)
    try { await remove(initial.id, workspaceId); onSaved() }
    catch (e) { setError(String(e)); setIsDeleting(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'oklch(0% 0 0 / 0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        className="card"
        style={{
          width: 480, height: '100vh', borderRadius: '16px 0 0 16px',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            {initial ? 'Event bearbeiten' : 'Neues Event'}
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em' }}>
            {title || <span style={{ color: 'var(--fg-dim)', fontWeight: 400, fontStyle: 'italic' }}>Titel…</span>}
          </h2>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Titel *
            </label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Q2 Strategy Call"
              style={{ width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
            Ganztägiges Event
          </label>

          {!allDay ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Start</label>
                <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Ende</label>
                <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Datum</label>
              <input type="date" value={startAt.slice(0,10)} onChange={e => setStartAt(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Client (optional)
            </label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}>
              <option value="">Kein Client</option>
              {accounts.filter(a => !a.isPrivate).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Ort</label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              placeholder="z.B. Zoom, Büro, Adresse…"
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Beschreibung</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Notizen, Agenda…"
              rows={3}
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Farbe</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setColor(opt.value as EventColor | '')}
                  title={opt.label}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: opt.bg, border: color === opt.value ? '3px solid var(--fg)' : '2px solid var(--border)',
                    cursor: 'pointer', transition: 'transform 120ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = '')}
                />
              ))}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 9, background: 'oklch(65% 0.22 25 / 0.12)', color: 'var(--danger)', fontSize: 13, border: '1px solid oklch(65% 0.22 25 / 0.3)' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            {initial && (
              <button
                className="btn-ghost"
                onClick={handleDelete}
                disabled={isDeleting}
                style={{ color: 'var(--danger)' }}
              >
                {isDeleting ? 'Löschen…' : 'Löschen'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CalendarRoute ─────────────────────────────────────────────────────────────

export function CalendarRoute() {
  const events      = useCalendarStore(s => s.events)
  const view        = useCalendarStore(s => s.view)
  const currentDate = useCalendarStore(s => s.currentDate)
  const isLoading   = useCalendarStore(s => s.isLoading)
  const error       = useCalendarStore(s => s.error)
  const load        = useCalendarStore(s => s.load)
  const setView     = useCalendarStore(s => s.setView)
  const navigate    = useCalendarStore(s => s.navigate)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const todayEvents    = useCalendarStore(s => s.todayEvents)
  const isTodayLoading = useCalendarStore(s => s.isTodayLoading)
  const loadToday      = useCalendarStore(s => s.loadToday)

  const [formOpen,      setFormOpen]      = useState(false)
  const [editingEvent,  setEditingEvent]  = useState<CalendarEvent | undefined>()
  const [defaultDate,   setDefaultDate]   = useState<Date | undefined>()
  const [defaultHour,   setDefaultHour]   = useState<number | undefined>()

  useEffect(() => { if (workspaceId) load(workspaceId) }, [workspaceId, view, currentDate.toDateString()])

  useEffect(() => {
    if (workspaceId) loadToday(workspaceId)
  }, [workspaceId])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'ArrowLeft')  navigate('prev', workspaceId)
    if (e.key === 'ArrowRight') navigate('next', workspaceId)
    if (e.key === 't' || e.key === 'T') navigate('today', workspaceId)
    if (e.key === 'd' || e.key === 'D') setView('day')
    if (e.key === 'w' || e.key === 'W') setView('week')
    if (e.key === 'm' || e.key === 'M') setView('month')
    if ((e.key === 'n' || e.key === 'N') && !formOpen) {
      setEditingEvent(undefined); setDefaultDate(new Date()); setDefaultHour(10); setFormOpen(true)
    }
    if (e.key === 'Escape' && formOpen) setFormOpen(false)
  }, [workspaceId, view, formOpen, navigate, setView])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  function openNew(date?: Date, hour?: number) {
    setEditingEvent(undefined); setDefaultDate(date); setDefaultHour(hour); setFormOpen(true)
  }
  function openEdit(event: CalendarEvent) {
    setEditingEvent(event); setDefaultDate(undefined); setDefaultHour(undefined); setFormOpen(true)
  }
  function onFormSaved() {
    setFormOpen(false); load(workspaceId)
  }

  function headingLabel() {
    if (view === 'day') {
      return `${DE_DAYS[(currentDate.getDay() + 6) % 7]}, ${currentDate.getDate()}. ${DE_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    }
    if (view === 'week') {
      const days = weekDays(currentDate)
      const kw = kwOf(currentDate)
      const first = days[0], last = days[6]
      if (first.getMonth() === last.getMonth()) {
        return `KW ${kw} · ${first.getDate()}. – ${last.getDate()}. ${DE_MONTHS[first.getMonth()]} ${first.getFullYear()}`
      }
      return `KW ${kw} · ${first.getDate()}. ${DE_MONTHS_SHORT[first.getMonth()]} – ${last.getDate()}. ${DE_MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`
    }
    return `${DE_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }

  const days = weekDays(currentDate)

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div className="greeting">
        <h1 className="greeting-title">Kalender<em>.</em></h1>
        <div className="greeting-sub">
          <span>{headingLabel()}</span>
          <span>{events.length} Events</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Left: nav controls + calendar card */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-ghost" onClick={() => navigate('prev', workspaceId)} title="← (Pfeil links)">
            <ChevronLeft size={15} />
          </button>
          <button className="btn-ghost" onClick={() => navigate('today', workspaceId)} title="T">
            Heute
          </button>
          <button className="btn-ghost" onClick={() => navigate('next', workspaceId)} title="→ (Pfeil rechts)">
            <ChevronRight size={15} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 8, letterSpacing: '-0.01em' }}>
            {headingLabel()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {(['day','week','month'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: view === v ? 'var(--accent)' : 'none',
                  color: view === v ? 'var(--accent-ink)' : 'var(--fg-muted)',
                  transition: 'background 150ms, color 150ms',
                }}
              >
                {v === 'day' ? 'Tag' : v === 'week' ? 'Woche' : 'Monat'}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => openNew()} title="N">
            <Plus size={13} /> Event
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        {(view === 'week' || view === 'day') && (
          <div style={{ display: 'grid', gridTemplateColumns: view === 'week' ? '60px repeat(7, 1fr)' : '60px 1fr', borderBottom: '1px solid var(--border)' }}>
            <div />
            {(view === 'week' ? days : [currentDate]).map((d, i) => (
              <div
                key={i}
                style={{ padding: '12px 10px', textAlign: 'center', borderLeft: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => setView('day')}
              >
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                  {DE_DAYS[(d.getDay() + 6) % 7].toUpperCase()}
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 600, marginTop: 3,
                  width: 34, height: 34, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '3px auto 0',
                  background: isToday(d) ? 'var(--accent)' : 'transparent',
                  color: isToday(d) ? 'var(--accent-ink)' : 'var(--fg)',
                }}>
                  {d.getDate()}
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>Laden…</div>
        )}

        {error && !isLoading && (
          <div style={{ margin: '0 0 8px', padding: '10px 16px', borderRadius: 10, background: 'oklch(65% 0.22 25 / 0.12)', color: 'var(--danger)', fontSize: 13, border: '1px solid oklch(65% 0.22 25 / 0.3)' }}>
            Fehler beim Laden: {error}
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div style={{ padding: '12px 24px', fontSize: 12, color: 'var(--fg-dim)', fontStyle: 'italic', borderBottom: view !== 'month' ? '1px solid var(--border)' : 'none' }}>
            Keine Events in diesem Zeitraum — klicke auf einen Slot oder drücke N.
          </div>
        )}

        {!isLoading && view === 'week' && (
          <WeekView events={events} days={days} onSlotClick={openNew} onEventClick={openEdit} />
        )}
        {!isLoading && view === 'day' && (
          <DayView events={events} day={currentDate} onSlotClick={openNew} onEventClick={openEdit} />
        )}
        {!isLoading && view === 'month' && (
          <MonthView
            events={events}
            anchor={currentDate}
            onDayClick={d => { useCalendarStore.setState({ view: 'day', currentDate: d }) }}
            onEventClick={openEdit}
          />
        )}
      </div>

      </div>{/* end left column */}

      {/* Tagesplan sidebar */}
      <div style={{ width: 240, flexShrink: 0, paddingLeft: 4 }}>
        <TagesplanCard events={todayEvents} isLoading={isTodayLoading} />
      </div>
    </div>{/* end flex row */}

      {formOpen && (
        <EventForm
          initial={editingEvent}
          defaultDate={defaultDate}
          defaultHour={defaultHour}
          onClose={() => setFormOpen(false)}
          onSaved={onFormSaved}
        />
      )}
    </div>
  )
}
