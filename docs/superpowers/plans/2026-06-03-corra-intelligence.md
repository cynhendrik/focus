# CORRA Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated CORRA Intelligence route — a full-page AI assistant chat with real app data queries (Todos, Invoices, Emails, Deals, Calendar), Framer Motion message animations, and a one-click Focus bridge for actionable items.

**Architecture:** Context Injection — before every message, all relevant Zustand store data is serialized into the system prompt. CORRA returns either plain text or structured JSON (with `actions[]`) for actionable items. `CorraActionCard` renders the item list; clicking the CTA creates todos and navigates to Focus. NavSidebar gets a glowing premium button above Workspace.

**Tech Stack:** React + TypeScript, Framer Motion 11 (already installed), `invoke('cmd_anthropic_messages')` via Tauri, Zustand stores (`useFinanceStore`, `useTodosStore`, `useMailStore`, `useDealsStore`, `useCalendarStore`, `useAccountsStore`), vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/store/ui.store.ts` | Add `'corra'` to `AppView` union |
| Create | `src/routes/CorraRoute.tsx` | Page: state, API calls, Focus bridge |
| Modify | `src/App.tsx` | Import + `case 'corra'` in `renderMain()` |
| Create | `src/lib/ai/corra-intelligence.ts` | Types, context builder, response parser, system prompt |
| Create | `src/lib/ai/corra-intelligence.test.ts` | Unit tests for `parseCorraResponse` + `buildCorraIntelligenceContext` |
| Create | `src/components/corra/CorraActionCard.tsx` | Animated item list + Focus CTA button |
| Create | `src/components/corra/CorraSuggestedPrompts.tsx` | 4 quick-prompt chips |
| Create | `src/components/corra/CorraMessage.tsx` | Animated message bubble (user + assistant) |
| Create | `src/components/corra/CorraChat.tsx` | Chat container: message list + input area |
| Modify | `src/components/layout/NavSidebar.tsx` | CORRA glowing premium button above Workspace |
| Modify | `src/styles/globals.css` | `.corra-nav-button` styles + pulse animation |

---

## Task 1: Add `'corra'` to AppView + stub route + wire App.tsx

**Files:**
- Modify: `src/store/ui.store.ts` (line 88–93)
- Create: `src/routes/CorraRoute.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `'corra'` to the `AppView` union**

In `src/store/ui.store.ts`, find the `AppView` type (lines 88–93) and add `'corra'`:

```ts
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'sales'     | 'invoices'  | 'inbox'
  | 'settings'  | 'integrations'
  | 'pipeline'  | 'calendar'   | 'mail' | 'followups' | 'leads'
  | 'journal'   | 'focus'      | 'corra'
```

- [ ] **Step 2: Create stub `CorraRoute.tsx`**

Create `src/routes/CorraRoute.tsx`:

```tsx
// src/routes/CorraRoute.tsx
export function CorraRoute() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        CORRA — coming soon
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Wire `CorraRoute` into `App.tsx`**

In `src/App.tsx`, add the import after the `FocusShell` import:

```tsx
import { CorraRoute } from '@/routes/CorraRoute'
```

In the `renderMain()` switch (around line 196), add before `default`:

```tsx
case 'corra': return <CorraRoute />
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/store/ui.store.ts src/routes/CorraRoute.tsx src/App.tsx
git commit -m "feat(corra): add corra appView + stub route"
```

---

## Task 2: `corra-intelligence.ts` — types, context builder, parser, system prompt

**Files:**
- Create: `src/lib/ai/corra-intelligence.ts`
- Create: `src/lib/ai/corra-intelligence.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/corra-intelligence.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCorraIntelligenceContext, parseCorraResponse } from './corra-intelligence'
import type { Invoice } from '@/types/finance.types'
import type { Account } from '@/types/account.types'

// Minimal mocks — use type assertions to avoid filling every required field
const baseAccount = { id: 'acc-1', name: 'Müller GmbH' } as Account

const baseInvoice = {
  id: 'inv-1', accountId: 'acc-1', number: 'RE-001',
  dueDate: '2026-05-01', status: 'overdue', total: 1190,
} as Invoice

describe('parseCorraResponse', () => {
  it('returns plain text unchanged when no JSON', () => {
    const result = parseCorraResponse('Heute hast du 5 Todos.')
    expect(result.text).toBe('Heute hast du 5 Todos.')
    expect(result.actions).toBeUndefined()
    expect(result.focusCta).toBeUndefined()
  })

  it('parses valid JSON with actions', () => {
    const payload = {
      text: 'Du hast 2 überfällige Rechnungen.',
      actions: [{ type: 'invoice', id: 'inv-1', label: 'Müller GmbH', detail: '€1.190', urgency: '14 Tage' }],
      focusCta: 'Jetzt in Fokus',
    }
    const result = parseCorraResponse(JSON.stringify(payload))
    expect(result.text).toBe('Du hast 2 überfällige Rechnungen.')
    expect(result.actions).toHaveLength(1)
    expect(result.actions![0].id).toBe('inv-1')
    expect(result.focusCta).toBe('Jetzt in Fokus')
  })

  it('handles JSON wrapped in markdown code fences', () => {
    const raw = '```json\n{"text":"Test","actions":[],"focusCta":"Go"}\n```'
    const result = parseCorraResponse(raw)
    expect(result.text).toBe('Test')
  })

  it('falls back to plain text for malformed JSON', () => {
    const result = parseCorraResponse('{ "text": 42 }')
    expect(result.text).toBe('{ "text": 42 }')
    expect(result.actions).toBeUndefined()
  })
})

describe('buildCorraIntelligenceContext', () => {
  it('includes overdue invoice with customer name and ID', () => {
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [baseInvoice], emails: [],
      deals: [], calendarEvents: [], accounts: [baseAccount],
    })
    expect(ctx).toContain('Müller GmbH')
    expect(ctx).toContain('RE-001')
    expect(ctx).toContain('ID:inv-1')
    expect(ctx).toContain('RECHNUNGEN ÜBERFÄLLIG')
  })

  it('shows empty state message when all data is empty', () => {
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [], emails: [],
      deals: [], calendarEvents: [], accounts: [],
    })
    expect(ctx).toContain('Keine offenen')
  })

  it('filters out paid invoices', () => {
    const paid = { ...baseInvoice, status: 'paid' as const }
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [paid], emails: [],
      deals: [], calendarEvents: [], accounts: [baseAccount],
    })
    expect(ctx).not.toContain('RECHNUNGEN ÜBERFÄLLIG')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test:run src/lib/ai/corra-intelligence.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/lib/ai/corra-intelligence.ts`**

```ts
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { Deal } from '@/types/deal.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Account } from '@/types/account.types'

// ─── Public Types ────────────────────────────────────────────────────────────

export interface CorraActionItem {
  type: 'invoice' | 'todo' | 'mail'
  id: string
  label: string       // e.g. "Müller GmbH"
  detail: string      // e.g. "RE-2024-047 · €4.200"
  urgency: string     // e.g. "14 Tage"
}

export interface CorraIntelligenceResponse {
  text: string
  actions?: CorraActionItem[]
  focusCta?: string
}

export interface CorraMessage {
  role: 'user' | 'assistant'
  text: string
  actions?: CorraActionItem[]
  focusCta?: string
}

export interface CorraContextInput {
  todos: Todo[]
  invoices: Invoice[]
  emails: EmailHeader[]
  deals: Deal[]
  calendarEvents: CalendarEvent[]
  accounts: Account[]
}

// ─── Context Builder ─────────────────────────────────────────────────────────

function formatEur(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

export function buildCorraIntelligenceContext(input: CorraContextInput): string {
  const today   = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const accountName = (id: string) =>
    input.accounts.find(a => a.id === id)?.name ?? id

  const openTodos = input.todos
    .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress'))
    .slice(0, 15)

  const overdueInvoices = input.invoices
    .filter(i => i.status === 'overdue')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 10)

  const unreadEmails = input.emails
    .filter(e => !e.isRead && e.customerId !== null)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 10)

  const openDeals = input.deals
    .filter(d => d.stage !== 'won' && d.stage !== 'lost')
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8)

  const todayEvents = input.calendarEvents
    .filter(e => e.startAt.startsWith(todayStr))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 5)

  const lines: string[] = [
    `DATUM: ${today.toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
    })}`,
    '',
  ]

  if (openTodos.length > 0) {
    lines.push('TODOS HEUTE/IN ARBEIT:')
    for (const t of openTodos) {
      const prefix  = t.bucket === 'in_progress' ? '[IN ARBEIT]' : '[HEUTE]'
      const cust    = t.customerId ? ` · ${accountName(t.customerId)}` : ''
      const type    = t.actionType ? ` (${t.actionType})` : ''
      lines.push(`- ${prefix} ${t.title}${cust}${type} · ID:${t.id}`)
    }
    lines.push('')
  }

  if (overdueInvoices.length > 0) {
    lines.push('RECHNUNGEN ÜBERFÄLLIG:')
    for (const inv of overdueInvoices) {
      const days = Math.floor(
        (today.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000,
      )
      const num = inv.number ? ` · ${inv.number}` : ''
      lines.push(
        `- ${accountName(inv.accountId)}${num} · ${formatEur(inv.total)} · ${days} Tage · ID:${inv.id}`,
      )
    }
    lines.push('')
  }

  if (unreadEmails.length > 0) {
    lines.push('UNGELESENE KUNDEN-MAILS:')
    for (const m of unreadEmails) {
      const from = m.fromName ? `${m.fromName} <${m.fromAddr}>` : m.fromAddr
      lines.push(`- ${from} · ${m.subject} · ID:${m.id}`)
    }
    lines.push('')
  }

  if (openDeals.length > 0) {
    lines.push('OFFENE DEALS:')
    for (const d of openDeals) {
      const val = d.value != null ? ` · ${formatEur(d.value)}` : ''
      lines.push(`- ${d.title} · ${accountName(d.accountId)}${val} · ${d.stage}`)
    }
    lines.push('')
  }

  if (todayEvents.length > 0) {
    lines.push('KALENDER HEUTE:')
    for (const e of todayEvents) {
      lines.push(`- ${e.startAt.slice(11, 16)} ${e.title}`)
    }
    lines.push('')
  }

  if (lines.length === 2) {
    lines.push('Keine offenen Aufgaben, Rechnungen oder Mails heute.')
  }

  return lines.join('\n').trim()
}

// ─── Response Parser ──────────────────────────────────────────────────────────

export function parseCorraResponse(raw: string): CorraIntelligenceResponse {
  const trimmed = raw.trim()
  // Strip markdown code fences if present
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(trimmed)
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed
  try {
    const parsed: unknown = JSON.parse(jsonStr)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'text' in parsed &&
      typeof (parsed as { text: unknown }).text === 'string'
    ) {
      const p = parsed as { text: string; actions?: unknown; focusCta?: unknown }
      return {
        text:     p.text,
        actions:  Array.isArray(p.actions) ? (p.actions as CorraActionItem[]) : undefined,
        focusCta: typeof p.focusCta === 'string' ? p.focusCta : undefined,
      }
    }
  } catch {}
  return { text: trimmed }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export const CORRA_INTELLIGENCE_SYSTEM = `Du bist CORRA Intelligence, ein persönlicher KI-Assistent in Cynera (CRM-App für Berater).
Du hast Zugriff auf alle aktuellen Geschäftsdaten des Nutzers (Todos, Rechnungen, Mails, Deals, Kalender).

DEINE AUFGABE:
- Beantworte Fragen direkt und präzise mit echten Daten aus dem Kontext
- Erkenne actionable Items und schlage vor, sie im Fokus-Modus zu bearbeiten

ANTWORT-FORMAT:
Wenn deine Antwort actionable Items enthält (Rechnungen, Mails, Todos die bearbeitet werden sollen), antworte AUSSCHLIESSLICH als JSON — kein Text davor oder danach:
{
  "text": "Deine Antwort als Fließtext (2-4 Sätze)",
  "actions": [
    { "type": "invoice", "id": "EXAKTE_ID_AUS_KONTEXT", "label": "Firmenname", "detail": "RE-Nummer · €Betrag", "urgency": "X Tage" }
  ],
  "focusCta": "Kurzer Button-Text z.B. 'Alle 3 jetzt in Fokus bearbeiten'"
}

Typen für actions[].type:
- "invoice" → überfällige Rechnung → ID nach "ID:" im Kontext
- "mail" → ungelesene Kunden-Mail → ID nach "ID:" im Kontext
- "todo" → bestehendes Todo → ID nach "ID:" im Kontext

Wenn KEINE Aktionen nötig sind, antworte als normaler Text (kein JSON).

REGELN:
- Immer auf Deutsch
- Ton: direkt, kompetent, kein Berater-Speak
- Zahlen immer mit konkreten Werten (€, Tage, Namen)
- IDs EXAKT aus dem Kontext übernehmen (nach "ID:")
- Nur Daten aus dem Kontext — keine Erfindungen`
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test:run src/lib/ai/corra-intelligence.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors in new file

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/corra-intelligence.ts src/lib/ai/corra-intelligence.test.ts
git commit -m "feat(corra): add corra-intelligence context builder, parser and system prompt"
```

---

## Task 3: `CorraActionCard` — animated item list + Focus CTA

**Files:**
- Create: `src/components/corra/CorraActionCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/corra/CorraActionCard.tsx`:

```tsx
import { motion } from 'framer-motion'
import type { CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  actions: CorraActionItem[]
  focusCta: string
  onFocus: () => void
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

function urgencyColor(urgency: string): string {
  const days = parseInt(urgency, 10)
  if (isNaN(days)) return 'var(--fg-dim)'
  if (days > 10) return 'var(--danger, #ef4444)'
  if (days > 3) return 'var(--warn, #f97316)'
  return 'var(--info, #60a5fa)'
}

export function CorraActionCard({ actions, focusCta, onFocus }: Props) {
  return (
    <div style={{ marginTop: 10 }}>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}
      >
        {actions.map(a => (
          <motion.div
            key={a.id}
            variants={item}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface-3, #1e1e1e)',
              border: '1px solid var(--border)',
              borderRadius: 7, padding: '7px 11px',
            }}
          >
            <div>
              <div style={{ color: 'var(--fg)', fontSize: 11, fontWeight: 600 }}>{a.label}</div>
              <div style={{ color: 'var(--fg-dim)', fontSize: 10 }}>{a.detail}</div>
            </div>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 10,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
              background: 'color-mix(in srgb, currentColor 15%, transparent)',
              color: urgencyColor(a.urgency),
            }}>
              {a.urgency}
            </span>
          </motion.div>
        ))}
      </motion.div>

      <button
        type="button"
        onClick={onFocus}
        style={{
          width: '100%', padding: '9px 14px', border: 'none', borderRadius: 8,
          background: 'linear-gradient(135deg, var(--accent), #7c3aed)',
          color: 'var(--accent-ink)', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6,
          boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 30%, transparent)',
        }}
      >
        <span>⚡</span> {focusCta}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/corra/CorraActionCard.tsx
git commit -m "feat(corra): add CorraActionCard with stagger animation"
```

---

## Task 4: `CorraSuggestedPrompts` — quick-prompt chips

**Files:**
- Create: `src/components/corra/CorraSuggestedPrompts.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/corra/CorraSuggestedPrompts.tsx`:

```tsx
interface Props {
  onSelect: (prompt: string) => void
}

const PROMPTS = [
  'Was ist heute wichtig?',
  'Überfällige Rechnungen?',
  'Neue Kunden-Mails?',
  'Meine Todos diese Woche?',
] as const

export function CorraSuggestedPrompts({ onSelect }: Props) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
      {PROMPTS.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          style={{
            padding: '4px 11px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            color: 'var(--fg-dim)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'all 150ms',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--fg)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--fg-dim)'
          }}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/corra/CorraSuggestedPrompts.tsx
git commit -m "feat(corra): add CorraSuggestedPrompts chips"
```

---

## Task 5: `CorraMessage` — animated message bubble

**Files:**
- Create: `src/components/corra/CorraMessage.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/corra/CorraMessage.tsx`:

```tsx
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { CorraActionCard } from './CorraActionCard'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  message: CorraMessageType
  onFocusActions?: (actions: CorraActionItem[]) => void
}

export function CorraMessage({ message, onFocusActions }: Props) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        padding: '0 24px',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 10px rgba(124,58,237,0.35)',
          marginTop: 2,
        }}>
          <Sparkles size={12} style={{ color: '#fff' }} />
        </div>
      )}

      <div style={{
        maxWidth: '82%',
        padding: '12px 15px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser
          ? 'linear-gradient(135deg, #1e1b4b, #2d1b69)'
          : 'var(--surface-2)',
        border: isUser
          ? '1px solid rgba(124,58,237,0.3)'
          : '1px solid var(--border)',
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--fg)',
      }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {message.text}
        </div>

        {message.actions && message.actions.length > 0 && onFocusActions && (
          <CorraActionCard
            actions={message.actions}
            focusCta={message.focusCta ?? `${message.actions.length} Aktion${message.actions.length > 1 ? 'en' : ''} in Fokus bearbeiten`}
            onFocus={() => onFocusActions(message.actions!)}
          />
        )}
      </div>

      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--surface-3)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 2,
          fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)',
        }}>
          Du
        </div>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/corra/CorraMessage.tsx
git commit -m "feat(corra): add CorraMessage animated bubble"
```

---

## Task 6: `CorraChat` — chat container with AnimatePresence

**Files:**
- Create: `src/components/corra/CorraChat.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/corra/CorraChat.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Send, Loader } from 'lucide-react'
import { CorraMessage } from './CorraMessage'
import { CorraSuggestedPrompts } from './CorraSuggestedPrompts'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  messages: CorraMessageType[]
  loading: boolean
  onSend: (text: string) => void
  onFocusActions: (actions: CorraActionItem[]) => void
  onExport: () => void
  onClear: () => void
}

export function CorraChat({ messages, loading, onSend, onFocusActions, onExport, onClear }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSuggest = (prompt: string) => {
    setInput('')
    onSend(prompt)
  }

  const showSuggestions = messages.length <= 1 && !loading

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(124,58,237,0.45)',
          }}>
            <span style={{ color: '#fff', fontSize: 14 }}>✦</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
              CORRA Intelligence
            </div>
            <div style={{
              fontSize: 9, color: 'var(--fg-dim)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            }}>
              KI-ASSISTENT · CYNERA
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onExport} style={{
            padding: '6px 12px', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--fg-dim)', fontSize: 10, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            ↗ Kopieren
          </button>
          <button type="button" onClick={onClear} style={{
            padding: '6px 12px', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--fg-dim)', fontSize: 10, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            ✕ Leeren
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 0',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <CorraMessage
              key={i}
              message={msg}
              onFocusActions={onFocusActions}
            />
          ))}
        </AnimatePresence>

        {loading && (
          <div style={{ display: 'flex', padding: '0 24px', gap: 10, alignItems: 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontSize: 12 }}>✦</span>
            </div>
            <div style={{
              padding: '10px 14px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: '14px 14px 14px 4px',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--fg-dim)',
            }}>
              <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
              CORRA denkt…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '14px 24px 18px', borderTop: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '10px 12px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Frag CORRA — Todos, Rechnungen, Mails, Deals…"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 13, color: 'var(--fg)', outline: 'none',
              resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 120, overflowY: 'auto',
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: input.trim() && !loading
                ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                : 'var(--surface-3)',
              color: input.trim() && !loading ? '#fff' : 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 160ms',
              boxShadow: input.trim() && !loading
                ? '0 0 10px rgba(124,58,237,0.4)' : 'none',
            }}
          >
            <Send size={13} />
          </button>
        </div>

        {showSuggestions && <CorraSuggestedPrompts onSelect={handleSuggest} />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/corra/CorraChat.tsx
git commit -m "feat(corra): add CorraChat container with AnimatePresence"
```

---

## Task 7: `CorraRoute` — full implementation (replaces stub)

**Files:**
- Modify: `src/routes/CorraRoute.tsx` (full replacement of stub)

- [ ] **Step 1: Replace the stub with the full implementation**

Overwrite `src/routes/CorraRoute.tsx` with:

```tsx
import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useDealsStore } from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore } from '@/store/ui.store'
import { useToastStore } from '@/store/toast.store'
import { getApiKey, getModel, MissingApiKeyError } from '@/lib/ai/briefing'
import {
  buildCorraIntelligenceContext,
  parseCorraResponse,
  CORRA_INTELLIGENCE_SYSTEM,
} from '@/lib/ai/corra-intelligence'
import type { CorraMessage, CorraActionItem } from '@/lib/ai/corra-intelligence'
import { CorraChat } from '@/components/corra/CorraChat'
import { log } from '@/lib/logger'

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

const GREETING: CorraMessage = {
  role: 'assistant',
  text: 'Hey — ich bin CORRA Intelligence. Ich habe Zugriff auf deine Todos, Rechnungen, Mails und Deals.\n\nWas möchtest du wissen?',
}

export function CorraRoute() {
  const [messages, setMessages] = useState<CorraMessage[]>([GREETING])
  const [loading, setLoading]   = useState(false)

  const invoices      = useFinanceStore(s => s.invoices)
  const todos         = useTodosStore(s => s.allTodos)
  const emails        = useMailStore(s => s.emails)
  const deals         = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts      = useAccountsStore(s => s.accounts)
  const upsertTodo    = useTodosStore(s => s.upsert)
  const setAppView    = useUiStore(s => s.setAppView)
  const showToast     = useToastStore(s => s.show)

  const handleSend = useCallback(async (text: string) => {
    const userMsg: CorraMessage = { role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const apiKey = getApiKey()
      if (!apiKey) throw new MissingApiKeyError()

      const ctx = buildCorraIntelligenceContext({
        todos, invoices, emails, deals, calendarEvents, accounts,
      })

      const history = [...messages, userMsg]

      const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
        apiKey,
        body: {
          model: getModel(),
          max_tokens: 1024,
          system: [
            {
              type: 'text',
              text: `${CORRA_INTELLIGENCE_SYSTEM}\n\n--- AKTUELLE DATEN ---\n${ctx}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: history.map(m => ({ role: m.role, content: m.text })),
        },
      })

      const block = response.content.find(
        (b): b is AnthropicTextBlock => b.type === 'text',
      )
      const raw = block?.text.trim() ?? '(keine Antwort)'
      const parsed = parseCorraResponse(raw)

      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: parsed.text, actions: parsed.actions, focusCta: parsed.focusCta },
      ])
    } catch (e) {
      const errText = e instanceof MissingApiKeyError
        ? 'Kein API-Key konfiguriert — bitte in den Einstellungen hinterlegen.'
        : 'Verbindungsfehler. Versuche es erneut.'
      log.warn('CORRA Intelligence API error', { err: e })
      setMessages(prev => [...prev, { role: 'assistant', text: errText }])
    } finally {
      setLoading(false)
    }
  }, [messages, todos, invoices, emails, deals, calendarEvents, accounts])

  const handleFocusActions = useCallback(async (actions: CorraActionItem[]) => {
    try {
      for (const action of actions) {
        if (action.type === 'invoice') {
          await upsertTodo({
            title:      `Mahnung: ${action.label}`,
            actionType: 'send_reminder',
            sourceRef:  action.id,
            bucket:     'today',
            priority:   'p1',
            checklist:  [],
            tags:       [],
          })
        } else if (action.type === 'mail') {
          await upsertTodo({
            title:      `${action.label} beantworten`,
            actionType: 'reply_mail',
            sourceRef:  action.id,
            bucket:     'today',
            priority:   'p1',
            checklist:  [],
            tags:       [],
          })
        }
        // 'todo' type: already exists — no creation needed
      }
      setAppView('focus')
    } catch {
      showToast({ message: 'Fehler beim Anlegen der Fokus-Aufgaben.', variant: 'error' })
    }
  }, [upsertTodo, setAppView, showToast])

  const handleExport = useCallback(() => {
    const lines = messages.map(m => {
      const prefix = m.role === 'user' ? '**Du:**' : '**CORRA:**'
      const actionLines = m.actions
        ? '\n' + m.actions.map(a => `- ${a.label}: ${a.detail}`).join('\n')
        : ''
      return `${prefix} ${m.text}${actionLines}`
    })
    const content = `# CORRA Intelligence — ${new Date().toLocaleDateString('de-DE')}\n\n${lines.join('\n\n')}`
    navigator.clipboard.writeText(content).then(() => {
      showToast({ message: 'Protokoll in Zwischenablage kopiert.', variant: 'success' })
    })
  }, [messages, showToast])

  const handleClear = useCallback(() => {
    setMessages([GREETING])
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <CorraChat
        messages={messages}
        loading={loading}
        onSend={handleSend}
        onFocusActions={handleFocusActions}
        onExport={handleExport}
        onClear={handleClear}
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
pnpm test:run
```

Expected: all pass including `corra-intelligence.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/routes/CorraRoute.tsx
git commit -m "feat(corra): implement full CorraRoute with context injection and focus bridge"
```

---

## Task 8: NavSidebar CORRA button + CSS

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add CORRA button to `NavSidebar.tsx`**

In `src/components/layout/NavSidebar.tsx`:

Add `Sparkles` to the lucide-react import (line 10):
```tsx
import {
  Home, Users, CreditCard,
  TrendingUp, Target, Reply,
  Calendar, Mail, Settings, Plug,
  ChevronRight, PanelLeftClose, PanelLeftOpen, Zap, Sparkles,
} from 'lucide-react'
```

In the `return` of `NavSidebar`, find the line with `<SidebarSection label="Workspace"` and insert the CORRA button **before** it:

```tsx
{/* CORRA Intelligence — premium nav button above Workspace */}
<div
  className="corra-nav-button"
  data-active={appView === 'corra' ? 'true' : 'false'}
  onClick={() => setAppView('corra')}
  title="CORRA Intelligence"
>
  <div className="corra-nav-orb">
    <Sparkles size={12} />
  </div>
  <div className="corra-nav-text">
    <span>CORRA</span>
    <small>Intelligence</small>
  </div>
</div>

<SidebarSection label="Workspace" expanded={expanded.workspace} onToggle={() => toggle('workspace')} />
```

- [ ] **Step 2: Add CSS to `src/styles/globals.css`**

Append at the end of the file:

```css
/* ─── CORRA Intelligence nav button ────────────────────────────────────────── */
.corra-nav-button {
  margin: 6px 8px 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(124, 58, 237, 0.3);
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.12), rgba(124, 58, 237, 0.12));
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 9px;
  animation: corraPulse 3s ease-in-out infinite;
  transition: border-color 200ms, background 200ms;
}

.corra-nav-button[data-active="true"] {
  border-color: rgba(124, 58, 237, 0.65);
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.25), rgba(124, 58, 237, 0.25));
  animation: none;
}

.corra-nav-button:hover:not([data-active="true"]) {
  border-color: rgba(124, 58, 237, 0.5);
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.2), rgba(124, 58, 237, 0.2));
}

.corra-nav-orb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.55);
  flex-shrink: 0;
  color: #fff;
}

.corra-nav-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.corra-nav-text span {
  font-size: 12px;
  font-weight: 700;
  color: #c4b5fd;
  letter-spacing: -0.01em;
}

.corra-nav-text small {
  font-size: 8px;
  color: rgba(167, 139, 250, 0.6);
  font-family: var(--font-mono);
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

/* Collapsed sidebar: hide text, keep orb centered */
.sidebar[data-collapsed="true"] .corra-nav-button {
  padding: 10px 6px;
  justify-content: center;
}

.sidebar[data-collapsed="true"] .corra-nav-text {
  display: none;
}

@keyframes corraPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
  50%       { box-shadow: 0 0 14px 2px rgba(124, 58, 237, 0.25); }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
pnpm test:run
```

Expected: all 2592+ tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/NavSidebar.tsx src/styles/globals.css
git commit -m "feat(corra): add CORRA Intelligence nav button with pulse animation"
```

---

## Manual Verification Checklist

After all 8 tasks complete, verify in the running app (`pnpm tauri dev`):

- [ ] CORRA button visible in sidebar, glowing pulse animation active
- [ ] Clicking CORRA navigates to the CORRA Intelligence page
- [ ] Greeting message "Hey — ich bin CORRA Intelligence…" appears on load
- [ ] Typing a message and pressing Enter sends it; CORRA responds
- [ ] Asking "Überfällige Rechnungen?" shows the item list + Focus CTA (requires overdue invoices in app)
- [ ] Clicking "Alle X in Fokus bearbeiten" creates todos and navigates to Focus mode
- [ ] Suggested prompts visible when only greeting is shown; disappear after first message
- [ ] "↗ Kopieren" copies Markdown protocol to clipboard (verify with toast)
- [ ] "✕ Leeren" resets to greeting only
- [ ] Collapsed sidebar shows CORRA orb only (no text)
- [ ] Active state shows brighter border (no pulse animation when on CORRA route)
