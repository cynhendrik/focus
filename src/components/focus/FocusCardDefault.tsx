import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore } from '@/store/ui.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
import type { Todo, TodoPriority } from '@/types/todo.types'
import { Check, ArrowRight, FileText, Tag, Mail, Phone, Reply } from 'lucide-react'
import { detectFocusAction, getFocusActionConfig } from '@/lib/focus-actions'
import type { FocusActionType } from '@/lib/focus-actions'
import type { LucideIcon } from 'lucide-react'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { CorraHintBox } from './CorraHintBox'

const ACTION_ICONS: Record<FocusActionType, LucideIcon> = {
  invoice: FileText, offer: Tag, mail: Mail, call: Phone, followup: Reply,
}

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'var(--accent)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Aufgabe', p4: 'Niedrig',
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
  const loadAll         = useFinanceStore(s => s.loadAll)
  const workspaceId     = useWorkspaceStore(s => s.activeWorkspaceId)

  const [showInvoiceForm, setShowInvoiceForm] = useState(false)

  const account   = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const doneCount = todo.checklist.filter(c => c.done).length
  const accentColor = PRIO_COLOR[todo.priority] ?? PRIO_COLOR.p3

  const corraHint      = useCorraContextHint(todo.customerId, account?.name ?? '', 'general')
  const createActivity = useActivitiesStore(s => s.create)
  const userId         = useAuthStore(s => s.user?.id)

  const [noteText, setNoteText]     = useState('')
  const [showNote, setShowNote]     = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [saveError, setSaveError]   = useState(false)

  const resolvedActionType = todo.actionType === 'create_invoice' || todo.actionType === 'write_offer'
    ? (todo.actionType === 'create_invoice' ? 'invoice' : 'offer')
    : todo.actionType === 'call' ? 'call'
    : detectFocusAction(todo.title)

  const actionConfig = resolvedActionType ? getFocusActionConfig(resolvedActionType) : null
  const ActionIcon   = resolvedActionType ? ACTION_ICONS[resolvedActionType] : null

  const handleContextAction = () => {
    if (resolvedActionType === 'invoice' || todo.actionType === 'create_invoice' || todo.actionType === 'write_offer') {
      setShowInvoiceForm(true); return
    }
    if (actionConfig) {
      if (todo.customerId) openCustomerAt(todo.customerId, actionConfig.customerTab)
      else setAppView(actionConfig.globalView as Parameters<typeof setAppView>[0])
    } else if (todo.customerId) {
      openCustomerAt(todo.customerId)
    }
  }

  const handleInvoiceSaved = () => {
    setShowInvoiceForm(false)
    if (workspaceId) loadAll(workspaceId)
    onComplete().catch(() => {})
  }

  return (
    <>
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: 18,
      padding: '32px 36px',
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
      display: 'flex', flexDirection: 'column', gap: 24,
    }}>

      {/* Title block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: accentColor, background: `${accentColor}18`,
            padding: '3px 9px', borderRadius: 99,
          }}>
            {PRIO_LABEL[todo.priority]}
          </span>
          {account && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>· {account.name}</span>}
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34, fontWeight: 700,
          letterSpacing: '-0.03em', lineHeight: 1.0,
          margin: 0, color: 'var(--fg)',
        }}>
          {todo.title}
        </h1>

        {todo.notes && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: accentColor, fontSize: 14, marginTop: 1, flexShrink: 0 }}>→</span>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>{todo.notes}</p>
          </div>
        )}

        <CorraHintBox hint={corraHint} />
      </div>

      {/* Checklist */}
      {todo.checklist.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--fg-dim)',
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
          }}>
            Teilschritte · {doneCount}/{todo.checklist.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {todo.checklist.map((item, idx) => (
              <label
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: idx < todo.checklist.length - 1 ? '1px solid var(--border)' : undefined,
                  color: item.done ? 'var(--fg-dim)' : 'var(--fg)',
                }}
              >
                <button
                  type="button"
                  onClick={() => { toggleChecklist(todo.id, item.id).catch(() => {}) }}
                  style={{
                    width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                    border: `1.5px solid ${item.done ? 'var(--accent)' : 'var(--border-strong)'}`,
                    background: item.done ? 'var(--accent)' : 'transparent',
                    color: 'var(--accent-ink)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {item.done && <Check size={12} />}
                </button>
                <span style={{ fontSize: 14, textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Context action */}
      {(actionConfig || account) && (
        <button
          type="button"
          onClick={handleContextAction}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left', width: '100%',
          }}
        >
          {ActionIcon && (
            <span style={{
              width: 32, height: 32, borderRadius: 9,
              background: `${accentColor}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: accentColor,
            }}>
              <ActionIcon size={15} />
            </span>
          )}
          <span style={{ flex: 1 }}>
            {actionConfig ? actionConfig.label : `Bei ${account?.name ?? 'Kunden'} öffnen`}
            {account && actionConfig && (
              <span style={{ color: 'var(--fg-dim)', fontWeight: 400, marginLeft: 8 }}>· {account.name}</span>
            )}
          </span>
          <ArrowRight size={15} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
        </button>
      )}

      {/* Schnellnotiz */}
      {todo.customerId && (
        <div>
          {!showNote ? (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1px dashed var(--border)', background: 'transparent',
                color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 14 }}>✎</span>
              Schnellnotiz hinzufügen…
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                autoFocus
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Notiz…"
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--fg)', fontSize: 13, outline: 'none',
                  resize: 'none', fontFamily: 'inherit', lineHeight: 1.6,
                  boxSizing: 'border-box',
                }}
              />
              {saveError && (
                <p style={{ fontSize: 11, color: 'oklch(72% 0.18 25)', margin: 0 }}>
                  Konnte nicht gespeichert werden — bitte erneut versuchen.
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={!noteText.trim() || savingNote}
                  onClick={async () => {
                    setSaveError(false)
                    if (!noteText.trim() || !todo.customerId || !workspaceId || !userId) return
                    setSavingNote(true)
                    try {
                      await createActivity({
                        workspaceId,
                        createdBy: userId,
                        accountId: todo.customerId,
                        type: 'note',
                        title: 'Schnellnotiz aus Focus',
                        body: noteText.trim(),
                      })
                      setNoteText('')
                      setShowNote(false)
                    } catch {
                      setSaveError(true)
                      // keep note open so user doesn't lose their text
                    } finally {
                      setSavingNote(false)
                    }
                  }}
                  style={{
                    padding: '7px 16px', borderRadius: 99, border: 'none',
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    opacity: !noteText.trim() || savingNote ? 0.5 : 1,
                  }}
                >
                  {savingNote ? 'Speichert…' : 'Speichern'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNote(false); setNoteText('') }}
                  style={{
                    padding: '7px 14px', borderRadius: 99,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => { onComplete().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 99, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700,
            boxShadow: '0 4px 16px -6px var(--accent-glow)', cursor: 'pointer',
          }}
        >
          <Check size={14} />
          Erledigt
          <span style={{ fontSize: 9, opacity: 0.6, fontFamily: 'var(--font-mono)', marginLeft: 2 }}>SPACE</span>
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '11px 16px', borderRadius: 99,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Morgen
          <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none',
            color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px',
          }}
        >
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

    </div>

    {showInvoiceForm && (
      <InvoiceForm
        initialAccountId={todo.customerId ?? undefined}
        onClose={() => setShowInvoiceForm(false)}
        onSaved={handleInvoiceSaved}
      />
    )}
    </>
  )
}
