// src/components/tasks/TasksHeader.tsx
import { useUiStore } from '@/store/ui.store'
import { Sparkles, List, LayoutGrid, Target } from 'lucide-react'

interface Props {
  total: number
  completedToday: number
  plannedHours: number
  onOpenCyPanel: () => void
  /** Compact = lebt im Kunden-Workflow (Cockpit-Header schon präsent) */
  compact?: boolean
}

const TABS = [
  { id: 'list',  label: 'Liste', icon: List       },
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'focus', label: 'Fokus', icon: Target     },
] as const

export function TasksHeader({
  total, completedToday, plannedHours, onOpenCyPanel, compact = false,
}: Props) {
  const tasksTab    = useUiStore(s => s.tasksTab)
  const setTasksTab = useUiStore(s => s.setTasksTab)

  const denominator = Math.max(total, 1)
  const ringPct = Math.min(100, (completedToday / denominator) * 100)

  // Sizing tokens for both modes
  const ring  = compact ? 38 : 60
  const r     = compact ? 16 : 26
  const sw    = compact ? 3  : 4
  const circ  = 2 * Math.PI * r
  const dash  = (ringPct / 100) * circ
  const titleSize    = compact ? 17 : 28
  const titleWeight  = compact ? 600 : 600
  const padY         = compact ? '4px 0 14px' : '14px 0 20px'
  const gap          = compact ? 14 : 18
  const fontMain     = compact ? 12 : 14

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap,
      padding: padY,
    }}>
      {/* Ring */}
      <div style={{ position: 'relative', width: ring, height: ring, flexShrink: 0 }}>
        <svg width={ring} height={ring} viewBox={`0 0 ${ring} ${ring}`}>
          <circle cx={ring / 2} cy={ring / 2} r={r} fill="none"
            stroke="oklch(50% 0 0 / 0.12)" strokeWidth={sw} />
          <circle cx={ring / 2} cy={ring / 2} r={r} fill="none"
            stroke="var(--accent)" strokeWidth={sw}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
            style={{ transition: 'stroke-dasharray 400ms' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: fontMain - 2, fontWeight: 600, color: 'var(--fg)',
          fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
        }}>
          {completedToday}/{total}
        </div>
      </div>

      {/* Stats */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!compact && (
          <div className="card-label" style={{ marginBottom: 4 }}>TAGESPLAN</div>
        )}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: titleSize, fontWeight: titleWeight,
          letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0,
        }}>
          {total - completedToday} Aufgaben offen
        </h1>
        <div style={{ marginTop: compact ? 2 : 6, fontSize: 11.5, color: 'var(--fg-muted)' }}>
          {plannedHours > 0 && <>⏱ {plannedHours.toFixed(1)}h eingeplant · </>}
          {total} gesamt
        </div>
      </div>

      {/* Cy-Button */}
      <button
        onClick={onOpenCyPanel}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: compact ? '6px 11px' : '10px 16px',
          borderRadius: 99,
          background: compact ? 'transparent' : 'var(--accent-soft)',
          color: compact ? 'var(--fg-muted)' : 'var(--accent-ink)',
          fontSize: compact ? 11.5 : 13, fontWeight: 600,
          border: `1px solid ${compact ? 'var(--border)' : 'var(--accent)'}`,
          transition: 'background 180ms, color 180ms, border-color 180ms',
        }}
        onMouseEnter={e => {
          if (compact) {
            e.currentTarget.style.background = 'var(--accent-soft)'
            e.currentTarget.style.color = 'var(--accent-ink)'
            e.currentTarget.style.borderColor = 'var(--accent)'
          }
        }}
        onMouseLeave={e => {
          if (compact) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--fg-muted)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }
        }}
      >
        <Sparkles size={compact ? 12 : 14} />
        {compact ? 'Cy' : 'Cy · Tag planen'}
      </button>

      {/* Tab-Switcher */}
      <div style={{
        display: 'inline-flex', gap: 2, padding: 3, borderRadius: 99,
        background: 'oklch(50% 0 0 / 0.06)', border: '1px solid var(--border)',
      }}>
        {TABS.map(t => {
          const active = tasksTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTasksTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: compact ? '5px 10px' : '6px 14px',
                borderRadius: 99,
                fontSize: compact ? 11.5 : 12.5, fontWeight: 600,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
                transition: 'background 180ms, color 180ms',
              }}
            >
              <t.icon size={compact ? 12 : 13} />
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
