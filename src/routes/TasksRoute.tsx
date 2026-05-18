import { useFocusStore } from '@/store/focus.store'
import type { FocusBucket, FocusTodo } from '@/types/focus.types'

const BUCKETS: { id: FocusBucket; label: string }[] = [
  { id: 'today',     label: 'Heute'       },
  { id: 'tomorrow',  label: 'Morgen'      },
  { id: 'this_week', label: 'Diese Woche' },
  { id: 'later',     label: 'Später'      },
]

function TaskCard({ todo, onRemove }: { todo: FocusTodo; onRemove: (id: string) => void }) {
  return (
    <div className="task-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <strong style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{todo.title}</strong>
        <button
          onClick={() => onRemove(todo.id)}
          style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8, flexShrink: 0, opacity: 0, transition: 'opacity 180ms' }}
          className="task-delete"
        >
          ✕
        </button>
      </div>
      {todo.customer && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{todo.customer}</div>
      )}
      {todo.notes && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4, lineHeight: 1.4 }}>{todo.notes}</div>
      )}
    </div>
  )
}

export function TasksRoute() {
  const todos  = useFocusStore(s => s.todos)
  const add    = useFocusStore(s => s.add)
  const remove = useFocusStore(s => s.remove)

  return (
    <div className="main-inner">
      <div className="greeting">
        <h1 className="greeting-title">Tasks<em>.</em></h1>
        <div className="greeting-sub">
          <span>{todos.length} aktiv · {todos.filter(t => t.when === 'today').length} heute</span>
          <span>Fokus heute <strong>2h 15m</strong></span>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>Alle Tasks</h2>
        <button className="btn-primary" onClick={() => add({ title: 'Neue Task', when: 'today' })}>
          + Neue Task
        </button>
      </div>

      <div className="kanban">
        {BUCKETS.map(b => {
          const items = todos.filter(t => t.when === b.id)
          return (
            <div key={b.id} className="kanban-col">
              <div className="kanban-col-head">
                <span className="card-label">{b.label}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{items.length}</span>
              </div>
              {items.map(t => (
                <TaskCard key={t.id} todo={t} onRemove={remove} />
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

      <style>{`.task-card:hover .task-delete { opacity: 1 !important; }`}</style>
    </div>
  )
}
