import { useState } from 'react'
import { NotizPane } from './NotizPane'
import { useTodosStore } from '@/store/todos.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import { useCustomersStore } from '@/store/customers.store'
import type { Todo, ChecklistItem } from '@/types/todo.types'
import { v4 as uuid } from 'uuid'

// ── Bucket helpers ──────────────────────────────────────────────────────────

type Bucket = 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'later'

function getBucket(dueDate?: string): Bucket {
  if (!dueDate) return 'later'
  const due = new Date(dueDate)
  const now = new Date()
  due.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const diff = Math.floor((due.getTime() - now.getTime()) / 86400000)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return 'this_week'
  if (due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()) return 'this_month'
  return 'later'
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  return `${days[d.getDay()]}, ${dd}.${mm}`
}

// ── Shared mini checkbox ────────────────────────────────────────────────────

function MiniCheck({ done, onToggle }: { done: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(e) }}
      className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors
        ${done ? 'bg-primary border-primary' : 'border-white/25 hover:border-primary/60'}`}
    >
      {done && (
        <svg width="6" height="6" viewBox="0 0 10 10">
          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="black" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

// ── Inline date editor ──────────────────────────────────────────────────────

function DateBadge({ value, onChange }: { value?: string; onChange: (d: string) => void }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        type="date"
        defaultValue={value ?? ''}
        autoFocus
        onClick={e => e.stopPropagation()}
        onBlur={e => { onChange(e.target.value); setEditing(false) }}
        onChange={e => { if (e.target.value) { onChange(e.target.value); setEditing(false) } }}
        className="text-xs px-2 py-1 rounded-lg bg-[var(--bg)] border border-primary text-[var(--text)] focus:outline-none w-32"
      />
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className={`text-xs px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors
        ${value
          ? 'text-[var(--text2)] bg-white/6 hover:bg-white/10'
          : 'text-[var(--text2)]/30 hover:text-[var(--text2)] hover:bg-white/6'
        }`}
    >
      {value ? formatShortDate(value) : '+ Datum'}
    </button>
  )
}

// ── BracketCard ─────────────────────────────────────────────────────────────

function BracketCard({ todo, customerName, onClick, onToggleItem, onDateChange }: {
  todo: Todo; customerName: string
  onClick: () => void
  onToggleItem: (itemId: string) => void
  onDateChange: (d: string) => void
}) {
  const isDone = todo.status === 'done'
  const total  = todo.checklist.length
  const done   = todo.checklist.filter(c => c.done).length
  const pct    = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="relative w-full pl-8 pr-6 py-6 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] hover:border-white/12 transition-colors">
      <div className="absolute left-4 top-4 bottom-4 w-[3px] rounded-full bg-white/12" />

      <button onClick={onClick} className="w-full text-left flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-lg font-semibold text-[var(--text)] leading-snug ${isDone ? 'line-through opacity-40' : ''}`}>
            {todo.title}
          </p>
          {(customerName || todo.tags[0]) && (
            <p className="text-sm text-[var(--text2)] mt-1">
              {[customerName, todo.tags[0]].filter(Boolean).join(' • ')}
            </p>
          )}
        </div>
        <DateBadge value={todo.dueDate} onChange={onDateChange} />
      </button>

      {total > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[3px] rounded-full bg-white/10">
              <div className="h-[3px] rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-[var(--text2)]">{done}/{total}</span>
          </div>
          {todo.checklist.slice(0, 4).map(item => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 text-left"
            >
              <MiniCheck done={item.done} onToggle={e => { e.stopPropagation(); onToggleItem(item.id) }} />
              <span className={`text-sm leading-relaxed ${item.done ? 'line-through text-[var(--text2)]/50' : 'text-[var(--text2)]'}`}>
                {item.text}
              </span>
            </div>
          ))}
          {total > 4 && (
            <p className="text-xs text-[var(--text2)]/40 pl-6">+{total - 4} weitere</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── GridCard ────────────────────────────────────────────────────────────────

function GridCard({ todo, customerName, onClick, onToggleItem, onDateChange }: {
  todo: Todo; customerName: string
  onClick: () => void
  onToggleItem: (itemId: string) => void
  onDateChange: (d: string) => void
}) {
  const isDone = todo.status === 'done'
  const total  = todo.checklist.length
  const done   = todo.checklist.filter(c => c.done).length
  const pct    = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="relative pl-8 pr-5 py-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] hover:border-white/12 transition-colors flex flex-col gap-3">
      <div className="absolute left-4 top-4 bottom-4 w-[3px] rounded-full bg-white/12" />

      <button onClick={onClick} className="text-left min-w-0">
        <p className={`text-base font-semibold text-[var(--text)] leading-snug ${isDone ? 'line-through opacity-40' : ''}`}>
          {todo.title}
        </p>
        {customerName && <p className="text-sm text-[var(--text2)] mt-1">{customerName}</p>}
      </button>

      {total > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[3px] rounded-full bg-white/10">
              <div className="h-[3px] rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-[var(--text2)]">{done}/{total}</span>
          </div>
          {todo.checklist.slice(0, 3).map(item => (
            <button
              key={item.id}
              onClick={e => { e.stopPropagation(); onToggleItem(item.id) }}
              className="flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
            >
              <MiniCheck done={item.done} onToggle={e => { e.stopPropagation(); onToggleItem(item.id) }} />
              <span className={`text-sm ${item.done ? 'line-through text-[var(--text2)]/50' : 'text-[var(--text2)]'}`}>
                {item.text}
              </span>
            </button>
          ))}
          {total > 3 && <p className="text-xs text-[var(--text2)]/40 pl-6">+{total - 3} weitere</p>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <DateBadge value={todo.dueDate} onChange={onDateChange} />
        {todo.assignee && (
          <span className="w-7 h-7 rounded-full bg-[var(--bg3)] border border-[var(--border)] text-[var(--text2)] text-xs font-bold flex items-center justify-center uppercase">
            {todo.assignee[0]}
          </span>
        )}
      </div>
    </div>
  )
}

// ── TaskDetailPanel ─────────────────────────────────────────────────────────

function TaskDetailPanel({ todo, customerName, onClose, onUpdate, onRemove }: {
  todo: Todo; customerName: string
  onClose: () => void
  onUpdate: (t: Todo) => void
  onRemove: (id: string) => void
}) {
  const STATUS_NEXT: Record<string, Todo['status']> = { open: 'in_progress', in_progress: 'done', done: 'open' }
  const STATUS_LABEL: Record<string, string> = { open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt' }
  const STATUS_COLOR: Record<string, string> = {
    open: 'bg-white/8 text-[var(--text2)]',
    in_progress: 'bg-blue-500/15 text-blue-400',
    done: 'bg-primary/15 text-primary',
  }

  const [checklist, setChecklist] = useState<ChecklistItem[]>(todo.checklist)
  const [newText, setNewText]     = useState('')

  const toggleItem = (itemId: string) => {
    const updated = checklist.map(c => c.id === itemId ? { ...c, done: !c.done } : c)
    setChecklist(updated)
    onUpdate({ ...todo, checklist: updated })
  }

  const addItem = () => {
    const text = newText.trim()
    if (!text) return
    const item: ChecklistItem = { id: uuid(), text, done: false }
    const updated = [...checklist, item]
    setChecklist(updated)
    onUpdate({ ...todo, checklist: updated })
    setNewText('')
  }

  const removeItem = (itemId: string) => {
    const updated = checklist.filter(c => c.id !== itemId)
    setChecklist(updated)
    onUpdate({ ...todo, checklist: updated })
  }

  const doneCount = checklist.filter(c => c.done).length

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-[var(--bg1)] border-t border-[var(--border)] p-6 pb-8"
        style={{ animation: 'focusSlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both', maxHeight: '82vh', overflowY: 'auto' }}
      >
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-6" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-[var(--text)] leading-snug">{todo.title}</p>
            {customerName && <p className="text-xs text-[var(--text2)] mt-0.5">{customerName}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onUpdate({ ...todo, checklist, status: STATUS_NEXT[todo.status] })}
              className={`text-xs px-3 py-1.5 rounded-full font-medium ${STATUS_COLOR[todo.status]}`}
            >
              {STATUS_LABEL[todo.status]}
            </button>
            <button
              onClick={() => { onRemove(todo.id); onClose() }}
              className="text-xs px-3 py-1.5 rounded-full bg-red-500/10 text-red-400"
            >
              Löschen
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 text-[var(--text2)] text-sm flex items-center justify-center">
              ✕
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {checklist.length > 0 && (
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-[3px] rounded-full bg-white/10">
              <div
                className="h-[3px] rounded-full bg-primary transition-all"
                style={{ width: `${(doneCount / checklist.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-[var(--text2)] flex-shrink-0">{doneCount}/{checklist.length}</span>
          </div>
        )}

        {/* Checklist */}
        <div className="flex flex-col gap-1 mb-4">
          {checklist.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group">
              <button
                onClick={() => toggleItem(item.id)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                  ${item.done ? 'bg-primary border-primary' : 'border-white/25 hover:border-primary/60'}`}
              >
                {item.done && (
                  <svg width="8" height="8" viewBox="0 0 10 10">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="black" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <span
                onClick={() => toggleItem(item.id)}
                className={`text-sm flex-1 cursor-pointer select-none ${item.done ? 'line-through text-[var(--text2)]' : 'text-[var(--text)]'}`}
              >
                {item.text}
              </span>
              <button
                onClick={() => removeItem(item.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Input — between list and close button */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] mb-4">
          <span className="text-[var(--text2)] text-lg leading-none select-none">+</span>
          <input
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Unterschritt hinzufügen…"
            className="flex-1 text-sm bg-transparent text-[var(--text)] focus:outline-none placeholder:text-[var(--text2)]/40"
          />
          {newText.trim() && (
            <button onClick={addItem} className="text-xs px-2.5 py-1 rounded-lg bg-primary text-black font-semibold">
              Add
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-white/6 text-[var(--text2)] text-sm font-medium hover:bg-white/10 transition-colors"
        >
          Schließen
        </button>
      </div>
    </>
  )
}

// ── NewTaskModal ────────────────────────────────────────────────────────────

function NewTaskModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const upsert = useTodosStore(s => s.upsert)
  const [title, setTitle]         = useState('')
  const [dueDate, setDueDate]     = useState('')
  const [priority, setPriority]   = useState<'low' | 'normal' | 'high'>('normal')
  const [tag, setTag]             = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [newStep, setNewStep]     = useState('')

  const addStep = () => {
    const text = newStep.trim()
    if (!text) return
    setChecklist(prev => [...prev, { id: uuid(), text, done: false }])
    setNewStep('')
  }

  const removeStep = (id: string) =>
    setChecklist(prev => prev.filter(c => c.id !== id))

  const submit = async () => {
    if (!title.trim()) return
    await upsert({
      customerId,
      title: title.trim(),
      dueDate: dueDate || undefined,
      priority,
      tags: tag.trim() ? [tag.trim()] : [],
      checklist,
    })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
      <div
        className="w-full max-w-md bg-[var(--bg1)] border border-[var(--border)] rounded-2xl p-5"
        style={{ animation: 'fadeInUp 0.2s ease both' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-[var(--text)]">Neue Task</p>
          <button onClick={onClose} className="w-6 h-6 rounded-full bg-white/8 text-[var(--text2)] text-xs flex items-center justify-center">✕</button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Titel */}
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Titel…"
            className="w-full px-4 py-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-[var(--text2)]/50"
          />

          {/* Notiz + Priorität */}
          <div className="flex gap-3">
            <input
              value={tag}
              onChange={e => setTag(e.target.value)}
              placeholder="Notiz (optional)…"
              className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-[var(--text2)]/50"
            />
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as 'low' | 'normal' | 'high')}
              className="px-4 py-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="low">Niedrig</option>
              <option value="normal">Mittel</option>
              <option value="high">Hoch</option>
            </select>
          </div>

          {/* Datum */}
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Checklist builder */}
          <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
            <p className="text-xs text-[var(--text2)] px-4 pt-3 pb-2 font-medium">Unterschritte</p>

            {checklist.length > 0 && (
              <div className="flex flex-col px-3 pb-1">
                {checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-2.5 py-2 group">
                    <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" />
                    <span className="flex-1 text-sm text-[var(--text)]">{item.text}</span>
                    <button
                      onClick={() => removeStep(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 px-3 pb-3">
              <span className="text-[var(--text2)] text-base leading-none select-none">+</span>
              <input
                value={newStep}
                onChange={e => setNewStep(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep() } }}
                placeholder="Unterschritt hinzufügen…"
                className="flex-1 text-sm bg-transparent text-[var(--text)] focus:outline-none placeholder:text-[var(--text2)]/40 py-1"
              />
              {newStep.trim() && (
                <button onClick={addStep} className="text-xs px-2.5 py-1 rounded-lg bg-primary text-black font-semibold">
                  Add
                </button>
              )}
            </div>
          </div>

          <button
            onClick={submit}
            className="w-full py-2.5 rounded-xl bg-primary text-black text-sm font-bold mt-1 hover:bg-primary-dark transition-colors"
          >
            + Task erstellen
          </button>
        </div>
      </div>
      </div>
    </>
  )
}

// ── Main pane ───────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function WorkflowPane({ customerId }: Props) {
  const todos          = useTodosStore(s => s.todos)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const removeTodo     = useTodosStore(s => s.remove)
  const deadlines      = useDeadlinesStore(s => s.deadlines)
  const upsertDeadline = useDeadlinesStore(s => s.upsert)
  const removeDeadline = useDeadlinesStore(s => s.remove)
  const followUps      = useCrmStore(s => s.followUps)
  const customer       = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const customerName   = customer?.name ?? ''

  const [subTab, setSubTab]             = useState<'tasks' | 'notizen'>('tasks')
  const [showNewTask, setShowNewTask]   = useState(false)
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)
  const [laterOpen, setLaterOpen]       = useState(true)

  const open        = todos.filter(t => t.status !== 'done')
  const todayTodos  = open.filter(t => getBucket(t.dueDate) === 'today')
  const tomorrowTodos = open.filter(t => getBucket(t.dueDate) === 'tomorrow')
  const weekTodos   = open.filter(t => getBucket(t.dueDate) === 'this_week')
  const monthTodos  = open.filter(t => getBucket(t.dueDate) === 'this_month')
  const laterTodos  = open.filter(t => getBucket(t.dueDate) === 'later')

  const changeDate = (t: Todo, dueDate: string) =>
    upsertTodo({ ...t, dueDate: dueDate || undefined })

  const toggleItem = (t: Todo, itemId: string) => {
    const checklist = t.checklist.map(c => c.id === itemId ? { ...c, done: !c.done } : c)
    upsertTodo({ ...t, checklist })
  }

  const cardProps = (t: Todo) => ({
    todo: t,
    customerName,
    onClick:        () => setSelectedTodo(t),
    onToggleItem:   (itemId: string) => toggleItem(t, itemId),
    onDateChange:   (d: string) => changeDate(t, d),
  })

  const SECTIONS: { bucket: Bucket; label: string; items: Todo[]; grid?: boolean }[] = [
    { bucket: 'today',      label: 'Heute',        items: todayTodos },
    { bucket: 'tomorrow',   label: 'Morgen',        items: tomorrowTodos },
    { bucket: 'this_week',  label: 'Diese Woche',   items: weekTodos,  grid: true },
    { bucket: 'this_month', label: 'Diesen Monat',  items: monthTodos, grid: true },
    { bucket: 'later',      label: 'Später',        items: laterTodos },
  ]

  const openFollowUps = followUps.filter(f => f.status === 'offen')

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-[var(--border)] flex-shrink-0">
        {(['tasks', 'notizen'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${subTab === t
                ? 'bg-primary/10 text-primary'
                : 'text-[var(--text2)] hover:text-[var(--text)] hover:bg-white/5'
              }`}
          >
            {t === 'tasks' ? 'Tasks' : 'Notizen'}
          </button>
        ))}
      </div>

      {subTab === 'notizen' ? (
        <NotizPane customerId={customerId} />
      ) : (
        <div className="p-6 flex flex-col gap-8 overflow-y-auto flex-1">

          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <h1 className="text-2xl font-bold text-[var(--text)]">Tasks</h1>
            <button onClick={() => setShowNewTask(true)}
              className="px-4 py-2 rounded-full bg-primary text-black text-sm font-bold hover:bg-primary-dark transition-colors">
              + Neue Task
            </button>
          </div>

          {/* Bucketed sections */}
          {SECTIONS.map(({ bucket, label, items, grid }) => {
            if (items.length === 0) return null
            const isLater = bucket === 'later'
            return (
              <section key={bucket} className="flex flex-col gap-3">
                <button
                  disabled={!isLater}
                  onClick={() => isLater && setLaterOpen(v => !v)}
                  className={`flex items-center justify-between text-base font-semibold text-[var(--text)] ${isLater ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span>{label}</span>
                  {isLater && <span className={`text-[var(--text2)] text-xs transition-transform ${laterOpen ? '' : '-rotate-90'}`}>▼</span>}
                </button>

                {(!isLater || laterOpen) && (
                  grid ? (
                    <div className={`grid gap-4 ${items.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {items.map(t => <GridCard key={t.id} {...cardProps(t)} />)}
                    </div>
                  ) : (
                    <div className={`grid gap-4 ${items.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {items.map(t => <BracketCard key={t.id} {...cardProps(t)} />)}
                    </div>
                  )
                )}
              </section>
            )
          })}

          {/* Deadlines */}
          {deadlines.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
              <h2 className="text-sm font-semibold text-[var(--text2)] mb-1">Deadlines</h2>
              {deadlines.map(d => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
                  <input type="checkbox" checked={d.done} onChange={() => upsertDeadline({ ...d, done: !d.done })} className="accent-primary" />
                  <span className={`flex-1 text-sm text-[var(--text)] ${d.done ? 'line-through opacity-40' : ''}`}>{d.title}</span>
                  <DateBadge value={d.dueDate} onChange={date => upsertDeadline({ ...d, dueDate: date })} />
                  <button onClick={() => removeDeadline(d.id)} className="text-[var(--text2)] hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </section>
          )}

          {/* Follow-Ups */}
          {openFollowUps.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
              <h2 className="text-sm font-semibold text-[var(--text2)] mb-1">Nächste Schritte</h2>
              {openFollowUps.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
                  <span className="flex-1 text-sm text-[var(--text)]">{f.title}</span>
                  <span className="text-xs text-[var(--text2)]">{f.dueDate ? formatShortDate(f.dueDate) : ''}</span>
                </div>
              ))}
            </section>
          )}

          {/* Empty state */}
          {open.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-[var(--text2)] text-sm">Keine offenen Tasks</p>
              <button onClick={() => setShowNewTask(true)} className="mt-3 text-primary text-sm hover:underline">
                + Erste Task erstellen
              </button>
            </div>
          )}
        </div>
      )}

      {showNewTask && <NewTaskModal customerId={customerId} onClose={() => setShowNewTask(false)} />}

      {selectedTodo && (
        <TaskDetailPanel
          todo={selectedTodo}
          customerName={customerName}
          onClose={() => setSelectedTodo(null)}
          onUpdate={async (t) => { await upsertTodo(t); setSelectedTodo(t) }}
          onRemove={removeTodo}
        />
      )}
    </div>
  )
}
