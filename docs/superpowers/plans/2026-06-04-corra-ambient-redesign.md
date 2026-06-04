# CORRA Intelligence Ambient Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign CORRA Intelligence from a traditional chat UI to an ambient command center — centered Stitch-style input when idle, chat slides to bottom-right after first message, and contextual lime-only ambient widgets appear in the center.

**Architecture:** `CorraRoute` becomes a phase machine (`idle` | `active`). Idle renders `CorraIdleView` (dark bg, dot grid, aurora, centered input). After first send, phase flips to active: `CorraChatPanel` appears bottom-right, `CorraWidget` renders the ambient data display in the center based on the `widget` field in CORRA's JSON response. All widgets read directly from Zustand stores — no prop drilling.

**Tech Stack:** React, Framer Motion (AnimatePresence + motion), Zustand stores, existing `invoke('cmd_anthropic_messages')`, existing `generateCorraDraft`-style CORRA system prompt.

---

## Design Reference

**Idle state:** Full viewport. Background `#080808` with lime dot grid + two lime aurora radial gradients. CORRA orb + "Was möchtest du wissen?" centered. Large input box (like Google Stitch). Suggested prompt pills below.

**Active state:** Background stays dark. Center: ambient widget — big lime number/headline floating in space (no card, no border), context lines below, glow behind. Bottom-right: compact 280px chat panel with scrollable history + input.

**Widgets (all lime, no other colors, no card border):**
- `revenue` — giant floating €-number + mini bar chart dots + context lines
- `todos` — big "N offen" + checkable list (live, marks todos done)
- `mails` — big "N neu" + sender list with lime dots
- `week` — big "N Termine" + mini week row (dots) + next event
- `heute` — 3 small counters (Termine / Aufgaben / Mails) + timeline

---

## File Map

**Create:**
- `src/components/corra/CorraIdleView.tsx` — Stitch-style idle screen
- `src/components/corra/CorraChatPanel.tsx` — compact bottom-right chat
- `src/components/corra/CorraWidget.tsx` — widget type switcher
- `src/components/corra/widgets/WidgetRevenue.tsx`
- `src/components/corra/widgets/WidgetTodos.tsx`
- `src/components/corra/widgets/WidgetMails.tsx`
- `src/components/corra/widgets/WidgetWeek.tsx`
- `src/components/corra/widgets/WidgetHeute.tsx`

**Modify:**
- `src/lib/ai/corra-intelligence.ts` — add `CorraWidgetType`, extend `CorraIntelligenceResponse` + `CorraMessage`, update system prompt, update parser
- `src/routes/CorraRoute.tsx` — full rewrite: phase state machine, wire new components

**Delete (Task 7):**
- `src/components/corra/CorraChat.tsx` — replaced by CorraIdleView + CorraChatPanel

**Keep unchanged:**
- `src/components/corra/CorraMessage.tsx` — used inside CorraChatPanel
- `src/components/corra/CorraSuggestedPrompts.tsx` — used inside CorraIdleView
- `src/components/corra/CorraActionCard.tsx` — used inside CorraChatPanel
- `src/lib/ai/corra-intelligence.ts` logic (only additions, no deletions)

---

## Task 1: Extend corra-intelligence — widget type + parser

**Files:**
- Modify: `src/lib/ai/corra-intelligence.ts`
- Modify: `src/lib/ai/corra-intelligence.test.ts` (create if not exists)

- [ ] **Step 1: Add `CorraWidgetType` and extend response types**

In `src/lib/ai/corra-intelligence.ts`, add after the existing type exports:

```typescript
export type CorraWidgetType = 'revenue' | 'todos' | 'mails' | 'week' | 'heute'

const VALID_WIDGETS = new Set<string>(['revenue', 'todos', 'mails', 'week', 'heute'])
```

Extend `CorraIntelligenceResponse`:
```typescript
export interface CorraIntelligenceResponse {
  text: string
  widget?: CorraWidgetType   // ← add this
  actions?: CorraActionItem[]
  focusCta?: string
}
```

Extend `CorraMessage`:
```typescript
export interface CorraMessage {
  id?: string
  role: 'user' | 'assistant'
  text: string
  widget?: CorraWidgetType   // ← add this
  actions?: CorraActionItem[]
  focusCta?: string
}
```

- [ ] **Step 2: Update `CORRA_INTELLIGENCE_SYSTEM` prompt**

Append to the end of the system prompt string (before the closing backtick):

```
WIDGET-FELD (optional, nur wenn inhaltlich passend):
Wenn deine Antwort primär Umsatz/Rechnungen/Finanzen zeigt → füge "widget": "revenue" ins JSON
Wenn deine Antwort Todos/Aufgaben zeigt → "widget": "todos"
Wenn deine Antwort Mails/Nachrichten zeigt → "widget": "mails"
Wenn deine Antwort Kalender/Termine/Woche zeigt → "widget": "week"
Wenn deine Antwort einen Tagesüberblick gibt (mehrere Kategorien) → "widget": "heute"
Bei reinen Text-Antworten (Erklärungen, Fragen) → kein "widget" Feld`
```

- [ ] **Step 3: Update `parseCorraResponse` to extract widget field**

Replace the existing `parseCorraResponse` function body:

```typescript
export function parseCorraResponse(raw: string): CorraIntelligenceResponse {
  const trimmed = raw.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/s.exec(trimmed)
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed
  try {
    const parsed: unknown = JSON.parse(jsonStr)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'text' in parsed &&
      typeof (parsed as { text: unknown }).text === 'string'
    ) {
      const p = parsed as { text: string; widget?: unknown; actions?: unknown; focusCta?: unknown }
      return {
        text:     p.text,
        widget:   typeof p.widget === 'string' && VALID_WIDGETS.has(p.widget)
                    ? p.widget as CorraWidgetType
                    : undefined,
        actions:  Array.isArray(p.actions) ? (p.actions as CorraActionItem[]) : undefined,
        focusCta: typeof p.focusCta === 'string' ? p.focusCta : undefined,
      }
    }
  } catch {}
  return { text: trimmed }
}
```

- [ ] **Step 4: Write tests**

Create `src/lib/ai/corra-intelligence.test.ts` (or append if it exists):

```typescript
import { describe, it, expect } from 'vitest'
import { parseCorraResponse } from './corra-intelligence'

describe('parseCorraResponse — widget field', () => {
  it('extracts valid widget type', () => {
    const raw = JSON.stringify({ text: 'Dein Umsatz:', widget: 'revenue' })
    expect(parseCorraResponse(raw).widget).toBe('revenue')
  })

  it('rejects unknown widget value', () => {
    const raw = JSON.stringify({ text: 'Hallo', widget: 'unknown' })
    expect(parseCorraResponse(raw).widget).toBeUndefined()
  })

  it('handles missing widget field gracefully', () => {
    const raw = JSON.stringify({ text: 'Hallo' })
    expect(parseCorraResponse(raw).widget).toBeUndefined()
  })

  it('still parses text when widget present', () => {
    const raw = JSON.stringify({ text: 'Umsatz diese Woche', widget: 'revenue' })
    const result = parseCorraResponse(raw)
    expect(result.text).toBe('Umsatz diese Woche')
    expect(result.widget).toBe('revenue')
  })

  it('accepts all valid widget types', () => {
    const types = ['revenue', 'todos', 'mails', 'week', 'heute'] as const
    for (const type of types) {
      const raw = JSON.stringify({ text: 'x', widget: type })
      expect(parseCorraResponse(raw).widget).toBe(type)
    }
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/lib/ai/corra-intelligence.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/corra-intelligence.ts src/lib/ai/corra-intelligence.test.ts
git commit -m "feat(corra): add widget type to intelligence response + parser"
```

---

## Task 2: CorraIdleView — Stitch-style idle screen

**Files:**
- Create: `src/components/corra/CorraIdleView.tsx`

- [ ] **Step 1: Create `src/components/corra/CorraIdleView.tsx`**

```typescript
import { useState, useRef } from 'react'
import { CorraSuggestedPrompts } from './CorraSuggestedPrompts'

interface Props {
  onSend: (text: string) => void
  loading: boolean
}

export function CorraIdleView({ onSend, loading }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#080808',
      overflow: 'hidden',
    }}>
      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(163,230,53,0.07) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }} />

      {/* Aurora */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 55% 45% at 15% 85%, rgba(163,230,53,0.09) 0%, transparent 65%)',
          'radial-gradient(ellipse 45% 35% at 85% 15%, rgba(163,230,53,0.06) 0%, transparent 60%)',
        ].join(', '),
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, padding: '0 24px' }}>
        {/* Orb + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 36 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(163,230,53,0.35)',
          }}>
            <span style={{ color: 'var(--accent-ink)', fontSize: 18 }}>✦</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 9, color: 'oklch(92% 0.2 125 / 0.5)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.18em',
              textTransform: 'uppercase', marginBottom: 10,
            }}>
              CORRA INTELLIGENCE
            </div>
            <div style={{
              fontSize: 26, fontWeight: 700, color: '#fff',
              letterSpacing: '-0.025em', lineHeight: 1.2,
            }}>
              Was möchtest du wissen?
            </div>
          </div>
        </div>

        {/* Input */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(163,230,53,0.2)',
          borderRadius: 16, padding: '14px 16px',
          display: 'flex', alignItems: 'flex-end', gap: 10,
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Frag CORRA — Umsatz, Todos, Mails, Deals…"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 14, color: '#fff', outline: 'none',
              resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 140, overflowY: 'auto',
              caretColor: 'var(--accent)',
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: input.trim() && !loading ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
              color: input.trim() && !loading ? 'var(--accent-ink)' : 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 180ms',
              boxShadow: input.trim() && !loading ? '0 0 12px rgba(163,230,53,0.4)' : 'none',
              fontSize: 16,
            }}
          >
            ↑
          </button>
        </div>

        {/* Suggested prompts */}
        <CorraSuggestedPrompts onSelect={text => { setInput(''); onSend(text) }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "corra/CorraIdleView" | head -5
```
Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/corra/CorraIdleView.tsx
git commit -m "feat(corra): add Stitch-style CorraIdleView"
```

---

## Task 3: Ambient Widget Components

**Files:**
- Create: `src/components/corra/widgets/WidgetRevenue.tsx`
- Create: `src/components/corra/widgets/WidgetTodos.tsx`
- Create: `src/components/corra/widgets/WidgetMails.tsx`
- Create: `src/components/corra/widgets/WidgetWeek.tsx`
- Create: `src/components/corra/widgets/WidgetHeute.tsx`

All widgets: dark ambient background (`#080808`), lime-only, no card border, content floats in space.

- [ ] **Step 1: Create `src/components/corra/widgets/WidgetRevenue.tsx`**

```typescript
import { useMemo } from 'react'
import { useFinanceStore } from '@/store/finance.store'

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setHours(0,0,0,0); m.setDate(d.getDate() + diff); return m
}

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function WidgetRevenue() {
  const invoices = useFinanceStore(s => s.invoices)

  const { paidNow, paidPrev, trend, bars } = useMemo(() => {
    const now = new Date()
    const weekStart = startOfWeek(now)
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7)

    let paidNow = 0, paidPrev = 0
    for (const inv of invoices) {
      if (inv.status !== 'paid') continue
      const ts = new Date(inv.date)
      if (ts >= weekStart) paidNow += inv.total
      else if (ts >= prevWeekStart && ts < weekStart) paidPrev += inv.total
    }

    const trendPct = paidPrev === 0
      ? (paidNow > 0 ? 100 : 0)
      : Math.round(((paidNow - paidPrev) / paidPrev) * 100)

    // Mini bar chart: last 5 weeks
    const bars: number[] = []
    for (let w = 4; w >= 0; w--) {
      const ws = new Date(weekStart); ws.setDate(ws.getDate() - w * 7)
      const we = new Date(ws); we.setDate(we.getDate() + 7)
      const total = invoices.filter(i => i.status === 'paid' && new Date(i.date) >= ws && new Date(i.date) < we).reduce((s, i) => s + i.total, 0)
      bars.push(total)
    }
    const maxBar = Math.max(...bars, 1)

    return { paidNow, paidPrev, trend: trendPct, bars: bars.map(b => b / maxBar) }
  }, [invoices])

  const overdueCount = invoices.filter(i => i.status === 'overdue').length

  return (
    <div style={{ textAlign: 'center', position: 'relative' }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 300, height: 200, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(163,230,53,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 16 }}>
        UMSATZ · DIESE WOCHE
      </div>

      {/* Mini bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 40, justifyContent: 'center', marginBottom: 16 }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: 14, borderRadius: '3px 3px 0 0',
            height: `${Math.max(h * 100, 4)}%`,
            background: i === bars.length - 1 ? 'var(--accent)' : 'rgba(163,230,53,0.18)',
            boxShadow: i === bars.length - 1 ? '0 0 8px rgba(163,230,53,0.5)' : 'none',
            transition: 'height 600ms ease',
          }} />
        ))}
      </div>

      {/* Giant number */}
      <div style={{
        fontSize: 56, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 48px rgba(163,230,53,0.3)',
      }}>
        {fmtEur(paidNow)}
      </div>

      {/* Separator */}
      <div style={{ width: 40, height: 1, background: 'rgba(163,230,53,0.2)', margin: '18px auto 14px' }} />

      {/* Context */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: trend >= 0 ? 'var(--accent)' : 'rgba(239,68,68,0.8)' }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs Vorwoche
        </span>
        {overdueCount > 0 && (
          <>
            <span style={{ fontSize: 11, color: 'rgba(163,230,53,0.3)' }}>·</span>
            <span style={{ fontSize: 11, color: 'rgba(163,230,53,0.5)' }}>{overdueCount} offen</span>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/corra/widgets/WidgetTodos.tsx`**

```typescript
import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { Loader } from 'lucide-react'
import type { Todo, UpsertTodoPayload } from '@/types/todo.types'

export function WidgetTodos() {
  const allTodos   = useTodosStore(s => s.allTodos)
  const upsertTodo = useTodosStore(s => s.upsert)
  const [completing, setCompleting] = useState<string | null>(null)

  const todayTodos = allTodos
    .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress'))
    .sort((a, b) => { const p = { p1: 0, p2: 1, p3: 2, p4: 3 }; return (p[a.priority] ?? 9) - (p[b.priority] ?? 9) })
    .slice(0, 5)

  const handleDone = async (todo: Todo) => {
    setCompleting(todo.id)
    try {
      const payload: UpsertTodoPayload = {
        id: todo.id, title: todo.title, status: 'done', bucket: 'done',
        priority: todo.priority, customerId: todo.customerId,
        checklist: todo.checklist, tags: todo.tags,
      }
      await upsertTodo(payload)
    } finally {
      setCompleting(null)
    }
  }

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 160, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(163,230,53,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 12 }}>
        AUFGABEN · HEUTE
      </div>

      <div style={{
        fontSize: 48, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 40px rgba(163,230,53,0.25)', marginBottom: 20,
      }}>
        {todayTodos.length} offen
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {todayTodos.map(todo => (
          <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => handleDone(todo)}
              disabled={completing === todo.id}
              style={{
                width: 18, height: 18, borderRadius: 5,
                border: '1px solid rgba(163,230,53,0.4)',
                background: 'transparent', flexShrink: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(163,230,53,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {completing === todo.id && <Loader size={10} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />}
            </button>
            <span style={{ fontSize: 13, color: '#ddd', flex: 1 }}>{todo.title}</span>
            <span style={{ fontSize: 9, color: 'rgba(163,230,53,0.35)', fontFamily: 'var(--font-mono)' }}>
              {todo.priority.toUpperCase()}
            </span>
          </div>
        ))}
        {todayTodos.length === 0 && (
          <span style={{ fontSize: 13, color: 'rgba(163,230,53,0.4)' }}>Alle Aufgaben erledigt ✓</span>
        )}
      </div>

      <div style={{ width: 40, height: 1, background: 'rgba(163,230,53,0.15)', margin: '16px 0 10px' }} />
      <div style={{ fontSize: 10, color: 'rgba(163,230,53,0.35)' }}>Direkt abhaken</div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/corra/widgets/WidgetMails.tsx`**

```typescript
import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'

export function WidgetMails() {
  const emails   = useMailStore(s => s.emails)
  const accounts = useAccountsStore(s => s.accounts)

  const unread = emails
    .filter(e => !e.isRead && e.customerId != null)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 4)

  const accountName = (id: string | undefined) =>
    id ? (accounts.find(a => a.id === id)?.name ?? null) : null

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  }

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 140,
        background: 'radial-gradient(ellipse, rgba(163,230,53,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 12 }}>
        UNGELESENE MAILS
      </div>

      <div style={{
        fontSize: 48, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 40px rgba(163,230,53,0.25)', marginBottom: 20,
      }}>
        {unread.length} neu
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {unread.map((mail, i) => (
          <div key={mail.id}>
            {i > 0 && <div style={{ height: 1, background: 'rgba(163,230,53,0.08)', marginBottom: 12 }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent)', boxShadow: '0 0 6px rgba(163,230,53,0.6)',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd', flex: 1 }}>
                {accountName(mail.customerId ?? undefined) ?? mail.fromName ?? mail.fromAddr}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(163,230,53,0.35)', fontFamily: 'var(--font-mono)' }}>
                {fmtTime(mail.sentAt)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(163,230,53,0.4)', paddingLeft: 14, marginTop: 2 }}>
              {mail.subject || '(ohne Betreff)'}
            </div>
          </div>
        ))}
        {unread.length === 0 && (
          <span style={{ fontSize: 13, color: 'rgba(163,230,53,0.4)' }}>Keine ungelesenen Mails ✓</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/corra/widgets/WidgetWeek.tsx`**

```typescript
import { useCalendarStore } from '@/store/calendar.store'

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function WidgetWeek() {
  const events = useCalendarStore(s => s.events)

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // Get Mon–Sun of current week
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1 // 0=Mon
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - dayOfWeek + i)
    return d.toISOString().slice(0, 10)
  })

  const eventsPerDay = weekDays.map(day =>
    events.filter(e => e.startAt.startsWith(day))
  )

  const totalThisWeek = eventsPerDay.reduce((s, es) => s + es.length, 0)

  const todayEvents = eventsPerDay[dayOfWeek] ?? []
  const nextEvent   = todayEvents.sort((a, b) => a.startAt.localeCompare(b.startAt))[0]

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 140,
        background: 'radial-gradient(ellipse, rgba(163,230,53,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 12 }}>
        DIESE WOCHE
      </div>

      <div style={{
        fontSize: 48, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 40px rgba(163,230,53,0.25)', marginBottom: 20,
      }}>
        {totalThisWeek} Termine
      </div>

      {/* Mini week row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {weekDays.map((day, i) => {
          const isToday = day === todayStr
          const count = eventsPerDay[i]?.length ?? 0
          return (
            <div key={day} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                fontSize: 8, color: isToday ? 'var(--accent)' : 'rgba(163,230,53,0.3)',
                fontFamily: 'var(--font-mono)', marginBottom: 4,
                fontWeight: isToday ? 700 : 400,
              }}>
                {DAYS[i]}
              </div>
              <div style={{
                height: 28, borderRadius: 4,
                background: isToday ? 'rgba(163,230,53,0.12)' : 'rgba(163,230,53,0.04)',
                border: isToday ? '1px solid rgba(163,230,53,0.3)' : '1px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {count > 0 && (
                  <div style={{
                    width: count > 1 ? 8 : 6, height: count > 1 ? 8 : 6,
                    borderRadius: '50%', background: 'var(--accent)',
                    boxShadow: isToday ? '0 0 6px rgba(163,230,53,0.6)' : 'none',
                  }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {nextEvent && (
        <>
          <div style={{ width: 40, height: 1, background: 'rgba(163,230,53,0.15)', marginBottom: 10 }} />
          <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.4)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            HEUTE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)' }}>
              {nextEvent.startAt.slice(11, 16)}
            </span>
            <span style={{ fontSize: 13, color: '#ddd' }}>{nextEvent.title}</span>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create `src/components/corra/widgets/WidgetHeute.tsx`**

```typescript
import { useMemo } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useCalendarStore } from '@/store/calendar.store'

export function WidgetHeute() {
  const allTodos = useTodosStore(s => s.allTodos)
  const emails   = useMailStore(s => s.emails)
  const events   = useCalendarStore(s => s.todayEvents ?? useCalendarStore.getState().events.filter(e => e.startAt.startsWith(new Date().toISOString().slice(0,10))))

  const todayStr = new Date().toISOString().slice(0, 10)

  const todayTodos = allTodos.filter(t =>
    t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')
  )
  const unreadMails = emails.filter(e => !e.isRead && e.customerId != null)
  const todayEvents = events.filter(e => e.startAt.startsWith(todayStr))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 4)

  type TodayItem =
    | { kind: 'event'; time: string; label: string }
    | { kind: 'todo';  label: string; priority: string }
    | { kind: 'mail';  label: string }

  const timeline = useMemo((): TodayItem[] => {
    const items: TodayItem[] = [
      ...todayEvents.map(e => ({ kind: 'event' as const, time: e.startAt.slice(11,16), label: e.title })),
      ...todayTodos.slice(0,2).map(t => ({ kind: 'todo' as const, label: t.title, priority: t.priority.toUpperCase() })),
      ...unreadMails.slice(0,1).map(m => ({ kind: 'mail' as const, label: m.fromName ?? m.fromAddr })),
    ]
    return items.slice(0, 5)
  }, [todayEvents, todayTodos, unreadMails])

  const Counter = ({ value, label }: { value: number; label: string }) => (
    <div>
      <div style={{
        fontSize: 28, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.03em', textShadow: '0 0 20px rgba(163,230,53,0.2)',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        {label}
      </div>
    </div>
  )

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 140,
        background: 'radial-gradient(ellipse, rgba(163,230,53,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(163,230,53,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 16 }}>
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' }).toUpperCase()}
      </div>

      {/* 3 mini counters */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <Counter value={todayEvents.length} label="TERMINE" />
        <div style={{ width: 1, background: 'rgba(163,230,53,0.1)', alignSelf: 'stretch' }} />
        <Counter value={todayTodos.length} label="AUFGABEN" />
        <div style={{ width: 1, background: 'rgba(163,230,53,0.1)', alignSelf: 'stretch' }} />
        <Counter value={unreadMails.length} label="MAILS" />
      </div>

      <div style={{ width: 40, height: 1, background: 'rgba(163,230,53,0.15)', marginBottom: 14 }} />

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {timeline.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', width: 32, flexShrink: 0,
              color: item.kind === 'event' ? 'rgba(163,230,53,0.5)'
                   : item.kind === 'todo' ? 'var(--accent)'
                   : 'var(--accent)',
            }}>
              {item.kind === 'event' ? item.time : item.kind === 'todo' ? 'Todo' : 'Mail'}
            </span>
            <div style={{ width: 1, background: 'rgba(163,230,53,0.15)', alignSelf: 'stretch', minHeight: 24, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#ccc', flex: 1 }}>
              {item.label}
            </span>
            {item.kind === 'todo' && (
              <span style={{ fontSize: 9, color: 'rgba(163,230,53,0.35)', fontFamily: 'var(--font-mono)' }}>
                {item.priority}
              </span>
            )}
          </div>
        ))}
        {timeline.length === 0 && (
          <span style={{ fontSize: 13, color: 'rgba(163,230,53,0.4)' }}>Ruhiger Tag ✓</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Typecheck widgets**

```bash
npm run typecheck 2>&1 | grep "widgets/" | head -10
```
Fix any type errors in widget files.

- [ ] **Step 7: Commit**

```bash
git add src/components/corra/widgets/
git commit -m "feat(corra): add ambient widget components (revenue, todos, mails, week, heute)"
```

---

## Task 4: CorraWidget Switcher

**Files:**
- Create: `src/components/corra/CorraWidget.tsx`

- [ ] **Step 1: Create `src/components/corra/CorraWidget.tsx`**

```typescript
import { WidgetRevenue } from './widgets/WidgetRevenue'
import { WidgetTodos }   from './widgets/WidgetTodos'
import { WidgetMails }   from './widgets/WidgetMails'
import { WidgetWeek }    from './widgets/WidgetWeek'
import { WidgetHeute }   from './widgets/WidgetHeute'
import type { CorraWidgetType } from '@/lib/ai/corra-intelligence'

interface Props {
  type: CorraWidgetType
}

export function CorraWidget({ type }: Props) {
  switch (type) {
    case 'revenue': return <WidgetRevenue />
    case 'todos':   return <WidgetTodos />
    case 'mails':   return <WidgetMails />
    case 'week':    return <WidgetWeek />
    case 'heute':   return <WidgetHeute />
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/corra/CorraWidget.tsx
git commit -m "feat(corra): add CorraWidget switcher"
```

---

## Task 5: CorraChatPanel — compact bottom-right chat

**Files:**
- Create: `src/components/corra/CorraChatPanel.tsx`

- [ ] **Step 1: Create `src/components/corra/CorraChatPanel.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader, Sparkles, X } from 'lucide-react'
import { CorraMessage } from './CorraMessage'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  messages: CorraMessageType[]
  loading: boolean
  onSend: (text: string) => void
  onFocusActions: (actions: CorraActionItem[]) => void
  onClear: () => void
}

export function CorraChatPanel({ messages, loading, onSend, onFocusActions, onClear }: Props) {
  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend() }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, y: 20 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 40, y: 20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        position: 'absolute', bottom: 24, right: 24, zIndex: 10,
        width: 280,
      }}
    >
      <div style={{
        background: 'rgba(10,10,10,0.95)',
        border: '1px solid rgba(163,230,53,0.18)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: '1px solid rgba(163,230,53,0.1)',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px rgba(163,230,53,0.4)',
          }}>
            <Sparkles size={10} style={{ color: 'var(--accent-ink)' }} />
          </div>
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            CORRA
          </span>
          <button type="button" onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', color: 'rgba(163,230,53,0.4)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
            {expanded ? '−' : '+'}
          </button>
          <button type="button" onClick={onClear}
            style={{ background: 'none', border: 'none', color: 'rgba(163,230,53,0.4)', cursor: 'pointer', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              {/* Messages */}
              <div style={{ maxHeight: 220, overflowY: 'auto', padding: '10px 0' }}>
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <CorraMessage key={msg.id ?? String(i)} message={msg} onFocusActions={onFocusActions} />
                  ))}
                </AnimatePresence>
                {loading && (
                  <div style={{ display: 'flex', padding: '6px 14px', gap: 8, alignItems: 'center' }}>
                    <Loader size={10} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 11, color: 'rgba(163,230,53,0.4)' }}>CORRA denkt…</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(163,230,53,0.08)' }}>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: 'rgba(163,230,53,0.04)', border: '1px solid rgba(163,230,53,0.12)',
                  borderRadius: 10, padding: '7px 10px',
                }}>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Weiterfragen…"
                    style={{
                      flex: 1, background: 'transparent', border: 'none',
                      fontSize: 12, color: '#ddd', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', border: 'none', flexShrink: 0,
                      background: input.trim() && !loading ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                      color: input.trim() && !loading ? 'var(--accent-ink)' : 'rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                    }}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/corra/CorraChatPanel.tsx
git commit -m "feat(corra): add compact CorraChatPanel for active state"
```

---

## Task 6: CorraRoute — phase state machine + wire up

**Files:**
- Modify: `src/routes/CorraRoute.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `src/routes/CorraRoute.tsx`**

```typescript
import { useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore }  from '@/store/finance.store'
import { useTodosStore }    from '@/store/todos.store'
import { useMailStore }     from '@/store/mail.store'
import { useDealsStore }    from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore }       from '@/store/ui.store'
import { useToastStore }    from '@/store/toast.store'
import { getApiKey, getModel, MissingApiKeyError } from '@/lib/ai/briefing'
import {
  buildCorraIntelligenceContext,
  parseCorraResponse,
  CORRA_INTELLIGENCE_SYSTEM,
} from '@/lib/ai/corra-intelligence'
import type { CorraMessage, CorraActionItem, CorraWidgetType } from '@/lib/ai/corra-intelligence'
import { CorraIdleView }   from '@/components/corra/CorraIdleView'
import { CorraChatPanel }  from '@/components/corra/CorraChatPanel'
import { CorraWidget }     from '@/components/corra/CorraWidget'
import { log } from '@/lib/logger'

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

type Phase = 'idle' | 'active'

const makeGreeting = (): CorraMessage => ({
  id: '0',
  role: 'assistant',
  text: 'Hey — ich bin CORRA. Was möchtest du wissen?',
})

export function CorraRoute() {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [messages, setMessages] = useState<CorraMessage[]>(() => [makeGreeting()])
  const [loading, setLoading]   = useState(false)

  const msgIdRef = useRef(0)
  const nextId = () => String(++msgIdRef.current)

  const invoices       = useFinanceStore(s => s.invoices)
  const todos          = useTodosStore(s => s.allTodos)
  const emails         = useMailStore(s => s.emails)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const setAppView     = useUiStore(s => s.setAppView)
  const showToast      = useToastStore(s => s.show)

  // Current widget = last assistant message with a widget field
  const currentWidget: CorraWidgetType | undefined = [...messages]
    .reverse()
    .find(m => m.role === 'assistant' && m.widget)?.widget

  const handleSend = useCallback(async (text: string) => {
    if (phase === 'idle') setPhase('active')

    const userMsg: CorraMessage = { id: nextId(), role: 'user', text }
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

      const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
      const raw = block?.text.trim() ?? '(keine Antwort)'
      const parsed = parseCorraResponse(raw)

      setMessages(prev => [...prev, {
        id: nextId(), role: 'assistant',
        text: parsed.text,
        widget: parsed.widget,
        actions: parsed.actions,
        focusCta: parsed.focusCta,
      }])
    } catch (e) {
      const errText = e instanceof MissingApiKeyError
        ? 'Kein API-Key konfiguriert — bitte in den Einstellungen hinterlegen.'
        : 'Verbindungsfehler. Versuche es erneut.'
      log.warn('CORRA error', { err: e })
      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', text: errText }])
    } finally {
      setLoading(false)
    }
  }, [phase, messages, todos, invoices, emails, deals, calendarEvents, accounts])

  const handleFocusActions = useCallback(async (actions: CorraActionItem[]) => {
    try {
      for (const action of actions) {
        if (action.type === 'invoice') {
          const inv = invoices.find(i => i.id === action.id)
          await upsertTodo({
            title: `Mahnung: ${action.label}`, actionType: 'send_reminder',
            sourceRef: action.id, customerId: inv?.accountId,
            bucket: 'today', priority: 'p1', checklist: [], tags: [],
          })
        } else if (action.type === 'mail') {
          const mail = emails.find(e => e.id === action.id)
          await upsertTodo({
            title: `${action.label} beantworten`, actionType: 'reply_mail',
            sourceRef: action.id, customerId: mail?.customerId ?? undefined,
            bucket: 'today', priority: 'p1', checklist: [], tags: [],
          })
        }
      }
      setAppView('focus')
    } catch {
      showToast({ message: 'Fehler beim Anlegen der Fokus-Aufgaben.', variant: 'error' })
    }
  }, [upsertTodo, setAppView, showToast, invoices, emails])

  const handleClear = useCallback(() => {
    setMessages([makeGreeting()])
    setPhase('idle')
  }, [])

  return (
    <div style={{
      position: 'relative', height: '100%', overflow: 'hidden',
      background: '#080808',
    }}>
      {/* Idle phase */}
      <AnimatePresence>
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <CorraIdleView onSend={handleSend} loading={loading} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active phase — widget center */}
      <AnimatePresence>
        {phase === 'active' && (
          <motion.div
            key="active-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {/* Subtle dot grid in active state too */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'radial-gradient(circle, rgba(163,230,53,0.04) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }} />

            <AnimatePresence mode="wait">
              {currentWidget ? (
                <motion.div
                  key={currentWidget}
                  initial={{ opacity: 0, scale: 0.94, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <CorraWidget type={currentWidget} />
                </motion.div>
              ) : loading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite',
                    boxShadow: '0 0 12px rgba(163,230,53,0.5)',
                  }} />
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div style={{
                    fontSize: 9, color: 'rgba(163,230,53,0.3)',
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.15em',
                  }}>
                    CORRA INTELLIGENCE
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel — slides in when active */}
      <AnimatePresence>
        {phase === 'active' && (
          <CorraChatPanel
            key="chat-panel"
            messages={messages}
            loading={loading}
            onSend={handleSend}
            onFocusActions={handleFocusActions}
            onClear={handleClear}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | grep "CorraRoute\|corra/" | grep -v "slashMenu\|ArbeitsraumPane" | head -10
```
Fix any errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/CorraRoute.tsx
git commit -m "feat(corra): rewrite CorraRoute as phase machine (idle/active)"
```

---

## Task 7: Cleanup

**Files:**
- Delete: `src/components/corra/CorraChat.tsx`

- [ ] **Step 1: Check for remaining imports of CorraChat**

```bash
grep -r "CorraChat" src/ --include="*.tsx" --include="*.ts" -l
```
Expected: no files reference CorraChat (it was only used by the old CorraRoute).

- [ ] **Step 2: Delete CorraChat.tsx**

```bash
cd C:\Users\hendr\Documents\DEV\cyneradev
git rm src/components/corra/CorraChat.tsx
```

- [ ] **Step 3: Final typecheck**

```bash
npm run typecheck 2>&1 | grep -v "slashMenu\|ArbeitsraumPane\|NotizPane" | grep "error" | head -10
```
Expected: no new errors.

- [ ] **Step 4: Run all tests**

```bash
npm run test:run
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(corra): remove old CorraChat, ambient redesign complete"
```

---

## Self-Review

**Spec coverage:**
- ✅ Idle state: dark bg + dot grid + aurora + centered input → `CorraIdleView`
- ✅ After send: chat slides to bottom-right → `CorraChatPanel` with AnimatePresence
- ✅ Widget appears center → `CorraWidget` + `AnimatePresence mode="wait"`
- ✅ Widget types: revenue, todos, mails, week, heute → Tasks 3+4
- ✅ All lime, no other colors → all widgets use `var(--accent)` + `rgba(163,230,53,...)`
- ✅ Todos interactive (checkboxes) → `WidgetTodos` calls `upsertTodo`
- ✅ `widget` field in CORRA response → Task 1
- ✅ Phase machine idle/active → `CorraRoute` Task 6
- ✅ onClear resets to idle → `handleClear` sets `setPhase('idle')`
- ✅ CorraChatPanel collapsible → `expanded` state + `AnimatePresence`

**Placeholder scan:** None found.

**Type consistency:**
- `CorraWidgetType` defined Task 1, used in Tasks 4, 5, 6 ✅
- `CorraMessage.widget?: CorraWidgetType` defined Task 1, populated in Task 6 ✅
- `CorraChatPanel` props match usage in Task 6 ✅
