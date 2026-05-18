import { useState, useEffect } from 'react'
import { useAccountsStore } from '@/store/accounts.store'
import { TodoService } from '@/services/todo.service'
import type { Todo } from '@/types/todo.types'

type TodoWithCustomer = Todo & { customerName: string }

const STATUS_COLS: { id: Todo['status']; label: string }[] = [
  { id: 'open',        label: 'Offen' },
  { id: 'in_progress', label: 'In Bearbeitung' },
  { id: 'done',        label: 'Erledigt' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high:   'var(--accent)',
  normal: 'var(--fg-dim)',
  low:    'var(--fg-dim)',
}

function TaskCard({ todo, onRemove }: { todo: TodoWithCustomer; onRemove: (id: string) => void }) {
  return (
    <div className="task-card" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <strong style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, flex: 1 }}>
          {todo.title}
        </strong>
        <button
          onClick={() => onRemove(todo.id)}
          style={{ fontSize: 10, color: 'var(--fg-dim)', flexShrink: 0, opacity: 0, transition: 'opacity 180ms' }}
          className="task-delete"
        >✕</button>
      </div>

      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)',
          background: 'var(--accent-soft)', borderRadius: 99, padding: '2px 7px',
        }}>
          {todo.customerName}
        </span>

        {todo.priority === 'high' && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: 'var(--accent-ink)',
            background: 'var(--accent)', borderRadius: 99, padding: '2px 7px',
          }}>
            Priorität
          </span>
        )}

        {todo.dueDate && (
          <span style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>
            {new Date(todo.dueDate).toLocaleDateString('de')}
          </span>
        )}
      </div>

      {todo.checklist.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-dim)' }}>
          {todo.checklist.filter(c => c.done).length}/{todo.checklist.length} Punkte
        </div>
      )}
    </div>
  )
}

export function TasksRoute() {
  const accounts = useAccountsStore(s => s.accounts)
  const [todos, setTodos]     = useState<TodoWithCustomer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (accounts.length === 0) return
    setLoading(true)
    setError(null)
    Promise.all(
      accounts.map(async a => {
        const customerTodos = await TodoService.getByCustomer(a.id)
        return customerTodos.map(t => ({ ...t, customerName: a.name }))
      })
    )
      .then(results => { setTodos(results.flat()); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [accounts.length])

  const handleRemove = async (id: string) => {
    await TodoService.delete(id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const openCount   = todos.filter(t => t.status !== 'done').length
  const todayCount  = todos.filter(t => t.dueDate?.startsWith(new Date().toISOString().slice(0, 10))).length

  return (
    <div className="main-inner">
      <div className="greeting">
        <h1 className="greeting-title">Tasks<em>.</em></h1>
        <div className="greeting-sub">
          <span>{todos.length} gesamt · {openCount} offen{todayCount > 0 ? ` · ${todayCount} heute fällig` : ''}</span>
          <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{accounts.length} Kunden</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Tasks werden geladen…
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
          Noch keine Kunden angelegt. Erstelle zuerst einen Kunden unter <strong>Clients</strong>.
        </div>
      ) : (
        <div className="kanban">
          {STATUS_COLS.map(col => {
            const items = todos.filter(t => t.status === col.id)
            return (
              <div key={col.id} className="kanban-col">
                <div className="kanban-col-head">
                  <span className="card-label">{col.label}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{items.length}</span>
                </div>
                {items.map(t => (
                  <TaskCard key={t.id} todo={t} onRemove={handleRemove} />
                ))}
                {items.length === 0 && (
                  <div style={{ padding: '12px 4px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center' }}>
                    Keine Tasks
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`.task-card:hover .task-delete { opacity: 1 !important; }`}</style>
    </div>
  )
}
