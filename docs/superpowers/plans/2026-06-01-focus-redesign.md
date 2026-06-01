# Focus Mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Focus Mode 1:1 nach Mockup: Full-Screen-Shell mit eigenem TopBar, Progress-Bar, Schließen/ESC, Icon-basierter Queue-Sidebar, und Aktionsbuttons innerhalb der Karten.

**Architecture:** `FocusShell` ersetzt `FocusRoute` als Full-Screen-Takeover (analog zu `PrivateShell`). `useFocusStack()` wird einmalig in `FocusShell` aufgerufen und als `FocusStackApi`-Prop durch `FocusWorkspace` und `FocusTopBar` weitergegeben — kein doppeltes State. Aktionsbuttons wandern in die Karten, die Queue-Sidebar bekommt Typ-Icons und Betrags-Anzeige.

**Tech Stack:** React, TypeScript, Zustand, lucide-react, bestehende CSS-Variablen (`var(--accent)`, `var(--bg)`, `var(--surface-2)`, `var(--fg)`, etc.)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Neu | `src/components/focus/FocusTopBar.tsx` | TopBar: Dot + Focus + Tagline + Progress + Schließen/ESC |
| Neu | `src/components/focus/FocusShell.tsx` | Full-Screen-Shell, lädt Daten, ruft useFocusStack() |
| Redesign | `src/components/focus/FocusWorkspace.tsx` | Layout-Container, empfängt FocusStackApi als Prop |
| Redesign | `src/components/focus/FocusCardDefault.tsx` | Standard-Karte + Aktionsbuttons innen |
| Redesign | `src/components/focus/FocusCardReminder.tsx` | Zahlungserinnerungs-Karte + Aktionsbuttons innen |
| Redesign | `src/components/focus/FocusQueueSidebar.tsx` | Queue mit Icon-Kreisen, Count-Badge, Beträgen |
| Modify | `src/App.tsx` | Focus-Branch vor normalem Layout, FocusRoute-Import entfernen |
| Delete | `src/routes/FocusRoute.tsx` | Logik wandert in FocusShell |

---

## Task 1: FocusTopBar

**Files:**
- Create: `src/components/focus/FocusTopBar.tsx`

- [ ] **Step 1: Create `src/components/focus/FocusTopBar.tsx`**

```tsx
import { useEffect } from 'react'
import { useUiStore } from '@/store/ui.store'

interface Props {
  currentIndex: number
  total: number
}

export function FocusTopBar({ currentIndex, total }: Props) {
  const setAppView = useUiStore(s => s.setAppView)
  const progress = total > 0 ? (currentIndex + 1) / total : 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAppView('dashboard')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setAppView])

  return (
    <div style={{
      height: 48,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      gap: 24,
      flexShrink: 0,
    }}>
      {/* Left: brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: 'var(--accent)',
          boxShadow: '0 0 6px var(--accent)',
        }} />
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>Focus</span>
        <span style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-dim)',
          letterSpacing: '0.04em',
        }}>
          abarbeiten, ohne Ablenkung
        </span>
      </div>

      {/* Center: counter + progress bar */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg)',
          flexShrink: 0,
        }}>
          {total > 0 ? `${currentIndex + 1} / ${total}` : '— / —'}
        </span>
        <div style={{
          flex: 1,
          height: 4,
          borderRadius: 99,
          background: 'oklch(50% 0 0 / 0.15)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: 'var(--accent)',
            borderRadius: 99,
            transition: 'width 300ms ease',
          }} />
        </div>
      </div>

      {/* Right: close button */}
      <button
        type="button"
        onClick={() => setAppView('dashboard')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--fg)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Schließen
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-dim)',
          background: 'var(--surface-2)',
          padding: '2px 5px',
          borderRadius: 4,
        }}>
          ESC
        </span>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusTopBar.tsx
git commit -m "feat(focus): FocusTopBar — progress bar, brand, Schließen/ESC"
```

---

## Task 2: FocusCardDefault — Aktionsbuttons innen

**Files:**
- Modify: `src/components/focus/FocusCardDefault.tsx`

- [ ] **Step 1: Replace `src/components/focus/FocusCardDefault.tsx` completely**

```tsx
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Todo, TodoPriority } from '@/types/todo.types'
import { Check, Clock } from 'lucide-react'

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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusCardDefault.tsx
git commit -m "feat(focus): FocusCardDefault — action buttons inside card, type pill"
```

---

## Task 3: FocusCardReminder — Aktionsbuttons innen

**Files:**
- Modify: `src/components/focus/FocusCardReminder.tsx`

- [ ] **Step 1: Replace `src/components/focus/FocusCardReminder.tsx` completely**

```tsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Contact } from '@/types/contact.types'
import { Send, Mail, Clock } from 'lucide-react'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

function daysOverdue(dueDate: string): number {
  return Math.max(0, Math.floor(
    (Date.now() - new Date(dueDate).getTime()) / 86_400_000
  ))
}

function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FocusCardReminder({ todo, onComplete, onSkip, onPostpone }: Props) {
  const invoices     = useFinanceStore(s => s.invoices)
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const invoice = invoices.find(i => i.id === todo.sourceRef)
  const account = invoice ? accounts.find(a => a.id === invoice.accountId) : undefined

  const defaultSubject = invoice
    ? `Zahlungserinnerung · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)} · ${formatEur(invoice.total)} €`
    : todo.title

  const defaultBody = invoice && account
    ? `Guten Tag,\n\nmit dieser Nachricht möchten wir Sie freundlich daran erinnern, dass die Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.total)} € seit dem ${new Date(invoice.dueDate).toLocaleDateString('de-DE')} fällig ist.\n\nWir bitten um Begleichung des offenen Betrags.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen`
    : ''

  const [subject, setSubject]     = useState(defaultSubject)
  const [body, setBody]           = useState(defaultBody)
  const [recipient, setRecipient] = useState('')
  const [sending, setSending]     = useState(false)

  useEffect(() => {
    if (!invoice?.accountId) return
    invoke<Contact[]>('get_contacts', { accountId: invoice.accountId })
      .then(contacts => {
        const email = contacts.find(c => c.email)?.email ?? ''
        setRecipient(email)
      })
      .catch((err: unknown) => log.warn('Failed to load contacts for reminder', { accountId: invoice.accountId, err }))
  }, [invoice?.accountId])

  useEffect(() => {
    setSubject(defaultSubject)
    setBody(defaultBody)
    setRecipient('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id])

  const handleSend = async () => {
    if (!mailAccounts[0]) {
      showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' })
      return
    }
    if (!recipient.trim()) {
      showToast({ message: 'Bitte Empfänger-E-Mail angeben.', variant: 'error' })
      return
    }
    if (!subject.trim()) {
      showToast({ message: 'Betreff darf nicht leer sein.', variant: 'error' })
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
      borderLeft: '4px solid oklch(60% 0.2 25)',
      borderRadius: 18,
      padding: '32px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
    }}>
      {/* Meta row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'oklch(60% 0.2 25 / 0.15)',
            color: 'oklch(60% 0.2 25)',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '3px 9px',
            borderRadius: 99,
            fontSize: 10,
          }}>
            ↗ RECHNUNG
          </span>
          {account && (
            <span style={{ color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: 'oklch(60% 0.2 25)', display: 'inline-block' }} />
              {account.name}
            </span>
          )}
        </div>
        {invoice && (
          <span style={{ color: 'var(--fg)', fontWeight: 600, fontSize: 14 }}>
            {Math.round(invoice.total / 1000)}k €
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
          rows={4}
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
          onClick={handleSend}
          disabled={sending}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 99,
            border: 'none',
            background: sending ? 'var(--surface-3)' : 'var(--accent)',
            color: sending ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 14,
            fontWeight: 700,
            boxShadow: sending ? 'none' : '0 6px 20px -8px var(--accent-glow)',
            cursor: sending ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}
        >
          <Send size={15} />
          {sending ? 'Wird gesendet…' : 'Erinnerung senden'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusCardReminder.tsx
git commit -m "feat(focus): FocusCardReminder — action row innen, Überspringen + Morgen"
```

---

## Task 4: FocusQueueSidebar — Redesign

**Files:**
- Modify: `src/components/focus/FocusQueueSidebar.tsx`

- [ ] **Step 1: Replace `src/components/focus/FocusQueueSidebar.tsx` completely**

```tsx
import { useAccountsStore } from '@/store/accounts.store'
import { useFinanceStore } from '@/store/finance.store'
import type { Todo } from '@/types/todo.types'

interface Props {
  stack: Todo[]
  currentIndex: number
}

function itemBorderColor(todo: Todo): string {
  if (todo.source === 'finance') return 'oklch(60% 0.2 25)'
  return 'oklch(55% 0 0 / 0.25)'
}

function itemIconBg(todo: Todo): string {
  if (todo.source === 'finance') return 'oklch(60% 0.2 25 / 0.15)'
  return 'oklch(50% 0 0 / 0.1)'
}

function itemIconColor(todo: Todo): string {
  if (todo.source === 'finance') return 'oklch(60% 0.2 25)'
  return 'var(--fg-dim)'
}

function itemIconLabel(todo: Todo): string {
  if (todo.source === 'finance') return '€'
  return '✓'
}

export function FocusQueueSidebar({ stack, currentIndex }: Props) {
  const accounts = useAccountsStore(s => s.accounts)
  const invoices = useFinanceStore(s => s.invoices)
  const upcoming = stack.slice(currentIndex + 1)

  return (
    <div style={{
      width: 300,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      paddingLeft: 24,
      borderLeft: '1px solid var(--border)',
      maxHeight: '100%',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 2,
        paddingBottom: 14,
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--fg-dim)',
        }}>
          Als Nächstes
        </span>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-muted)',
          background: 'var(--surface-3)',
          padding: '2px 7px',
          borderRadius: 99,
        }}>
          {upcoming.length}
        </span>
      </div>

      {/* Empty state */}
      {upcoming.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', paddingTop: 4 }}>
          Nichts mehr offen
        </div>
      )}

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {upcoming.map(todo => {
          const account = todo.customerId
            ? accounts.find(a => a.id === todo.customerId)
            : undefined
          const invoice = todo.sourceRef
            ? invoices.find(i => i.id === todo.sourceRef)
            : undefined
          const amount = invoice
            ? `${(invoice.total / 1000).toFixed(1)}k €`
            : undefined

          return (
            <div key={todo.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 10,
              borderLeft: `3px solid ${itemBorderColor(todo)}`,
              background: 'transparent',
            }}>
              {/* Icon circle */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 99,
                background: itemIconBg(todo),
                color: itemIconColor(todo),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {itemIconLabel(todo)}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  color: 'var(--fg)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.3,
                }}>
                  {todo.title}
                </div>
                {account && (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--fg-dim)',
                    marginTop: 1,
                  }}>
                    {account.name}
                  </div>
                )}
              </div>

              {/* Amount */}
              {amount && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}>
                  {amount}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusQueueSidebar.tsx
git commit -m "feat(focus): FocusQueueSidebar — icon circles, count badge, amounts"
```

---

## Task 5: FocusWorkspace — empfängt FocusStackApi als Prop

**Files:**
- Modify: `src/components/focus/FocusWorkspace.tsx`

- [ ] **Step 1: Replace `src/components/focus/FocusWorkspace.tsx` completely**

```tsx
import { useEffect } from 'react'
import type { FocusStackApi } from '@/hooks/useFocusStack'
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusQueueSidebar } from './FocusQueueSidebar'

interface Props {
  focusApi: FocusStackApi
}

export function FocusWorkspace({ focusApi }: Props) {
  const { current, currentIndex, total, stack, prev, skip, complete, postpone } = focusApi

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
      height: '100%',
      padding: '40px 40px 40px 60px',
    }}>
      {/* Left: card */}
      <div style={{
        flex: 1,
        minWidth: 0,
        paddingRight: 32,
        overflowY: 'auto',
      }}>
        {isReminder ? (
          <FocusCardReminder
            todo={current}
            onComplete={complete}
            onSkip={skip}
            onPostpone={postpone}
          />
        ) : (
          <FocusCardDefault
            todo={current}
            onComplete={complete}
            onSkip={skip}
            onPostpone={postpone}
          />
        )}
      </div>

      {/* Right: queue */}
      <FocusQueueSidebar stack={stack} currentIndex={currentIndex} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusWorkspace.tsx
git commit -m "feat(focus): FocusWorkspace — receives FocusStackApi prop, no own header"
```

---

## Task 6: FocusShell — Full-Screen-Shell

**Files:**
- Create: `src/components/focus/FocusShell.tsx`

- [ ] **Step 1: Create `src/components/focus/FocusShell.tsx`**

```tsx
import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFocusStack } from '@/hooks/useFocusStack'
import { useOverdueTaskSync } from '@/hooks/useOverdueTaskSync'
import { FocusTopBar } from './FocusTopBar'
import { FocusWorkspace } from './FocusWorkspace'

export function FocusShell() {
  const loadFinance       = useFinanceStore(s => s.loadAll)
  const invoices          = useFinanceStore(s => s.invoices)
  const loadMailAccounts  = useMailStore(s => s.loadAccounts)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const focusApi          = useFocusStack()

  useEffect(() => {
    if (!activeWorkspaceId) return
    if (invoices.length === 0) loadFinance(activeWorkspaceId)
  }, [activeWorkspaceId, invoices.length, loadFinance])

  useEffect(() => {
    loadMailAccounts()
  }, [loadMailAccounts])

  useOverdueTaskSync()

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      <FocusTopBar
        currentIndex={focusApi.currentIndex}
        total={focusApi.total}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FocusWorkspace focusApi={focusApi} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/focus/FocusShell.tsx
git commit -m "feat(focus): FocusShell — full-screen takeover, single useFocusStack call"
```

---

## Task 7: App.tsx + FocusRoute entfernen

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/routes/FocusRoute.tsx`

- [ ] **Step 1: Add FocusShell import to `src/App.tsx`**

Find the existing import line (around line 39):
```ts
import { FocusRoute }    from '@/routes/FocusRoute'
```

Replace it with:
```ts
import { FocusShell }   from '@/components/focus/FocusShell'
```

- [ ] **Step 2: Add FocusShell branch in `src/App.tsx`**

Find this section (around line 183):
```tsx
if (!activeWorkspaceId && !DEV_BYPASS) return <WorkspacePicker />
```

After it, add:
```tsx
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

- [ ] **Step 3: Remove `case 'focus'` from `renderMain()` in `src/App.tsx`**

Find and delete this line in the switch statement:
```ts
case 'focus':        return <FocusRoute />
```

- [ ] **Step 4: Delete `src/routes/FocusRoute.tsx`**

```bash
git rm src/routes/FocusRoute.tsx
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (clean compile).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(focus): FocusShell als Full-Screen-Branch in App — FocusRoute entfernt"
```
