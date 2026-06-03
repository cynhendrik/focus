import { Check } from 'lucide-react'
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo, TodoPriority } from '@/types/todo.types'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(72% 0.18 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'var(--accent)',
  p4: 'var(--accent)',
}

const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Aufgabe', p4: 'Niedrig',
}

function getAccentColor(todo: Todo): string {
  if (todo.actionType === 'send_reminder' || todo.actionType === 'create_invoice') return 'var(--danger)'
  if (todo.actionType === 'followup' || todo.actionType === 'reply_mail') return 'var(--warn)'
  if (todo.actionType === 'write_offer') return 'var(--accent)'
  if (todo.actionType === 'call') return 'var(--info)'
  return PRIO_COLOR[todo.priority] ?? 'var(--accent)'
}

function getPrioLabel(todo: Todo): string {
  if (todo.actionType === 'send_reminder') return 'Mahnung'
  if (todo.actionType === 'create_invoice') return 'Rechnung'
  if (todo.actionType === 'followup') return 'Follow-Up'
  if (todo.actionType === 'reply_mail') return 'Antwort'
  if (todo.actionType === 'write_offer') return 'Angebot'
  if (todo.actionType === 'call') return 'Anruf'
  return PRIO_LABEL[todo.priority] ?? 'Aufgabe'
}

export function FocusHero({ todo, onComplete, onSkip, onPostpone }: Props) {
  const accounts = useAccountsStore(s => s.accounts)
  const account  = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const accentColor = getAccentColor(todo)

  const dueLabel = todo.dueDate
    ? new Date(todo.dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    : null

  return (
    <div style={{
      background: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 0,
      flexShrink: 0,
    }}>
      {/* Accent bar */}
      <div style={{
        width: 3, alignSelf: 'stretch', background: accentColor,
        borderRadius: 99, marginRight: 18, flexShrink: 0,
      }} />

      {/* Title block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: accentColor, background: `${accentColor}18`,
            padding: '2px 8px', borderRadius: 99,
          }}>
            {getPrioLabel(todo)}
          </span>
          {account && (
            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>· {account.name}</span>
          )}
          {dueLabel && (
            <>
              <span style={{ color: 'var(--border-strong)', fontSize: 10 }}>·</span>
              <span style={{ fontSize: 11, color: 'oklch(70% 0.18 50)' }}>fällig {dueLabel}</span>
            </>
          )}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em',
          lineHeight: 1.25, color: 'var(--fg)',
        }}>
          {todo.title}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 20, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            padding: '7px 13px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)',
          }}
        >
          Morgen
        </button>
        <button
          type="button"
          onClick={onSkip}
          style={{
            padding: '7px 13px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)',
          }}
        >
          Überspringen
        </button>
        <button
          type="button"
          onClick={() => { onComplete().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 16px', borderRadius: 99, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 3px 12px -4px var(--accent-glow)',
          }}
        >
          <Check size={13} />
          Erledigt
        </button>
      </div>
    </div>
  )
}
