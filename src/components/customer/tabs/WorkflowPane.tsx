import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { NotizPane } from './NotizPane'
import { useTodosStore } from '@/store/todos.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import { useCustomersStore } from '@/store/customers.store'
import { Modal, BottomSheet } from '@/components/ui/Sheet'
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
        ${done ? 'bg-primary border-primary' : 'border-[var(--border-strong)] hover:border-[var(--accent)]'}`}
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

function TaskDetailPanel({ open, todo, customerName, onClose, onUpdate, onRemove }: {
  open: boolean
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
    <BottomSheet open={open} onClose={onClose}>
      <div className="p-6 pb-8">
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
    </BottomSheet>
  )
}

// ── NewTaskModal ────────────────────────────────────────────────────────────

function NewTaskModal({ open, customerId, onClose }: { open: boolean; customerId: string; onClose: () => void }) {
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

  const PRIORITIES: { value: 'low' | 'normal' | 'high'; label: string }[] = [
    { value: 'low',    label: 'Niedrig' },
    { value: 'normal', label: 'Mittel'  },
    { value: 'high',   label: 'Hoch'    },
  ]

  return (
    <Modal open={open} onClose={onClose} width={480}>
      <div style={{ padding: '20px 22px 22px' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex flex-col gap-0.5">
            <span className="card-label">Workflow</span>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0,
              color: 'var(--fg)',
            }}>
              Neue Task
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 10,
              background: 'oklch(50% 0 0 / 0.06)',
              color: 'var(--fg-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13,
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'oklch(50% 0 0 / 0.12)'
              e.currentTarget.style.color = 'var(--fg)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'oklch(50% 0 0 / 0.06)'
              e.currentTarget.style.color = 'var(--fg-muted)'
            }}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col" style={{ gap: 10 }}>
          {/* Titel — prominent */}
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Was muss erledigt werden?"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              padding: '6px 0 10px',
              fontSize: 17,
              fontWeight: 500,
              color: 'var(--fg)',
              letterSpacing: '-0.01em',
              transition: 'border-color 180ms',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--accent)' }}
            onBlur ={e => { e.currentTarget.style.borderBottomColor = 'var(--border)' }}
          />

          {/* Notiz */}
          <input
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="Notiz oder Tag (optional)"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              padding: '6px 0 10px',
              fontSize: 13,
              color: 'var(--fg-2)',
              transition: 'border-color 180ms',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--accent)' }}
            onBlur ={e => { e.currentTarget.style.borderBottomColor = 'var(--border)' }}
          />

          {/* Priorität — segmented control */}
          <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
            <span className="card-label">Priorität</span>
            <div style={{
              display: 'inline-flex', gap: 2, padding: 3, borderRadius: 99,
              background: 'oklch(50% 0 0 / 0.06)', border: '1px solid var(--border)',
            }}>
              {PRIORITIES.map(p => {
                const active = priority === p.value
                return (
                  <button
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    style={{
                      padding: '5px 12px', borderRadius: 99,
                      fontSize: 11.5, fontWeight: 600,
                      letterSpacing: '0.01em',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
                      transition: 'background 180ms, color 180ms',
                    }}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fälligkeit */}
          <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
            <span className="card-label">Fällig</span>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{
                background: 'oklch(50% 0 0 / 0.06)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '6px 10px',
                fontSize: 12.5,
                color: dueDate ? 'var(--fg)' : 'var(--fg-muted)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
                colorScheme: 'dark light',
                transition: 'border-color 180ms, background 180ms',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.background = 'var(--surface-2)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.background = 'oklch(50% 0 0 / 0.06)'
              }}
            />
          </div>

          {/* Checklist */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="card-label">Unterschritte</span>

            <AnimatePresence initial={false}>
              {checklist.map(item => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit   ={{ opacity: 0, height: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="flex items-center gap-2 group" style={{ padding: '6px 2px' }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: '1.5px solid var(--border-strong)',
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-2)' }}>
                      {item.text}
                    </span>
                    <button
                      onClick={() => removeStep(item.id)}
                      className="opacity-0 group-hover:opacity-100"
                      style={{
                        color: 'var(--fg-dim)', fontSize: 11,
                        transition: 'opacity 150ms, color 150ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)' }}
                    >
                      ✕
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="flex items-center gap-2" style={{
              padding: '8px 10px',
              borderRadius: 10,
              background: 'oklch(50% 0 0 / 0.06)',
              border: '1px dashed var(--border-strong)',
            }}>
              <span style={{ color: 'var(--fg-muted)', fontSize: 14, lineHeight: 1 }}>+</span>
              <input
                value={newStep}
                onChange={e => setNewStep(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep() } }}
                placeholder="Schritt hinzufügen …"
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  fontSize: 12.5, color: 'var(--fg)',
                  letterSpacing: 'inherit',
                }}
              />
              {newStep.trim() && (
                <button
                  onClick={addStep}
                  style={{
                    fontSize: 10.5, fontWeight: 700,
                    padding: '4px 10px', borderRadius: 99,
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}
                >
                  Add
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between" style={{ marginTop: 18 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5,
              color: 'var(--fg-dim)', letterSpacing: '0.06em',
            }}>
              ⏎  ENTER ZUM SPEICHERN
            </span>
            <button
              onClick={submit}
              disabled={!title.trim()}
              style={{
                padding: '9px 18px', borderRadius: 99,
                background: title.trim() ? 'var(--accent)' : 'oklch(50% 0 0 / 0.1)',
                color: title.trim() ? 'var(--accent-ink)' : 'var(--fg-dim)',
                fontSize: 13, fontWeight: 600,
                letterSpacing: '-0.005em',
                cursor: title.trim() ? 'pointer' : 'not-allowed',
                boxShadow: title.trim()
                  ? '0 8px 24px -10px var(--accent-glow), 0 0 0 1px oklch(0% 0 0 / 0.08)'
                  : 'none',
                transition: 'transform 150ms, box-shadow 220ms, background 150ms',
              }}
              onMouseEnter={e => {
                if (title.trim()) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 14px 32px -10px var(--accent-glow), 0 0 0 1px oklch(0% 0 0 / 0.08)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                if (title.trim()) {
                  e.currentTarget.style.boxShadow = '0 8px 24px -10px var(--accent-glow), 0 0 0 1px oklch(0% 0 0 / 0.08)'
                }
              }}
            >
              Task erstellen
            </button>
          </div>
        </div>
      </div>
    </Modal>
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${subTab === t
                ? 'bg-primary text-black'
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

      <NewTaskModal
        open={showNewTask}
        customerId={customerId}
        onClose={() => setShowNewTask(false)}
      />

      {selectedTodo && (
        <TaskDetailPanel
          open={!!selectedTodo}
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
