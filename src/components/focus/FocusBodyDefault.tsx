// src/components/focus/FocusBodyDefault.tsx
import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore } from '@/store/ui.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
import type { Todo } from '@/types/todo.types'
import { Check, ArrowRight, FileText, Tag, Mail, Phone, Reply } from 'lucide-react'
import { detectFocusAction, getFocusActionConfig } from '@/lib/focus-actions'
import type { FocusActionType } from '@/lib/focus-actions'
import type { LucideIcon } from 'lucide-react'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { CorraHintBox } from './CorraHintBox'

const ACTION_ICONS: Record<FocusActionType, LucideIcon> = {
  invoice: FileText, offer: Tag, mail: Mail, call: Phone, followup: Reply,
}

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
}

export function FocusBodyDefault({ todo, onComplete }: Props) {
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const accounts        = useAccountsStore(s => s.accounts)
  const openCustomerAt  = useUiStore(s => s.openCustomerAt)
  const setAppView      = useUiStore(s => s.setAppView)
  const loadAll         = useFinanceStore(s => s.loadAll)
  const workspaceId     = useWorkspaceStore(s => s.activeWorkspaceId)
  const createActivity  = useActivitiesStore(s => s.create)
  const activities      = useActivitiesStore(s => s.activities)
  const userId          = useAuthStore(s => s.user?.id)

  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [noteText, setNoteText]   = useState('')
  const [showNote, setShowNote]   = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const account   = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const doneCount = todo.checklist.filter(c => c.done).length
  const corraHint = useCorraContextHint(todo.customerId, account?.name ?? '', 'general')

  const recentActs = activities
    .filter(a => a.accountId === todo.customerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3)

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

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', flex: 1, overflow: 'hidden' }}>

      {/* Left: notes, CORRA, context action, Schnellnotiz */}
      <div style={{
        padding: '18px 20px 18px 24px',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {todo.notes && (
          <div style={{ fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            {todo.notes}
          </div>
        )}

        <CorraHintBox hint={corraHint} />

        {(actionConfig || account) && (
          <button
            type="button"
            onClick={handleContextAction}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--fg)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            {ActionIcon && (
              <span style={{
                width: 28, height: 28, borderRadius: 8, background: 'var(--accent-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: 'var(--accent)',
              }}>
                <ActionIcon size={13} />
              </span>
            )}
            <span style={{ flex: 1 }}>
              {actionConfig ? actionConfig.label : `Bei ${account?.name ?? 'Kunden'} öffnen`}
              {account && actionConfig && (
                <span style={{ color: 'var(--fg-dim)', fontWeight: 400, marginLeft: 8 }}>· {account.name}</span>
              )}
            </span>
            <ArrowRight size={13} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
          </button>
        )}

        {todo.customerId && (
          <div>
            {!showNote ? (
              <button
                type="button"
                onClick={() => setShowNote(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '9px 13px', borderRadius: 9,
                  border: '1px dashed var(--border)', background: 'transparent',
                  color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 13 }}>✎</span>
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
                    width: '100%', padding: '9px 13px', borderRadius: 9,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--fg)', fontSize: 13, outline: 'none',
                    resize: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box',
                  }}
                />
                {saveError && (
                  <p style={{ fontSize: 11, color: 'var(--danger)', margin: 0 }}>
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
                          workspaceId, createdBy: userId,
                          accountId: todo.customerId,
                          type: 'note', title: 'Schnellnotiz aus Focus', body: noteText.trim(),
                        })
                        setNoteText('')
                        setShowNote(false)
                      } catch {
                        setSaveError(true)
                      } finally {
                        setSavingNote(false)
                      }
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: 99, border: 'none',
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
                      padding: '6px 13px', borderRadius: 99,
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
      </div>

      {/* Right: checklist + recent activities */}
      <div style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {todo.checklist.length > 0 && (
          <div>
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 8,
            }}>
              Teilschritte · {doneCount}/{todo.checklist.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todo.checklist.map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <button
                    type="button"
                    onClick={() => { toggleChecklist(todo.id, item.id).catch(() => {}) }}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `1.5px solid ${item.done ? 'var(--accent)' : 'var(--border-strong)'}`,
                      background: item.done ? 'var(--accent)' : 'transparent',
                      color: 'var(--accent-ink)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, cursor: 'pointer',
                    }}
                  >
                    {item.done && <Check size={10} />}
                  </button>
                  <span style={{
                    fontSize: 12, lineHeight: 1.3,
                    color: item.done ? 'var(--fg-dim)' : 'var(--fg)',
                    textDecoration: item.done ? 'line-through' : 'none',
                  }}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {recentActs.length > 0 && (
          <div>
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 8,
            }}>
              Aktivitäten
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentActs.map(act => (
                <div key={act.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: 99, background: 'var(--fg-dim)',
                    flexShrink: 0, marginTop: 4,
                  }} />
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fg-muted)', lineHeight: 1.3 }}>{act.title}</div>
                    <div style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                      {new Date(act.updatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    {showInvoiceForm && (
      <InvoiceForm
        initialAccountId={todo.customerId ?? undefined}
        onClose={() => setShowInvoiceForm(false)}
        onSaved={() => {
          setShowInvoiceForm(false)
          if (workspaceId) loadAll(workspaceId)
          onComplete().catch(() => {})
        }}
      />
    )}
    </>
  )
}
