const DAYS  = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DATES = ['18', '19', '20', '21', '22', '23', '24']
const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i)

const EVENTS = [
  { day: 0, start: 9,  end: 10, title: 'Q2 Strategy Call',         client: 'GreenLeaf',  tone: 'accent' },
  { day: 0, start: 10, end: 11, title: 'Brand Guidelines Review',   client: 'TechCorp',   tone: 'accent' },
  { day: 1, start: 14, end: 15, title: 'Website Deployment',        client: 'PixelStudio', tone: 'warn'  },
  { day: 2, start: 11, end: 12, title: 'Kick-off Meeting',          client: 'StartupXY',  tone: ''       },
  { day: 3, start: 15, end: 16, title: 'Rechnung Q1 besprechen',    client: 'BigCo',      tone: ''       },
  { day: 4, start: 9,  end: 10, title: 'Weekly Sync',               client: 'Intern',     tone: ''       },
]

function eventBg(tone: string) {
  if (tone === 'accent') return 'var(--accent)'
  if (tone === 'warn')   return 'oklch(82% 0.16 70 / 0.18)'
  return 'var(--surface-2)'
}
function eventFg(tone: string) {
  if (tone === 'accent') return 'var(--accent-ink)'
  if (tone === 'warn')   return 'var(--warn)'
  return 'var(--fg)'
}
function eventBorder(tone: string) {
  if (tone === 'accent') return 'transparent'
  if (tone === 'warn')   return 'oklch(82% 0.16 70 / 0.4)'
  return 'var(--border-strong)'
}

export function CalendarRoute() {
  return (
    <div className="main-inner">
      <div className="greeting" style={{ marginBottom: 18 }}>
        <h1 className="greeting-title">Calendar<em>.</em></h1>
        <div className="greeting-sub">
          <span>KW 20 · 18.–24. Mai</span>
          <span>13 Termine · 2 Konflikte</span>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>Diese Woche</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost">← Zurück</button>
          <button className="btn-ghost">Heute</button>
          <button className="btn-ghost">Weiter →</button>
          <button className="btn-primary">+ Event</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          <div />
          {DAYS.map((d, i) => (
            <div key={d} style={{ padding: '14px 12px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>{d.toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4, color: i === 0 ? 'var(--accent)' : 'var(--fg)' }}>{DATES[i]}</div>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: 56, paddingRight: 12, paddingTop: 4, textAlign: 'right' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{String(h).padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>
          {DAYS.map((_d, col) => (
            <div key={col} style={{ borderLeft: '1px solid var(--border)', position: 'relative', minHeight: HOURS.length * 56 }}>
              {HOURS.map((_, hi) => (
                <div key={hi} style={{ height: 56, borderBottom: hi < HOURS.length - 1 ? '1px solid oklch(100% 0 0 / 0.025)' : 'none' }} />
              ))}
              {EVENTS.filter(e => e.day === col).map((e, ei) => (
                <div key={ei} style={{
                  position: 'absolute', left: 4, right: 4,
                  top: (e.start - 8) * 56 + 2,
                  height: (e.end - e.start) * 56 - 4,
                  background: eventBg(e.tone), color: eventFg(e.tone),
                  padding: '6px 10px', borderRadius: 8,
                  border: `1px solid ${eventBorder(e.tone)}`,
                  fontSize: 11.5, lineHeight: 1.3,
                  overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 180ms ease',
                }}
                onMouseEnter={ev => (ev.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'}
                onMouseLeave={ev => (ev.currentTarget as HTMLDivElement).style.transform = ''}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{e.title}</div>
                  <div style={{ opacity: 0.7, fontSize: 10.5 }}>{e.client}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
