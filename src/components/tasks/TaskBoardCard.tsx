import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: todo.id,
    data: { todo },
  })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 12,
    cursor: 'grab',
    fontSize: 12.5,
    display: 'flex', flexDirection: 'column', gap: 6,
  }

  const doneCount = todo.checklist.filter(c => c.done).length
  const time = todo.scheduledAt
    ? new Date(todo.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 6,
          background: `${PRIO_COLOR[todo.priority]}22`,
          color: PRIO_COLOR[todo.priority],
        }}>
          {PRIO_LABEL[todo.priority]}
        </span>
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
