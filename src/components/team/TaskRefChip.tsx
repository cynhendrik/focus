import { CheckSquare } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'

/** Klickbarer Aufgaben-Chip. Verwaiste Referenz → inaktiv, Label „Aufgabe gelöscht". */
export function TaskRefChip({ taskId }: { taskId: string }) {
  const todo = useTodosStore(s => s.allTodos.find(t => t.id === taskId))
  const openTask = useOpenTask()
  const gone = !todo
  return (
    <button
      onClick={() => { if (!gone) openTask(taskId) }}
      disabled={gone}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4,
        padding: '5px 10px', borderRadius: 8,
        background: gone ? 'oklch(50% 0 0 / 0.06)' : 'var(--accent-soft)',
        color: gone ? 'var(--fg-dim)' : 'var(--accent-ink)',
        border: '1px solid var(--border)', fontSize: 12, fontWeight: 600,
        cursor: gone ? 'default' : 'pointer', maxWidth: '100%',
      }}
    >
      <CheckSquare size={13} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {gone ? 'Aufgabe gelöscht' : todo!.title}
      </span>
      {todo?.dueDate && !gone && (
        <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
          {new Date(todo.dueDate).toLocaleDateString('de', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </button>
  )
}
