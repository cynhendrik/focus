import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { Loader } from 'lucide-react'
import type { Todo, UpsertTodoPayload } from '@/types/todo.types'

export function WidgetTodos() {
  const allTodos   = useTodosStore(s => s.allTodos)
  const upsertTodo = useTodosStore(s => s.upsert)
  const [completing, setCompleting] = useState<string | null>(null)

  const todayTodos = allTodos
    .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress'))
    .sort((a, b) => { const p = { p1: 0, p2: 1, p3: 2, p4: 3 }; return (p[a.priority] ?? 9) - (p[b.priority] ?? 9) })
    .slice(0, 5)

  const handleDone = async (todo: Todo) => {
    setCompleting(todo.id)
    try {
      const payload: UpsertTodoPayload = {
        id: todo.id, title: todo.title, status: 'done', bucket: 'done',
        priority: todo.priority, customerId: todo.customerId,
        checklist: todo.checklist, tags: todo.tags,
      }
      await upsertTodo(payload)
    } finally {
      setCompleting(null)
    }
  }

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 160, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(163,230,53,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 12 }}>
        AUFGABEN · HEUTE
      </div>

      <div style={{
        fontSize: 48, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 40px rgba(163,230,53,0.25)', marginBottom: 20,
      }}>
        {todayTodos.length} offen
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {todayTodos.map(todo => (
          <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => handleDone(todo)}
              disabled={completing === todo.id}
              style={{
                width: 18, height: 18, borderRadius: 5,
                border: '1px solid rgba(163,230,53,0.4)',
                background: 'transparent', flexShrink: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(163,230,53,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {completing === todo.id && <Loader size={10} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />}
            </button>
            <span style={{ fontSize: 13, color: '#ddd', flex: 1 }}>{todo.title}</span>
            <span style={{ fontSize: 9, color: 'rgba(163,230,53,0.35)', fontFamily: 'var(--font-mono)' }}>
              {todo.priority.toUpperCase()}
            </span>
          </div>
        ))}
        {todayTodos.length === 0 && (
          <span style={{ fontSize: 13, color: 'rgba(163,230,53,0.4)' }}>Alle Aufgaben erledigt ✓</span>
        )}
      </div>

      <div style={{ width: 40, height: 1, background: 'rgba(163,230,53,0.15)', margin: '16px 0 10px' }} />
      <div style={{ fontSize: 10, color: 'rgba(163,230,53,0.35)' }}>Direkt abhaken</div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
