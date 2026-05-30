import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo, TodoPriority } from '@/types/todo.types'
import { Sparkles } from 'lucide-react'

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

export function TaskFocusCard({ todo }: { todo: Todo }) {
  const accounts        = useAccountsStore(s => s.accounts)
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const customer = todo.customerId ? accounts.find(c => c.id === todo.customerId) : undefined
  const time = todo.scheduledAt
    ? new Date(todo.scheduledAt).toLocaleString('de', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
    : null
  const doneCount = todo.checklist.filter(c => c.done).length

  return (
    <div style={{
      position: 'relative',
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${PRIO_COLOR[todo.priority]}`,
      borderRadius: 18,
      padding: '28px 32px',
      display: 'flex', flexDirection: 'column', gap: 22,
      boxShadow: '0 8px 30px -10px oklch(0% 0 0 / 0.25)',
    }}>
      <div style={{ display: 'flex', gap: 10, fontSize: 11.5, alignItems: 'center' }}>
        <span style={{ color: PRIO_COLOR[todo.priority], fontWeight: 700 }}>
          ● {PRIO_LABEL[todo.priority]}
        </span>
        {time && <span style={{ color: 'var(--fg-muted)' }}>{time}</span>}
        {customer && <span style={{ color: 'var(--accent-ink)' }}>● {customer.name}</span>}
        {todo.aiSummary && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>● Cy vorbereitet</span>}
      </div>

      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 36, fontWeight: 600,
        letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0,
      }}>
        {todo.title}
      </h1>

      {todo.aiSummary && (
        <div style={{
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent)',
          borderRadius: 12,
          padding: '14px 18px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 700,
            color: 'var(--accent-ink)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 6,
          }}>
            <Sparkles size={12} />
            Cy · Vorbereitet
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg)', margin: 0 }}>
            {todo.aiSummary}
          </p>
        </div>
      )}

      {todo.checklist.length > 0 && (
        <div>
          <div className="card-label" style={{ marginBottom: 10 }}>
            Teilschritte · {doneCount}/{todo.checklist.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todo.checklist.map(item => (
              <label key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 15, cursor: 'pointer',
                color: item.done ? 'var(--fg-muted)' : 'var(--fg)',
              }}>
                <button
                  onClick={() => toggleChecklist(todo.id, item.id)}
                  style={{
                    width: 22, height: 22, borderRadius: 99,
                    border: `1.5px solid ${item.done ? 'var(--accent)' : 'var(--border-strong)'}`,
                    background: item.done ? 'var(--accent)' : 'transparent',
                    color: 'var(--accent-ink)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 12,
                  }}
                >
                  {item.done ? '✓' : ''}
                </button>
                <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
