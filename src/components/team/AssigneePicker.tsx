import { useState } from 'react'
import { UserPlus, Check } from 'lucide-react'
import { useMembersStore } from '@/store/members.store'
import { useTodosStore } from '@/store/todos.store'
import type { Todo } from '@/types/todo.types'

/** Mitglieder-Picker an einer Aufgabe. Schreibt assignee → Trigger benachrichtigt. */
export function AssigneePicker({ todo }: { todo: Todo }) {
  const [open, setOpen] = useState(false)
  const members     = useMembersStore(s => s.members())
  const nameOf      = useMembersStore(s => s.nameOf)
  const setAssignee = useTodosStore(s => s.setAssignee)

  const current = todo.assignee ? nameOf(todo.assignee) : 'Niemand'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
      >
        <UserPlus size={13} /> {current}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 60, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-2)', padding: 4 }}>
          {members.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--fg-dim)' }}>Keine Mitglieder geladen.</div>
          )}
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => { void setAssignee(todo.id, m.id); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <span style={{ flex: 1 }}>{m.displayName}</span>
              {todo.assignee === m.id && <Check size={14} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
          {todo.assignee && (
            <button
              onClick={() => { void setAssignee(todo.id, undefined); setOpen(false) }}
              style={{ width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 12.5, fontFamily: 'inherit' }}
            >
              Zuweisung entfernen
            </button>
          )}
        </div>
      )}
    </div>
  )
}
