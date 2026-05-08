import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line,
} from 'recharts'
import { fmtDate } from '../../utils/helpers'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
}

function pct(a, b) {
  if (!b) return null
  return ((a - b) / Math.abs(b) * 100).toFixed(1)
}

const PURPLE = '#7C3AED'
const PURPLE_LIGHT = 'rgba(124,58,237,0.15)'

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'var(--text)', trend }) {
  const up = trend > 0, dn = trend < 0
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color, lineHeight: 1 }}>{value}</div>
      {(sub || trend != null) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {trend != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: up ? 'var(--green)' : dn ? 'var(--red)' : 'var(--text3)' }}>
              {up ? '↑' : dn ? '↓' : '→'} {Math.abs(trend)}%
            </span>
          )}
          {sub && <span style={{ fontSize: 11, color: 'var(--text4)' }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 14px', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ fontSize: 13, fontWeight: 600, color: p.color ?? PURPLE }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function buildPeriods(reels) {
  const years  = [...new Set(reels.map(r => new Date(r.posted_at).getFullYear()))].sort((a,b) => b-a)
  const months = [...new Set(reels.map(r => {
    const d = new Date(r.posted_at)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }))].sort((a,b) => b.localeCompare(a))
  return { years, months }
}

function filterReels(reels, period, customFrom, customTo) {
  if (period === 'all') return reels
  if (period === 'custom') {
    const from = customFrom ? new Date(customFrom) : null
    const to   = customTo   ? new Date(customTo + 'T23:59:59') : null
    return reels.filter(r => {
      const d = new Date(r.posted_at)
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    })
  }
  if (period.startsWith('q')) {
    const [q, yr] = period.split('-')
    const qNum   = parseInt(q.slice(1))
    const startM = (qNum - 1) * 3
    return reels.filter(r => {
      const d = new Date(r.posted_at)
      return d.getFullYear() === parseInt(yr) && d.getMonth() >= startM && d.getMonth() < startM + 3
    })
  }
  if (period.includes('-')) {
    const [yr, mo] = period.split('-')
    return reels.filter(r => {
      const d = new Date(r.posted_at)
      return d.getFullYear() === parseInt(yr) && d.getMonth() + 1 === parseInt(mo)
    })
  }
  return reels
}

const selectStyle = {
  fontSize: 13, fontWeight: 500,
  padding: '7px 32px 7px 12px',
  borderRadius: 'var(--r-md)',
  border: '1.5px solid var(--border)',
  background: 'var(--bg1)',
  color: 'var(--text)',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
}

const dateInputStyle = {
  fontSize: 13, padding: '7px 10px',
  borderRadius: 'var(--r-md)',
  border: '1.5px solid var(--border)',
  background: 'var(--bg1)',
  color: 'var(--text)',
  outline: 'none',
  fontFamily: 'inherit',
}

export function InstagramDashboard({ reels }) {
  const [period,      setPeriod]      = useState('all')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')

  const { years, months } = useMemo(() => buildPeriods(reels), [reels])
  const filtered = useMemo(() => filterReels(reels, period, customFrom, customTo), [reels, period, customFrom, customTo])

  // Sort reels by date ascending for charts
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at)),
    [filtered]
  )

  // ── Overview stats ──────────────────────────────────────────────────────────
  const totalViews      = filtered.reduce((s, r) => s + (r.views || 0), 0)
  const totalLikes      = filtered.reduce((s, r) => s + (r.likes || 0), 0)
  const totalShares     = filtered.reduce((s, r) => s + (r.shares || 0), 0)
  const totalSaves      = filtered.reduce((s, r) => s + (r.saves || 0), 0)
  const avgViews        = avg(filtered.map(r => r.views || 0))
  const engagementRate  = totalViews ? ((totalLikes + totalShares + totalSaves) / totalViews * 100).toFixed(2) : '—'

  // Trend: compare last half vs first half
  const half = Math.floor(sorted.length / 2)
  const firstHalf  = sorted.slice(0, half)
  const secondHalf = sorted.slice(half)
  const viewsTrend = pct(avg(secondHalf.map(r => r.views)), avg(firstHalf.map(r => r.views)))

  // ── Posting frequency per week ──────────────────────────────────────────────
  const weeklyFreq = useMemo(() => {
    const weeks = {}
    sorted.forEach(r => {
      const d = new Date(r.posted_at)
      const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1)
      const key = mon.toISOString().slice(0, 10)
      if (!weeks[key]) weeks[key] = { week: key, reels: 0, views: 0, likes: 0 }
      weeks[key].reels++
      weeks[key].views += r.views || 0
      weeks[key].likes += r.likes || 0
    })
    return Object.values(weeks).map(w => ({ ...w, label: fmtDate(w.week).slice(0, 5) }))
  }, [sorted])

  // ── Performance over time ───────────────────────────────────────────────────
  const timelineData = useMemo(() =>
    sorted.map(r => ({
      label: fmtDate(r.posted_at).slice(0, 5),
      Views: r.views || 0,
      Likes: r.likes || 0,
      Saves: r.saves || 0,
      Reach: r.reach || 0,
    })),
    [sorted]
  )

  // ── Best posting days ───────────────────────────────────────────────────────
  const dayStats = useMemo(() => {
    const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
    const map = {}
    filtered.forEach(r => {
      const d = new Date(r.posted_at).getDay()
      const name = DAYS[d]
      if (!map[name]) map[name] = { day: name, views: [], count: 0 }
      map[name].views.push(r.views || 0)
      map[name].count++
    })
    return DAYS.map(d => map[d]
      ? { day: d, avgViews: avg(map[d].views), count: map[d].count }
      : { day: d, avgViews: 0, count: 0 }
    )
  }, [filtered])

  // ── Top hashtags ────────────────────────────────────────────────────────────
  const topHashtags = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      (r.hashtags || []).forEach(h => {
        if (!map[h]) map[h] = { tag: h, uses: 0, totalViews: 0 }
        map[h].uses++
        map[h].totalViews += r.views || 0
      })
    })
    return Object.values(map)
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 8)
  }, [filtered])

  // ── Top reels ───────────────────────────────────────────────────────────────
  const topReels = useMemo(() =>
    [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3),
    [filtered]
  )

  const maxViews = Math.max(...filtered.map(r => r.views || 0), 1)

  return (
    <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%' }}>

      {/* ── Period filter ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
            <option value="all">Alle Zeiträume</option>
            {years.map(yr => (
              <optgroup key={yr} label={`${yr}`}>
                <option value={`q1-${yr}`}>Q1 {yr} (Jan–Mrz)</option>
                <option value={`q2-${yr}`}>Q2 {yr} (Apr–Jun)</option>
                <option value={`q3-${yr}`}>Q3 {yr} (Jul–Sep)</option>
                <option value={`q4-${yr}`}>Q4 {yr} (Okt–Dez)</option>
              </optgroup>
            ))}
            <optgroup label="Monate">
              {months.map(m => {
                const [yr, mo] = m.split('-')
                return <option key={m} value={m}>{MONTHS_DE[parseInt(mo) - 1]} {yr}</option>
              })}
            </optgroup>
            <optgroup label="Eigener Zeitraum">
              <option value="custom">Benutzerdefiniert …</option>
            </optgroup>
          </select>
        </div>

        {period === 'custom' && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Von</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={dateInputStyle} />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Bis</span>
            <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   style={dateInputStyle} />
          </>
        )}

        <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 4 }}>
          {filtered.length} Reel{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Overview stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        <StatCard label="Gesamt Views"   value={fmt(totalViews)}   sub={`Ø ${fmt(avgViews)} / Reel`} trend={parseFloat(viewsTrend)} color={PURPLE} />
        <StatCard label="Gesamt Likes"   value={fmt(totalLikes)}   sub={`${filtered.length} Reels`} />
        <StatCard label="Saves"          value={fmt(totalSaves)}   sub="Gesammt gespeichert" />
        <StatCard label="Engagement Rate" value={`${engagementRate}%`} sub="(Likes+Shares+Saves)/Views" />
      </div>

      {/* ── Views over time ── */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 20 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 16, letterSpacing: '-0.01em' }}>Views & Reach über Zeit</h4>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={timelineData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={PURPLE} stopOpacity={0.2} />
                <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22C55E" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={40} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="Views" stroke={PURPLE} strokeWidth={2} fill="url(#viewsGrad)" dot={{ fill: PURPLE, r: 3 }} />
            <Area type="monotone" dataKey="Reach" stroke="#22C55E" strokeWidth={2} fill="url(#reachGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* ── Weekly posting frequency ── */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Postingfrequenz pro Woche</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyFreq} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="reels" name="Reels" fill={PURPLE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Best days ── */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Ø Views nach Wochentag</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dayStats} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={36} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="avgViews" name="Ø Views" fill="rgba(124,58,237,0.5)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* ── Top Reels ── */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Top Reels</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topReels.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? PURPLE : 'var(--bg3)', color: i === 0 ? '#fff' : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.caption?.slice(0, 50) || 'Kein Caption'}
                  </div>
                  <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(r.views / maxViews) * 100}%`, background: PURPLE, borderRadius: 99 }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: PURPLE, flexShrink: 0 }}>{fmt(r.views)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Top Hashtags ── */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Top Hashtags nach Views</h4>
          {topHashtags.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Keine Hashtags gefunden</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topHashtags.map(h => {
                const maxV = topHashtags[0].totalViews
                return (
                  <div key={h.tag} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--p)', fontWeight: 600, minWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#{h.tag}</span>
                    <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(h.totalViews / maxV) * 100}%`, background: PURPLE_LIGHT, borderRadius: 99, border: `1px solid ${PURPLE}` }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 36, textAlign: 'right' }}>{fmt(h.totalViews)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Likes vs Saves scatter (as line) ── */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px' }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Likes · Saves · Shares über Zeit</h4>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={timelineData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={36} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="Likes" stroke={PURPLE} strokeWidth={2} dot={{ fill: PURPLE, r: 3 }} />
            <Line type="monotone" dataKey="Saves" stroke="#22C55E" strokeWidth={2} dot={{ fill: '#22C55E', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
