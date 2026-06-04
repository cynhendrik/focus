import { useState } from 'react'
import { CheckSquare, Loader } from 'lucide-react'
import type { Todo } from '@/types/todo.types'

interface Props {
  todo: Todo
  onDone: () => Promise<void>
  onSkip: () => void
}

export function TileBodyTodo({ todo, onDone, onSkip }: Props) {
  const [loading, setLoading] = useState(false)

  const handleDone = async () => {
    setLoading(true)
    try { await onDone() } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
      {todo.notes && (
        <div style={{
          fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 16px',
        }}>
          {todo.notes}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={handleDone}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 24px', borderRadius: 99, border: 'none',
            background: loading ? 'var(--surface-3)' : 'var(--accent)',
            color: loading ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 4px 16px -6px var(--accent-glow)',
            transition: 'all 200ms',
          }}
        >
          {loading
            ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
            : <CheckSquare size={14} />
          }
          {loading ? 'Wird erledigt…' : 'Erledigt ✓'}
        </button>

        <button
          type="button"
          onClick={onSkip}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
