// ─────────────────────────────────────────────────────────────────────────────
// Private Todos — drei Buckets: Heute / Diese Woche / Irgendwann.
// Pro Bucket: Liste + Add-Input am Ende. Toggle, rename, delete.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, CheckSquare, Plus, Trash2 } from 'lucide-react'
import {
  usePrivateTodosStore,
  BUCKET_LABEL,
  type PrivateTodoBucket,
  type PrivateTodo,
} from '@/store/private-todos.store'

const BUCKETS: PrivateTodoBucket[] = ['heute', 'diese_woche', 'irgendwann']

export function PrivateTodosRoute() {
  const todos = usePrivateTodosStore(s => s.todos)

  const grouped = useMemo(() => {
    const out: Record<PrivateTodoBucket, PrivateTodo[]> = {
      heute: [], diese_woche: [], irgendwann: [],
    }
    for (const t of todos) out[t.bucket].push(t)
    return out
  }, [todos])

  const openCount = todos.filter(t => !t.done).length

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="priv-section-label">
        <CheckSquare size={11} /> Private To-Dos
      </div>

      <h1 className="priv-title">
        Dein eigenes Leben. <span className="muted">Nicht das der Clients.</span>
      </h1>
      <p className="priv-subtitle">
        Alles, was du fernab vom Arbeit zu tun hast — getrennt vom CRM.{' '}
        <strong style={{ color: 'var(--priv-fg-muted)', fontWeight: 600 }}>
          {openCount} offen.
        </strong>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {BUCKETS.map(b => (
          <BucketSection key={b} bucket={b} todos={grouped[b]} />
        ))}
      </div>
    </div>
  )
}

// ── Bucket-Section ──────────────────────────────────────────────────────────

function BucketSection({ bucket, todos }: { bucket: PrivateTodoBucket; todos: PrivateTodo[] }) {
  const add = usePrivateTodosStore(s => s.add)
  const open = todos.filter(t => !t.done).length

  return (
    <section>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--priv-fg-dim)', fontWeight: 600,
        }}>
          {BUCKET_LABEL[bucket]}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--priv-fg-dim)',
        }}>
          {open}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {todos.map(t => <TodoRow key={t.id} todo={t} />)}
        <AddRow bucket={bucket} onAdd={(text) => add(bucket, text)} />
      </div>
    </section>
  )
}

// ── Todo-Row ────────────────────────────────────────────────────────────────

function TodoRow({ todo }: { todo: PrivateTodo }) {
  const toggle = usePrivateTodosStore(s => s.toggle)
  const rename = usePrivateTodosStore(s => s.rename)
  const remove = usePrivateTodosStore(s => s.remove)
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.text)

  const commit = () => {
    const v = draft.trim()
    if (v && v !== todo.text) rename(todo.id, v)
    setEditing(false)
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 11,
        background: 'var(--priv-surface)',
        border: '1px solid var(--priv-border)',
        transition: 'border-color 140ms, opacity 140ms',
        opacity: todo.done ? 0.6 : 1,
        borderColor: hover ? 'oklch(100% 0 0 / 0.14)' : undefined,
      }}
    >
      <button
        onClick={() => toggle(todo.id)}
        title={todo.done ? 'Wieder offen' : 'Erledigen'}
        style={{
          width: 18, height: 18, padding: 0, border: 'none', background: 'transparent',
          color: todo.done ? 'var(--priv-accent)' : 'var(--priv-fg-dim)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {todo.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(todo.text); setEditing(false) } }}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--priv-fg)', fontFamily: 'inherit', fontSize: 13.5,
          }}
        />
      ) : (
        <span
          onClick={() => { setDraft(todo.text); setEditing(true) }}
          style={{
            flex: 1, cursor: 'text',
            fontSize: 13.5, color: 'var(--priv-fg)',
            textDecoration: todo.done ? 'line-through' : 'none',
            textDecorationColor: 'var(--priv-fg-dim)',
          }}
        >
          {todo.text}
        </span>
      )}

      {hover && !editing && (
        <button
          onClick={() => remove(todo.id)}
          title="Loeschen"
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--priv-fg-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}

// ── Add-Row ─────────────────────────────────────────────────────────────────

function AddRow({ bucket, onAdd }: { bucket: PrivateTodoBucket; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')

  const submit = () => {
    const v = text.trim()
    if (!v) return
    onAdd(v)
    setText('')
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', borderRadius: 11,
      border: '1px dashed var(--priv-border)',
      color: 'var(--priv-fg-dim)',
      transition: 'border-color 140ms',
    }}
      onFocus={e => { e.currentTarget.style.borderColor = 'oklch(100% 0 0 / 0.16)' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'var(--priv-border)' }}
    >
      <Plus size={14} style={{ flexShrink: 0 }} />
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder={`Etwas zu "${BUCKET_LABEL[bucket]}" hinzufügen…`}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--priv-fg)', fontFamily: 'inherit', fontSize: 13,
        }}
      />
    </div>
  )
}
