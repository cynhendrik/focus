# Focus WorkSurface Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow centered card (max-width 580px) in the Focus session with a full-width three-zone work surface: Hero (title + actions) → Body (type-specific content) → Cockpit (existing bar).

**Architecture:** A new `FocusWorkSurface` orchestrates three zones. `FocusHero` is a shared header for all card types. Four `FocusBody*` components extract the type-specific content from the old `FocusCard*` files (removing the card wrapper + title block). `FocusSessionView` mounts only `FocusWorkSurface`; the four old `FocusCard*` files are deleted.

**Tech Stack:** React 18, TypeScript, Zustand stores, Lucide icons, inline styles (existing codebase pattern).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/focus/FocusHero.tsx` | Create | Shared hero zone: accent bar, priority tag, customer, due date, title, action buttons |
| `src/components/focus/FocusBodyDefault.tsx` | Create | Body for default tasks: 2-col grid (notes+CORRA+Schnellnotiz left, checklist+activities right) |
| `src/components/focus/FocusBodyReminder.tsx` | Create | Body for `send_reminder`: dunning context + compose area |
| `src/components/focus/FocusBodyInvoice.tsx` | Create | Body for `create_invoice`: invoice preview + send flow |
| `src/components/focus/FocusBodyFollowUp.tsx` | Create | Body for `followup`/`reply_mail`: email compose + CORRA auto-draft |
| `src/components/focus/FocusWorkSurface.tsx` | Create | Shell: Hero + body routing by actionType + CockpitBar |
| `src/components/focus/FocusSessionView.tsx` | Modify | Swap `FocusCard*` rendering for `<FocusWorkSurface>` |
| `src/components/focus/FocusCardDefault.tsx` | Delete | Replaced by FocusHero + FocusBodyDefault |
| `src/components/focus/FocusCardReminder.tsx` | Delete | Replaced by FocusHero + FocusBodyReminder |
| `src/components/focus/FocusCardInvoice.tsx` | Delete | Replaced by FocusHero + FocusBodyInvoice |
| `src/components/focus/FocusCardFollowUp.tsx` | Delete | Replaced by FocusHero + FocusBodyFollowUp |

---

## Task 1: FocusHero

**Files:**
- Create: `src/components/focus/FocusHero.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusHero.tsx
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
  return PRIO_COLOR[todo.priority] ?? 'var(--accent)'
}

function getPrioLabel(todo: Todo): string {
  if (todo.actionType === 'send_reminder') return 'Mahnung'
  if (todo.actionType === 'create_invoice') return 'Rechnung'
  if (todo.actionType === 'followup') return 'Follow-Up'
  if (todo.actionType === 'reply_mail') return 'Antwort'
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
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FocusHero
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusHero.tsx
git commit -m "feat(focus): FocusHero — shared hero zone with accent bar, title, action buttons"
```

---

## Task 2: FocusBodyDefault

**Files:**
- Create: `src/components/focus/FocusBodyDefault.tsx`

This is the content of `FocusCardDefault` with its outer card wrapper and title block removed, restructured into a 2-column grid (notes+CORRA+Schnellnotiz left, checklist+activities right). The action buttons (Erledigt/Morgen/Überspringen) move to the Hero — they are not rendered here.

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FocusBodyDefault
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusBodyDefault.tsx
git commit -m "feat(focus): FocusBodyDefault — 2-col body with notes, CORRA, checklist, activities"
```

---

## Task 3: FocusBodyReminder

**Files:**
- Create: `src/components/focus/FocusBodyReminder.tsx`

This is the content of `FocusCardReminder` with the outer card wrapper div and title block removed. The context paragraph, AlertTriangle, and CorraHintBox become a context section at the top of the body. The compose area and action row are preserved verbatim.

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusBodyReminder.tsx
import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { getDunningState } from '@/hooks/useOverdueTaskSync'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Contact } from '@/types/contact.types'
import { Send, Sparkles, Loader, AlertTriangle, Mail, MessageCircle } from 'lucide-react'
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
import { CorraHintBox } from './CorraHintBox'

function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildSubject(level: number, invoiceNumber: string | undefined, total: number): string {
  const num = invoiceNumber ?? 'Entwurf'
  const amt = formatEur(total)
  if (level === 0) return `Zahlungserinnerung · Rechnung ${num} · ${amt} €`
  if (level === 1) return `1. Mahnung · Rechnung ${num} · ${amt} €`
  return `2. Mahnung · Rechnung ${num} · ${amt} € [dringend]`
}

const LEVEL_COLOR = ['var(--warn)', 'var(--danger)', 'var(--danger)']
const LEVEL_BADGE = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

export function FocusBodyReminder({ todo, onComplete, onSkip, onPostpone }: Props) {
  const invoices     = useFinanceStore(s => s.invoices)
  const accounts     = useAccountsStore(s => s.accounts)
  const allTodos     = useTodosStore(s => s.allTodos)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const dunningLevel = useMemo(() => {
    if (!invoice) return 0
    return allTodos.filter(
      t => t.sourceRef === invoice.id && t.actionType === 'send_reminder' && t.status === 'done',
    ).length
  }, [invoice, allTodos])

  const corraHint = useCorraContextHint(
    invoice?.accountId, account?.name ?? '', 'reminder', invoice?.id,
  )

  const accentColor = LEVEL_COLOR[dunningLevel] ?? LEVEL_COLOR[2]
  const daysOverdue = invoice
    ? Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000))
    : 0

  const [subject, setSubject]       = useState(invoice ? buildSubject(dunningLevel, invoice.number, invoice.total) : todo.title)
  const [body, setBody]             = useState('')
  const [recipient, setRecipient]   = useState('')
  const [sending, setSending]       = useState(false)
  const [generating, setGenerating] = useState(false)
  const [hasCorraDraft, setHasCorraDraft] = useState(false)
  const [channel, setChannel]       = useState<'email' | 'whatsapp'>('email')

  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => setRecipient(contacts.find(c => c.email)?.email ?? ''))
      .catch((err: unknown) => log.warn('Failed to load contacts for reminder', { err }))
  }, [invoice?.accountId])

  useEffect(() => {
    if (!invoice || !account) return
    setGenerating(true)
    generateCorraDraft({
      kind: 'reminder', customerName: account.name,
      invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
      amount: invoice.total, dueDate: invoice.dueDate, daysOverdue, dunningLevel,
    })
      .then(draft => { if (draft) { setBody(draft); setHasCorraDraft(true) } })
      .catch(() => {
        setBody(dunningLevel === 0
          ? `Hey, kleine Erinnerung: Die Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.total)} € ist seit ${daysOverdue} Tagen fällig. Falls schon überwiesen, einfach ignorieren — ansonsten freuen wir uns über die Zahlung. Bei Fragen einfach melden!`
          : `Hallo, wir melden uns nochmals wegen der offenen Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.total)} € (fällig seit ${daysOverdue} Tagen). Bitte überweise den Betrag bis Ende der Woche. Bei Fragen sind wir für dich da.`
        )
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, dunningLevel])

  const regenerate = async () => {
    if (!invoice || !account || generating) return
    setGenerating(true)
    try {
      const draft = await generateCorraDraft({
        kind: 'reminder', customerName: account.name,
        invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
        amount: invoice.total, dueDate: invoice.dueDate, daysOverdue, dunningLevel,
      })
      if (draft) { setBody(draft); setHasCorraDraft(true) }
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    if (channel === 'whatsapp') { showToast({ message: 'WhatsApp-Versand kommt bald.', variant: 'info' }); return }
    if (!mailAccounts[0]) { showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' }); return }
    if (!recipient.trim()) { showToast({ message: 'Bitte Empfänger-E-Mail angeben.', variant: 'error' }); return }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id, to: [recipient.trim()],
        subject: subject.trim(), bodyText: body.trim(),
      })
      showToast({ message: `${LEVEL_BADGE[dunningLevel] ?? 'Mahnung'} gesendet.`, variant: 'success' })
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const nextState = invoice ? getDunningState(invoice, allTodos) : null

  return (
    <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Context section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {invoice && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: accentColor, fontSize: 14, marginTop: 1, flexShrink: 0 }}>→</span>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
              {dunningLevel === 0
                ? `${invoice.number ?? ''} ist seit dem ${new Date(invoice.dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} überfällig. Je länger es liegt, desto unangenehmer wird das Gespräch — eine freundliche Erinnerung heute löst es meistens.`
                : dunningLevel === 1
                ? `Zahlungserinnerung wurde ignoriert — ${daysOverdue} Tage überfällig. Jetzt Zeit für eine formelle 1. Mahnung.`
                : `Zwei Erinnerungen ignoriert — ${daysOverdue} Tage überfällig. Das ist die letzte Warnung vor weiteren Schritten.`
              }
            </p>
          </div>
        )}
        {dunningLevel >= 2 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 14px', borderRadius: 10,
            background: `${accentColor}10`, border: `1px solid ${accentColor}28`,
            fontSize: 12, color: accentColor,
          }}>
            <AlertTriangle size={13} />
            Nach dieser Mahnung: manuell über Inkasso / rechtliche Schritte entscheiden.
          </div>
        )}
        <CorraHintBox hint={corraHint} />
      </div>

      {/* Compose area */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setChannel('email')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: channel === 'email' ? 'var(--accent)' : 'transparent', color: channel === 'email' ? 'var(--accent-ink)' : 'var(--fg-dim)', border: channel === 'email' ? 'none' : '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Mail size={12} /> E-Mail
            </button>
            <button type="button" onClick={() => setChannel('whatsapp')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: channel === 'whatsapp' ? 'var(--accent)' : 'transparent', color: channel === 'whatsapp' ? 'var(--accent-ink)' : 'var(--fg-dim)', border: channel === 'whatsapp' ? 'none' : '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <MessageCircle size={12} /> WhatsApp
            </button>
          </div>
          {hasCorraDraft && !generating && (
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={9} /> CORRA-ENTWURF · EDITIERBAR
            </span>
          )}
          {generating && (
            <span style={{ fontSize: 9, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CORRA DENKT…
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>AN</span>
          <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder={channel === 'whatsapp' ? 'Handynummer…' : 'E-Mail-Adresse…'} style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }} />
        </div>
        {channel === 'email' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>BETREFF</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }} />
          </div>
        )}
        <textarea value={generating ? '…' : body} onChange={e => setBody(e.target.value)} disabled={generating} rows={5} style={{ width: '100%', background: 'transparent', border: 'none', padding: '14px 16px', fontSize: 14, color: generating ? 'var(--fg-dim)' : 'var(--fg)', outline: 'none', resize: 'none', lineHeight: 1.65, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>

      {nextState && dunningLevel < 2 && (
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0 }}>
          Bei ausbleibender Zahlung erscheint in {dunningLevel === 0 ? 7 : 14} Tagen automatisch die {dunningLevel === 0 ? '1. Mahnung' : '2. Mahnung'}.
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={handleSend} disabled={sending || generating} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 99, border: 'none', background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)', color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)', fontSize: 13, fontWeight: 700, boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)', cursor: (sending || generating) ? 'not-allowed' : 'pointer', transition: 'all 200ms' }}>
          <Send size={14} />
          {sending ? 'Wird gesendet…' : 'Erinnerung senden'}
        </button>
        <button type="button" onClick={regenerate} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)', color: generating ? 'var(--fg-dim)' : 'var(--fg)', fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
          Corra neu
        </button>
        <button type="button" onClick={() => { onPostpone().catch(() => {}) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px', borderRadius: 99, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer' }}>
          Morgen <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onSkip} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px' }}>
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FocusBodyReminder
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusBodyReminder.tsx
git commit -m "feat(focus): FocusBodyReminder — dunning context + compose, extracted from FocusCardReminder"
```

---

## Task 4: FocusBodyInvoice

**Files:**
- Create: `src/components/focus/FocusBodyInvoice.tsx`

Extracted from `FocusCardInvoice` — outer wrapper + meta row + title removed. Keeps: CORRA hint, invoice preview, action row.

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusBodyInvoice.tsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
import { useToastStore } from '@/store/toast.store'
import { useMailStore } from '@/store/mail.store'
import { useCompanyStore } from '@/store/company.store'
import { FinanceService } from '@/services/finance.service'
import { MailService } from '@/services/mail.service'
import { getInvoicePdfBytes } from '@/components/finance/InvoicePDF'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { InvoiceItem } from '@/types/finance.types'
import type { Contact } from '@/types/contact.types'
import { Send, Paperclip, Clock } from 'lucide-react'
import { CorraHintBox } from './CorraHintBox'

function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ACCENT_RED = 'var(--danger)'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

export function FocusBodyInvoice({ todo, onComplete, onSkip, onPostpone }: Props) {
  const invoices    = useFinanceStore(s => s.invoices)
  const accounts    = useAccountsStore(s => s.accounts)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const userId      = useAuthStore(s => s.user?.id)
  const showToast   = useToastStore(s => s.show)
  const mailAccounts = useMailStore(s => s.accounts)
  const profile     = useCompanyStore(s => s.profile)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const corraHint = useCorraContextHint(
    invoice?.accountId, account?.name ?? '', 'invoice', invoice?.id,
  )

  const [items, setItems]           = useState<InvoiceItem[]>([])
  const [billingEmail, setBillingEmail] = useState<string>('')
  const [sending, setSending]       = useState(false)
  const [sendLabel, setSendLabel]   = useState('Rechnung erstellen & senden')

  useEffect(() => {
    if (!invoice?.id) return
    FinanceService.getInvoice(invoice.id)
      .then(data => setItems(data.items))
      .catch((err: unknown) => log.warn('Failed to load invoice items', { invoiceId: invoice.id, err }))
  }, [invoice?.id])

  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => setBillingEmail(contacts.find(c => c.email)?.email ?? ''))
      .catch(() => {})
  }, [invoice?.accountId])

  const handleCreateAndSend = async () => {
    if (!invoice || !workspaceId || !userId) {
      showToast({ message: 'Fehler: Daten nicht verfügbar.', variant: 'error' }); return
    }
    setSending(true)
    try {
      setSendLabel('Wird erstellt…')
      await FinanceService.approveInvoiceSuggestion(invoice.id, userId, workspaceId)
      const fullInvoice = await FinanceService.getInvoice(invoice.id)
      let pdfPath: string | null = null
      if (profile && account) {
        setSendLabel('PDF wird generiert…')
        try {
          const bytes = await getInvoicePdfBytes(fullInvoice, profile, account)
          const safeClient = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
          const filename = `Rechnung_${invoice.number ?? invoice.id}_${safeClient}.pdf`
          pdfPath = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
        } catch (err) {
          log.warn('PDF generation failed', { invoiceId: invoice.id, err })
        }
      }
      if (mailAccounts[0] && billingEmail) {
        setSendLabel('Wird gesendet…')
        const invoiceNum = invoice.number ?? 'Entwurf'
        await MailService.sendEmail({
          accountId: mailAccounts[0].id, to: [billingEmail],
          subject: `Rechnung ${invoiceNum} · ${formatEur(invoice.total)} €`,
          bodyText: `Sehr geehrte Damen und Herren,\n\nim Anhang finden Sie die Rechnung ${invoiceNum} über ${formatEur(invoice.total)} €.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen`,
          ...(pdfPath ? { attachmentPaths: [pdfPath] } : {}),
        })
        showToast({ message: 'Rechnung erstellt & gesendet.', variant: 'success' })
      } else {
        showToast({ message: 'Rechnung erstellt.', variant: 'success' })
      }
      await onComplete()
    } catch (err) {
      log.warn('Failed to create/send invoice', { invoiceId: invoice?.id, err })
      showToast({ message: 'Fehler beim Erstellen der Rechnung.', variant: 'error' })
    } finally {
      setSending(false)
      setSendLabel('Rechnung erstellen & senden')
    }
  }

  return (
    <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {todo.notes && (
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>{todo.notes}</p>
      )}

      <CorraHintBox hint={corraHint} />

      {invoice && (
        <div style={{ background: 'var(--surface-3)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
              {invoice.number ?? 'Entwurf'} · {account?.name ?? ''}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: `${ACCENT_RED}18`, color: ACCENT_RED, padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)' }}>NEU</span>
              {invoice.dealId && (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'oklch(50% 0 0 / 0.1)', color: 'var(--fg-muted)', padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)' }}>AUS ANGEBOT</span>
              )}
            </div>
          </div>
          <div style={{ padding: '4px 0' }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', fontSize: 13, color: 'var(--fg)', borderBottom: '1px solid oklch(50% 0 0 / 0.06)' }}>
                <span>{item.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 16 }}>{formatEur(item.total)} €</span>
              </div>
            ))}
            {items.length === 0 && (
              <div style={{ padding: '9px 16px', fontSize: 13, color: 'var(--fg-dim)' }}>Lade Positionen…</div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>Gesamt · Netto</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--fg)' }}>{formatEur(invoice.total)} €</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'oklch(92% 0.2 125 / 0.06)', borderTop: '1px solid oklch(92% 0.2 125 / 0.12)', fontSize: 12, color: 'oklch(70% 0.15 125)' }}>
            <Paperclip size={12} style={{ flexShrink: 0 }} />
            <span>
              Wird als PDF an die Buchhaltung
              {billingEmail ? <> (<span style={{ fontFamily: 'var(--font-mono)' }}>{billingEmail}</span>)</> : ' (keine E-Mail hinterlegt)'}
              {' '}gesendet.
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={onSkip} style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderRadius: 99, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer' }}>
          Überspringen
        </button>
        <button type="button" onClick={() => { onPostpone().catch(() => {}) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 99, border: 'none', background: 'oklch(50% 0 0 / 0.08)', color: 'var(--fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Clock size={14} /> Morgen <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>
        <button type="button" onClick={handleCreateAndSend} disabled={sending} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderRadius: 99, border: 'none', background: sending ? 'var(--surface-3)' : 'var(--accent)', color: sending ? 'var(--fg-muted)' : 'var(--accent-ink)', fontSize: 14, fontWeight: 700, boxShadow: sending ? 'none' : '0 6px 20px -8px var(--accent-glow)', cursor: sending ? 'not-allowed' : 'pointer', transition: 'all 200ms' }}>
          <Send size={15} /> {sendLabel}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FocusBodyInvoice
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusBodyInvoice.tsx
git commit -m "feat(focus): FocusBodyInvoice — invoice preview + send flow, extracted from FocusCardInvoice"
```

---

## Task 5: FocusBodyFollowUp

**Files:**
- Create: `src/components/focus/FocusBodyFollowUp.tsx`

Extracted from `FocusCardFollowUp` — outer card wrapper + title block removed. Context paragraph and CorraHintBox become a context section; compose area and actions are preserved verbatim.

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusBodyFollowUp.tsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Contact } from '@/types/contact.types'
import { Send, Sparkles, Loader, Mail, MessageCircle } from 'lucide-react'
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
import { CorraHintBox } from './CorraHintBox'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

const ACCENT = 'var(--warn)'

export function FocusBodyFollowUp({ todo, onComplete, onSkip, onPostpone }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const account     = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const isReplyMail = todo.actionType === 'reply_mail'
  const accentColor = isReplyMail ? 'var(--info)' : ACCENT

  const [contactName, setContactName] = useState('')
  const [recipient, setRecipient]     = useState('')
  const [subject, setSubject]         = useState(isReplyMail ? 'Re: …' : 'Kurz nachgehakt')
  const [body, setBody]               = useState('')
  const [sending, setSending]         = useState(false)
  const [generating, setGenerating]   = useState(false)
  const [hasCorraDraft, setHasCorraDraft] = useState(false)
  const [channel, setChannel]         = useState<'email' | 'whatsapp'>('email')

  const corraHint = useCorraContextHint(todo.customerId, account?.name ?? '', 'followup')

  useEffect(() => {
    if (!todo.customerId) return
    invoke<Contact[]>('get_contacts', { accountId: todo.customerId })
      .then(contacts => {
        const primary = contacts.find(c => c.email)
        if (primary) {
          setRecipient(primary.email ?? '')
          setContactName([primary.firstName, primary.lastName].filter(Boolean).join(' '))
        }
      })
      .catch((err: unknown) => log.warn('Failed to load contacts for followup', { err }))
  }, [todo.customerId])

  useEffect(() => {
    setGenerating(true)
    generateCorraDraft(
      isReplyMail
        ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName, subject: todo.title, notes: todo.notes }
        : { kind: 'followup', customerName: account?.name ?? '', contactName, topic: todo.title, notes: todo.notes }
    )
      .then(draft => { if (draft) { setBody(draft); setHasCorraDraft(true) } })
      .catch(() => {
        setBody(isReplyMail
          ? 'Danke für deine Nachricht! Ich schaue mir das an und melde mich kurz bei dir.'
          : 'Wollte kurz nachfragen, wie es läuft — gibt es Neuigkeiten von deiner Seite?'
        )
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id])

  const regenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const draft = await generateCorraDraft(
        isReplyMail
          ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName, subject: todo.title, notes: todo.notes }
          : { kind: 'followup', customerName: account?.name ?? '', contactName, topic: todo.title, notes: todo.notes }
      )
      if (draft) { setBody(draft); setHasCorraDraft(true) }
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    if (channel === 'whatsapp') { showToast({ message: 'WhatsApp-Versand kommt bald.', variant: 'info' }); return }
    if (!mailAccounts[0]) { showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' }); return }
    if (!recipient.trim()) { showToast({ message: 'Bitte eine Empfänger-E-Mail angeben.', variant: 'error' }); return }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id, to: [recipient.trim()],
        subject: subject.trim(), bodyText: body.trim(),
      })
      showToast({ message: isReplyMail ? 'Antwort gesendet.' : 'Follow-Up gesendet.', variant: 'success' })
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const contextText = todo.notes
    ?? (isReplyMail ? 'Eine Antwort ist fällig — CORRA hat einen Entwurf vorbereitet.' : 'Kein aktiver Kontakt — Zeit für eine kurze Nachricht.')

  return (
    <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Context */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ color: accentColor, fontSize: 14, marginTop: 1, flexShrink: 0 }}>→</span>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>{contextText}</p>
        </div>
        <CorraHintBox hint={corraHint} />
      </div>

      {/* Compose */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setChannel('email')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: channel === 'email' ? 'var(--accent)' : 'transparent', color: channel === 'email' ? 'var(--accent-ink)' : 'var(--fg-dim)', border: channel === 'email' ? 'none' : '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Mail size={12} /> E-Mail
            </button>
            <button type="button" onClick={() => setChannel('whatsapp')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: channel === 'whatsapp' ? 'var(--accent)' : 'transparent', color: channel === 'whatsapp' ? 'var(--accent-ink)' : 'var(--fg-dim)', border: channel === 'whatsapp' ? 'none' : '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <MessageCircle size={12} /> WhatsApp
            </button>
          </div>
          {hasCorraDraft && !generating && (
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={9} /> CORRA-ENTWURF · EDITIERBAR
            </span>
          )}
          {generating && (
            <span style={{ fontSize: 9, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CORRA DENKT…
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>AN</span>
          <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>
            {contactName || account?.name || '—'}
            {recipient && <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontFamily: 'var(--font-mono)', fontSize: 12 }}> &lt;{recipient}&gt;</span>}
          </span>
          {!recipient && (
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder={channel === 'whatsapp' ? 'Handynummer…' : 'E-Mail eingeben…'} style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }} />
          )}
        </div>
        {channel === 'email' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>BETREFF</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }} />
          </div>
        )}
        <textarea value={generating ? '…' : body} onChange={e => setBody(e.target.value)} disabled={generating} rows={5} style={{ width: '100%', background: 'transparent', border: 'none', padding: '14px 16px', fontSize: 14, color: generating ? 'var(--fg-dim)' : 'var(--fg)', outline: 'none', resize: 'none', lineHeight: 1.65, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={handleSend} disabled={sending || generating} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 99, border: 'none', background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)', color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)', fontSize: 13, fontWeight: 700, boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)', cursor: (sending || generating) ? 'not-allowed' : 'pointer', transition: 'all 200ms' }}>
          <Send size={14} />
          {sending ? 'Wird gesendet…' : isReplyMail ? 'Antwort senden' : 'Nachfassen'}
        </button>
        <button type="button" onClick={regenerate} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)', color: generating ? 'var(--fg-dim)' : 'var(--fg)', fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
          Corra neu
        </button>
        <button type="button" onClick={() => { onPostpone().catch(() => {}) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px', borderRadius: 99, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer' }}>
          Morgen <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onSkip} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px' }}>
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FocusBodyFollowUp
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusBodyFollowUp.tsx
git commit -m "feat(focus): FocusBodyFollowUp — compose + CORRA auto-draft, extracted from FocusCardFollowUp"
```

---

## Task 6: FocusWorkSurface

**Files:**
- Create: `src/components/focus/FocusWorkSurface.tsx`

Orchestrates all zones: FocusHero + body routing + FocusCockpitBar. `FocusSessionView` will use this in the next task.

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusWorkSurface.tsx
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo } from '@/types/todo.types'
import { FocusHero } from './FocusHero'
import { FocusBodyDefault } from './FocusBodyDefault'
import { FocusBodyReminder } from './FocusBodyReminder'
import { FocusBodyInvoice } from './FocusBodyInvoice'
import { FocusBodyFollowUp } from './FocusBodyFollowUp'
import { FocusCockpitBar } from './FocusCockpitBar'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

export function FocusWorkSurface({ todo, onComplete, onSkip, onPostpone }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const account      = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const customerName = account?.name ?? (todo.customerId ? 'Kunden-Session' : 'Allgemein')

  const isReminder = todo.actionType === 'send_reminder'
  const isInvoice  = todo.actionType === 'create_invoice'
  const isFollowup = todo.actionType === 'followup' || todo.actionType === 'reply_mail'

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FocusHero
        todo={todo}
        onComplete={onComplete}
        onSkip={onSkip}
        onPostpone={onPostpone}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isReminder ? (
          <FocusBodyReminder todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
        ) : isInvoice ? (
          <FocusBodyInvoice todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
        ) : isFollowup ? (
          <FocusBodyFollowUp todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
        ) : (
          <FocusBodyDefault todo={todo} onComplete={onComplete} />
        )}
      </div>

      <FocusCockpitBar
        customerId={todo.customerId}
        customerName={customerName}
      />
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FocusWorkSurface
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusWorkSurface.tsx
git commit -m "feat(focus): FocusWorkSurface — Hero + body routing + Cockpit shell"
```

---

## Task 7: Wire FocusSessionView + Delete old cards

**Files:**
- Modify: `src/components/focus/FocusSessionView.tsx`
- Delete: `src/components/focus/FocusCardDefault.tsx`
- Delete: `src/components/focus/FocusCardReminder.tsx`
- Delete: `src/components/focus/FocusCardInvoice.tsx`
- Delete: `src/components/focus/FocusCardFollowUp.tsx`

- [ ] **Step 1: Read the current center column in FocusSessionView**

Read `src/components/focus/FocusSessionView.tsx` lines 1–20 (imports) and 198–236 (center column rendering).

- [ ] **Step 2: Replace imports**

In `FocusSessionView.tsx`, remove these imports:
```ts
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusCardInvoice } from './FocusCardInvoice'
import { FocusCardFollowUp } from './FocusCardFollowUp'
```

Add:
```ts
import { FocusWorkSurface } from './FocusWorkSurface'
```

Also remove these lines (they are no longer needed in FocusSessionView since FocusWorkSurface handles them):
```ts
const isReminder = current.actionType === 'send_reminder'
const isInvoice  = current.actionType === 'create_invoice'
const isFollowup = current.actionType === 'followup' || current.actionType === 'reply_mail'
```

- [ ] **Step 3: Replace center column rendering**

Find this block in FocusSessionView (after the CORRA chat branch):
```tsx
        ) : (
          <div style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Cards scrollable area */}
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '32px 40px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            }}>
              <div style={{ width: '100%', maxWidth: 580 }}>
                {isReminder ? (
                  <FocusCardReminder todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                ) : isInvoice ? (
                  <FocusCardInvoice  todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                ) : isFollowup ? (
                  <FocusCardFollowUp todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                ) : (
                  <FocusCardDefault  todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                )}
              </div>
            </div>

            {/* Cockpit Bar — persistent at bottom */}
            <FocusCockpitBar
              customerId={customerId}
              customerName={customerName}
            />
          </div>
        )}
```

Replace it with:
```tsx
        ) : (
          <FocusWorkSurface
            todo={current}
            onComplete={complete}
            onSkip={skip}
            onPostpone={postpone}
          />
        )}
```

Also remove the `FocusCockpitBar` import from FocusSessionView (now internal to FocusWorkSurface):
```ts
import { FocusCockpitBar } from './FocusCockpitBar'
```

- [ ] **Step 4: TypeScript check — zero errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors total.

- [ ] **Step 5: Delete old card files**

```bash
git rm src/components/focus/FocusCardDefault.tsx
git rm src/components/focus/FocusCardReminder.tsx
git rm src/components/focus/FocusCardInvoice.tsx
git rm src/components/focus/FocusCardFollowUp.tsx
```

- [ ] **Step 6: Run test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/focus/FocusSessionView.tsx
git commit -m "feat(focus): wire FocusWorkSurface into FocusSessionView, delete old FocusCard* components"
```

---

## Task 8: Final check

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 2: Full test run**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Verify no dead imports remain**

```bash
grep -rn "FocusCardDefault\|FocusCardReminder\|FocusCardInvoice\|FocusCardFollowUp" src/
```

Expected: no output (files are deleted and all imports removed).
