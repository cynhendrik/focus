// src/components/tasks/TasksListView.tsx
import { useMemo, useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { TaskRow } from './TaskRow'
import { TaskComposer } from './TaskComposer'
import type { Todo } from '@/types/todo.types'

type GroupBy = 'time' | 'priority'

function dayDiff(iso: string | undefined): number | null {
  if (!iso) return null
  const date = new Date(iso); date.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((date.getTime() - today.getTime()) / 86_400_000)
}

function timeSection(t: Todo): string {
  const d = dayDiff(t.scheduledAt)
  if (t.status === 'done') return 'erledigt'
  if (d === 0)             return 'heute'
  if (d === 1)             return 'morgen'
  if (d !== null && d >= 2 && d <= 6) return 'woche'
  if (d !== null && d > 6) return 'spaeter'
  return 'backlog'
}

const TIME_SECTIONS: { id: string; label: string }[] = [
  { id: 'heute',    label: 'Heute' },
  { id: 'morgen',   label: 'Morgen' },
  { id: 'woche',    label: 'Diese Woche' },
  { id: 'spaeter',  label: 'Später' },
  { id: 'backlog',  label: 'Backlog' },
  { id: 'erledigt', label: 'Erledigt' },
]

const PRIORITY_SECTIONS = [
  { id: 'p1', label: 'P1 — Dringend' },
  { id: 'p2', label: 'P2 — Hoch'     },
  { id: 'p3', label: 'P3 — Normal'   },
  { id: 'p4', label: 'P4 — Niedrig'  },
]

interface Props { customerId?: string }

export function TasksListView({ customerId }: Props = {}) {
  const allTodos = useTodosStore(s => s.allTodos)
  const todos = useMemo(
    () => customerId ? allTodos.filter(t => t.customerId === customerId) : allTodos,
    [allTodos, customerId],
  )
  const [groupBy, setGroupBy] = useState<GroupBy>('time')

  const grouped = useMemo(() => {
    const map: Record<string, Todo[]> = {}
    for (const t of todos) {
      const key = groupBy === 'time' ? timeSection(t) : t.priority
      ;(map[key] ??= []).push(t)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const sa = a.scheduledAt ?? ''
        const sb = b.scheduledAt ?? ''
        if (sa !== sb) return sa.localeCompare(sb)
        return a.priority.localeCompare(b.priority)
      })
    }
    return map
  }, [todos, groupBy])

  const openCount = todos.filter(t => t.status !== 'done').length
  const doneCount = todos.filter(t => t.status === 'done').length

  const sections = groupBy === 'time' ? TIME_SECTIONS : PRIORITY_SECTIONS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <TaskComposer customerId={customerId} />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="card-label" style={{ marginRight: 4 }}>Gruppieren</span>
          <button
            onClick={() => setGroupBy('time')}
            style={{
              padding: '4px 11px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
              background: groupBy === 'time' ? 'var(--accent)' : 'transparent',
              color:      groupBy === 'time' ? 'var(--accent-ink)' : 'var(--fg-muted)',
              transition: 'background 160ms, color 160ms',
            }}
          >Zeit</button>
          <button
            onClick={() => setGroupBy('priority')}
            style={{
              padding: '4px 11px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
              background: groupBy === 'priority' ? 'var(--accent)' : 'transparent',
              color:      groupBy === 'priority' ? 'var(--accent-ink)' : 'var(--fg-muted)',
              transition: 'background 160ms, color 160ms',
            }}
          >Priorität</button>
        </div>
        <span style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>
          {openCount} offen · {doneCount} erledigt
        </span>
      </div>

      {sections.map(sec => {
        const items = grouped[sec.id] ?? []
        if (items.length === 0) return null
        const isErledigt = sec.id === 'erledigt'
        return (
          <section key={sec.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              paddingBottom: 6,
              borderBottom: '1px solid var(--border)',
            }}>
              <h3 style={{
                fontSize: 12, fontWeight: 700,
                color: isErledigt ? 'var(--fg-muted)' : 'var(--fg)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: 0,
              }}>
                {sec.label}
              </h3>
              <span style={{
                fontSize: 10.5, color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)',
              }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(t => <TaskRow key={t.id} todo={t} />)}
            </div>
          </section>
        )
      })}

      {todos.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '64px 0',
          color: 'var(--fg-dim)', fontSize: 13,
        }}>
          Noch keine Tasks. Tippe oben deinen ersten ein —<br/>
          <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
            „!! morgen 10:00 Brand finalisieren" reicht.
          </span>
        </div>
      )}
    </div>
  )
}
