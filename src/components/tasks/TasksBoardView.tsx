import { useMemo } from 'react'
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useTodosStore } from '@/store/todos.store'
import type { Todo, TodoBucket } from '@/types/todo.types'
import { TaskBoardCard } from './TaskBoardCard'
import { TaskComposer } from './TaskComposer'

const COLUMNS: { id: TodoBucket; label: string; hint: string }[] = [
  { id: 'backlog',     label: 'Backlog',    hint: 'Alles offene' },
  { id: 'today',       label: 'Heute',      hint: 'Heute geplant' },
  { id: 'in_progress', label: 'In Arbeit',  hint: 'Gerade dran' },
  { id: 'done',        label: 'Erledigt',   hint: 'Geschafft' },
]

function DropColumn({
  id, label, hint, items,
}: { id: TodoBucket; label: string; hint: string; items: Todo[] }) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const visible = id === 'done' ? items.slice(-10) : items
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 0,
        background: isOver ? 'var(--accent-soft)' : 'oklch(50% 0 0 / 0.03)',
        border: '1px solid var(--border)',
        borderRadius: 14, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'background 180ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{label}</h4>
          <p style={{ fontSize: 10.5, color: 'var(--fg-dim)', margin: 0, marginTop: 2 }}>{hint}</p>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
        {visible.length === 0 && (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 10,
            padding: 12, textAlign: 'center',
            fontSize: 11, color: 'var(--fg-dim)',
          }}>
            – hierher ziehen –
          </div>
        )}
        {visible.map(t => <TaskBoardCard key={t.id} todo={t} />)}
      </div>
    </div>
  )
}

interface Props { customerId?: string }

export function TasksBoardView({ customerId }: Props = {}) {
  const allTodos  = useTodosStore(s => s.allTodos)
  const setBucket = useTodosStore(s => s.setBucket)

  const todos = useMemo(
    () => customerId ? allTodos.filter(t => t.customerId === customerId) : allTodos,
    [allTodos, customerId],
  )

  const byBucket = useMemo(() => {
    const map: Record<TodoBucket, Todo[]> = {
      backlog: [], today: [], in_progress: [], done: [],
    }
    for (const t of todos) (map[t.bucket] ??= []).push(t)
    return map
  }, [todos])

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return
    const newBucket = e.over.id as TodoBucket
    setBucket(String(e.active.id), newBucket)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TaskComposer customerId={customerId} />
      <DndContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          {COLUMNS.map(col => (
            <DropColumn key={col.id} {...col} items={byBucket[col.id] ?? []} />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
