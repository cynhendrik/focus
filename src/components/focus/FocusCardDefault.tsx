import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo } from '@/types/todo.types'

const PRIO_COLOR: Record<string, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<string, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

interface Props { todo: Todo }

export function FocusCardDefault({ todo }: Props) {
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const accounts        = useAccountsStore(s => s.accounts)
  const account = todo.customerId
    ? accounts.find(a => a.id === todo.customerId)
    : undefined
  const doneCount = todo.checklist.filter(c => c.done).length

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${PRIO_COLOR[todo.priority] ?? PRIO_COLOR.p3}`,
      borderRadius: 18,
      padding: '32px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
    }}>
      <div style={{ display: 'flex', gap: 10, fontSize: 11, alignItems: 'center' }}>
        <span style={{ color: PRIO_COLOR[todo.priority], fontWeight: 700 }}>
          ● {PRIO_LABEL[todo.priority]}
        </span>
        {account && (
          <span style={{ color: 'var(--fg-muted)' }}>· {account.name}</span>
        )}
      </div>

      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 36,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.05,
        margin: 0,
        color: 'var(--fg)',
      }}>
        {todo.title}
      </h1>

      {todo.notes && (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-muted)', margin: 0 }}>
          {todo.notes}
        </p>
      )}

      {todo.checklist.length > 0 && (
        <div>
          <div style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fg-dim)',
            marginBottom: 10,
          }}>
            Teilschritte · {doneCount}/{todo.checklist.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todo.checklist.map(item => (
              <label key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 15,
                cursor: 'pointer',
                color: item.done ? 'var(--fg-muted)' : 'var(--fg)',
              }}>
                <button
                  onClick={() => toggleChecklist(todo.id, item.id)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 99,
                    border: `1.5px solid ${item.done ? 'var(--accent)' : 'var(--border-strong)'}`,
                    background: item.done ? 'var(--accent)' : 'transparent',
                    color: 'var(--accent-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 12,
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
