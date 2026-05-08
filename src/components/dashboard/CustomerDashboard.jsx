import { useMemo } from 'react'
import { useStore, PRIVAT_ID } from '../../store'
import { healthColor, healthLabel, generateWhatMatters, fmtDate } from '../../utils/helpers'
import { computeHealthScore } from '../../utils/healthScore'

const PRIO_DOT = { high: '#EF4444', medium: '#F59E0B', low: '#9CA3AF' }

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function CustomerDashboard({ customerId }) {
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
        return (p[a.prio ?? a.priority] ?? 2) - (p[b.prio ?? b.priority] ?? 2)
      }),
    [todos, customerId]
  )

  const myDeadlines = useMemo(() =>
    deadlines
      .filter(d => d.customerId === customerId)
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
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

  const igStats = useMemo(() => {
    const cache = instagramCache.find(c => c.customerId === customerId)
    const reels = cache?.reels
    if (!reels?.length) return null
    const totalViews  = reels.reduce((s, r) => s + (r.views  || 0), 0)
    const totalLikes  = reels.reduce((s, r) => s + (r.likes  || 0), 0)
    const totalSaves  = reels.reduce((s, r) => s + (r.saves  || 0), 0)
    const totalShares = reels.reduce((s, r) => s + (r.shares || 0), 0)
    const avgViews    = Math.round(totalViews / reels.length)
    const er          = totalViews ? ((totalLikes + totalSaves + totalShares) / totalViews * 100).toFixed(1) : '0'
    const days30      = new Date(Date.now() - 30 * 86400000)
    const recentCount = reels.filter(r => new Date(r.posted_at) >= days30).length
    return { totalViews, avgViews, totalLikes, er, count: reels.length, recentCount }
  }, [instagramCache, customerId])

  const whatMatters = useMemo(
    () => customer ? generateWhatMatters(customer, { score }, openTodos, myDeadlines) : '',
    [customer, score, openTodos, myDeadlines]
  )

  const recentNotes = useMemo(() =>
    notes
      .filter(n => n.customerId === customerId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5),
    [notes, customerId]
  )

  if (!customer) return null

  // ── Private layout ─────────────────────────────────────────────────────────
  if (customer.isPrivat || customerId === PRIVAT_ID) {
    return (
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── To-Dos + Deadlines ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Offene Aufgaben</h3>
              {openTodos.length > 0 && <span style={{ fontSize: 11, color: 'var(--text4)' }}>{openTodos.length}</span>}
            </div>
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              {openTodos.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>Alle erledigt ✓</div>
              ) : openTodos.slice(0, 8).map((t, i) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i < Math.min(openTodos.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIO_DOT[t.prio ?? t.priority] ?? '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{t.text || t.title}</span>
                  {(t.prio === 'high' || t.priority === 'high') && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>!</span>
                  )}
                </div>
              ))}
              {openTodos.length > 8 && (
                <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text4)' }}>+{openTodos.length - 8} weitere</div>
              )}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Nächste Deadlines</h3>
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              {myDeadlines.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>Keine Deadlines</div>
              ) : myDeadlines.slice(0, 8).map((d, i) => {
                const overdue = new Date(d.date) < new Date()
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '10px 14px',
                    borderBottom: i < Math.min(myDeadlines.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: overdue ? 'var(--red)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    <span style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 700 : 400, flexShrink: 0 }}>{fmtDate(d.date)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Notizen ── */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Notizen</h3>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            {recentNotes.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>Noch keine Notizen</div>
            ) : recentNotes.map((n, i) => (
              <div key={n.id} style={{
                padding: '12px 16px',
                borderBottom: i < recentNotes.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{n.title || 'Ohne Titel'}</span>
                  <span style={{ fontSize: 10, color: 'var(--text4)', flexShrink: 0, marginLeft: 10 }}>{fmtDate(n.updatedAt)}</span>
                </div>
                {n.content && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.content.replace(/[#*_`>\-]/g, '').slice(0, 120)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── KPIs (wenn vorhanden) ── */}
        {kpiGroups.length > 0 && (
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>KPIs</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {kpiGroups.map(k => {
                const up = k.growth != null && k.growth > 0
                const dn = k.growth != null && k.growth < 0
                const gColor = up ? 'var(--green)' : dn ? 'var(--red)' : 'var(--text3)'
                return (
                  <div key={k.name} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text4)' }}>{k.name}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>
                      {k.value}{k.unit ? ` ${k.unit}` : ''}
                    </div>
                    {k.growth != null && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: gColor }}>
                        {up ? '↑' : dn ? '↓' : '→'} {Math.abs(k.growth).toFixed(1)}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  const hColor = healthColor(score)
  const hLabel = healthLabel(score)

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Heute im Fokus banner ── */}
      <div style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)', borderRadius: 'var(--r-xl)', padding: '20px 24px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <svg width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Heute im Fokus</span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.65, opacity: 0.9 }}>{whatMatters}</p>
      </div>

      {/* ── Health Score + KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 14 }}>

        {/* Health Score card */}
        <div style={{
          background: 'var(--bg1)', border: `2px solid ${hColor}35`,
          borderRadius: 'var(--r-xl)', padding: '20px 22px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)' }}>Health Score</div>
          <div>
            <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: '-0.06em', color: hColor, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: hColor, marginTop: 3 }}>{hLabel}</div>
          </div>
          {/* Mini progress bar */}
          <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${score}%`, background: hColor, borderRadius: 99 }} />
          </div>
          {/* Top 3 factors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {factors.slice(0, 3).map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                <span style={{ color: 'var(--text4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.label}</span>
                <span style={{ fontWeight: 700, color: f.positive ? 'var(--green)' : 'var(--red)', flexShrink: 0, marginLeft: 6 }}>{f.pts}</span>
              </div>
            ))}
          </div>
        </div>

        {/* KPI cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {kpiGroups.length === 0 ? (
            <div style={{ gridColumn: '1/-1', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <span style={{ fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Keine KPIs — im Workflow-Tab anlegen</span>
            </div>
          ) : kpiGroups.map(k => {
            const up = k.growth != null && k.growth > 0
            const dn = k.growth != null && k.growth < 0
            const gColor = up ? 'var(--green)' : dn ? 'var(--red)' : 'var(--text3)'
            return (
              <div key={k.name} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text4)' }}>{k.name}</div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>
                  {k.value}{k.unit ? ` ${k.unit}` : ''}
                </div>
                {k.growth != null && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: gColor }}>
                    {up ? '↑' : dn ? '↓' : '→'} {Math.abs(k.growth).toFixed(1)}%
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Instagram Snapshot ── */}
      {igStats && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="#E1306C">
              <rect x="2" y="2" width="20" height="20" rx="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="1" fill="#E1306C" stroke="none"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Instagram Übersicht</span>
            {igStats.recentCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text4)', marginLeft: 'auto' }}>
                {igStats.recentCount} Reel{igStats.recentCount > 1 ? 's' : ''} in 30 Tagen
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { label: 'Gesamt Views',  value: fmt(igStats.totalViews) },
              { label: 'Ø Views / Reel', value: fmt(igStats.avgViews) },
              { label: 'Gesamt Likes',  value: fmt(igStats.totalLikes) },
              { label: 'Engagement',    value: `${igStats.er}%` },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, color: 'var(--text4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Todos + Deadlines ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Open Todos */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Offene Aufgaben</h3>
            {openTodos.length > 0 && <span style={{ fontSize: 11, color: 'var(--text4)' }}>{openTodos.length}</span>}
          </div>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            {openTodos.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>Alle erledigt ✓</div>
            ) : openTodos.slice(0, 6).map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                borderBottom: i < Math.min(openTodos.length, 6) - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIO_DOT[t.prio ?? t.priority] ?? '#9CA3AF', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{t.text || t.title}</span>
                {(t.prio === 'high' || t.priority === 'high') && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>!</span>
                )}
              </div>
            ))}
            {openTodos.length > 6 && (
              <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text4)' }}>+{openTodos.length - 6} weitere</div>
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Nächste Deadlines</h3>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            {myDeadlines.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>Keine Deadlines</div>
            ) : myDeadlines.slice(0, 6).map((d, i) => {
              const overdue = new Date(d.date) < new Date()
              return (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '10px 14px',
                  borderBottom: i < Math.min(myDeadlines.length, 6) - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: overdue ? 'var(--red)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  <span style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 700 : 400, flexShrink: 0 }}>{fmtDate(d.date)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
