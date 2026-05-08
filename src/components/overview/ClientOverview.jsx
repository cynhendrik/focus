import { useMemo, useState } from 'react'
import { useStore } from '../../store'
import { PRIVAT_ID } from '../../store'
import { Avatar } from '../ui/Avatar'
import { healthLabel, healthColor, healthStatus, timeAgo } from '../../utils/helpers'

function scoreColor(score) {
  if (score == null) return 'var(--text3)'
  if (score >= 80) return 'var(--green)'
  if (score >= 50) return '#f59e0b'
  return 'var(--red)'
}

function fmtMins(mins) {
  if (!mins) return '0h'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function StatCard({ label, value, sub, icon, color }) {
  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '20px 24px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ value, color }) {
  return (
    <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${Math.min(100, value ?? 0)}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export function ClientOverview({ onNewClient, onTimeEntry }) {
  const customers      = useStore(s => s.customers)
  const healthScores   = useStore(s => s.healthScores)
  const timeEntries    = useStore(s => s.timeEntries)
  const timePlanning   = useStore(s => s.timePlanning)
  const todos          = useStore(s => s.todos)
  const notes          = useStore(s => s.notes)
  const selectCustomer = useStore(s => s.selectCustomer)

  const [healthFilter, setHealthFilter] = useState('Alle')
  const [catFilter, setCatFilter]       = useState('Alle')

  const getHS = id => healthScores.find(h => h.customerId === id)

  const categories = useMemo(
    () => ['Alle', ...new Set(customers.map(c => c.category).filter(Boolean))],
    [customers]
  )

  const filtered = useMemo(() => customers.filter(c => {
    const hs = getHS(c.id)
    const status = hs ? healthStatus(hs.score) : 'unknown'
    const matchHealth =
      healthFilter === 'Alle'     ? true :
      healthFilter === 'Healthy'  ? status === 'healthy' :
      healthFilter === 'Warning'  ? status === 'warning' :
      healthFilter === 'At Risk'  ? status === 'at-risk' : true
    const matchCat = catFilter === 'Alle' || c.category === catFilter
    return matchHealth && matchCat
  }), [customers, healthScores, healthFilter, catFilter])

  const avgScore = useMemo(() => {
    const scores = customers.map(c => getHS(c.id)?.score).filter(s => s != null)
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  }, [customers, healthScores])

  const healthyCount = customers.filter(c => { const s = getHS(c.id)?.score; return s != null && s >= 80 }).length
  const atRiskCount  = customers.filter(c => { const s = getHS(c.id)?.score; return s != null && s < 60 }).length

  const catStats = useMemo(() =>
    categories.filter(c => c !== 'Alle').map(cat => {
      const group = customers.filter(c => c.category === cat)
      const scores = group.map(c => getHS(c.id)?.score).filter(s => s != null)
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      return { cat, count: group.length, avg }
    }),
    [customers, healthScores, categories]
  )

  const timeStats = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const weekEntries  = timeEntries.filter(e => new Date(e.date) >= weekStart)
    const monthEntries = timeEntries.filter(e => new Date(e.date) >= monthStart)
    const weekMins  = weekEntries.reduce((s, e) => s + e.durationMinutes, 0)
    const monthMins = monthEntries.reduce((s, e) => s + e.durationMinutes, 0)
    // Plan = sum of explicitly set per-customer plans only (no global default)
    const perC = timePlanning.perCustomer ?? {}
    const weekPlan  = Object.values(perC).reduce((s, p) => s + (p.weekHours  ?? 0), 0) * 60
    const monthPlan = Object.values(perC).reduce((s, p) => s + (p.monthHours ?? 0), 0) * 60
    const weekScore  = weekPlan  > 0 ? Math.round((weekMins  / weekPlan)  * 100) : null
    const monthScore = monthPlan > 0 ? Math.round((monthMins / monthPlan) * 100) : null
    // Top customers by month hours
    const perCustomer = {}
    monthEntries.forEach(e => { perCustomer[e.customerId] = (perCustomer[e.customerId] ?? 0) + e.durationMinutes })
    const topCustomers = Object.entries(perCustomer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, mins]) => ({ id, mins, name: customers.find(c => c.id === id)?.name ?? id }))
    return { weekMins, monthMins, weekPlan, monthPlan, weekScore, monthScore, topCustomers, recent: [...timeEntries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5) }
  }, [timeEntries, timePlanning, customers])

  const privatStats = useMemo(() => {
    const openTodos  = todos.filter(t => t.customerId === PRIVAT_ID && !t.completed && !t.archived)
    const pinnedNotes = notes.filter(n => n.customerId === PRIVAT_ID && n.pinned)
    const recentNotes = notes.filter(n => n.customerId === PRIVAT_ID).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3)
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const privEntries = timeEntries.filter(e => e.customerId === PRIVAT_ID)
    const weekMins  = privEntries.filter(e => new Date(e.date) >= weekStart).reduce((s, e) => s + e.durationMinutes, 0)
    const monthMins = privEntries.filter(e => new Date(e.date) >= monthStart).reduce((s, e) => s + e.durationMinutes, 0)
    const plan = timePlanning.perCustomer[PRIVAT_ID] ?? {}
    const weekPlan  = (plan.weekHours  ?? timePlanning.globalWeekHours  ?? 0) * 60
    const monthPlan = (plan.monthHours ?? timePlanning.globalMonthHours ?? 0) * 60
    const weekScore  = weekPlan  > 0 ? Math.round((weekMins  / weekPlan)  * 100) : null
    const monthScore = monthPlan > 0 ? Math.round((monthMins / monthPlan) * 100) : null
    return { openTodos, pinnedNotes, recentNotes, weekMins, monthMins, weekScore, monthScore }
  }, [todos, notes, timeEntries, timePlanning])

  const chipStyle = active => ({
    padding: '5px 14px', borderRadius: 'var(--r-pill)', fontSize: 12,
    border: `1px solid ${active ? 'var(--border3)' : 'var(--border)'}`,
    background: active ? 'var(--p5)' : 'transparent',
    color: active ? 'var(--p)' : 'var(--text3)',
    fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.12s',
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Heading */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>Client Overview</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Manage your complete client portfolio</p>
        </div>

        {/* ── Privat Section ── */}
        {(privatStats.openTodos.length > 0 || privatStats.pinnedNotes.length > 0 || privatStats.recentNotes.length > 0) && (
          <div style={{ background: 'var(--bg1)', border: '1px solid rgba(100,116,139,0.25)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(100,116,139,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Privat</span>
                <span style={{ fontSize: 11, color: 'var(--text4)', fontStyle: 'italic' }}>Persönlicher Bereich</span>
              </div>
              <button
                onClick={() => selectCustomer(PRIVAT_ID)}
                style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: 'rgba(100,116,139,0.10)', border: '1px solid rgba(100,116,139,0.20)', padding: '6px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Öffnen →
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Open todos */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Offene Aufgaben</div>
                {privatStats.openTodos.length === 0
                  ? <div style={{ fontSize: 12, color: 'var(--text4)' }}>Keine offenen Aufgaben</div>
                  : privatStats.openTodos.slice(0, 4).map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid rgba(100,116,139,0.4)', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</span>
                    </div>
                  ))
                }
                {privatStats.openTodos.length > 4 && (
                  <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>+{privatStats.openTodos.length - 4} weitere</div>
                )}
              </div>

              {/* Pinned / recent notes */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>
                  {privatStats.pinnedNotes.length > 0 ? 'Gepinnte Notizen' : 'Letzte Notizen'}
                </div>
                {(privatStats.pinnedNotes.length > 0 ? privatStats.pinnedNotes : privatStats.recentNotes).slice(0, 3).map(n => (
                  <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    {n.pinned && (
                      <svg width="10" height="10" fill="#f59e0b" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || 'Neue Notiz'}</span>
                  </div>
                ))}
                {privatStats.pinnedNotes.length === 0 && privatStats.recentNotes.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text4)' }}>Keine Notizen</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Time Tracking Overview ── */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" fill="none" stroke="var(--p)" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={1.75}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6v6l4 2"/></svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Zeiterfassung</span>
            </div>
            <button
              onClick={() => onTimeEntry?.()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--p)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
              Zeit erfassen
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {/* Week */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Diese Woche</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>{fmtMins(timeStats.weekMins)}</div>
              {timeStats.weekPlan > 0 && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>/ {fmtMins(timeStats.weekPlan)} Ziel</div>}
              {timeStats.weekScore != null && (
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, timeStats.weekScore)}%`, background: scoreColor(timeStats.weekScore), borderRadius: 99 }} />
                </div>
              )}
            </div>
            {/* Month */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Dieser Monat</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>{fmtMins(timeStats.monthMins)}</div>
              {timeStats.monthPlan > 0 && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>/ {fmtMins(timeStats.monthPlan)} Ziel</div>}
              {timeStats.monthScore != null && (
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, timeStats.monthScore)}%`, background: scoreColor(timeStats.monthScore), borderRadius: 99 }} />
                </div>
              )}
            </div>
            {/* Healthscore */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Woche Healthscore</div>
              {timeStats.weekScore != null ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: scoreColor(timeStats.weekScore) }}>{timeStats.weekScore}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Ist / Plan</div>
                  {timeStats.weekScore < 50 && (
                    <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>Hinter Plan!</div>
                  )}
                </>
              ) : <div style={{ fontSize: 14, color: 'var(--text4)', marginTop: 4 }}>Keine Planzeit</div>}
            </div>
            {/* Top customers */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Top Kunden (Monat)</div>
              {timeStats.topCustomers.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text4)' }}>Noch keine Einträge</div>
                : timeStats.topCustomers.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{c.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{fmtMins(c.mins)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <svg width="13" height="13" fill="none" stroke="var(--text3)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Filter:</span>
          {[
            { id: 'Alle', label: 'Alle' },
            { id: 'Healthy', label: '✓ Healthy (80+)' },
            { id: 'Warning', label: '⚠ Warning (60-79)' },
            { id: 'At Risk', label: '⚠ At Risk (<60)' },
          ].map(f => (
            <button key={f.id} onClick={() => setHealthFilter(f.id)} style={chipStyle(healthFilter === f.id)}>{f.label}</button>
          ))}
          {categories.filter(c => c !== 'Alle').length > 0 && (
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          )}
          {categories.filter(c => c !== 'Alle').map(cat => (
            <button key={cat} onClick={() => setCatFilter(catFilter === cat ? 'Alle' : cat)} style={chipStyle(catFilter === cat)}>{cat}</button>
          ))}
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Clients" value={customers.length} sub={`${filtered.length} showing`}
            color="var(--blue)"
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
          />
          <StatCard label="Avg Health Score" value={avgScore != null ? `${avgScore}%` : '—'} sub={avgScore != null ? '+5% from last month' : 'Noch keine Scores'}
            color="var(--green)"
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          />
          <StatCard label="Healthy Clients" value={healthyCount} sub="80+ health score"
            color="var(--green)"
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>}
          />
          <StatCard label="At Risk" value={atRiskCount} sub="Needs attention"
            color="var(--red)"
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
          />
        </div>

        {/* Category breakdown */}
        {catStats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(catStats.length, 3)}, 1fr)`, gap: 16, marginBottom: 24 }}>
            {catStats.map(({ cat, count, avg }) => (
              <div key={cat} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{cat}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{count}</span>
                </div>
                <ProgressBar value={avg ?? 0} color={healthColor(avg)} />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{avg != null ? `${avg}% Ø` : 'Kein Score'}</div>
              </div>
            ))}
          </div>
        )}

        {/* Client table */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Client List</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>({filtered.length} clients)</span>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 1fr', padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            {['Client', 'Category', 'Health Score', 'Status', 'Last Activity'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Keine Kunden gefunden</div>
          ) : filtered.map((c, i) => {
            const hs = getHS(c.id)
            const score = hs?.score
            const color = healthColor(score)
            return (
              <div
                key={c.id}
                onClick={() => selectCustomer(c.id)}
                style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 1fr',
                  padding: '14px 24px', cursor: 'pointer',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={c.name} id={c.id} size={28} radius={8} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {c.category
                    ? <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 500 }}>{c.category}</span>
                    : <span style={{ color: 'var(--text4)', fontSize: 12 }}>—</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {score != null ? (
                    <>
                      <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', maxWidth: 80 }}>
                        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 24 }}>{score}</span>
                    </>
                  ) : <span style={{ color: 'var(--text4)', fontSize: 12 }}>—</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {score != null
                    ? <span style={{ fontSize: 12, fontWeight: 500, color }}>{healthLabel(score)}</span>
                    : <span style={{ color: 'var(--text4)', fontSize: 12 }}>—</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{timeAgo(c.updatedAt)}</span>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
