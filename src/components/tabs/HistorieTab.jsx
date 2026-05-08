import { useMemo } from 'react'
import { useStore } from '../../store'
import { fmtDate } from '../../utils/helpers'

const TYPE_META = {
  todo_completed: { icon: '✓', color: 'var(--green)',  label: 'Aufgabe erledigt' },
  note_added:     { icon: '📝', color: 'var(--p)',     label: 'Notiz hinzugefügt' },
  kpi_added:      { icon: '📈', color: 'var(--blue)',  label: 'KPI erfasst' },
  deadline_added: { icon: '📅', color: 'var(--amber)', label: 'Deadline gesetzt' },
  health_updated: { icon: '♥', color: 'var(--red)',   label: 'Health aktualisiert' },
}

function buildTimeline(customer, todos, kpis, deadlines, healthScores) {
  const events = []

  todos
    .filter(t => t.customerId === customer.id && t.completed)
    .forEach(t => events.push({ id: `t-${t.id}`, type: 'todo_completed', title: t.title, date: t.updatedAt ?? t.createdAt }))

  kpis
    .filter(k => k.customerId === customer.id)
    .forEach(k => events.push({ id: `k-${k.id}`, type: 'kpi_added', title: `${k.name}: ${k.value}${k.unit ? ' ' + k.unit : ''}`, date: k.createdAt }))

  deadlines
    .filter(d => d.customerId === customer.id)
    .forEach(d => events.push({ id: `d-${d.id}`, type: 'deadline_added', title: d.title, date: d.createdAt ?? d.date }))

  const hs = healthScores.find(h => h.customerId === customer.id)
  if (hs) events.push({ id: `hs-${hs.id}`, type: 'health_updated', title: `Score: ${hs.score}`, date: hs.updatedAt ?? hs.createdAt })

  return events.sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function HistorieTab({ customerId }) {
  const customers    = useStore(s => s.customers)
  const todos        = useStore(s => s.todos)
  const kpis         = useStore(s => s.kpis)
  const deadlines    = useStore(s => s.deadlines)
  const healthScores = useStore(s => s.healthScores)

  const customer = customers.find(c => c.id === customerId)
  const timeline = useMemo(
    () => customer ? buildTimeline(customer, todos, kpis, deadlines, healthScores) : [],
    [customer, todos, kpis, deadlines, healthScores]
  )

  if (!customer) return null

  return (
    <div style={{ padding: '28px 32px', maxWidth: 640 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 24, letterSpacing: '-0.02em' }}>Aktivitätsverlauf</h3>

      {timeline.length === 0 ? (
        <div style={{
          background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: 13,
        }}>
          Noch keine Aktivitäten vorhanden
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* vertical line */}
          <div style={{
            position: 'absolute', left: 15, top: 0, bottom: 0, width: 2,
            background: 'var(--border)', borderRadius: 99,
          }} />

          {timeline.map((event, i) => {
            const meta = TYPE_META[event.type] ?? { icon: '·', color: 'var(--text3)', label: event.type }
            return (
              <div key={event.id} style={{ display: 'flex', gap: 20, marginBottom: 20, position: 'relative' }}>
                {/* dot */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg1)', border: `2px solid ${meta.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, zIndex: 1,
                }}>
                  <span style={{ fontSize: 12 }}>{meta.icon}</span>
                </div>

                {/* content */}
                <div style={{
                  flex: 1, background: 'var(--bg1)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)', padding: '12px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{meta.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(event.date)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{event.title}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
