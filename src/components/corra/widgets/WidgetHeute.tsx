import { useMemo } from 'react'
import { useTodosStore }    from '@/store/todos.store'
import { useMailStore }     from '@/store/mail.store'
import { useCalendarStore } from '@/store/calendar.store'

export function WidgetHeute() {
  const allTodos  = useTodosStore(s => s.allTodos)
  const emails    = useMailStore(s => s.emails)
  const allEvents = useCalendarStore(s => s.events)

  const todayStr = new Date().toISOString().slice(0, 10)

  const todayTodos = allTodos.filter(t =>
    t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')
  )
  const unreadMails = emails.filter(e => !e.isRead && e.customerId != null)
  const allTodayEvents = allEvents
    .filter(e => e.startAt.startsWith(todayStr))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))

  const todayEvents = allTodayEvents.slice(0, 4) // only for timeline

  type TodayItem =
    | { kind: 'event'; time: string; label: string }
    | { kind: 'todo';  label: string; priority: string }
    | { kind: 'mail';  label: string }

  const timeline = useMemo((): TodayItem[] => {
    const items: TodayItem[] = [
      ...todayEvents.map(e => ({ kind: 'event' as const, time: e.startAt.slice(11,16), label: e.title })),
      ...todayTodos.slice(0,2).map(t => ({ kind: 'todo' as const, label: t.title, priority: t.priority.toUpperCase() })),
      ...unreadMails.slice(0,1).map(m => ({ kind: 'mail' as const, label: m.fromName ?? m.fromAddr })),
    ]
    return items.slice(0, 5)
  }, [todayEvents, todayTodos, unreadMails])

  const Counter = ({ value, label }: { value: number; label: string }) => (
    <div>
      <div style={{
        fontSize: 28, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.03em', textShadow: '0 0 20px rgba(59,109,244,0.2)',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(59,109,244,0.4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        {label}
      </div>
    </div>
  )

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 140,
        background: 'radial-gradient(ellipse, rgba(59,109,244,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(59,109,244,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 16 }}>
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' }).toUpperCase()}
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <Counter value={allTodayEvents.length} label="TERMINE" />
        <div style={{ width: 1, background: 'rgba(59,109,244,0.1)', alignSelf: 'stretch' }} />
        <Counter value={todayTodos.length} label="AUFGABEN" />
        <div style={{ width: 1, background: 'rgba(59,109,244,0.1)', alignSelf: 'stretch' }} />
        <Counter value={unreadMails.length} label="MAILS" />
      </div>

      <div style={{ width: 40, height: 1, background: 'rgba(59,109,244,0.15)', marginBottom: 14 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {timeline.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', width: 32, flexShrink: 0,
              color: 'var(--accent)',
            }}>
              {item.kind === 'event' ? item.time : item.kind === 'todo' ? 'Todo' : 'Mail'}
            </span>
            <div style={{ width: 1, background: 'rgba(59,109,244,0.15)', alignSelf: 'stretch', minHeight: 24, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#ccc', flex: 1 }}>{item.label}</span>
            {item.kind === 'todo' && (
              <span style={{ fontSize: 9, color: 'rgba(59,109,244,0.35)', fontFamily: 'var(--font-mono)' }}>
                {item.priority}
              </span>
            )}
          </div>
        ))}
        {timeline.length === 0 && (
          <span style={{ fontSize: 13, color: 'rgba(59,109,244,0.4)' }}>Ruhiger Tag ✓</span>
        )}
      </div>
    </div>
  )
}
