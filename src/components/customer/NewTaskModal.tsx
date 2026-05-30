import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { v4 as uuid } from 'uuid'
import { useTodosStore } from '@/store/todos.store'
import { Modal } from '@/components/ui/Sheet'
import type { ChecklistItem } from '@/types/todo.types'

// ─────────────────────────────────────────────────────────────────────────────
// NewTaskModal — full task creation modal with title + tag + priority +
// due date + checklist. Used by both WorkflowPane (Arbeiten > Tasks) and
// TasksList (Activities). Shared design ensures Tasks feel consistent
// wherever you create them.
//
// `context` controls the small uppercase label in the header so the modal
// can identify itself differently per surface ("Workflow" vs "Activities").
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  customerId: string
  onClose: () => void
  context?: string
}

const PRIORITIES: { value: 'low' | 'normal' | 'high'; label: string }[] = [
  { value: 'low',    label: 'Niedrig' },
  { value: 'normal', label: 'Mittel'  },
  { value: 'high',   label: 'Hoch'    },
]

export function NewTaskModal({ open, customerId, onClose, context = 'Workflow' }: Props) {
  const upsert = useTodosStore(s => s.upsert)
  const [title, setTitle]         = useState('')
  const [dueDate, setDueDate]     = useState('')
  const [priority, setPriority]   = useState<'low' | 'normal' | 'high'>('normal')
  const [tag, setTag]             = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [newStep, setNewStep]     = useState('')

  const reset = () => {
    setTitle('')
    setDueDate('')
    setPriority('normal')
    setTag('')
    setChecklist([])
    setNewStep('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

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
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} width={480}>
      <div style={{ padding: '20px 22px 22px' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex flex-col gap-0.5">
            <span className="card-label">{context}</span>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0,
              color: 'var(--fg)',
            }}>
              Neue Task
            </h3>
          </div>
          <button
            onClick={handleClose}
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
          {/* Titel */}
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Was muss erledigt werden?"
            style={{
              width: '100%',
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--border)',
              padding: '6px 0 10px',
              fontSize: 17, fontWeight: 500,
              color: 'var(--fg)', letterSpacing: '-0.01em',
              transition: 'border-color 180ms',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--accent)' }}
            onBlur ={e => { e.currentTarget.style.borderBottomColor = 'var(--border)' }}
          />

          {/* Notiz / Tag */}
          <input
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="Notiz oder Tag (optional)"
            style={{
              width: '100%',
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--border)',
              padding: '6px 0 10px',
              fontSize: 13, color: 'var(--fg-2)',
              transition: 'border-color 180ms',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--accent)' }}
            onBlur ={e => { e.currentTarget.style.borderBottomColor = 'var(--border)' }}
          />

          {/* Priorität */}
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
