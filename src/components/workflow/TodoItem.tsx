import type { Todo } from '@/types/todo.types'

interface Props {
  todo: Todo
  onToggle: (id: string, done: boolean) => void
  onDelete: (id: string) => void
}

export function TodoItem({ todo, onToggle, onDelete }: Props) {
  const done = todo.status === 'done'
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg1)] group">
      <input
        type="checkbox"
        checked={done}
        onChange={e => onToggle(todo.id, e.target.checked)}
        className="w-4 h-4 rounded accent-primary cursor-pointer"
      />
      <span className={`flex-1 text-sm ${done ? 'line-through text-[var(--text2)]' : 'text-[var(--text)]'}`}>
        {todo.title}
      </span>
      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}
