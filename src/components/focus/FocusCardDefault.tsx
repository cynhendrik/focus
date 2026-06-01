import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore } from '@/store/ui.store'
import type { Todo, TodoPriority } from '@/types/todo.types'
import { Check, Clock, FileText, Tag, Mail, Phone, Reply, ArrowRight } from 'lucide-react'
import { detectFocusAction, getFocusActionConfig } from '@/lib/focus-actions'
import type { FocusActionType } from '@/lib/focus-actions'
import type { LucideIcon } from 'lucide-react'

const ACTION_ICONS: Record<FocusActionType, LucideIcon> = {
  invoice: FileText,
  offer: Tag,
  mail: Mail,
  call: Phone,
  followup: Reply,
}

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

export function FocusCardDefault({ todo, onComplete, onSkip, onPostpone }: Props) {
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const accounts        = useAccountsStore(s => s.accounts)
  const openCustomerAt  = useUiStore(s => s.openCustomerAt)
  const setAppView      = useUiStore(s => s.setAppView)
  const account = todo.customerId
    ? accounts.find(a => a.id === todo.customerId)
    : undefined
  const doneCount = todo.checklist.filter(c => c.done).length

  const detectedActionType = detectFocusAction(todo.title)
  const actionConfig = detectedActionType ? getFocusActionConfig(detectedActionType) : null
  const ActionIcon = detectedActionType ? ACTION_ICONS[detectedActionType] : null

  const handleContextAction = () => {
    if (actionConfig) {
      if (todo.customerId) {
        openCustomerAt(todo.customerId, actionConfig.customerTab)
      } else {
        setAppView(actionConfig.globalView as Parameters<typeof setAppView>[0])
      }
    } else if (todo.customerId) {
      openCustomerAt(todo.customerId)
    }
  }

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${PRIO_COLOR[todo.priority] ?? PRIO_COLOR.p3}`,
      borderRadius: 18,
      padding: '32px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
    }}>
      {/* Meta row */}
      <div style={{ display: 'flex', gap: 10, fontSize: 11, alignItems: 'center' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: `${PRIO_COLOR[todo.priority]}22`,
          color: PRIO_COLOR[todo.priority],
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '3px 9px',
          borderRadius: 99,
          fontSize: 10,
        }}>
          AUFGABE
        </span>
        {account && (
          <span style={{ color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: PRIO_COLOR[todo.priority], display: 'inline-block' }} />
            {account.name}
          </span>
        )}
      </div>

      {/* Title */}
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 36,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.05,
        margin: 0,
        color: 'var(--fg)',
      }}>
        {todo.title}
      </h1>

      {/* Notes */}
      {todo.notes && (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-muted)', margin: 0 }}>
          {todo.notes}
        </p>
      )}

      {/* Checklist */}
      {todo.checklist.length > 0 && (
        <div>
          <div style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fg-dim)',
            marginBottom: 10,
          }}>
            Teilschritte · {doneCount}/{todo.checklist.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todo.checklist.map(item => (
              <label key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 15,
                cursor: 'pointer',
                color: item.done ? 'var(--fg-muted)' : 'var(--fg)',
              }}>
                <button
                  type="button"
                  onClick={() => { toggleChecklist(todo.id, item.id).catch(() => {}) }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 99,
                    border: `1.5px solid ${item.done ? 'var(--accent)' : 'var(--border-strong)'}`,
                    background: item.done ? 'var(--accent)' : 'transparent',
                    color: 'var(--accent-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {item.done ? '✓' : ''}
                </button>
                <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Context action — keyword match or customer fallback */}
      {(actionConfig || account) && (
        <button
          type="button"
          onClick={handleContextAction}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface-3)',
            color: 'var(--fg)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
        >
          {ActionIcon && (
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'oklch(50% 0 0 / 0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              color: 'var(--accent)',
            }}>
              <ActionIcon size={14} />
            </span>
          )}
          <span style={{ flex: 1 }}>
            {actionConfig ? actionConfig.label : `Bei ${account?.name ?? 'Kunden'} öffnen`}
            {account && actionConfig && (
              <span style={{ color: 'var(--fg-dim)', fontWeight: 400, marginLeft: 6 }}>
                · {account.name}
              </span>
            )}
          </span>
          <ArrowRight size={14} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
        </button>
      )}

      {/* Action row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 4,
      }}>
        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 18px',
            borderRadius: 99,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--fg-muted)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Überspringen
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 99,
            border: 'none',
            background: 'oklch(50% 0 0 / 0.08)',
            color: 'var(--fg)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Clock size={14} />
          Morgen
          <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <button
          type="button"
          onClick={() => { onComplete().catch(() => {}) }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 99,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 6px 20px -8px var(--accent-glow)',
            cursor: 'pointer',
          }}
        >
          <Check size={16} />
          Erledigt · weiter
          <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>
            SPACE
          </span>
        </button>
      </div>
    </div>
  )
}
