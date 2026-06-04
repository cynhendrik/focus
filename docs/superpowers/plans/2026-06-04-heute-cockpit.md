# Heute-Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Focus area with a global Heute-Cockpit that shows today's most important tasks one at a time — CORRA-sorted, AI-drafted where needed, one click to complete.

**Architecture:** A `useHeuteQueue` hook calls CORRA once to get a prioritised list of item IDs (invoices, todos, mails). `HeuteRoute` renders one `HeuteTile` at a time with AnimatePresence slide transitions. Each tile resolves its own data from stores and renders the correct body (checkbox for todos, TipTap composer for mails/reminders).

**Tech Stack:** React, Zustand stores, Framer Motion (AnimatePresence), TipTap, Tauri `invoke`, existing `generateCorraDraft`, existing `MailService`

---

## File Map

**Create:**
- `src/lib/ai/heute-queue.ts` — CORRA queue sort: types, system prompt, context builder, parser, static fallback
- `src/hooks/useHeuteQueue.ts` — hook: calls CORRA, returns sorted HeuteQueueItem[], loading, reshuffle
- `src/components/heute/TileBodyTodo.tsx` — simple todo tile body (description + done button)
- `src/components/heute/TileBodyMail.tsx` — email compose tile body (TipTap + CORRA draft)
- `src/components/heute/HeuteTile.tsx` — full tile (header, reason, body switcher, footer)
- `src/routes/HeuteRoute.tsx` — top-level route: queue state, index, AnimatePresence
- `src/lib/ai/heute-queue.test.ts` — tests for parser + static fallback

**Modify:**
- `src/App.tsx:186-194` — replace `<FocusShell />` with `<HeuteRoute />`

**Delete (after HeuteRoute works):**
- `src/components/focus/FocusShell.tsx`
- `src/components/focus/FocusSessionView.tsx`
- `src/components/focus/FocusWorkSurface.tsx`
- `src/components/focus/FocusCustomerPanel.tsx`
- `src/components/focus/FocusBatchSidebar.tsx`
- `src/components/focus/FocusCockpitBar.tsx`
- `src/components/focus/FocusCorraChat.tsx`
- `src/components/focus/FocusHero.tsx`
- `src/components/focus/FocusBodyDefault.tsx`
- `src/components/focus/FocusBodyEmail.tsx`
- `src/components/focus/FocusBodyInvoice.tsx`
- `src/components/focus/FocusBodyReminder.tsx`
- `src/components/focus/FocusBodyFollowUp.tsx`
- `src/components/focus/cockpit/CorraLamp.tsx`
- `src/components/focus/cockpit/CockpitTaskForm.tsx`
- `src/components/focus/cockpit/CockpitInvoiceForm.tsx`
- `src/components/focus/cockpit/CockpitMailForm.tsx`
- `src/hooks/useCorraContextHint.ts`
- `src/components/focus/CorraHintBox.tsx`

---

## Task 1: AI Queue Types, Prompt, Parser

**Files:**
- Create: `src/lib/ai/heute-queue.ts`
- Create: `src/lib/ai/heute-queue.test.ts`

- [ ] **Step 1: Create `src/lib/ai/heute-queue.ts`**

```typescript
import { invoke } from '@tauri-apps/api/core'
import { getApiKey, getModel, MissingApiKeyError } from './briefing'
import { buildCorraIntelligenceContext } from './corra-intelligence'
import type { CorraContextInput } from './corra-intelligence'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'

export type HeuteItemType = 'invoice_reminder' | 'mail_reply' | 'todo' | 'followup'

export interface HeuteQueueItem {
  type: HeuteItemType
  id: string
  reason: string
}

export const CORRA_HEUTE_SYSTEM = `Du bist CORRA, persönlicher Assistent in Cynera (CRM für Berater).

Erstelle eine priorisierte Aufgabenliste für heute. Reihenfolge:
1. Mahnwesen — überfällige Rechnungen (nach Betrag × Tage überfällig)
2. Kunden-Mails — nach Wartezeit
3. Todos — nach Priorität (p1 zuerst)

Antworte AUSSCHLIESSLICH als JSON-Array, kein Text davor oder danach:
[
  { "type": "invoice_reminder", "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" },
  { "type": "mail_reply",       "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" },
  { "type": "todo",             "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" },
  { "type": "followup",        "id": "EXAKTE_ID", "reason": "1 Satz warum jetzt" }
]

Maximal 10 Einträge. IDs EXAKT aus dem Kontext (nach "ID:"). Nur Dinge die heute wichtig sind.`

export function parseHeuteQueue(raw: string): HeuteQueueItem[] {
  const trimmed = raw.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/s.exec(trimmed)
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed
  try {
    const parsed: unknown = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is HeuteQueueItem =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as HeuteQueueItem).type === 'string' &&
        typeof (item as HeuteQueueItem).id === 'string' &&
        typeof (item as HeuteQueueItem).reason === 'string'
      )
      .slice(0, 10)
  } catch {
    return []
  }
}

export function staticHeuteQueue(input: CorraContextInput): HeuteQueueItem[] {
  const today = new Date().toISOString().slice(0, 10)
  const items: HeuteQueueItem[] = []

  // 1. Overdue invoices — sort by total * daysOverdue descending
  const overdueInvoices = input.invoices
    .filter((i: Invoice) => i.status === 'overdue')
    .map((i: Invoice) => ({
      invoice: i,
      score: i.total * Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  for (const { invoice, score } of overdueInvoices) {
    const days = Math.floor(score / invoice.total)
    items.push({
      type: 'invoice_reminder',
      id: invoice.id,
      reason: `Rechnung seit ${days} Tagen überfällig — ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(invoice.total)}.`,
    })
  }

  // 2. Unread customer mails — oldest first
  const unreadMails = input.emails
    .filter((e: EmailHeader) => !e.isRead && e.customerId != null)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .slice(0, 3)

  for (const mail of unreadMails) {
    items.push({
      type: 'mail_reply',
      id: mail.id,
      reason: `Unbeantwortet seit ${new Date(mail.sentAt).toLocaleDateString('de-DE')}.`,
    })
  }

  // 3. Today's todos — p1 first, then p2+
  const todayTodos = input.todos
    .filter((t: Todo) =>
      t.status !== 'done' &&
      (t.bucket === 'today' || t.bucket === 'in_progress')
    )
    .sort((a, b) => {
      const prio = { p1: 0, p2: 1, p3: 2, p4: 3 }
      return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9)
    })
    .slice(0, 5)

  for (const todo of todayTodos) {
    const type: HeuteItemType =
      todo.actionType === 'reply_mail' || todo.actionType === 'write_email' ? 'mail_reply' :
      todo.actionType === 'followup' ? 'followup' :
      'todo'
    items.push({
      type,
      id: todo.id,
      reason: todo.aiSummary ?? `Priorität ${todo.priority.toUpperCase()} — heute fällig.`,
    })
  }

  return items.slice(0, 10)
}

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

export async function fetchHeuteQueue(input: CorraContextInput): Promise<HeuteQueueItem[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new MissingApiKeyError()

  const ctx = buildCorraIntelligenceContext(input)

  const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
    apiKey,
    body: {
      model: getModel(),
      max_tokens: 512,
      system: [
        { type: 'text', text: `${CORRA_HEUTE_SYSTEM}\n\n--- AKTUELLE DATEN ---\n${ctx}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: 'Erstelle die Aufgabenliste für heute.' }],
    },
  })

  const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
  const raw = block?.text.trim() ?? '[]'
  return parseHeuteQueue(raw)
}
```

- [ ] **Step 2: Create `src/lib/ai/heute-queue.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseHeuteQueue, staticHeuteQueue } from './heute-queue'
import type { CorraContextInput } from './corra-intelligence'

const emptyInput: CorraContextInput = {
  todos: [], invoices: [], emails: [], deals: [], calendarEvents: [], accounts: [],
}

describe('parseHeuteQueue', () => {
  it('parses valid JSON array', () => {
    const raw = JSON.stringify([
      { type: 'invoice_reminder', id: 'inv-1', reason: 'Überfällig' },
      { type: 'todo', id: 'todo-1', reason: 'P1' },
    ])
    const result = parseHeuteQueue(raw)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('invoice_reminder')
    expect(result[0].id).toBe('inv-1')
  })

  it('handles fenced code block', () => {
    const raw = '```json\n[{"type":"todo","id":"t1","reason":"ok"}]\n```'
    expect(parseHeuteQueue(raw)).toHaveLength(1)
  })

  it('returns empty array on garbage input', () => {
    expect(parseHeuteQueue('not json at all')).toEqual([])
    expect(parseHeuteQueue('')).toEqual([])
    expect(parseHeuteQueue('"just a string"')).toEqual([])
  })

  it('filters items missing required fields', () => {
    const raw = JSON.stringify([
      { type: 'todo', id: 'ok', reason: 'fine' },
      { type: 'todo', id: 'missing-reason' },
      { id: 'missing-type', reason: 'x' },
    ])
    expect(parseHeuteQueue(raw)).toHaveLength(1)
  })

  it('caps at 10 items', () => {
    const raw = JSON.stringify(
      Array.from({ length: 15 }, (_, i) => ({ type: 'todo', id: `t${i}`, reason: 'x' }))
    )
    expect(parseHeuteQueue(raw)).toHaveLength(10)
  })
})

describe('staticHeuteQueue', () => {
  it('returns empty array for empty input', () => {
    expect(staticHeuteQueue(emptyInput)).toEqual([])
  })

  it('puts overdue invoices first', () => {
    const input: CorraContextInput = {
      ...emptyInput,
      invoices: [
        { id: 'inv-1', status: 'overdue', total: 1000, dueDate: '2026-05-01', accountId: 'a1', workspaceId: 'w', createdBy: 'u', date: '2026-04-01', taxMode: 'standard', subtotal: 1000, taxAmount: 0, bankInfo: '', isSuggestion: false, pendingSync: false, createdAt: '', updatedAt: '' },
      ],
      todos: [
        { id: 'todo-1', title: 'Task', status: 'open', priority: 'p1', bucket: 'today', checklist: [], tags: [], createdAt: '', updatedAt: '' },
      ],
    }
    const queue = staticHeuteQueue(input)
    expect(queue[0].type).toBe('invoice_reminder')
    expect(queue[0].id).toBe('inv-1')
  })

  it('maps todo actionType reply_mail to mail_reply', () => {
    const input: CorraContextInput = {
      ...emptyInput,
      todos: [
        { id: 'todo-mail', title: 'Mail beantworten', status: 'open', priority: 'p1', bucket: 'today', actionType: 'reply_mail', checklist: [], tags: [], createdAt: '', updatedAt: '' },
      ],
    }
    const queue = staticHeuteQueue(input)
    expect(queue[0].type).toBe('mail_reply')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:run -- src/lib/ai/heute-queue.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/heute-queue.ts src/lib/ai/heute-queue.test.ts
git commit -m "feat(heute): add CORRA queue types, parser and static fallback"
```

---

## Task 2: useHeuteQueue Hook

**Files:**
- Create: `src/hooks/useHeuteQueue.ts`

- [ ] **Step 1: Create `src/hooks/useHeuteQueue.ts`**

```typescript
import { useState, useCallback, useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useDealsStore } from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { fetchHeuteQueue, staticHeuteQueue } from '@/lib/ai/heute-queue'
import type { HeuteQueueItem } from '@/lib/ai/heute-queue'
import { MissingApiKeyError } from '@/lib/ai/briefing'
import { log } from '@/lib/logger'

export function useHeuteQueue() {
  const [items, setItems]     = useState<HeuteQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const invoices       = useFinanceStore(s => s.invoices)
  const todos          = useTodosStore(s => s.allTodos)
  const emails         = useMailStore(s => s.emails)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)

  const input = { todos, invoices, emails, deals, calendarEvents, accounts }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const queue = await fetchHeuteQueue(input)
      setItems(queue.length > 0 ? queue : staticHeuteQueue(input))
    } catch (e) {
      if (!(e instanceof MissingApiKeyError)) {
        log.warn('CORRA queue failed, using static fallback', { e })
      }
      setItems(staticHeuteQueue(input))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  return { items, loading, reshuffle: load }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useHeuteQueue.ts
git commit -m "feat(heute): add useHeuteQueue hook with CORRA sort + static fallback"
```

---

## Task 3: TileBodyTodo

**Files:**
- Create: `src/components/heute/TileBodyTodo.tsx`

- [ ] **Step 1: Create `src/components/heute/TileBodyTodo.tsx`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/heute/TileBodyTodo.tsx
git commit -m "feat(heute): add TileBodyTodo component"
```

---

## Task 4: TileBodyMail

**Files:**
- Create: `src/components/heute/TileBodyMail.tsx`

This replaces `FocusBodyEmail`. Same logic, clean props — works for `invoice_reminder`, `mail_reply`, and `followup`.

- [ ] **Step 1: Create `src/components/heute/TileBodyMail.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Send, Sparkles, Loader } from 'lucide-react'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Invoice } from '@/types/finance.types'

interface BaseProps {
  onDone: () => Promise<void>
  onSkip: () => void
}

interface TodoMailProps extends BaseProps {
  mode: 'reply_mail' | 'followup'
  todo: Todo
  invoice?: never
}

interface InvoiceReminderProps extends BaseProps {
  mode: 'invoice_reminder'
  invoice: Invoice
  todo?: never
}

type Props = TodoMailProps | InvoiceReminderProps

export function TileBodyMail({ mode, todo, invoice, onDone, onSkip }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const account = mode === 'invoice_reminder'
    ? accounts.find(a => a.id === invoice!.accountId)
    : todo?.customerId ? accounts.find(a => a.id === todo.customerId) : undefined

  const [to, setTo]           = useState('')
  const [subject, setSubject] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending]       = useState(false)
  const [hasDraft, setHasDraft]     = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Nachricht schreiben…' }),
    ],
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 100px; font-size: 14px; line-height: 1.65; color: var(--fg); font-family: inherit;',
      },
    },
  })

  // Set To/Subject based on mode
  useEffect(() => {
    if (mode === 'invoice_reminder') {
      const email = account?.email ?? ''
      setTo(email)
      setSubject(`Zahlungserinnerung ${invoice!.number ?? ''}`.trim())
    } else if (mode === 'reply_mail' && todo) {
      const notes = todo.notes ?? ''
      const fromAddr = /^fromAddr: (.+)$/m.exec(notes)?.[1]?.trim() ?? ''
      setTo(fromAddr)
      setSubject(`Re: ${todo.title.replace(/ beantworten$/, '')}`)
    } else if (mode === 'followup' && todo) {
      setSubject(todo.title)
    }
  }, [mode, todo?.id, invoice?.id])

  // Auto-generate draft on mount
  useEffect(() => {
    if (!editor) return
    setGenerating(true)

    const draftPromise = (() => {
      if (mode === 'invoice_reminder' && invoice) {
        const daysOverdue = Math.floor(
          (Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000
        )
        return generateCorraDraft({
          kind: 'reminder',
          customerName: account?.name ?? '',
          invoiceNumber: invoice.number ?? '',
          amount: invoice.total,
          dueDate: invoice.dueDate,
          daysOverdue,
          dunningLevel: daysOverdue > 21 ? 1 : 0,
        })
      }
      if (mode === 'reply_mail' && todo) {
        const notes = todo.notes ?? ''
        const fromLine = notes.split('\n')[0]?.replace(/^Von: /, '') ?? ''
        return generateCorraDraft({
          kind: 'reply_mail',
          customerName: account?.name ?? '',
          contactName: fromLine,
          subject: todo.title,
          notes: todo.notes,
        })
      }
      if (mode === 'followup' && todo) {
        const notes = todo.notes ?? ''
        const fromLine = notes.split('\n')[0]?.replace(/^Von: /, '') ?? ''
        return generateCorraDraft({
          kind: 'followup',
          customerName: account?.name ?? '',
          contactName: fromLine,
          topic: todo.title,
          notes: todo.notes,
        })
      }
      return Promise.resolve('')
    })()

    draftPromise
      .then(draft => {
        if (draft && editor) {
          editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
          setHasDraft(true)
        }
      })
      .catch((e: unknown) => {
        log.warn('CORRA draft failed', { e })
        editor.commands.setContent('<p>Guten Tag,</p><p>ich melde mich kurz dazu.</p>')
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo?.id ?? invoice?.id, editor])

  const regenerate = useCallback(async () => {
    if (generating || !editor) return
    setGenerating(true)
    try {
      const draft = await (() => {
        if (mode === 'invoice_reminder' && invoice) {
          const daysOverdue = Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000)
          return generateCorraDraft({ kind: 'reminder', customerName: account?.name ?? '', invoiceNumber: invoice.number ?? '', amount: invoice.total, dueDate: invoice.dueDate, daysOverdue, dunningLevel: daysOverdue > 21 ? 1 : 0 })
        }
        if (mode === 'reply_mail' && todo) {
          const fromLine = (todo.notes ?? '').split('\n')[0]?.replace(/^Von: /, '') ?? ''
          return generateCorraDraft({ kind: 'reply_mail', customerName: account?.name ?? '', contactName: fromLine, subject, notes: todo.notes })
        }
        if (mode === 'followup' && todo) {
          const fromLine = (todo.notes ?? '').split('\n')[0]?.replace(/^Von: /, '') ?? ''
          return generateCorraDraft({ kind: 'followup', customerName: account?.name ?? '', contactName: fromLine, topic: subject || todo.title, notes: todo.notes })
        }
        return Promise.resolve('')
      })()
      if (draft) {
        editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
        setHasDraft(true)
      }
    } catch {
      showToast({ message: 'CORRA konnte keinen neuen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }, [generating, editor, mode, todo, invoice, account?.name, subject, showToast])

  const handleSend = async () => {
    const bodyText = editor?.getText() ?? ''
    if (!to.trim() || !subject.trim() || !bodyText.trim()) {
      showToast({ message: 'Bitte An, Betreff und Nachricht ausfüllen.', variant: 'error' })
      return
    }
    if (!mailAccounts[0]) {
      showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' })
      return
    }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id,
        to: [to.trim()],
        subject: subject.trim(),
        bodyText,
      })
      showToast({ message: 'E-Mail gesendet.', variant: 'success' })
      await onDone()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const sendLabel = mode === 'invoice_reminder' ? 'Erinnerung senden' : mode === 'reply_mail' ? 'Antwort senden' : 'E-Mail senden'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Compose box */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            }}>✉ E-Mail</span>
          </div>
          {generating
            ? <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CY-ENTWURF…
              </span>
            : hasDraft
            ? <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>✦ CY-ENTWURF · EDITIERBAR</span>
            : null
          }
        </div>

        {/* To */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', width: 52, flexShrink: 0 }}>AN</span>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="E-Mail-Adresse…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }} />
        </div>

        {/* Subject */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', width: 52, flexShrink: 0 }}>BETREFF</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Betreff…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }} />
        </div>

        {/* Body */}
        <div style={{ padding: '12px 16px', minHeight: 100 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={handleSend} disabled={sending || generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px',
            borderRadius: 99, border: 'none',
            background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)',
            color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700,
            boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)',
            cursor: (sending || generating) ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}>
          <Send size={14} />
          {sending ? 'Wird gesendet…' : sendLabel}
        </button>

        <button type="button" onClick={regenerate} disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
          }}>
          {generating ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
          Cy neu
        </button>

        <button type="button" onClick={onSkip}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/heute/TileBodyMail.tsx
git commit -m "feat(heute): add TileBodyMail (replaces FocusBodyEmail)"
```

---

## Task 5: HeuteTile

**Files:**
- Create: `src/components/heute/HeuteTile.tsx`

- [ ] **Step 1: Create `src/components/heute/HeuteTile.tsx`**

```typescript
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'
import { TileBodyTodo } from './TileBodyTodo'
import { TileBodyMail } from './TileBodyMail'
import type { HeuteQueueItem } from '@/lib/ai/heute-queue'

interface Props {
  item: HeuteQueueItem
  index: number
  total: number
  onDone: () => Promise<void>
  onSkip: () => void
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: Math.min(total, 7) }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 8 : 6,
          height: i === current ? 8 : 6,
          borderRadius: '50%',
          background: i === current ? 'var(--accent)' : 'var(--surface-3)',
          boxShadow: i === current ? '0 0 6px var(--accent-glow)' : 'none',
          transition: 'all 200ms',
        }} />
      ))}
      <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
        {current + 1} / {total}
      </span>
    </div>
  )
}

function deriveHeadline(item: HeuteQueueItem, name: string, total?: number): string {
  if (item.type === 'invoice_reminder') {
    const amount = total != null
      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(total)
      : ''
    return `Zahlungserinnerung${amount ? ` für ${amount}` : ''} schicken`
  }
  if (item.type === 'mail_reply') return `${name ? name + ' ' : ''}antworten`
  if (item.type === 'followup')   return `Follow-up: ${name}`
  return ''
}

export function HeuteTile({ item, index, total, onDone, onSkip }: Props) {
  const invoices = useFinanceStore(s => s.invoices)
  const todos    = useTodosStore(s => s.allTodos)
  const emails   = useMailStore(s => s.emails)
  const accounts = useAccountsStore(s => s.accounts)

  const invoice = item.type === 'invoice_reminder'
    ? invoices.find(i => i.id === item.id) ?? null
    : null

  const todo = (item.type === 'todo' || item.type === 'mail_reply' || item.type === 'followup')
    ? todos.find(t => t.id === item.id) ?? null
    : null

  const email = item.type === 'mail_reply' && !todo
    ? emails.find(e => e.id === item.id) ?? null
    : null

  const accountId = invoice?.accountId ?? todo?.customerId
  const account   = accountId ? accounts.find(a => a.id === accountId) : undefined

  const headline = (() => {
    if (item.type === 'invoice_reminder' && invoice) return deriveHeadline(item, account?.name ?? '', invoice.total)
    if (todo) return todo.actionType ? deriveHeadline(item, account?.name ?? '') : todo.title
    if (email) return `${email.fromName ?? email.fromAddr} antworten`
    return item.type.replace('_', ' ')
  })()

  const renderBody = () => {
    if (item.type === 'invoice_reminder' && invoice) {
      return <TileBodyMail mode="invoice_reminder" invoice={invoice} onDone={onDone} onSkip={onSkip} />
    }
    if ((item.type === 'mail_reply' || item.type === 'followup') && todo) {
      return <TileBodyMail mode={item.type} todo={todo} onDone={onDone} onSkip={onSkip} />
    }
    if (todo) {
      return <TileBodyTodo todo={todo} onDone={onDone} onSkip={onSkip} />
    }
    return (
      <div style={{ color: 'var(--fg-dim)', fontSize: 13 }}>
        Aufgabe konnte nicht geladen werden.
        <button onClick={onSkip} style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>
          Überspringen →
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid var(--accent)',
      borderRadius: 16,
      padding: '28px 32px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          }}>
            DEIN NÄCHSTER ZUG
          </span>
        </div>
        <ProgressDots current={index} total={total} />
      </div>

      {/* Headline + reason */}
      <div>
        <h2 style={{
          fontSize: 26, fontWeight: 800, color: 'var(--fg)',
          letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0,
        }}>
          {headline}
        </h2>
        {item.reason && (
          <p style={{
            fontSize: 13, color: 'var(--fg-dim)', marginTop: 10,
            lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0 }}>→</span>
            {item.reason}
          </p>
        )}
      </div>

      {/* Body */}
      {renderBody()}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/heute/HeuteTile.tsx
git commit -m "feat(heute): add HeuteTile with header, body switcher and progress dots"
```

---

## Task 6: HeuteRoute

**Files:**
- Create: `src/routes/HeuteRoute.tsx`

- [ ] **Step 1: Create `src/routes/HeuteRoute.tsx`**

```typescript
import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useHeuteQueue } from '@/hooks/useHeuteQueue'
import { HeuteTile } from '@/components/heute/HeuteTile'
import { useTodosStore } from '@/store/todos.store'
import { useFinanceStore } from '@/store/finance.store'
import { useToastStore } from '@/store/toast.store'
import type { UpsertTodoPayload } from '@/types/todo.types'

function HeuteEmpty({ onReshuffle }: { onReshuffle: () => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 24px var(--accent-glow)',
      }}>
        <Sparkles size={20} style={{ color: 'var(--accent-ink)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>Alles erledigt.</div>
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 6 }}>Kein weiterer Handlungsbedarf für heute.</div>
      </div>
      <button type="button" onClick={onReshuffle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
          padding: '9px 18px', borderRadius: 99,
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
        }}>
        <RefreshCw size={12} /> Neu prüfen
      </button>
    </div>
  )
}

function HeuteLoading() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite',
        boxShadow: '0 0 12px var(--accent-glow)',
      }} />
      <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
        CORRA priorisiert…
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
    </div>
  )
}

export function HeuteRoute() {
  const { items, loading, reshuffle } = useHeuteQueue()
  const [index, setIndex]   = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  const upsertTodo  = useTodosStore(s => s.upsert)
  const allTodos    = useTodosStore(s => s.allTodos)
  const showToast   = useToastStore(s => s.show)

  const advance = useCallback((dir: 1 | -1 = 1) => {
    setDirection(dir)
    setIndex(prev => prev + 1)
  }, [])

  const handleDone = useCallback(async () => {
    const item = items[index]
    if (!item) return

    try {
      if (item.type === 'todo' || item.type === 'mail_reply' || item.type === 'followup') {
        const todo = allTodos.find(t => t.id === item.id)
        if (todo) {
          const payload: UpsertTodoPayload = {
            id: todo.id,
            title: todo.title,
            status: 'done',
            bucket: 'done',
            priority: todo.priority,
            customerId: todo.customerId,
            actionType: todo.actionType,
            sourceRef: todo.sourceRef,
            notes: todo.notes,
            checklist: todo.checklist,
            tags: todo.tags,
          }
          await upsertTodo(payload)
        }
      }
      // invoice_reminder: sending the mail is the action — no status change needed here
    } catch {
      showToast({ message: 'Konnte Aufgabe nicht als erledigt markieren.', variant: 'error' })
    }

    advance(1)
  }, [items, index, allTodos, upsertTodo, advance, showToast])

  const handleSkip = useCallback(() => {
    advance(1)
  }, [advance])

  const currentItem = items[index]
  const isDone = !loading && index >= items.length

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.02em' }}>Heute</div>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {loading ? 'CORRA priorisiert…' : `${items.length} AUFGABEN · ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}`}
          </div>
        </div>
        <button type="button" onClick={() => { setIndex(0); reshuffle() }}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: loading ? 'var(--fg-dim)' : 'var(--fg)', fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
          <RefreshCw size={11} /> Neu sortieren
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading && <HeuteLoading />}

        {!loading && isDone && <HeuteEmpty onReshuffle={() => { setIndex(0); reshuffle() }} />}

        {!loading && !isDone && currentItem && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`${currentItem.id}-${index}`}
                custom={direction}
                initial={{ opacity: 0, x: direction * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -40 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <HeuteTile
                  item={currentItem}
                  index={index}
                  total={items.length}
                  onDone={handleDone}
                  onSkip={handleSkip}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/HeuteRoute.tsx
git commit -m "feat(heute): add HeuteRoute with AnimatePresence tile transitions"
```

---

## Task 7: Wire Routing + Delete Old Focus Files

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add HeuteRoute import to App.tsx**

In `src/App.tsx`, find the existing focus import:
```typescript
import { FocusShell }            from '@/components/focus/FocusShell'
```
Replace with:
```typescript
import { HeuteRoute }            from '@/routes/HeuteRoute'
```

- [ ] **Step 2: Replace FocusShell with HeuteRoute in App.tsx**

Find (around line 186-194):
```typescript
  if (appView === 'focus') {
    return (
      <AppShell>
        <FocusShell />
        <DownloadToast />
        <ToastViewport />
      </AppShell>
    )
  }
```
Replace with:
```typescript
  if (appView === 'focus') {
    return (
      <AppShell>
        <HeuteRoute />
        <DownloadToast />
        <ToastViewport />
      </AppShell>
    )
  }
```

- [ ] **Step 3: Run TypeScript check to catch any remaining imports**

```bash
npm run typecheck 2>&1 | head -40
```
Fix any import errors that reference removed files.

- [ ] **Step 4: Delete old Focus files**

```bash
git rm src/components/focus/FocusShell.tsx
git rm src/components/focus/FocusSessionView.tsx
git rm src/components/focus/FocusWorkSurface.tsx
git rm src/components/focus/FocusCustomerPanel.tsx
git rm src/components/focus/FocusBatchSidebar.tsx
git rm src/components/focus/FocusCockpitBar.tsx
git rm src/components/focus/FocusCorraChat.tsx
git rm src/components/focus/FocusHero.tsx
git rm src/components/focus/FocusBodyDefault.tsx
git rm src/components/focus/FocusBodyEmail.tsx
git rm src/components/focus/FocusBodyInvoice.tsx
git rm src/components/focus/FocusBodyReminder.tsx
git rm src/components/focus/FocusBodyFollowUp.tsx
git rm src/components/focus/cockpit/CorraLamp.tsx
git rm src/components/focus/cockpit/CockpitTaskForm.tsx
git rm src/components/focus/cockpit/CockpitInvoiceForm.tsx
git rm src/components/focus/cockpit/CockpitMailForm.tsx
git rm src/hooks/useCorraContextHint.ts
git rm src/components/focus/CorraHintBox.tsx
```

- [ ] **Step 5: Run TypeScript check again — must be clean**

```bash
npm run typecheck 2>&1 | head -40
```
Expected: no errors.

- [ ] **Step 6: Run all tests**

```bash
npm run test:run
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(heute): wire HeuteRoute, remove old Focus/Cockpit code"
```

---

## Self-Review

**Spec coverage:**
- ✅ CORRA sorts queue → `fetchHeuteQueue` in Task 1
- ✅ Fallback sort (Mahnwesen → Mails → Todos) → `staticHeuteQueue` in Task 1
- ✅ invoice_reminder tile → `TileBodyMail mode="invoice_reminder"` in Task 4
- ✅ todo tile → `TileBodyTodo` in Task 3
- ✅ mail_reply/followup tile → `TileBodyMail mode="mail_reply|followup"` in Task 4
- ✅ Auto-draft via CORRA → effect in TileBodyMail
- ✅ "Cy neu" regenerate → `regenerate` callback in TileBodyMail
- ✅ Überspringen → `onSkip` → `advance(1)` in HeuteRoute
- ✅ Progress dots → `ProgressDots` in HeuteTile
- ✅ AnimatePresence slide transition → HeuteRoute
- ✅ Empty state → `HeuteEmpty`
- ✅ "Neu sortieren" button → resets index + calls reshuffle
- ✅ Old Focus files deleted → Task 7

**Placeholder scan:** None found.

**Type consistency:**
- `HeuteQueueItem` defined in Task 1, used in Tasks 2, 5, 6 ✅
- `TileBodyMail` props discriminated union `mode` matches all call sites ✅
- `UpsertTodoPayload` used correctly in handleDone ✅
