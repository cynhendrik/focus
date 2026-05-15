import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import type { Todo, ChecklistItem } from '@/types/todo.types'
import { v4 as uuid } from 'uuid'

const STATUS_CYCLE: Record<string, string> = {
  open: 'in_progress', in_progress: 'done', done: 'open',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt',
}
const STATUS_COLOR: Record<string, string> = {
  open: 'bg-gray-400/10 text-gray-400',
  in_progress: 'bg-blue-500/10 text-blue-400',
  done: 'bg-green-500/10 text-green-400',
}

interface Props { customerId: string }

export function WorkflowPane({ customerId }: Props) {
  const todos          = useTodosStore(s => s.todos)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const removeTodo     = useTodosStore(s => s.remove)
  const deadlines      = useDeadlinesStore(s => s.deadlines)
  const upsertDeadline = useDeadlinesStore(s => s.upsert)
  const removeDeadline = useDeadlinesStore(s => s.remove)
  const followUps      = useCrmStore(s => s.followUps)
  const upsertFollowUp = useCrmStore(s => s.upsert)

  const [newTodoTitle, setNewTodoTitle]     = useState('')
  const [expandedTodoId, setExpandedTodoId] = useState<string | null>(null)
  const [newDeadlineTitle, setNewDeadlineTitle] = useState('')
  const [newDeadlineDate, setNewDeadlineDate]   = useState('')
  const [newFollowUpTitle, setNewFollowUpTitle] = useState('')
  const [newFollowUpDate, setNewFollowUpDate]   = useState('')

  const addTodo = async () => {
    if (!newTodoTitle.trim()) return
    await upsertTodo({ customerId, title: newTodoTitle.trim() })
    setNewTodoTitle('')
  }

  const cycleStatus = (todo: Todo) =>
    upsertTodo({ ...todo, status: STATUS_CYCLE[todo.status] as Todo['status'] })

  const toggleChecklistItem = (todo: Todo, itemId: string) => {
    const checklist = todo.checklist.map((c: ChecklistItem) =>
      c.id === itemId ? { ...c, done: !c.done } : c
    )
    upsertTodo({ ...todo, checklist })
  }

  const addChecklistItem = (todo: Todo, text: string) => {
    const item: ChecklistItem = { id: uuid(), text, done: false }
    upsertTodo({ ...todo, checklist: [...todo.checklist, item] })
  }

  const addDeadline = async () => {
    if (!newDeadlineTitle.trim() || !newDeadlineDate) return
    await upsertDeadline({ customerId, title: newDeadlineTitle.trim(), dueDate: newDeadlineDate })
    setNewDeadlineTitle('')
    setNewDeadlineDate('')
  }

  const addFollowUp = async () => {
    if (!newFollowUpTitle.trim() || !newFollowUpDate) return
    await upsertFollowUp({ customerId, title: newFollowUpTitle.trim(), dueDate: newFollowUpDate })
    setNewFollowUpTitle('')
    setNewFollowUpDate('')
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      {/* To-Dos */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">To-Dos</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={newTodoTitle}
            onChange={e => setNewTodoTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo()}
            placeholder="Neues To-Do…"
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={addTodo}
            className="px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            +
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {todos.map(todo => (
            <div key={todo.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => cycleStatus(todo)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLOR[todo.status]}`}
                >
                  {STATUS_LABEL[todo.status]}
                </button>
                <span
                  className={`flex-1 text-sm text-[var(--text)] cursor-pointer ${todo.status === 'done' ? 'line-through opacity-50' : ''}`}
                  onClick={() => setExpandedTodoId(expandedTodoId === todo.id ? null : todo.id)}
                >
                  {todo.title}
                </span>
                {todo.priority === 'high' && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                {todo.dueDate && <span className="text-xs text-[var(--text2)] flex-shrink-0">{todo.dueDate}</span>}
                <button onClick={() => removeTodo(todo.id)} className="text-[var(--text2)] hover:text-red-400 text-xs flex-shrink-0">✕</button>
              </div>

              {expandedTodoId === todo.id && (
                <div className="px-4 pb-3 border-t border-[var(--border)] pt-2">
                  {todo.checklist.map((item: ChecklistItem) => (
                    <div key={item.id} className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleChecklistItem(todo, item.id)}
                        className="accent-primary"
                      />
                      <span className={`text-sm text-[var(--text)] ${item.done ? 'line-through opacity-50' : ''}`}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                  <input
                    placeholder="+ Schritt hinzufügen…"
                    className="mt-1 w-full text-sm text-[var(--text2)] bg-transparent focus:outline-none placeholder:text-[var(--text2)]"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        addChecklistItem(todo, e.currentTarget.value.trim())
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Deadlines */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Deadlines</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={newDeadlineTitle}
            onChange={e => setNewDeadlineTitle(e.target.value)}
            placeholder="Titel…"
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="date"
            value={newDeadlineDate}
            onChange={e => setNewDeadlineDate(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={addDeadline} className="px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">+</button>
        </div>
        <div className="flex flex-col gap-1">
          {deadlines.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <input
                type="checkbox"
                checked={d.done}
                onChange={() => upsertDeadline({ ...d, done: !d.done })}
                className="accent-primary"
              />
              <span className={`flex-1 text-sm text-[var(--text)] ${d.done ? 'line-through opacity-50' : ''}`}>{d.title}</span>
              <span className="text-xs text-[var(--text2)]">{d.dueDate}</span>
              <button onClick={() => removeDeadline(d.id)} className="text-[var(--text2)] hover:text-red-400 text-xs">✕</button>
            </div>
          ))}
        </div>
      </section>

      {/* Follow-Ups */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Nächste Schritte</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={newFollowUpTitle}
            onChange={e => setNewFollowUpTitle(e.target.value)}
            placeholder="Nächster Schritt…"
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="date"
            value={newFollowUpDate}
            onChange={e => setNewFollowUpDate(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={addFollowUp} className="px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">+</button>
        </div>
        <div className="flex flex-col gap-1">
          {followUps.filter(f => f.status === 'offen').map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <span className="flex-1 text-sm text-[var(--text)]">{f.title}</span>
              <span className="text-xs text-[var(--text2)]">{f.dueDate}</span>
              <button
                onClick={() => upsertFollowUp({ ...f, status: 'erledigt' })}
                className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500/20"
              >
                Erledigt
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
