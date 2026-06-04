import { useCalendarStore } from '@/store/calendar.store'

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function WidgetWeek() {
  const events = useCalendarStore(s => s.events)

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - dayOfWeek + i)
    return d.toISOString().slice(0, 10)
  })

  const eventsPerDay = weekDays.map(day =>
    events.filter(e => e.startAt.startsWith(day))
  )

  const totalThisWeek = eventsPerDay.reduce((s, es) => s + es.length, 0)

  const todayEvents = (eventsPerDay[dayOfWeek] ?? [])
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  const nextEvent = todayEvents[0]

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 140,
        background: 'radial-gradient(ellipse, rgba(163,230,53,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 12 }}>
        DIESE WOCHE
      </div>

      <div style={{
        fontSize: 48, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 40px rgba(163,230,53,0.25)', marginBottom: 20,
      }}>
        {totalThisWeek} Termine
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {weekDays.map((day, i) => {
          const isToday = day === todayStr
          const count = eventsPerDay[i]?.length ?? 0
          return (
            <div key={day} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                fontSize: 8, color: isToday ? 'var(--accent)' : 'rgba(163,230,53,0.3)',
                fontFamily: 'var(--font-mono)', marginBottom: 4,
                fontWeight: isToday ? 700 : 400,
              }}>
                {DAYS[i]}
              </div>
              <div style={{
                height: 28, borderRadius: 4,
                background: isToday ? 'rgba(163,230,53,0.12)' : 'rgba(163,230,53,0.04)',
                border: isToday ? '1px solid rgba(163,230,53,0.3)' : '1px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {count > 0 && (
                  <div style={{
                    width: count > 1 ? 8 : 6, height: count > 1 ? 8 : 6,
                    borderRadius: '50%', background: 'var(--accent)',
                    boxShadow: isToday ? '0 0 6px rgba(163,230,53,0.6)' : 'none',
                  }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {nextEvent && (
        <>
          <div style={{ width: 40, height: 1, background: 'rgba(163,230,53,0.15)', marginBottom: 10 }} />
          <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.4)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            HEUTE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)' }}>
              {nextEvent.startAt.slice(11, 16)}
            </span>
            <span style={{ fontSize: 13, color: '#ddd' }}>{nextEvent.title}</span>
          </div>
        </>
      )}
    </div>
  )
}
