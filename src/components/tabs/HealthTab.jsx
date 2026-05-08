import { useMemo } from 'react'
import { useStore } from '../../store'
import { healthColor, healthLabel, healthStatus } from '../../utils/helpers'
import { computeHealthScore } from '../../utils/healthScore'

// ── Circular gauge ────────────────────────────────────────────────────────────
function GaugeRing({ score, color }) {
  const size   = 200
  const cx     = size / 2
  const cy     = size / 2
  const r      = 78
  // 270° arc (gap at bottom). Start from 135° (bottom-left), sweep 270° clockwise.
  const sweep  = 270
  const startDeg = 135
  const toRad  = d => (d * Math.PI) / 180

  function arcPath(pct) {
    const endDeg = startDeg + sweep * pct
    const x1 = cx + r * Math.cos(toRad(startDeg))
    const y1 = cy + r * Math.sin(toRad(startDeg))
    const x2 = cx + r * Math.cos(toRad(endDeg))
    const y2 = cy + r * Math.sin(toRad(endDeg))
    const large = sweep * pct > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  const trackPath = arcPath(1)
  const fillPath  = arcPath(Math.max(0.001, score / 100))

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          {/* Track */}
          <path d={trackPath} fill="none" stroke="var(--bg3)" strokeWidth="10" strokeLinecap="round" />
          {/* Fill */}
          <path d={fillPath}  fill="none" stroke={color}       strokeWidth="10" strokeLinecap="round" />
        </svg>
        {/* Center text */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: '-0.05em', color: 'var(--text)', lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text4)', marginTop: 4 }}>Health Score</div>
        </div>
      </div>
    </div>
  )
}

// ── Metric card ────────────────────────────────────────────────────────────────
function MetricCard({ icon, iconBg, title, value, badge, sub, barPct, barColor }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sub ? 4 : 12 }}>
        <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--text)' }}>{value}</span>
        {badge && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: 'rgba(124,58,237,0.12)', color: 'var(--p)' }}>{badge}</span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>{sub}</div>}
      {barPct != null && (
        <div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 99, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: barColor?.startsWith?.('linear') ? '#7C3AED' : barColor }}>{barPct}%</div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function HealthTab({ customerId }) {
  const customers            = useStore(s => s.customers)
  const todos                = useStore(s => s.todos)
  const kpis                 = useStore(s => s.kpis)
  const notes                = useStore(s => s.notes)
  const deadlines            = useStore(s => s.deadlines)
  const instagramConnections = useStore(s => s.instagramConnections)
  const instagramCache       = useStore(s => s.instagramCache)

  const { score, factors } = useMemo(() =>
    computeHealthScore(customerId, { customers, todos, kpis, notes, deadlines, instagramConnections, instagramCache }),
    [customerId, customers, todos, kpis, notes, deadlines, instagramConnections, instagramCache]
  )

  const customer = customers.find(c => c.id === customerId)
  const hColor   = healthColor(score)
  const hStatus  = healthStatus(score)

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const positivePts = factors.filter(f => f.positive).reduce((s, f) => s + parseInt(f.pts), 0)
  const negativePts = factors.filter(f => !f.positive).reduce((s, f) => s + Math.abs(parseInt(f.pts)), 0)
  const maxPosPts   = 61 // sum of all possible positive pts
  const maxNegPts   = 50

  const activityPct = Math.min(100, Math.round((positivePts / maxPosPts) * 100))
  const riskPct     = Math.min(100, Math.round((negativePts / maxNegPts) * 100))

  const activityLabel = activityPct >= 70 ? 'Hoch' : activityPct >= 40 ? 'Mittel' : 'Niedrig'
  const riskLabel     = riskPct     <= 20 ? 'Niedrig' : riskPct <= 50 ? 'Mittel' : 'Hoch'
  const riskColor     = riskPct     <= 20 ? '#F59E0B' : riskPct <= 50 ? '#F59E0B' : '#EF4444'

  // KPI trend
  const kpiTrend = useMemo(() => {
    const myKpis = kpis.filter(k => k.customerId === customerId)
    if (!myKpis.length) return null
    const names = [...new Set(myKpis.map(k => k.name))]
    let totalGrowth = 0, count = 0
    names.forEach(name => {
      const sorted = myKpis.filter(k => k.name === name).sort((a, b) => new Date(a.date) - new Date(b.date))
      if (sorted.length < 2) return
      const lv = parseFloat(sorted[sorted.length - 1].value)
      const pv = parseFloat(sorted[sorted.length - 2].value)
      if (!isNaN(lv) && !isNaN(pv) && pv !== 0) { totalGrowth += ((lv - pv) / Math.abs(pv)) * 100; count++ }
    })
    if (!count) return null
    return Math.round(totalGrowth / count)
  }, [kpis, customerId])

  const kpiLabel = kpiTrend == null ? 'Keine Daten' : kpiTrend > 0 ? 'Positiv' : kpiTrend < 0 ? 'Negativ' : 'Stabil'
  const kpiPct   = kpiTrend == null ? 0 : Math.min(100, Math.max(0, 50 + kpiTrend))

  // Chancen score
  const chancenPts =
    (score >= 70 ? 25 : score >= 50 ? 12 : 0) +
    (riskPct <= 20 ? 25 : 0) +
    (todos.filter(t => t.customerId === customerId && !t.completed).length === 0 ? 25 : 0) +
    (kpiTrend != null && kpiTrend > 0 ? 25 : 0)
  const chancenLabel = chancenPts >= 75 ? 'Hoch' : chancenPts >= 50 ? 'Mittel' : 'Niedrig'

  // AI interpretation text
  const aiText = useMemo(() => {
    if (!customer) return ''
    const name = customer.name
    const topPos = factors.filter(f => f.positive).slice(0, 2).map(f => f.label).join(', ')
    const topNeg = factors.filter(f => !f.positive).slice(0, 1).map(f => f.label)[0]

    if (hStatus === 'healthy') {
      return `${name} zeigt starke Aktivität${topPos ? ` — besonders durch: ${topPos}` : ''}. Der Health Score liegt bei ${score}/100, was auf eine gesunde und aktive Kundenbeziehung hindeutet. Empfehlung: Momentum halten und Upsell-Potenzial prüfen.`
    }
    if (hStatus === 'warning') {
      return `${name} ist grundsätzlich aktiv, aber es gibt Verbesserungspotenzial. ${topNeg ? `Aktuell zieht "${topNeg}" den Score nach unten.` : ''} Empfehlung: Offene Punkte zeitnah abarbeiten, um den Score auf 80+ zu heben.`
    }
    return `${name} benötigt sofortige Aufmerksamkeit. Der Health Score von ${score} liegt im kritischen Bereich. ${topNeg ? `Hauptgrund: "${topNeg}".` : ''} Empfehlung: Alle überfälligen Punkte priorisieren und Kontakt aufnehmen.`
  }, [customer, score, factors, hStatus])

  return (
    <div style={{ padding: '32px 36px', maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Gauge ── */}
      <GaugeRing score={score} color={hColor} />

      {/* ── AI Interpretation ── */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)',
        borderRadius: 'var(--r-xl)', padding: '22px 26px', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>✦</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>AI-Interpretation</span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.95, margin: 0 }}>{aiText}</p>
      </div>

      {/* ── 4 Metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Aktivität */}
        <MetricCard
          title="Aktivität"
          iconBg="rgba(34,197,94,0.12)"
          icon={<svg width="16" height="16" fill="none" stroke="#22C55E" viewBox="0 0 24 24"><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
          value={activityLabel}
          barPct={activityPct}
          barColor="#22C55E"
        />

        {/* KPI-Trend */}
        <MetricCard
          title="KPI-Trend"
          iconBg="rgba(124,58,237,0.12)"
          icon={<svg width="16" height="16" fill="none" stroke="#7C3AED" viewBox="0 0 24 24"><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} points="17 6 23 6 23 12"/></svg>}
          value={kpiLabel}
          badge={kpiTrend != null ? `${kpiTrend > 0 ? '+' : ''}${kpiTrend}%` : null}
          sub={kpiTrend == null ? 'Noch keine KPI-Daten' : kpiTrend > 0 ? 'Wachstum in allen Bereichen' : kpiTrend < 0 ? 'Rückgang erkannt' : 'Keine Veränderung'}
          barPct={kpiPct}
          barColor="#7C3AED"
        />

        {/* Risiko-Score */}
        <MetricCard
          title="Risiko-Score"
          iconBg="rgba(245,158,11,0.12)"
          icon={<svg width="16" height="16" fill="none" stroke="#F59E0B" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" strokeWidth={2}/><circle cx="12" cy="17" r="0.5" fill="#F59E0B" stroke="#F59E0B"/></svg>}
          value={riskLabel}
          barPct={riskPct}
          barColor={riskColor}
        />

        {/* Chancen-Score */}
        <MetricCard
          title="Chancen-Score"
          iconBg="rgba(124,58,237,0.10)"
          icon={<svg width="16" height="16" fill="none" stroke="#7C3AED" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><circle cx="12" cy="12" r="6" strokeWidth={2}/><circle cx="12" cy="12" r="2" strokeWidth={2}/></svg>}
          value={chancenLabel}
          barPct={chancenPts}
          barColor="linear-gradient(90deg, #7C3AED, #EC4899)"
        />
      </div>
    </div>
  )
}
