# KORA Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KORA wird vom 280px Floating-Panel zum Vollbild-Command-Center — Chat, Widgets und One-Click-Actions in einer einheitlichen Ansicht.

**Architecture:** `CorraRoute` rendert in der aktiven Phase einen Vollbild-Chat (statt Floating Panel + Widget-Center). Nachrichten können Text, inline Widgets und Action Cards enthalten. Action Cards haben pro Item einen Ausführen-Button der direkt Store-Actions aufruft — kein Umweg mehr zur Fokus-Ansicht. Erster Turn triggert automatisch eine Triage-Antwort von KORA.

**Tech Stack:** React 18, TypeScript, Zustand, Framer Motion, Lucide, inline styles (Codebase-Pattern), bestehende Store-Actions (`useFinanceStore`, `useTodosStore`, `useMailStore`).

---

## File Map

| File | Action | Verantwortlichkeit |
|------|--------|--------------------|
| `src/components/corra/CorraActionCard.tsx` | Modify | Per-Item Buttons: Execute + Dismiss, lokaler Status |
| `src/components/corra/CorraMessage.tsx` | Modify | Inline Widget-Embed, neue CorraActionCard-Props |
| `src/components/corra/CorraChatPanel.tsx` | Rewrite | Vollbild-Layout, zentrierte Spalte, fixierter Input |
| `src/lib/ai/corra-intelligence.ts` | Modify | System-Prompt: Startup-Triage-Instruktion |
| `src/routes/CorraRoute.tsx` | Modify | Vollbild-Chat, executeAction, dismissAction, first-turn |

---

## Task 1: CorraActionCard — Per-Item Execution

**Files:**
- Modify: `src/components/corra/CorraActionCard.tsx`

Jede Action bekommt eigene Buttons. Lokaler State pro Item: `'idle' | 'loading' | 'done' | 'dismissed'`.

- [ ] **Step 1: CorraActionCard komplett ersetzen**

```tsx
// src/components/corra/CorraActionCard.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { CorraActionItem } from '@/lib/ai/corra-intelligence'

type ItemStatus = 'idle' | 'loading' | 'done' | 'dismissed'

interface Props {
  actions:   CorraActionItem[]
  onExecute: (action: CorraActionItem) => Promise<void>
  onDismiss?: (id: string) => void
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}
const item = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

function urgencyColor(urgency: string): string {
  const days = parseInt(urgency, 10)
  if (isNaN(days)) return 'var(--fg-dim)'
  if (days > 10) return 'var(--danger, #ef4444)'
  if (days > 3)  return 'var(--warn, #f97316)'
  return 'var(--info, #60a5fa)'
}

const typeIcon: Record<string, string> = {
  invoice: '💳',
  mail:    '📬',
  todo:    '✅',
}

export function CorraActionCard({ actions, onExecute, onDismiss }: Props) {
  const [status, setStatus] = useState<Record<string, ItemStatus>>(
    () => Object.fromEntries(actions.map(a => [a.id, 'idle']))
  )

  const handleExecute = async (action: CorraActionItem) => {
    setStatus(s => ({ ...s, [action.id]: 'loading' }))
    try {
      await onExecute(action)
      setStatus(s => ({ ...s, [action.id]: 'done' }))
    } catch {
      setStatus(s => ({ ...s, [action.id]: 'idle' }))
    }
  }

  const handleDismiss = (id: string) => {
    setStatus(s => ({ ...s, [id]: 'dismissed' }))
    onDismiss?.(id)
  }

  const visible = actions.filter(a => status[a.id] !== 'dismissed')
  if (visible.length === 0) return null

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}
    >
      {visible.map(a => {
        const s = status[a.id] ?? 'idle'
        return (
          <motion.div key={a.id} variants={item} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--surface-1, #111)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 14px',
            opacity: s === 'done' ? 0.6 : 1,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon[a.type] ?? '📌'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>{a.detail}</div>
            </div>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 99,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', flexShrink: 0,
              background: 'color-mix(in srgb, currentColor 12%, transparent)',
              color: urgencyColor(a.urgency),
            }}>{a.urgency}</span>

            {s === 'done' ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: 'var(--accent)', fontWeight: 600,
              }}>
                <Check size={13} /> Erledigt
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={s === 'loading'}
                  onClick={() => handleExecute(a)}
                  style={{
                    padding: '5px 12px', borderRadius: 7, border: 'none',
                    background: s === 'loading' ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
                    color: s === 'loading' ? 'var(--fg-dim)' : 'var(--accent-ink)',
                    fontSize: 11, fontWeight: 700, cursor: s === 'loading' ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s === 'loading' ? '…' : '→ Ausführen'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(a.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--fg-dim)', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Später
                </button>
              </div>
            )}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "CorraActionCard"
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/corra/CorraActionCard.tsx
git commit -m "feat(kora): CorraActionCard — per-item Execute/Dismiss Buttons"
```

---

## Task 2: CorraMessage — Inline Widget + neue ActionCard-Props

**Files:**
- Modify: `src/components/corra/CorraMessage.tsx`

Widget wird direkt in die Nachricht eingebettet. `CorraActionCard` bekommt `onExecute`/`onDismiss` statt `onFocus`.

- [ ] **Step 1: CorraMessage ersetzen**

```tsx
// src/components/corra/CorraMessage.tsx
import { motion } from 'framer-motion'
import { CorraActionCard } from './CorraActionCard'
import { CorraWidget } from './CorraWidget'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  message:   CorraMessageType
  onExecute: (action: CorraActionItem) => Promise<void>
}

export function CorraMessage({ message, onExecute }: Props) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, marginTop: 2,
        }}>✦</div>
      )}

      <div style={{ maxWidth: '80%', flex: isUser ? undefined : 1 }}>
        {!isUser && (
          <div style={{
            fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', marginBottom: 5,
          }}>KORA</div>
        )}

        <div style={{
          padding: isUser ? '10px 14px' : undefined,
          borderRadius: isUser ? '12px 0 12px 12px' : undefined,
          background: isUser ? 'oklch(92% 0.2 125 / 0.08)' : undefined,
          border: isUser ? '1px solid oklch(92% 0.2 125 / 0.25)' : undefined,
          fontSize: 13, lineHeight: 1.65, color: 'var(--fg)',
        }}>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.text}
          </div>

          {message.widget && (
            <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden' }}>
              <CorraWidget type={message.widget} compact />
            </div>
          )}

          {message.actions && message.actions.length > 0 && (
            <CorraActionCard
              actions={message.actions}
              onExecute={onExecute}
            />
          )}
        </div>
      </div>

      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', marginTop: 2,
        }}>Du</div>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 2: CorraWidget — compact prop hinzufügen**

`CorraWidget` bekommt ein optionales `compact?: boolean` prop. Da wir es inline rendern, soll es keinen eigenen Padding-Container haben.

```bash
grep -n "export function CorraWidget" src/components/corra/CorraWidget.tsx
```

Öffne die Datei und füge `compact?: boolean` zur Props-Interface hinzu. Das Prop kann vorerst ungenutzt sein — der Wrapper-Style in CorraMessage gibt den Rahmen.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "CorraMessage\|CorraWidget"
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/corra/CorraMessage.tsx src/components/corra/CorraWidget.tsx
git commit -m "feat(kora): CorraMessage — inline Widget, neue ActionCard-Props"
```

---

## Task 3: CorraChatPanel — Vollbild-Layout

**Files:**
- Rewrite: `src/components/corra/CorraChatPanel.tsx`

Vollbild statt 280px Float. Topbar, scrollbare Nachrichtenliste, fixierter Input unten.

- [ ] **Step 1: CorraChatPanel komplett ersetzen**

```tsx
// src/components/corra/CorraChatPanel.tsx
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { CorraMessage } from './CorraMessage'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  messages:  CorraMessageType[]
  loading:   boolean
  onSend:    (text: string) => void
  onExecute: (action: CorraActionItem) => Promise<void>
  onClear:   () => void
}

export function CorraChatPanel({ messages, loading, onSend, onExecute, onClear }: Props) {
  const [input, setInput]   = useState('')
  const bottomRef           = useRef<HTMLDivElement>(null)
  const textareaRef         = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const openCount = messages.filter(
    m => m.role === 'assistant' && m.actions && m.actions.length > 0
  ).reduce((s, m) => s + (m.actions?.length ?? 0), 0)

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Dot grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }} />

      {/* Topbar */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 8px oklch(92% 0.2 125 / 0.4)',
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--accent)',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
        }}>KORA INTELLIGENCE</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {openCount > 0 && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'var(--accent)', letterSpacing: '0.1em',
              background: 'oklch(92% 0.2 125 / 0.1)',
              padding: '2px 8px', borderRadius: 99,
            }}>
              {openCount} OFFEN
            </span>
          )}
          <button
            type="button"
            onClick={onClear}
            title="Neue Unterhaltung"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--fg-dim)', display: 'flex', alignItems: 'center',
              gap: 5, fontSize: 11, padding: '4px 8px', borderRadius: 6,
            }}
          >
            <RotateCcw size={12} /> Neu
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1,
        padding: '24px 0',
      }}>
        <div style={{
          maxWidth: 760, margin: '0 auto',
          padding: '0 24px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <CorraMessage
                key={msg.id ?? String(i)}
                message={msg}
                onExecute={onExecute}
              />
            ))}
          </AnimatePresence>

          {loading && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--accent)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
              }}>✦</div>
              <div style={{ paddingTop: 6, display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: `koraPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    opacity: 0.6,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{
        position: 'relative', zIndex: 1,
        padding: '16px 24px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          maxWidth: 760, margin: '0 auto',
          background: 'var(--surface-1, #111)',
          border: '1px solid var(--border)',
          borderRadius: 14, padding: '12px 16px',
          display: 'flex', gap: 10, alignItems: 'flex-end',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Frag KORA — Umsatz, offene Rechnungen, was heute ansteht…"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 13, color: 'var(--fg)', outline: 'none',
              resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 120, overflowY: 'auto',
              caretColor: 'var(--accent)',
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
              background: input.trim() && !loading ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: input.trim() && !loading ? 'var(--accent-ink)' : 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              fontSize: 15, transition: 'all 160ms',
            }}
          >↑</button>
        </div>
      </div>

      <style>{`
        @keyframes koraPulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50%       { transform: scale(1.4); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "CorraChatPanel"
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/corra/CorraChatPanel.tsx
git commit -m "feat(kora): CorraChatPanel — Vollbild-Layout, zentrierte Spalte"
```

---

## Task 4: System-Prompt — Startup-Triage

**Files:**
- Modify: `src/lib/ai/corra-intelligence.ts`

KORA soll beim ersten Turn automatisch eine Triage starten.

- [ ] **Step 1: System-Prompt Instruktion erweitern**

In `corra-intelligence.ts`, am Ende von `CORRA_INTELLIGENCE_SYSTEM` folgendes anhängen (Template-String erweitern):

Ersetze die letzte Zeile:
```ts
Bei reinen Text-Antworten (Erklärungen, Fragen) → kein "widget" Feld`
```

durch:
```ts
Bei reinen Text-Antworten (Erklärungen, Fragen) → kein "widget" Feld

ERSTER TURN:
Wenn der Kontext "[ERSTER_TURN]" enthält: Beginne deine Antwort IMMER mit einer kurzen Triage.
Zeige max. 3 der wichtigsten offenen Punkte als actions-Array.
Dann beantworte die eigentliche Frage des Nutzers.
Format: JSON mit text + actions (+ optional widget).`
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "corra-intelligence"
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/corra-intelligence.ts
git commit -m "feat(kora): System-Prompt — Startup-Triage beim ersten Turn"
```

---

## Task 5: CorraRoute — Vollbild-Chat + executeAction

**Files:**
- Modify: `src/routes/CorraRoute.tsx`

Aktive Phase: kein Floating Panel mehr. `handleExecuteAction` führt Store-Actions direkt aus. Erster Turn bekommt `[ERSTER_TURN]`-Marker im Kontext.

- [ ] **Step 1: CorraRoute ersetzen**

```tsx
// src/routes/CorraRoute.tsx
import { useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore }  from '@/store/finance.store'
import { useTodosStore }    from '@/store/todos.store'
import { useMailStore }     from '@/store/mail.store'
import { useDealsStore }    from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useToastStore }    from '@/store/toast.store'
import { getApiKey, getModel, MissingApiKeyError } from '@/lib/ai/briefing'
import {
  buildCorraIntelligenceContext,
  parseCorraResponse,
  CORRA_INTELLIGENCE_SYSTEM,
} from '@/lib/ai/corra-intelligence'
import type { CorraMessage, CorraActionItem } from '@/lib/ai/corra-intelligence'
import { CorraIdleView }  from '@/components/corra/CorraIdleView'
import { CorraChatPanel } from '@/components/corra/CorraChatPanel'
import { log } from '@/lib/logger'

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

type Phase = 'idle' | 'active'

const makeGreeting = (): CorraMessage => ({
  id: '0', role: 'assistant',
  text: 'Hey — ich bin KORA. Was möchtest du wissen?',
})

export function CorraRoute() {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [messages, setMessages] = useState<CorraMessage[]>(() => [makeGreeting()])
  const [loading, setLoading]   = useState(false)

  const msgIdRef  = useRef(0)
  const nextId    = () => String(++msgIdRef.current)
  const isFirst   = useRef(true)

  const invoices       = useFinanceStore(s => s.invoices)
  const upsertInvoice  = useFinanceStore(s => s.upsertInvoice)
  const todos          = useTodosStore(s => s.allTodos)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const emails         = useMailStore(s => s.emails)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)
  const showToast      = useToastStore(s => s.show)

  const handleSend = useCallback(async (text: string) => {
    if (phase === 'idle') setPhase('active')

    const userMsg: CorraMessage = { id: nextId(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const apiKey = getApiKey()
      if (!apiKey) throw new MissingApiKeyError()

      const firstTurn = isFirst.current
      isFirst.current = false

      const ctx = buildCorraIntelligenceContext({
        todos, invoices, emails, deals, calendarEvents, accounts,
      })
      const ctxWithFlag = firstTurn ? `[ERSTER_TURN]\n\n${ctx}` : ctx

      const history = [...messages, userMsg]

      const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
        apiKey,
        body: {
          model: getModel(),
          max_tokens: 1024,
          system: [
            {
              type: 'text',
              text: `${CORRA_INTELLIGENCE_SYSTEM}\n\n--- AKTUELLE DATEN ---\n${ctxWithFlag}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: history.map(m => ({ role: m.role, content: m.text })),
        },
      })

      const block  = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
      const raw    = block?.text.trim() ?? '(keine Antwort)'
      const parsed = parseCorraResponse(raw)

      setMessages(prev => [...prev, {
        id: nextId(), role: 'assistant',
        text: parsed.text, widget: parsed.widget,
        actions: parsed.actions, focusCta: parsed.focusCta,
      }])
    } catch (e) {
      const errText = e instanceof MissingApiKeyError
        ? 'Kein API-Key konfiguriert — bitte in den Einstellungen hinterlegen.'
        : 'Verbindungsfehler. Versuche es erneut.'
      log.warn('KORA error', { err: e })
      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', text: errText }])
    } finally {
      setLoading(false)
    }
  }, [phase, messages, todos, invoices, emails, deals, calendarEvents, accounts])

  const handleExecuteAction = useCallback(async (action: CorraActionItem) => {
    if (action.type === 'invoice') {
      const inv = invoices.find(i => i.id === action.id)
      await upsertTodo({
        title: `Mahnung: ${action.label}`,
        actionType: 'send_reminder',
        sourceRef: action.id,
        customerId: inv?.accountId,
        bucket: 'today', priority: 'p1', checklist: [], tags: [],
      })
      showToast({ message: `Mahnung für ${action.label} angelegt.`, variant: 'success' })
    } else if (action.type === 'mail') {
      const mail = emails.find(e => e.id === action.id)
      await upsertTodo({
        title: `${action.label} beantworten`,
        actionType: 'reply_mail',
        sourceRef: action.id,
        customerId: mail?.customerId ?? undefined,
        bucket: 'today', priority: 'p1', checklist: [], tags: [],
      })
      showToast({ message: `Task für ${action.label} angelegt.`, variant: 'success' })
    } else if (action.type === 'todo') {
      await upsertTodo({
        title: action.label,
        bucket: 'today', priority: 'p1', checklist: [], tags: [],
      })
      showToast({ message: `Task angelegt.`, variant: 'success' })
    }
  }, [invoices, emails, upsertTodo, showToast])

  const handleClear = useCallback(() => {
    setMessages([makeGreeting()])
    setPhase('idle')
    isFirst.current = true
  }, [])

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <AnimatePresence>
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <CorraIdleView onSend={handleSend} loading={loading} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'active' && (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <CorraChatPanel
              messages={messages}
              loading={loading}
              onSend={handleSend}
              onExecute={handleExecuteAction}
              onClear={handleClear}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check — keine neuen Fehler**

```bash
npx tsc --noEmit 2>&1 | grep -v "slashMenu\|ArbeitsraumPane" | grep "error TS"
```

Expected: 0 Fehler.

- [ ] **Step 3: Tests laufen lassen**

```bash
npx vitest run 2>&1 | tail -6
```

Expected: alle Tests grün.

- [ ] **Step 4: Commit**

```bash
git add src/routes/CorraRoute.tsx
git commit -m "feat(kora): CorraRoute — Vollbild-Chat, executeAction, first-turn Triage"
```

---

## Selbst-Review

**Spec-Abdeckung:**
- ✅ Vollbild-Chat statt Floating Panel (Task 3 + 5)
- ✅ Widget inline in Chat-Bubble (Task 2)
- ✅ One-Click Actions direkt ausführbar (Task 1 + 5)
- ✅ Startup-Triage beim ersten Turn (Task 4 + 5)
- ✅ Dot-Grid im aktiven State (Task 3)
- ✅ "Neu"-Button für neue Unterhaltung (Task 3)

**Keine Placeholders.**

**Type-Konsistenz:**
- `CorraActionCard` Props: `{ actions, onExecute, onDismiss? }` — konsistent in Tasks 1, 2, 3
- `CorraChatPanel` Props: `{ messages, loading, onSend, onExecute, onClear }` — konsistent in Tasks 3, 5
- `handleExecuteAction` Signatur `(action: CorraActionItem) => Promise<void>` — konsistent durchgehend
