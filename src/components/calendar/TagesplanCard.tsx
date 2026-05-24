import type { CalendarEvent } from '@/types/calendar.types'

interface TagesplanCardProps {
  events: CalendarEvent[]
  isLoading: boolean
}

/** "2026-05-24T09:00:00" → "09:00" */
function formatTime(iso: string): string {
  return iso.slice(11, 16)
}

/** Current local time as ISO string (no timezone), matching startAt/endAt format */
function localNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function isEventNow(event: CalendarEvent): boolean {
  if (event.allDay) return false
  const now = localNow()
  return event.startAt <= now && event.endAt > now
}

function getPill(event: CalendarEvent, now: boolean): { label: string; tone: string } | null {
  if (now) return { label: 'JETZT', tone: 'now' }
  if (event.allDay) return { label: 'GANZTAG', tone: 'accent' }
  return null
}

export function TagesplanCard({ events, isLoading }: TagesplanCardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Tagesplan</h2>
        {!isLoading && events.length > 0 && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {events.length} {events.length === 1 ? 'EVENT' : 'EVENTS'}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && events.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && events.length === 0 && (
        <p className="empty" style={{ padding: '24px 0', fontSize: 13, color: 'var(--fg-dim)' }}>
          Keine Events heute
        </p>
      )}

      {/* Timeline */}
      {!isLoading && events.length > 0 && (
        <div className="timeline">
          <div className="tl-bar" />
          {events.map(event => {
            const isNow = isEventNow(event)
            const pill = getPill(event, isNow)
            return (
              <div key={event.id} className="tl-row" data-now={String(isNow)}>
                <span className="tl-time">
                  {event.allDay ? '↔' : formatTime(event.startAt)}
                </span>
                <div className="tl-dot" />
                <div className="tl-body" style={{ paddingLeft: 14 }}>
                  <span className="tl-title">{event.title}</span>
                  {event.location && <span className="tl-sub">{event.location}</span>}
                </div>
                {pill && (
                  <span className="tl-pill" data-tone={pill.tone}>{pill.label}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
