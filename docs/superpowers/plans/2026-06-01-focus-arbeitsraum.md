# Focus Arbeitsraum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global Focus Mode as a dedicated top-level route that surfaces all actionable tasks (including auto-generated payment reminders from overdue invoices) as a guided card-deck, with one-click email sending via SMTP.

**Architecture:** Todos (stored as `activities` with `type='task'` in SQLite) are extended with `source`, `actionType`, and `sourceRef` fields serialised into the existing `payload` JSON column — no DB migration needed. A `useOverdueTaskSync` hook auto-creates tasks for overdue invoices when Focus Route mounts. The existing `useFocusStack()` (no customerId arg) drives the global card stack. Two-panel layout: left = current card + action buttons, right = "Als Nächstes" queue.

**Tech Stack:** React, TypeScript, Zustand, Tauri (invoke), Vitest, lucide-react, existing `MailService.sendEmail`, `useFinanceStore`, `useTodosStore`, `useAccountsStore`, `useMailStore`, `useToastStore`.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types/todo.types.ts` | Add `source`, `actionType`, `sourceRef` to `Todo` + `UpsertTodoPayload` |
| Modify | `src/services/todo.service.ts` | Read/write new fields via payload JSON |
| Modify | `src/store/ui.store.ts` | Add `'focus'` to `AppView` |
| Modify | `src/components/layout/NavSidebar.tsx` | Add Focus nav entry with Zap icon + badge |
| Modify | `src/App.tsx` | Add `case 'focus': return <FocusRoute />` |
| Create | `src/hooks/useOverdueTaskSync.ts` | Generates tasks from overdue invoices |
| Create | `src/hooks/useOverdueTaskSync.test.ts` | Unit tests for sync logic |
| Create | `src/components/focus/FocusQueueSidebar.tsx` | "Als Nächstes" list |
| Create | `src/components/focus/FocusCardDefault.tsx` | Standard task card |
| Create | `src/components/focus/FocusCardReminder.tsx` | Payment reminder card with email editor + send button |
| Create | `src/components/focus/FocusWorkspace.tsx` | Two-panel layout, card switching, action bar |
| Create | `src/routes/FocusRoute.tsx` | Top-level route: loads finance data, mounts sync |

---

## Task 1: Extend Todo Type and Service

**Files:**
- Modify: `src/types/todo.types.ts`
- Modify: `src/services/todo.service.ts`
- Modify: `src/hooks/useFocusStack.test.ts` (update `makeTodo` helper)

- [ ] **Step 1: Add fields to `Todo` and `UpsertTodoPayload` in `src/types/todo.types.ts`**

Replace the `Todo` interface (lines 11–30) and `UpsertTodoPayload` (lines 32–48) with:

```ts
export type TodoSource     = 'manual' | 'finance'
export type TodoActionType = 'send_reminder'

export interface Todo {
  id: string
  customerId?: string
  title: string
  status: TodoStatus
  priority: TodoPriority
  bucket: TodoBucket
  scheduledAt?: string
  plannedMinutes?: number
  dueDate?: string
  notes?: string
  aiSummary?: string
  calendarEventId?: string
  checklist: ChecklistItem[]
  tags: string[]
  assignee?: string
  source?: TodoSource
  actionType?: TodoActionType
  sourceRef?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertTodoPayload {
  id?: string
  customerId?: string
  title: string
  status?: TodoStatus
  priority?: TodoPriority
  bucket?: TodoBucket
  scheduledAt?: string
  plannedMinutes?: number
  dueDate?: string
  notes?: string
  aiSummary?: string
  calendarEventId?: string
  checklist?: ChecklistItem[]
  tags?: string[]
  assignee?: string
  source?: TodoSource
  actionType?: TodoActionType
  sourceRef?: string
}
```

- [ ] **Step 2: Read new fields in `activityToTodo` in `src/services/todo.service.ts`**

In the `try { const p = JSON.parse(a.payload) ... }` block, after `calendarEventId`, add:

```ts
const source: Todo['source']         = typeof p.source === 'string' ? p.source as Todo['source'] : undefined
const actionType: Todo['actionType'] = typeof p.actionType === 'string' ? p.actionType as Todo['actionType'] : undefined
const sourceRef: string | undefined  = typeof p.sourceRef === 'string' ? p.sourceRef : undefined
```

Then add them to the returned object:

```ts
return {
  id: a.id,
  customerId: a.accountId,
  title: a.title ?? '',
  status,
  priority,
  bucket: bucket ?? deriveBucket(status, scheduledAt),
  scheduledAt,
  plannedMinutes,
  dueDate: a.dueAt,
  notes,
  aiSummary,
  calendarEventId,
  checklist,
  tags,
  assignee: a.assignee,
  source,
  actionType,
  sourceRef,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
}
```

- [ ] **Step 3: Write new fields in `TodoService.upsert` in `src/services/todo.service.ts`**

In the `activityPayload` object (the `JSON.stringify({...})` call), add after `calendarEventId`:

```ts
source:     payload.source     ?? null,
actionType: payload.actionType ?? null,
sourceRef:  payload.sourceRef  ?? null,
```

Also update `todoToPayload` in `src/store/todos.store.ts` to include the new fields — append to the returned object:

```ts
source:     t.source,
actionType: t.actionType,
sourceRef:  t.sourceRef,
```

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
npx vitest run src/hooks/useFocusStack.test.ts
```

Expected: all 7 tests PASS (the new optional fields don't affect existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/todo.types.ts src/services/todo.service.ts src/store/todos.store.ts
git commit -m "feat(focus): extend Todo type with source/actionType/sourceRef in payload JSON"
```

---

## Task 2: Add 'focus' to AppView and NavSidebar

**Files:**
- Modify: `src/store/ui.store.ts`
- Modify: `src/components/layout/NavSidebar.tsx`

- [ ] **Step 1: Add `'focus'` to `AppView` in `src/store/ui.store.ts`**

Find the `AppView` type (line ~88):
```ts
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'sales'     | 'invoices'  | 'inbox'
  | 'settings'  | 'integrations'
  | 'pipeline'  | 'calendar'   | 'mail' | 'followups' | 'leads'
  | 'journal'
```

Change to:
```ts
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'sales'     | 'invoices'  | 'inbox'
  | 'settings'  | 'integrations'
  | 'pipeline'  | 'calendar'   | 'mail' | 'followups' | 'leads'
  | 'journal'   | 'focus'
```

- [ ] **Step 2: Add Focus nav entry in `src/components/layout/NavSidebar.tsx`**

Add `Zap` to the lucide-react import line:
```ts
import {
  Home, Users, CreditCard,
  TrendingUp, Target, Reply,
  Calendar, Mail, Settings, Plug, Zap,
  ChevronRight, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
```

Add the badge count selector after existing store selectors (around line 92):
```ts
const allTodos       = useTodosStore(s => s.allTodos)
const focusCount     = allTodos.filter(t => t.status !== 'done' && (
  t.bucket === 'today' || t.bucket === 'in_progress'
)).length
```

Also add the import at top of file:
```ts
import { useTodosStore } from '@/store/todos.store'
```

In the Workspace section (after the `isAdmin && <SidebarNavItem icon={CreditCard} ...>` line), add:
```tsx
<SidebarNavItem
  icon={Zap}
  label="Fokus"
  active={appView === 'focus'}
  onClick={() => setAppView('focus')}
  kbd="W"
  badge={focusCount || undefined}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/store/ui.store.ts src/components/layout/NavSidebar.tsx
git commit -m "feat(focus): add 'focus' AppView and nav sidebar entry"
```

---

## Task 3: Build useOverdueTaskSync

**Files:**
- Create: `src/hooks/useOverdueTaskSync.ts`
- Create: `src/hooks/useOverdueTaskSync.test.ts`

- [ ] **Step 1: Write the failing test in `src/hooks/useOverdueTaskSync.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { shouldCreateReminderTask } from './useOverdueTaskSync'
import type { Todo } from '@/types/todo.types'
import type { Invoice } from '@/types/finance.types'

function makeInvoice(p: Partial<Invoice> & { id: string }): Invoice {
  return {
    id: p.id,
    workspaceId: 'ws1',
    createdBy: 'u1',
    accountId: p.accountId ?? 'acc1',
    date: '2026-01-01',
    dueDate: p.dueDate ?? '2026-04-01',
    status: p.status ?? 'overdue',
    taxMode: 'standard',
    subtotal: 1000,
    taxAmount: 190,
    total: p.total ?? 1190,
    bankInfo: '',
    isSuggestion: false,
    pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

function makeTodo(p: Partial<Todo> & { id: string }): Todo {
  return {
    id: p.id,
    title: 'x',
    status: p.status ?? 'open',
    priority: 'p1',
    bucket: 'today',
    checklist: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('shouldCreateReminderTask', () => {
  it('returns true when no existing task for that invoice', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    expect(shouldCreateReminderTask(invoice, [])).toBe(true)
  })

  it('returns false when an open task already references the invoice', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const task = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'open' })
    expect(shouldCreateReminderTask(invoice, [task])).toBe(false)
  })

  it('returns true when existing task is done (reminder can be re-sent)', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const doneTask = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'done' })
    expect(shouldCreateReminderTask(invoice, [doneTask])).toBe(true)
  })

  it('returns false for non-overdue invoice', () => {
    const invoice = makeInvoice({ id: 'inv1', status: 'open' })
    expect(shouldCreateReminderTask(invoice, [])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/hooks/useOverdueTaskSync.test.ts
```

Expected: FAIL — `shouldCreateReminderTask` is not defined.

- [ ] **Step 3: Create `src/hooks/useOverdueTaskSync.ts`**

```ts
import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'

/** Pure function — exported for testing. */
export function shouldCreateReminderTask(invoice: Invoice, todos: Todo[]): boolean {
  if (invoice.status !== 'overdue') return false
  return !todos.some(t => t.sourceRef === invoice.id && t.status !== 'done')
}

export function useOverdueTaskSync() {
  const invoices  = useFinanceStore(s => s.invoices)
  const allTodos  = useTodosStore(s => s.allTodos)
  const upsert    = useTodosStore(s => s.upsert)
  const accounts  = useAccountsStore(s => s.accounts)

  useEffect(() => {
    if (invoices.length === 0) return

    for (const invoice of invoices) {
      if (!shouldCreateReminderTask(invoice, allTodos)) continue

      const account = accounts.find(a => a.id === invoice.accountId)
      const customerName = account?.name ?? 'Kunde'

      upsert({
        customerId:  invoice.accountId,
        title:       `Zahlungserinnerung an ${customerName} schicken`,
        status:      'open',
        priority:    'p1',
        bucket:      'today',
        source:      'finance',
        actionType:  'send_reminder',
        sourceRef:   invoice.id,
        checklist:   [],
        tags:        [],
      }).catch(() => {})
    }
  }, [invoices, allTodos, upsert, accounts])
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/hooks/useOverdueTaskSync.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOverdueTaskSync.ts src/hooks/useOverdueTaskSync.test.ts
git commit -m "feat(focus): useOverdueTaskSync — auto-create tasks from overdue invoices"
```

---

## Task 4: Build FocusQueueSidebar

**Files:**
- Create: `src/components/focus/FocusQueueSidebar.tsx`

- [ ] **Step 1: Create `src/components/focus/FocusQueueSidebar.tsx`**

```tsx
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo } from '@/types/todo.types'
import { Zap } from 'lucide-react'

interface Props {
  stack: Todo[]
  currentIndex: number
}

const ACTION_LABEL: Record<string, string> = {
  send_reminder: 'Erinnerung',
}

export function FocusQueueSidebar({ stack, currentIndex }: Props) {
  const accounts = useAccountsStore(s => s.accounts)
  const upcoming = stack.slice(currentIndex + 1)

  return (
    <div style={{
      width: 272,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      paddingLeft: 24,
      borderLeft: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--fg-dim)',
        paddingBottom: 10,
      }}>
        Als Nächstes
      </div>

      {upcoming.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', paddingTop: 8 }}>
          Nichts mehr offen
        </div>
      )}

      {upcoming.map(todo => {
        const account = todo.customerId
          ? accounts.find(a => a.id === todo.customerId)
          : undefined
        const actionLabel = todo.actionType ? ACTION_LABEL[todo.actionType] : undefined

        return (
          <div key={todo.id} style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              color: 'var(--fg-dim)',
            }}>
              {actionLabel && (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}>
                  <Zap size={9} />
                  {actionLabel}
                </span>
              )}
              {account && <span>{account.name}</span>}
            </div>
            <div style={{
              fontSize: 13,
              lineHeight: 1.3,
              color: 'var(--fg)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {todo.title}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusQueueSidebar.tsx
git commit -m "feat(focus): FocusQueueSidebar — Als Nächstes queue"
```

---

## Task 5: Build FocusCardDefault

**Files:**
- Create: `src/components/focus/FocusCardDefault.tsx`

- [ ] **Step 1: Create `src/components/focus/FocusCardDefault.tsx`**

```tsx
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo } from '@/types/todo.types'

const PRIO_COLOR: Record<string, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<string, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

interface Props { todo: Todo }

export function FocusCardDefault({ todo }: Props) {
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const accounts        = useAccountsStore(s => s.accounts)
  const account = todo.customerId
    ? accounts.find(a => a.id === todo.customerId)
    : undefined
  const doneCount = todo.checklist.filter(c => c.done).length

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
      <div style={{ display: 'flex', gap: 10, fontSize: 11, alignItems: 'center' }}>
        <span style={{ color: PRIO_COLOR[todo.priority], fontWeight: 700 }}>
          ● {PRIO_LABEL[todo.priority]}
        </span>
        {account && (
          <span style={{ color: 'var(--fg-muted)' }}>· {account.name}</span>
        )}
      </div>

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

      {todo.notes && (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-muted)', margin: 0 }}>
          {todo.notes}
        </p>
      )}

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
                  onClick={() => toggleChecklist(todo.id, item.id)}
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
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusCardDefault.tsx
git commit -m "feat(focus): FocusCardDefault — standard task card"
```

---

## Task 6: Build FocusCardReminder

**Files:**
- Create: `src/components/focus/FocusCardReminder.tsx`

- [ ] **Step 1: Create `src/components/focus/FocusCardReminder.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import type { Todo } from '@/types/todo.types'
import type { Contact } from '@/types/contact.types'
import { Send, Mail } from 'lucide-react'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
}

function daysOverdue(dueDate: string): number {
  return Math.max(0, Math.floor(
    (Date.now() - new Date(dueDate).getTime()) / 86_400_000
  ))
}

function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FocusCardReminder({ todo, onComplete }: Props) {
  const invoices    = useFinanceStore(s => s.invoices)
  const accounts    = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast   = useToastStore(s => s.show)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const defaultSubject = invoice
    ? `Zahlungserinnerung · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)} · ${formatEur(invoice.total)} €`
    : todo.title

  const defaultBody = invoice && account
    ? `Guten Tag,\n\nmit dieser Nachricht möchten wir Sie freundlich daran erinnern, dass die Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.total)} € seit dem ${new Date(invoice.dueDate).toLocaleDateString('de-DE')} fällig ist.\n\nWir bitten um Begleichung des offenen Betrags.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen`
    : ''

  const [subject, setSubject]   = useState(defaultSubject)
  const [body, setBody]         = useState(defaultBody)
  const [recipient, setRecipient] = useState('')
  const [sending, setSending]   = useState(false)

  // Load primary contact email for this account
  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => {
        const email = contacts.find(c => c.email)?.email ?? ''
        setRecipient(email)
      })
      .catch(() => {})
  }, [invoice?.accountId])

  // Update defaults if invoice loads after mount
  useEffect(() => {
    setSubject(defaultSubject)
    setBody(defaultBody)
  }, [invoice?.id])

  const handleSend = async () => {
    if (!mailAccounts[0]) {
      showToast({ message: 'Kein E-Mail-Konto konfiguriert. Bitte zuerst ein Konto einrichten.', variant: 'error' })
      return
    }
    if (!recipient.trim()) {
      showToast({ message: 'Bitte Empfänger-E-Mail angeben.', variant: 'error' })
      return
    }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id,
        to: [recipient.trim()],
        subject: subject.trim(),
        bodyText: body.trim(),
      })
      showToast({ message: 'Erinnerung gesendet.', variant: 'success' })
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen. Bitte E-Mail-Verbindung prüfen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const overdueDays = invoice ? daysOverdue(invoice.dueDate) : 0

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: '4px solid var(--accent)',
      borderRadius: 18,
      padding: '32px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 10, fontSize: 11, alignItems: 'center' }}>
        <span style={{
          color: 'var(--accent)',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Finanzen
        </span>
        {account && <span style={{ color: 'var(--fg-muted)' }}>· {account.name}</span>}
        {invoice && (
          <span style={{ color: 'var(--fg-dim)' }}>
            · {formatEur(invoice.total)} €
          </span>
        )}
      </div>

      {/* Title */}
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.05,
        margin: 0,
        color: 'var(--fg)',
      }}>
        {todo.title}
      </h1>

      {/* Context */}
      {invoice && (
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
          → Rechnung {invoice.number ?? ''} ist seit {overdueDays} Tag{overdueDays !== 1 ? 'en' : ''} überfällig
          {overdueDays > 7 ? ' — je länger, desto unangenehmer das Gespräch.' : '.'}
        </p>
      )}

      {/* Email composer */}
      <div style={{
        background: 'var(--surface-3)',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-dim)',
          marginBottom: 4,
        }}>
          <Mail size={12} />
          E-Mail-Entwurf · editierbar
        </div>

        <input
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder="Empfänger-E-Mail"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--fg)',
            outline: 'none',
          }}
        />

        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--fg)',
            outline: 'none',
            fontWeight: 600,
          }}
        />

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--fg)',
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.55,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={sending}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px 28px',
          borderRadius: 99,
          background: sending ? 'var(--surface-3)' : 'var(--accent)',
          color: sending ? 'var(--fg-muted)' : 'var(--accent-ink)',
          fontSize: 14,
          fontWeight: 700,
          boxShadow: sending ? 'none' : '0 8px 24px -10px var(--accent-glow)',
          cursor: sending ? 'not-allowed' : 'pointer',
          transition: 'all 200ms',
          alignSelf: 'flex-start',
        }}
      >
        <Send size={15} />
        {sending ? 'Wird gesendet…' : 'Erinnerung senden'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusCardReminder.tsx
git commit -m "feat(focus): FocusCardReminder — payment reminder card with SMTP send"
```

---

## Task 7: Build FocusWorkspace

**Files:**
- Create: `src/components/focus/FocusWorkspace.tsx`

- [ ] **Step 1: Create `src/components/focus/FocusWorkspace.tsx`**

```tsx
import { useEffect } from 'react'
import { useFocusStack } from '@/hooks/useFocusStack'
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusQueueSidebar } from './FocusQueueSidebar'
import { Check, Clock, ChevronRight } from 'lucide-react'

export function FocusWorkspace() {
  const { current, currentIndex, total, stack, prev, skip, complete, postpone } = useFocusStack()

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')            { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight')           { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm')      { e.preventDefault(); postpone() }
      if (e.key === ' ' && current?.actionType !== 'send_reminder') {
        e.preventDefault()
        complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, skip, postpone, complete, current?.actionType])

  if (total === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 52 }}>🙌</div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 600,
          margin: 0,
        }}>
          Alles erledigt!
        </h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>
          Keine offenen Aufgaben für heute.
        </p>
      </div>
    )
  }

  if (!current) return null

  const isReminder = current.actionType === 'send_reminder'

  return (
    <div style={{
      display: 'flex',
      gap: 0,
      height: '100%',
      padding: '32px 40px',
    }}>
      {/* Left panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minWidth: 0,
        paddingRight: 32,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            fontWeight: 700,
          }}>
            Dein nächster Zug
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: Math.min(total, 8) }).map((_, i) => (
                <div key={i} style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: i === currentIndex
                    ? 'var(--accent)'
                    : 'oklch(50% 0 0 / 0.2)',
                  transition: 'background 200ms',
                }} />
              ))}
              {total > 8 && (
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 2 }}>
                  +{total - 8}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {currentIndex + 1} / {total}
            </span>
          </div>
        </div>

        {/* Card */}
        {isReminder ? (
          <FocusCardReminder todo={current} onComplete={complete} />
        ) : (
          <FocusCardDefault todo={current} />
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!isReminder && (
            <button
              onClick={complete}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 24px',
                borderRadius: 99,
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                fontSize: 14,
                fontWeight: 700,
                boxShadow: '0 8px 24px -10px var(--accent-glow)',
              }}
            >
              <Check size={16} />
              Erledigt · weiter
              <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>
                SPACE
              </span>
            </button>
          )}

          <button
            onClick={postpone}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '12px 18px',
              borderRadius: 99,
              background: 'oklch(50% 0 0 / 0.08)',
              color: 'var(--fg)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Clock size={14} />
            Morgen
            <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
          </button>

          <button
            onClick={skip}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: 'var(--fg-muted)',
              padding: '12px 16px',
            }}
          >
            Überspringen
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Right panel */}
      <FocusQueueSidebar stack={stack} currentIndex={currentIndex} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusWorkspace.tsx
git commit -m "feat(focus): FocusWorkspace — two-panel card deck layout"
```

---

## Task 8: Build FocusRoute and Wire App.tsx

**Files:**
- Create: `src/routes/FocusRoute.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/routes/FocusRoute.tsx`**

```tsx
import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useOverdueTaskSync } from '@/hooks/useOverdueTaskSync'
import { FocusWorkspace } from '@/components/focus/FocusWorkspace'

export function FocusRoute() {
  const loadFinance     = useFinanceStore(s => s.loadAll)
  const invoices        = useFinanceStore(s => s.invoices)
  const loadMailAccounts = useMailStore(s => s.loadAccounts)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  // Load finance data if not yet loaded
  useEffect(() => {
    if (!activeWorkspaceId) return
    if (invoices.length === 0) {
      loadFinance(activeWorkspaceId)
    }
  }, [activeWorkspaceId, invoices.length, loadFinance])

  // Load mail accounts for send functionality
  useEffect(() => {
    loadMailAccounts()
  }, [loadMailAccounts])

  // Auto-create tasks from overdue invoices
  useOverdueTaskSync()

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <FocusWorkspace />
    </div>
  )
}
```

- [ ] **Step 2: Wire into `src/App.tsx`**

Add import after the other route imports (around line 38):
```ts
import { FocusRoute } from '@/routes/FocusRoute'
```

In the `renderMain()` switch statement, add before the default case:
```ts
case 'focus':       return <FocusRoute />
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/FocusRoute.tsx src/App.tsx
git commit -m "feat(focus): FocusRoute + wire into App — Focus Arbeitsraum complete"
```

---

## Task 9: Verify in the App

- [ ] **Step 1: Run dev server**

```bash
npm run tauri dev
```

- [ ] **Step 2: Manual test checklist**

1. Sidebar shows "Fokus" with Zap icon — click it
2. Empty state: shows "Alles erledigt!" if no open tasks for today
3. Create a test task with bucket=today in any client → badge appears on Fokus nav
4. Open Focus → card appears with title, priority, action bar
5. SPACE key → completes task, moves to next
6. M key → postpones task to tomorrow
7. Arrow Right → skips to next card
8. Queue sidebar shows upcoming tasks
9. Mark an invoice as 'overdue' in Finance → navigate to Fokus → reminder task auto-created
10. FocusCardReminder shows invoice data, editable email form
11. Fill in recipient email → click "Erinnerung senden" → toast appears

- [ ] **Step 3: Final commit if any fixups needed**

```bash
git add -p
git commit -m "fix(focus): post-verification fixups"
```
