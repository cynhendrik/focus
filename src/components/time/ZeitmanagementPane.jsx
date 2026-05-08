import { useState, useMemo } from 'react'
import { useStore } from '../../store'

const CATEGORY_COLORS = {
  Meeting:     '#8b5cf6',
  Beratung:    '#3b82f6',
  Entwicklung: '#10b981',
  Design:      '#f59e0b',
  Support:     '#ef4444',
  Sonstiges:   'var(--text3)',
}

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

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function ScoreCircle({ score, size = 56 }) {
  const color = scoreColor(score)
  const r = (size / 2) - 5
  const circ = 2 * Math.PI * r
  const dash = score != null ? circ * Math.min(score, 100) / 100 : 0
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg3)" strokeWidth={4} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1 }}>{score != null ? `${score}%` : '—'}</span>
      </div>
    </div>
  )
}

function ProgressBar({ value, color }) {
  return (
    <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${Math.min(100, value ?? 0)}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export function ZeitmanagementPane({ customerId, onAddEntry }) {
  const customers       = useStore(s => s.customers)
  const timeEntries     = useStore(s => s.timeEntries)
  const timePlanning    = useStore(s => s.timePlanning)
  const deleteTimeEntry = useStore(s => s.deleteTimeEntry)
  const setCustomerPlanHours = useStore(s => s.setCustomerPlanHours)

  const [showAll,      setShowAll]      = useState(false)
  const [editPlan,     setEditPlan]     = useState(false)
  const [planWeek,     setPlanWeek]     = useState('')
  const [planMonth,    setPlanMonth]    = useState('')

  const customer = customers.find(c => c.id === customerId)
  const customerPlan = timePlanning.perCustomer[customerId] ?? {}

  const { weekMins, monthMins, weekPlan, monthPlan, weekScore, monthScore, entries } = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const all = timeEntries
      .filter(e => e.customerId === customerId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    const weekMins = all.filter(e => new Date(e.date) >= weekStart).reduce((s, e) => s + e.durationMinutes, 0)
    const monthMins = all.filter(e => new Date(e.date) >= monthStart).reduce((s, e) => s + e.durationMinutes, 0)
    const weekHours = customerPlan.weekHours ?? timePlanning.globalWeekHours ?? 0
    const monthHours = customerPlan.monthHours ?? timePlanning.globalMonthHours ?? 0
    const weekPlan = weekHours * 60
    const monthPlan = monthHours * 60
    const weekScore = weekPlan > 0 ? Math.round((weekMins / weekPlan) * 100) : null
    const monthScore = monthPlan > 0 ? Math.round((monthMins / monthPlan) * 100) : null
    return { weekMins, monthMins, weekPlan, monthPlan, weekScore, monthScore, entries: all }
  }, [timeEntries, customerId, timePlanning, customerPlan])

  const visible = showAll ? entries : entries.slice(0, 8)

  const openEditPlan = () => {
    setPlanWeek(customerPlan.weekHours ?? '')
    setPlanMonth(customerPlan.monthHours ?? '')
    setEditPlan(true)
  }
  const savePlan = () => {
    const w = Number(planWeek)
    const m = Number(planMonth)
    setCustomerPlanHours(customerId, {
      weekHours:  w > 0 ? w : undefined,
      monthHours: m > 0 ? m : undefined,
    })
    setEditPlan(false)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 2 }}>Zeitmanagement</h3>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{customer?.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={openEditPlan}
            style={{ padding: '8px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Planzeit setzen
          </button>
          <button
            onClick={onAddEntry}
            style={{ padding: '8px 14px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--p)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
            Zeit erfassen
          </button>
        </div>
      </div>

      {/* Plan edit inline */}
      {editPlan && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border3)', borderRadius: 'var(--r-lg)', padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Planzeit für {customer?.name}:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={0} value={planWeek} onChange={e => setPlanWeek(e.target.value)} placeholder={timePlanning.globalWeekHours} style={{ width: 70, padding: '6px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>h/Woche</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={0} value={planMonth} onChange={e => setPlanMonth(e.target.value)} placeholder={timePlanning.globalMonthHours} style={{ width: 70, padding: '6px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>h/Monat</span>
          </div>
          <button onClick={savePlan} style={{ padding: '6px 14px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--p)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Speichern</button>
          <button onClick={() => setEditPlan(false)} style={{ padding: '6px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
        </div>
      )}

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Week */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Diese Woche</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>{fmtMins(weekMins)}</div>
          {weekPlan > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>von {fmtMins(weekPlan)} geplant</div>
              <ProgressBar value={weekScore} color={scoreColor(weekScore)} />
            </>
          )}
        </div>
        {/* Month */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Dieser Monat</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>{fmtMins(monthMins)}</div>
          {monthPlan > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>von {fmtMins(monthPlan)} geplant</div>
              <ProgressBar value={monthScore} color={scoreColor(monthScore)} />
            </>
          )}
        </div>
        {/* Healthscore */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <ScoreCircle score={weekScore} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>Healthscore</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor(weekScore) }}>
              {weekScore == null ? 'Keine Planzeit' : weekScore >= 80 ? 'Im Plan' : weekScore >= 50 ? 'Hinter Plan' : 'Kritisch'}
            </div>
            {weekScore != null && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Ist / Plan × 100</div>
            )}
          </div>
        </div>
      </div>

      {/* Time entries list */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Zeiteinträge</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{entries.length} gesamt</span>
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Noch keine Zeiteinträge für diesen Kunden.
          </div>
        ) : (
          <>
            {visible.map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr 80px 90px 28px',
                  alignItems: 'center', gap: 12,
                  padding: '12px 20px',
                  borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtDate(e.date)}</span>
                <div>
                  {e.description
                    ? <span style={{ fontSize: 13, color: 'var(--text)' }}>{e.description}</span>
                    : <span style={{ fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Kein Beschreibung</span>
                  }
                </div>
                {e.category
                  ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${CATEGORY_COLORS[e.category] ?? 'var(--bg3)'}20`, color: CATEGORY_COLORS[e.category] ?? 'var(--text3)' }}>{e.category}</span>
                  : <span />
                }
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>{fmtMins(e.durationMinutes)}</span>
                <button
                  onClick={() => deleteTimeEntry(e.id)}
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: 'inherit' }}
                  onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(239,68,68,0.10)'; ev.currentTarget.style.color = 'var(--red)' }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = 'var(--text4)' }}
                >×</button>
              </div>
            ))}
            {entries.length > 8 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                <button
                  onClick={() => setShowAll(s => !s)}
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--p)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {showAll ? 'Weniger anzeigen' : `Alle ${entries.length} Einträge anzeigen`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
