import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Check } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import type { Todo, TodoPriority } from '@/types/todo.types'

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4',
}

export function TaskBoardCard({ todo }: { todo: Todo }) {
  const complete = useTodosStore(s => s.complete)
  const upsert   = useTodosStore(s => s.upsert)
  const isDone   = todo.status === 'done'

  const toggleDone = () => {
    if (isDone) {
      void upsert({
        id: todo.id, title: todo.title, status: 'open', bucket: 'today',
        priority: todo.priority, customerId: todo.customerId,
        checklist: todo.checklist, tags: todo.tags,
      })
    } else {
      void complete(todo.id)
    }
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: todo.id,
    data: { todo },
  })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '8px 10px',
    cursor: 'grab',
    fontSize: 12,
    display: 'flex', flexDirection: 'column', gap: 4,
  }

  const doneCount = todo.checklist.filter(c => c.done).length
  const time = todo.scheduledAt
    ? new Date(todo.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {/* Ein-Klick-Erledigt — stoppt den Drag-Start */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); toggleDone() }}
            aria-label={isDone ? 'Wieder öffnen' : 'Als erledigt markieren'}
            style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              border: `1.5px solid ${isDone ? 'var(--accent)' : 'var(--border-strong)'}`,
              background: isDone ? 'var(--accent)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            {isDone && <Check size={10} strokeWidth={3} style={{ color: 'var(--accent-ink)' }} />}
          </button>
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 6,
            background: `${PRIO_COLOR[todo.priority]}22`,
            color: PRIO_COLOR[todo.priority],
          }}>
            {PRIO_LABEL[todo.priority]}
          </span>
        </div>
        {time && <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{time}</span>}
      </div>
      <div style={{
        fontWeight: 600, color: 'var(--fg)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        textDecoration: todo.status === 'done' ? 'line-through' : 'none',
      }}>
        {todo.title}
      </div>
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
      <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--fg-dim)' }}>
        {todo.checklist.length > 0 && <span>{doneCount}/{todo.checklist.length}</span>}
        {todo.plannedMinutes && <span>⏱ {todo.plannedMinutes}m</span>}
        {todo.tags.map(t => <span key={t}>#{t}</span>)}
      </div>
    </div>
  )
}
