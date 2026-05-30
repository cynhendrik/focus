// src/components/tasks/TasksHeader.tsx
import { useUiStore } from '@/store/ui.store'
import { Sparkles, List, LayoutGrid, Target } from 'lucide-react'

interface Props {
  total: number
  completedToday: number
  plannedHours: number
  onOpenCyPanel: () => void
}

const TABS = [
  { id: 'list',  label: 'Liste', icon: List       },
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'focus', label: 'Fokus', icon: Target     },
] as const

export function TasksHeader({ total, completedToday, plannedHours, onOpenCyPanel }: Props) {
  const tasksTab    = useUiStore(s => s.tasksTab)
  const setTasksTab = useUiStore(s => s.setTasksTab)

  const denominator = Math.max(total, 1)
  const ringPct = Math.min(100, (completedToday / denominator) * 100)

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 18,
      padding: '14px 0 20px',
    }}>
      {/* Ring */}
      <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="26" fill="none"
            stroke="oklch(50% 0 0 / 0.15)" strokeWidth="4" />
          <circle cx="30" cy="30" r="26" fill="none"
            stroke="var(--accent)" strokeWidth="4"
            strokeDasharray={`${(ringPct / 100) * 163.36} 163.36`}
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
            style={{ transition: 'stroke-dasharray 400ms' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 600, color: 'var(--fg)',
          fontFamily: 'var(--font-mono)',
        }}>
          {completedToday}/{total}
        </div>
      </div>

      {/* Stats */}
      <div style={{ flex: 1 }}>
        <div className="card-label" style={{ marginBottom: 4 }}>TAGESPLAN</div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600,
          letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0,
        }}>
          {total - completedToday} Aufgaben offen
        </h1>
        <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          ⏱ {plannedHours.toFixed(1)}h eingeplant · {total} gesamt
        </div>
      </div>

      {/* Cy-Button */}
      <button
        onClick={onOpenCyPanel}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 99,
          background: 'var(--accent-soft)', color: 'var(--accent-ink)',
          fontSize: 13, fontWeight: 600,
          border: '1px solid var(--accent)',
        }}
      >
        <Sparkles size={14} />
        Cy · Tag planen
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
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 99,
                fontSize: 12.5, fontWeight: 600,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
                transition: 'background 180ms, color 180ms',
              }}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
