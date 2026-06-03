import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useToastStore } from '@/store/toast.store'
import type { TodoPriority } from '@/types/todo.types'

interface Props {
  customerId: string | undefined
  customerName: string
  onCreated: () => void
}

const PRIOS: Array<{ value: TodoPriority; label: string; color: string }> = [
  { value: 'p1', label: 'Dringend', color: 'oklch(72% 0.18 25)' },
  { value: 'p2', label: 'Hoch',     color: 'oklch(70% 0.18 50)' },
  { value: 'p3', label: 'Normal',   color: 'var(--accent)' },
  { value: 'p4', label: 'Niedrig',  color: 'var(--fg-dim)' },
]

export function CockpitTaskForm({ customerId, customerName, onCreated }: Props) {
  const upsert    = useTodosStore(s => s.upsert)
  const showToast = useToastStore(s => s.show)

  const [title, setTitle]       = useState('')
  const [priority, setPriority] = useState<TodoPriority>('p3')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await upsert({
        title: title.trim(),
        priority,
        bucket: 'today',
        status: 'open',
        customerId: customerId ?? undefined,
        dueDate: dueDate || undefined,
      })
      showToast({ message: 'Task erstellt.', variant: 'success' })
      setTitle('')
      setDueDate('')
      setPriority('p3')
      onCreated()
    } catch {
      showToast({ message: 'Task konnte nicht erstellt werden.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Customer chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#484858', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Für</span>
        <span style={{
          background: 'oklch(60% 0.25 280 / 0.12)', color: 'oklch(75% 0.2 280)',
          borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
        }}>
          {customerName || 'Allgemein'}
        </span>
      </div>

      {/* Title input */}
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleCreate())}
        placeholder="Neue Aufgabe…"
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 9,
          border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
          color: 'var(--fg)', fontSize: 13, outline: 'none',
          fontFamily: 'inherit',
        }}
      />

      {/* Priority + date row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Priority pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PRIOS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              style={{
                padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
                border: `1px solid ${priority === p.value ? p.color : 'rgba(255,255,255,0.07)'}`,
                background: priority === p.value ? `${p.color}18` : 'transparent',
                color: priority === p.value ? p.color : '#555',
                fontSize: 10, fontWeight: 600, transition: 'all 160ms',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Due date */}
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          style={{
            padding: '4px 8px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.07)', background: '#141419',
            color: dueDate ? 'var(--fg)' : '#484858', fontSize: 11, outline: 'none',
          }}
        />

        {/* Create button */}
        <button
          type="button"
          onClick={handleCreate}
          disabled={!title.trim() || saving}
          style={{
            padding: '7px 18px', borderRadius: 99, border: 'none',
            background: !title.trim() || saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
            color: !title.trim() || saving ? '#484858' : 'var(--accent-ink)',
            fontSize: 12, fontWeight: 700, cursor: !title.trim() || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Wird erstellt…' : 'Task erstellen →'}
        </button>
      </div>
    </div>
  )
}
