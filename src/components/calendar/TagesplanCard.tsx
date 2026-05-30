import type { CalendarEvent } from '@/types/calendar.types'
import { useAccountsStore } from '@/store/accounts.store'

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

function isPast(event: CalendarEvent): boolean {
  if (event.allDay) return false
  return event.endAt <= localNow()
}

export function TagesplanCard({ events, isLoading }: TagesplanCardProps) {
  const accounts = useAccountsStore(s => s.accounts)
  const accountName = (id?: string) => id ? accounts.find(a => a.id === id)?.name : undefined
  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <h2 style={{
          fontSize: 12, fontWeight: 700, margin: 0,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--fg-muted)',
        }}>
          Tagesplan
        </h2>
        {!isLoading && events.length > 0 && (
          <span style={{
            fontSize: 10.5, color: 'var(--fg-dim)',
            fontFamily: 'var(--font-mono)',
          }}>
            {events.length}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && events.length === 0 && (
        <div style={{
          fontSize: 11.5, color: 'var(--fg-dim)',
          padding: '8px 0',
        }}>
          Laden …
        </div>
      )}

      {/* Empty */}
      {!isLoading && events.length === 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--fg-dim)', margin: 0, lineHeight: 1.6 }}>
          Keine Events heute.
        </p>
      )}

      {/* Events */}
      {!isLoading && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {events.map(event => {
            const isNow  = isEventNow(event)
            const past   = isPast(event)
            return (
              <div
                key={event.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '8px 0',
                  opacity: past ? 0.45 : 1,
                  position: 'relative',
                  transition: 'opacity 200ms',
                }}
              >
                {/* Time */}
                <div style={{
                  width: 42, flexShrink: 0,
                  fontSize: 11.5, fontFamily: 'var(--font-mono)',
                  color: isNow ? 'var(--accent)' : 'var(--fg-muted)',
                  fontWeight: isNow ? 700 : 500,
                  lineHeight: 1.4,
                  paddingTop: 1,
                }}>
                  {event.allDay ? '· · ·' : formatTime(event.startAt)}
                </div>

                {/* Dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  marginTop: 7, flexShrink: 0,
                  background: isNow ? 'var(--accent)' : 'var(--fg-dim)',
                  boxShadow: isNow ? '0 0 8px var(--accent-glow)' : 'none',
                  transition: 'background 200ms, box-shadow 200ms',
                }} />

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0, paddingTop: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--fg)',
                    lineHeight: 1.35,
                    textDecoration: past ? 'line-through' : 'none',
                  }}>
                    {event.title}
                  </div>
                  {(accountName(event.accountId) || event.location) && (
                    <div style={{
                      fontSize: 11, color: 'var(--fg-dim)', marginTop: 2,
                      display: 'flex', gap: 6, alignItems: 'center',
                    }}>
                      {accountName(event.accountId) && (
                        <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                          {accountName(event.accountId)}
                        </span>
                      )}
                      {accountName(event.accountId) && event.location && (
                        <span style={{ opacity: 0.4 }}>·</span>
                      )}
                      {event.location && <span>{event.location}</span>}
                    </div>
                  )}
                </div>

                {/* Now pill */}
                {isNow && (
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 99,
                    background: 'var(--accent)',
                    color: 'var(--accent-ink)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.08em',
                    flexShrink: 0,
                    alignSelf: 'center',
                  }}>
                    JETZT
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
