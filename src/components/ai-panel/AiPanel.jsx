import { useMemo } from 'react'
import { useStore } from '../../store'
import { healthColor, healthLabel, fmtDate } from '../../utils/helpers'
import { computeHealthScore } from '../../utils/healthScore'

const PURPLE = '#7C3AED'

const PRIO_COLOR = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--text3)' }
const PRIO_BG    = { high: 'rgba(239,68,68,0.08)', medium: 'rgba(245,158,11,0.08)', low: 'var(--bg2)' }
const PRIO_DOT   = { high: '#EF4444', medium: '#F59E0B', low: '#9CA3AF' }

function Block({ title, children }) {
  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '16px 0 0' }} />
}

export function AiPanel({ customerId }) {
  const customers            = useStore(s => s.customers)
  const todos                = useStore(s => s.todos)
  const kpis                 = useStore(s => s.kpis)
  const notes                = useStore(s => s.notes)
  const deadlines            = useStore(s => s.deadlines)
  const instagramConnections = useStore(s => s.instagramConnections)
  const instagramCache       = useStore(s => s.instagramCache)

  const customer = customers.find(c => c.id === customerId)

  const { score, factors } = useMemo(() =>
    computeHealthScore(customerId, { customers, todos, kpis, notes, deadlines, instagramConnections, instagramCache }),
    [customerId, customers, todos, kpis, notes, deadlines, instagramConnections, instagramCache]
  )

  const openTodos = useMemo(() =>
    todos
      .filter(t => t.customerId === customerId && !t.completed)
      .sort((a, b) => {
        const p = { high: 0, medium: 1, low: 2 }
        return (p[a.priority] ?? 2) - (p[b.priority] ?? 2)
      }),
    [todos, customerId]
  )

  const myDeadlines = useMemo(() =>
    deadlines
      .filter(d => d.customerId === customerId)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 4),
    [deadlines, customerId]
  )

  const kpiGroups = useMemo(() => {
    const all = kpis.filter(k => k.customerId === customerId)
    const groups = {}
    all.forEach(k => { if (!groups[k.name]) groups[k.name] = []; groups[k.name].push(k) })
    return Object.entries(groups).map(([name, entries]) => {
      const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date))
      const latest = sorted[sorted.length - 1]
      const prev   = sorted[sorted.length - 2]
      const lv = parseFloat(latest.value), pv = prev ? parseFloat(prev.value) : null
      const growth = pv != null && !isNaN(lv) && !isNaN(pv) && pv !== 0
        ? ((lv - pv) / Math.abs(pv)) * 100 : null
      return { name, value: latest.value, unit: latest.unit, growth }
    })
  }, [kpis, customerId])

  const risks = useMemo(() => {
    const r = []
    if (score < 60) r.push({ text: 'Kritischer Health Score', level: 'high' })
    const highTodos = openTodos.filter(t => t.prio === 'high' || t.priority === 'high')
    if (highTodos.length > 0) r.push({ text: `${highTodos.length} dringende Task${highTodos.length > 1 ? 's' : ''} offen`, level: 'high' })
    const overdue = deadlines.filter(d => d.customerId === customerId && new Date(d.date) < new Date())
    if (overdue.length) r.push({ text: `${overdue.length} Deadline${overdue.length > 1 ? 's' : ''} überfällig`, level: 'high' })
    if (score >= 80 && openTodos.length === 0) r.push({ text: 'Starke Basis — Upsell möglich', level: 'ok' })
    return r
  }, [score, openTodos, deadlines, customerId])

  if (!customer) return null

  const hColor = healthColor(score)
  const hLabel = healthLabel(score)

  return (
    <div style={{
      width: 268, flexShrink: 0, borderLeft: '1px solid var(--border)',
      background: 'var(--bg1)', display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>Focus</div>
            <div style={{ fontSize: 10, color: 'var(--text4)', letterSpacing: '0.03em' }}>{customer.name}</div>
          </div>
        </div>
      </div>

      {/* ── Health Score ── */}
      <Block title="Health Score">
        <div style={{
          background: `linear-gradient(135deg, ${hColor}14 0%, ${hColor}06 100%)`,
          border: `1px solid ${hColor}30`,
          borderRadius: 'var(--r-lg)', padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--text)', lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: hColor, marginTop: 3 }}>{hLabel}</div>
            </div>
          </div>
          {/* Mini progress */}
          <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${score}%`, background: hColor, borderRadius: 99 }} />
          </div>
          {/* Top factors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {factors.slice(0, 3).map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: 'var(--text4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.label}</span>
                <span style={{ fontWeight: 700, color: f.positive ? 'var(--green)' : 'var(--red)', flexShrink: 0, marginLeft: 6 }}>{f.pts}</span>
              </div>
            ))}
          </div>
        </div>
      </Block>

      {/* ── Risiken ── */}
      {risks.length > 0 && (
        <>
          <Divider />
          <Block title="Signale">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {risks.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 'var(--r-md)',
                  background: r.level === 'high' ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                  border: `1px solid ${r.level === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}`,
                }}>
                  <span style={{ fontSize: 13 }}>{r.level === 'high' ? '⚠' : '✓'}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: r.level === 'high' ? 'var(--red)' : 'var(--green)' }}>{r.text}</span>
                </div>
              ))}
            </div>
          </Block>
        </>
      )}

      {/* ── Prioritäten (Todos) ── */}
      <Divider />
      <Block title={`To-Do's ${openTodos.length > 0 ? `· ${openTodos.length} offen` : ''}`}>
        {openTodos.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text4)', fontStyle: 'italic', paddingBottom: 4 }}>Alle erledigt ✓</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {openTodos.slice(0, 5).map(t => {
              const prio = t.prio ?? t.priority
              return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 10px', borderRadius: 'var(--r-md)',
                background: PRIO_BG[prio] ?? 'var(--bg2)',
                border: `1px solid ${PRIO_COLOR[prio] ?? 'var(--border)'}20`,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIO_DOT[prio] ?? '#9CA3AF', flexShrink: 0, marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word' }}>{t.text || t.title}</div>
                  {(t.due ?? t.dueDate) && (
                    <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>{fmtDate(t.due ?? t.dueDate)}</div>
                  )}
                </div>
              </div>
            )})}
            {openTodos.length > 5 && (
              <div style={{ fontSize: 11, color: 'var(--text4)', paddingLeft: 2 }}>+{openTodos.length - 5} weitere</div>
            )}
          </div>
        )}
      </Block>

      {/* ── Deadlines ── */}
      {myDeadlines.length > 0 && (
        <>
          <Divider />
          <Block title="Nächste Deadlines">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {myDeadlines.map(d => {
                const isOverdue = new Date(d.date) < new Date()
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '7px 10px', borderRadius: 'var(--r-md)',
                    background: isOverdue ? 'rgba(239,68,68,0.06)' : 'var(--bg2)',
                    border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.15)' : 'var(--border)'}`,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: isOverdue ? 'var(--red)' : 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    <span style={{ fontSize: 10, color: isOverdue ? 'var(--red)' : 'var(--text4)', flexShrink: 0, fontWeight: isOverdue ? 700 : 400 }}>{fmtDate(d.date)}</span>
                  </div>
                )
              })}
            </div>
          </Block>
        </>
      )}

      {/* ── KPI Highlights ── */}
      {kpiGroups.length > 0 && (
        <>
          <Divider />
          <Block title="KPI Highlights">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 4 }}>
              {kpiGroups.slice(0, 4).map(k => {
                const up = k.growth != null && k.growth > 0
                const dn = k.growth != null && k.growth < 0
                return (
                  <div key={k.name} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{k.value}{k.unit ? ` ${k.unit}` : ''}</span>
                      {k.growth != null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: up ? 'var(--green)' : dn ? 'var(--red)' : 'var(--text4)' }}>
                          {up ? '↑' : dn ? '↓' : '→'}{Math.abs(k.growth).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Block>
        </>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
