// src/components/tasks/TaskRow.tsx
import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo, TodoPriority } from '@/types/todo.types'
import { Trash2 } from 'lucide-react'

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4',
}

interface Props { todo: Todo }

export function TaskRow({ todo }: Props) {
  const [open, setOpen] = useState(false)
  const accounts        = useAccountsStore(s => s.accounts)
  const complete        = useTodosStore(s => s.complete)
  const remove          = useTodosStore(s => s.remove)
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const upsert          = useTodosStore(s => s.upsert)

  const customer = todo.customerId ? accounts.find(c => c.id === todo.customerId) : undefined
  const doneCount = todo.checklist.filter(c => c.done).length

  const onToggleDone = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (todo.status === 'done') {
      upsert({
        id: todo.id, customerId: todo.customerId, title: todo.title,
        status: 'open', bucket: 'backlog', priority: todo.priority,
        scheduledAt: todo.scheduledAt, plannedMinutes: todo.plannedMinutes,
        notes: todo.notes, aiSummary: todo.aiSummary,
        checklist: todo.checklist, tags: todo.tags,
      })
    } else {
      complete(todo.id)
    }
  }

  const timeLabel = todo.scheduledAt
    ? new Date(todo.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        padding: '12px 14px 12px 18px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 12,
        cursor: 'pointer',
        opacity: todo.status === 'done' ? 0.6 : 1,
        transition: 'border-color 180ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
        borderRadius: 99,
        background: PRIO_COLOR[todo.priority],
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onToggleDone}
          style={{
            width: 18, height: 18, borderRadius: 99,
            border: `1.5px solid ${todo.status === 'done' ? 'var(--accent)' : 'var(--border-strong)'}`,
            background: todo.status === 'done' ? 'var(--accent)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontSize: 10, color: 'var(--accent-ink)',
          }}
        >
          {todo.status === 'done' ? '✓' : ''}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontSize: 13.5, fontWeight: 500,
            color: 'var(--fg)',
            textDecoration: todo.status === 'done' ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {todo.title}
          </span>
          {todo.aiSummary && (
            <span style={{
              display: 'block',
              fontSize: 11,
              color: 'var(--fg-dim)',
              marginTop: 2,
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}>
              {todo.aiSummary}
            </span>
          )}
        </div>

        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 6,
          background: `${PRIO_COLOR[todo.priority]}22`,
          color: PRIO_COLOR[todo.priority],
        }}>
          {PRIO_LABEL[todo.priority]}
        </span>

        {timeLabel && (
          <span style={{
            fontSize: 11.5, color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            {timeLabel}
          </span>
        )}

        {todo.checklist.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
            {doneCount}/{todo.checklist.length}
          </span>
        )}

        {todo.plannedMinutes && (
          <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
            {todo.plannedMinutes}m
          </span>
        )}
      </div>

      {((todo.tags.length > 0) || customer) && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 6, marginLeft: 28,
          fontSize: 11, color: 'var(--fg-dim)',
        }}>
          {customer && <span>● {customer.name}</span>}
          {todo.tags.map(t => <span key={t}>#{t}</span>)}
        </div>
      )}

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            marginTop: 12, marginLeft: 28,
            paddingTop: 12, borderTop: '1px dashed var(--border)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          {todo.checklist.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="card-label">Teilschritte</div>
              {todo.checklist.map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleChecklist(todo.id, item.id)}
                  />
                  <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--fg-muted)' : 'var(--fg)' }}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          )}

          {todo.notes && (
            <div>
              <div className="card-label">Notiz</div>
              <div style={{
                fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-2)',
                padding: '8px 10px', borderRadius: 8,
                background: 'oklch(50% 0 0 / 0.04)',
              }}>
                {todo.notes}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => remove(todo.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: 'var(--fg-dim)',
                padding: '4px 8px', borderRadius: 6,
                background: 'transparent',
              }}
            >
              <Trash2 size={12} />
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
