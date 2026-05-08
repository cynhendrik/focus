import { useState, useEffect } from 'react'
import { useStore } from '../../store'

const CATEGORIES = ['Meeting', 'Beratung', 'Entwicklung', 'Design', 'Support', 'Sonstiges']

function timeScoreColor(score) {
  if (score == null) return 'var(--text3)'
  if (score >= 80) return 'var(--green)'
  if (score >= 50) return '#f59e0b'
  return 'var(--red)'
}

export function TimeEntryModal({ open, onClose, defaultCustomerId }) {
  const customers      = useStore(s => s.customers)
  const timeEntries    = useStore(s => s.timeEntries)
  const timePlanning   = useStore(s => s.timePlanning)
  const addTimeEntry   = useStore(s => s.addTimeEntry)

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    customerId: defaultCustomerId ?? '',
    date: today,
    hours: 1,
    minutes: 0,
    description: '',
    category: '',
  })

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, customerId: defaultCustomerId ?? '', date: today }))
    }
  }, [open, defaultCustomerId])

  if (!open) return null

  const selectedCustomer = customers.find(c => c.id === form.customerId)

  // Compute stats for selected customer
  const stats = (() => {
    if (!form.customerId) return null
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const entries = timeEntries.filter(e => e.customerId === form.customerId)
    const weekMins = entries.filter(e => new Date(e.date) >= weekStart).reduce((s, e) => s + e.durationMinutes, 0)
    const monthMins = entries.filter(e => new Date(e.date) >= monthStart).reduce((s, e) => s + e.durationMinutes, 0)
    const plan = timePlanning.perCustomer[form.customerId] ?? {}
    const weekPlan = (plan.weekHours ?? timePlanning.globalWeekHours ?? 0) * 60
    const monthPlan = (plan.monthHours ?? timePlanning.globalMonthHours ?? 0) * 60
    const weekScore = weekPlan > 0 ? Math.round((weekMins / weekPlan) * 100) : null
    const monthScore = monthPlan > 0 ? Math.round((monthMins / monthPlan) * 100) : null
    return { weekMins, monthMins, weekPlan, monthPlan, weekScore, monthScore }
  })()

  const fmt = (mins) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  const handleSave = () => {
    if (!form.customerId || (!form.hours && !form.minutes)) return
    const durationMinutes = (Number(form.hours) * 60) + Number(form.minutes)
    if (durationMinutes <= 0) return
    addTimeEntry({
      customerId: form.customerId,
      date: form.date,
      durationMinutes,
      description: form.description.trim(),
      category: form.category,
    })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: 440, background: 'var(--bg1)', borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border2)', boxShadow: '0 24px 60px rgba(0,0,0,0.20)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--p5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--p)' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth={1.75}/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6v6l4 2"/>
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Zeit erfassen</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: 'inherit' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Customer */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Kunde *</label>
            <select
              value={form.customerId}
              onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: form.customerId ? 'var(--text)' : 'var(--text3)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            >
              <option value="">Kunde wählen...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Stats preview for selected customer */}
          {stats && (
            <div style={{ background: 'var(--bg2)', borderRadius: 'var(--r-md)', padding: '12px 14px', display: 'flex', gap: 16 }}>
              <StatPill label="Diese Woche" value={fmt(stats.weekMins)} planned={stats.weekPlan > 0 ? fmt(stats.weekPlan) : null} score={stats.weekScore} />
              <div style={{ width: 1, background: 'var(--border)' }} />
              <StatPill label="Dieser Monat" value={fmt(stats.monthMins)} planned={stats.monthPlan > 0 ? fmt(stats.monthPlan) : null} score={stats.monthScore} />
            </div>
          )}

          {/* Date */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Datum</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Duration */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Dauer *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="number" min={0} max={99}
                  value={form.hours}
                  onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                  style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text3)', pointerEvents: 'none' }}>h</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="number" min={0} max={59}
                  value={form.minutes}
                  onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))}
                  style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text3)', pointerEvents: 'none' }}>min</span>
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Kategorie</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: form.category ? 'var(--text)' : 'var(--text3)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            >
              <option value="">Kategorie wählen...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Beschreibung</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Was wurde gemacht? (optional)"
              rows={2}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={!form.customerId || (Number(form.hours) === 0 && Number(form.minutes) === 0)}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 'var(--r-md)',
                background: 'var(--p)', border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.15s', opacity: (!form.customerId || (Number(form.hours) === 0 && Number(form.minutes) === 0)) ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--p2)' }}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
            >
              Speichern
            </button>
            <button
              onClick={onClose}
              style={{ padding: '11px 18px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatPill({ label, value, planned, score }) {
  const color = score == null ? 'var(--text3)' : score >= 80 ? 'var(--green)' : score >= 50 ? '#f59e0b' : 'var(--red)'
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{value}</span>
      {planned && <span style={{ fontSize: 11, color: 'var(--text3)' }}>/ {planned} geplant</span>}
      {score != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color }}>
          {score}% Healthscore
        </span>
      )}
    </div>
  )
}
