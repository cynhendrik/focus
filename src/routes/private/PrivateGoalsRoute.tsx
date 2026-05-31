// ─────────────────────────────────────────────────────────────────────────────
// Private Ziele — Cards mit Kategorie-Chip, Progress-Bar, +/- Buttons.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Target, Plus, Minus, X, Trash2 } from 'lucide-react'
import {
  usePrivateGoalsStore,
  CATEGORY_LABEL,
  type GoalCategory, type PrivateGoal,
} from '@/store/private-goals.store'

const CATEGORY_TONE: Record<GoalCategory, string> = {
  gesundheit:  'oklch(78% 0.16 145)',  // grün
  lernen:      'oklch(78% 0.14 250)',  // blau
  finanzen:    'oklch(80% 0.16 70)',   // amber
  persoenlich: 'oklch(80% 0.14 320)',  // rose
}

export function PrivateGoalsRoute() {
  const goals  = usePrivateGoalsStore(s => s.goals)
  const [showNew, setShowNew] = useState(false)

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div className="priv-section-label">
        <Target size={11} /> Persönliche Ziele
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 20, marginBottom: 28,
      }}>
        <div style={{ flex: 1 }}>
          <h1 className="priv-title">
            Wohin du willst. <span className="muted">Abseits der Pipeline.</span>
          </h1>
          <p className="priv-subtitle" style={{ marginBottom: 0 }}>
            Deine eigenen Ziele — kein Deal, kein Kunde. Tippe auf <kbd style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 5px',
              borderRadius: 4, background: 'oklch(100% 0 0 / 0.06)',
              color: 'var(--priv-fg-muted)',
            }}>−</kbd> / <kbd style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 5px',
              borderRadius: 4, background: 'oklch(100% 0 0 / 0.06)',
              color: 'var(--priv-fg-muted)',
            }}>+</kbd> um den Fortschritt zu aktualisieren.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="priv-btn-ghost">
          <Plus size={12} /> Ziel
        </button>
      </div>

      <div className="priv-section-label">Aktive Ziele</div>

      {goals.length === 0 ? (
        <div style={{
          padding: '24px 20px', borderRadius: 12,
          border: '1px dashed var(--priv-border)',
          color: 'var(--priv-fg-dim)', fontSize: 12.5,
          textAlign: 'center',
        }}>
          Noch keine Ziele. Tipp oben rechts „+ Ziel" — fang klein an.
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14,
        }}>
          {goals.map(g => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}

      {showNew && <NewGoalModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

// ── GoalCard ────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: PrivateGoal }) {
  const inc    = usePrivateGoalsStore(s => s.increment)
  const dec    = usePrivateGoalsStore(s => s.decrement)
  const remove = usePrivateGoalsStore(s => s.remove)
  const [hover, setHover] = useState(false)
  const pct = Math.round((goal.current / goal.target) * 100)
  const color = CATEGORY_TONE[goal.category]

  return (
    <div
      className="priv-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}
    >
      {/* Kategorie-Chip */}
      <div style={{
        display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 99,
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
        color, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
      }}>
        {CATEGORY_LABEL[goal.category].toUpperCase()}
      </div>

      {/* Titel */}
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--priv-fg)', letterSpacing: '-0.01em' }}>
        {goal.title}
      </div>
      {goal.subtitle && (
        <div style={{ fontSize: 12, color: 'var(--priv-fg-muted)' }}>
          {goal.subtitle}
        </div>
      )}

      {/* Progress */}
      <div style={{
        height: 8, borderRadius: 99,
        background: 'oklch(100% 0 0 / 0.06)',
        overflow: 'hidden',
        marginTop: 4,
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%',
          background: 'var(--priv-accent)',
          transition: 'width 380ms ease-out',
        }} />
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 4,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--priv-fg-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {pct}%
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => dec(goal.id)}
            title="Rueckschritt"
            style={iconBtnStyle}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => inc(goal.id)}
            title="Fortschritt"
            style={iconBtnStyle}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {hover && (
        <button
          onClick={() => remove(goal.id)}
          title="Loeschen"
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 24, height: 24, borderRadius: 7,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--priv-fg-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'oklch(72% 0.18 25)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--priv-fg-dim)' }}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'var(--priv-surface-2)',
  border: '1px solid var(--priv-border)',
  cursor: 'pointer', color: 'var(--priv-fg-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 140ms, color 140ms, border-color 140ms',
}

// ── New-Goal-Modal ──────────────────────────────────────────────────────────

function NewGoalModal({ onClose }: { onClose: () => void }) {
  const create = usePrivateGoalsStore(s => s.create)
  const [category, setCategory] = useState<GoalCategory>('persoenlich')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [target, setTarget] = useState('100')
  const [current, setCurrent] = useState('0')
  const [unit, setUnit] = useState('')

  const submit = () => {
    const t = title.trim()
    if (!t) return
    const targetN  = parseFloat(target) || 100
    const currentN = parseFloat(current) || 0
    create({
      category, title: t, subtitle: subtitle.trim() || undefined,
      current: currentN, target: targetN,
      unit: unit.trim() || undefined,
    })
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'oklch(0% 0 0 / 0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--priv-bg-2)',
          border: '1px solid var(--priv-border)', borderRadius: 16,
          padding: 22,
          boxShadow: '0 30px 80px oklch(0% 0 0 / 0.5)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--priv-fg-dim)', fontWeight: 600,
          }}>
            Neues Ziel
          </span>
          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--priv-fg-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as GoalCategory)}
            className="priv-input"
          >
            {(Object.keys(CATEGORY_LABEL) as GoalCategory[]).map(c => (
              <option key={c} value={c} style={{ background: 'var(--priv-bg)' }}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Titel (z.B. Halbmarathon im September)"
            className="priv-input"
            autoFocus
          />
          <input
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            placeholder="Untertitel (optional, z.B. 20 km — noch 16 Wochen)"
            className="priv-input"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <input
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder="Aktuell"
              className="priv-input"
              type="number"
            />
            <input
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="Ziel"
              className="priv-input"
              type="number"
            />
            <input
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="Einheit"
              className="priv-input"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={onClose} className="priv-btn-ghost">Abbrechen</button>
            <button onClick={submit} className="priv-btn" disabled={!title.trim()}>
              Anlegen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
