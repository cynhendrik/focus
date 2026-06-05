# Focus Cockpit Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Cockpit Bar at the bottom of the Focus session center column, enabling Task, Rechnung, and E-Mail creation directly from within a customer session — with CORRA assistance via a "Lampe" indicator.

**Architecture:** `FocusCockpitBar` mounts below the cards-area inside `FocusSessionView`'s center column. It manages an active tab state (`'task' | 'invoice' | 'email'`) and routes to one of three form components. A `CorraLamp` component in the bar header shows CORRA availability and generates drafts on click. Customer context (id + name) is always pre-filled from the parent session.

**Tech Stack:** React 18, TypeScript, TipTap 3 (`useEditor`/`EditorContent`/`StarterKit`/`Placeholder`), Zustand stores, `FinanceService.createInvoice`, `MailService.sendEmail`, `generateCorraDraft` from `src/lib/ai/corra.ts`, Lucide icons, inline styles (existing codebase pattern).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/focus/cockpit/CorraLamp.tsx` | Create | Lampe-Indikator (off/ready/loading), click triggers draft |
| `src/components/focus/cockpit/CockpitTaskForm.tsx` | Create | Task-Erstellungsformular (title + priority + due date) |
| `src/components/focus/cockpit/CockpitInvoiceForm.tsx` | Create | Schnell-Rechnung (title + amount + due date + single item) |
| `src/components/focus/cockpit/CockpitMailForm.tsx` | Create | E-Mail-Composer mit TipTap + CORRA-Draft |
| `src/components/focus/FocusCockpitBar.tsx` | Create | Outer shell mit Tabs, CorraLamp, Form-Routing |
| `src/components/focus/FocusSessionView.tsx` | Modify | FocusCockpitBar unterhalb der cards-area einhängen |

---

## Task 1: CorraLamp

**Files:**
- Create: `src/components/focus/cockpit/CorraLamp.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/cockpit/CorraLamp.tsx
import { Lightbulb, Loader } from 'lucide-react'

export type LampState = 'off' | 'ready' | 'loading'

interface Props {
  state: LampState
  onClick: () => void
}

export function CorraLamp({ state, onClick }: Props) {
  const isOff     = state === 'off'
  const isLoading = state === 'loading'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isOff || isLoading}
      title={isOff ? 'CORRA braucht mehr Kontext' : isLoading ? 'CORRA denkt…' : 'CORRA-Entwurf generieren'}
      style={{
        width: 28, height: 28, borderRadius: 99,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${isOff ? 'rgba(255,255,255,0.07)' : 'oklch(60% 0.25 280 / 0.3)'}`,
        background: isOff ? 'transparent' : 'oklch(60% 0.25 280 / 0.08)',
        color: isOff ? '#484858' : 'oklch(75% 0.2 280)',
        cursor: isOff || isLoading ? 'not-allowed' : 'pointer',
        transition: 'all 200ms',
        animation: state === 'ready' ? 'lampPulse 2s ease-in-out infinite' : undefined,
        flexShrink: 0,
      }}
    >
      {isLoading
        ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
        : <Lightbulb size={13} />
      }
      <style>{`
        @keyframes lampPulse {
          0%, 100% { box-shadow: 0 0 0 0 oklch(60% 0.25 280 / 0); }
          50% { box-shadow: 0 0 0 4px oklch(60% 0.25 280 / 0.15); }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </button>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep CorraLamp
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/cockpit/CorraLamp.tsx
git commit -m "feat(cockpit): CorraLamp component — off/ready/loading states"
```

---

## Task 2: CockpitTaskForm

**Files:**
- Create: `src/components/focus/cockpit/CockpitTaskForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/cockpit/CockpitTaskForm.tsx
import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useToastStore } from '@/store/toast.store'
import type { TodoPriority } from '@/types/todo.types'

interface Props {
  customerId: string | undefined
  customerName: string
  onCreated: () => void
}

const PRIOS: Array<{ value: TodoPriority; label: string; color: string }> = [
  { value: 'p1', label: 'Dringend', color: 'oklch(72% 0.18 25)' },
  { value: 'p2', label: 'Hoch',     color: 'oklch(70% 0.18 50)' },
  { value: 'p3', label: 'Normal',   color: 'var(--accent)' },
  { value: 'p4', label: 'Niedrig',  color: 'var(--fg-dim)' },
]

export function CockpitTaskForm({ customerId, customerName, onCreated }: Props) {
  const upsert    = useTodosStore(s => s.upsert)
  const showToast = useToastStore(s => s.show)

  const [title, setTitle]       = useState('')
  const [priority, setPriority] = useState<TodoPriority>('p3')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await upsert({
        title: title.trim(),
        priority,
        bucket: 'today',
        status: 'open',
        customerId: customerId ?? undefined,
        dueDate: dueDate || undefined,
      })
      showToast({ message: 'Task erstellt.', variant: 'success' })
      setTitle('')
      setDueDate('')
      setPriority('p3')
      onCreated()
    } catch {
      showToast({ message: 'Task konnte nicht erstellt werden.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Customer chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#484858', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Für</span>
        <span style={{
          background: 'oklch(60% 0.25 280 / 0.12)', color: 'oklch(75% 0.2 280)',
          borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
        }}>
          {customerName || 'Allgemein'}
        </span>
      </div>

      {/* Title input */}
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleCreate())}
        placeholder="Neue Aufgabe…"
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 9,
          border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
          color: 'var(--fg)', fontSize: 13, outline: 'none',
          fontFamily: 'inherit',
        }}
      />

      {/* Priority + date row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Priority pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PRIOS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              style={{
                padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
                border: `1px solid ${priority === p.value ? p.color : 'rgba(255,255,255,0.07)'}`,
                background: priority === p.value ? `${p.color}18` : 'transparent',
                color: priority === p.value ? p.color : '#555',
                fontSize: 10, fontWeight: 600, transition: 'all 160ms',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Due date */}
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          style={{
            padding: '4px 8px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.07)', background: '#141419',
            color: dueDate ? 'var(--fg)' : '#484858', fontSize: 11, outline: 'none',
          }}
        />

        {/* Create button */}
        <button
          type="button"
          onClick={handleCreate}
          disabled={!title.trim() || saving}
          style={{
            padding: '7px 18px', borderRadius: 99, border: 'none',
            background: !title.trim() || saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
            color: !title.trim() || saving ? '#484858' : 'var(--accent-ink)',
            fontSize: 12, fontWeight: 700, cursor: !title.trim() || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Wird erstellt…' : 'Task erstellen →'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep CockpitTaskForm
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/cockpit/CockpitTaskForm.tsx
git commit -m "feat(cockpit): CockpitTaskForm — task creation with priority pills"
```

---

## Task 3: CockpitInvoiceForm

**Files:**
- Create: `src/components/focus/cockpit/CockpitInvoiceForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/cockpit/CockpitInvoiceForm.tsx
import { useState } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { FinanceService } from '@/services/finance.service'

interface Props {
  customerId: string | undefined
  customerName: string
  /** Called when CORRA generates a mail draft — switches parent to E-Mail tab */
  onCorraInvoiceDraft: (subject: string, body: string) => void
}

// NOTE: CockpitInvoiceForm owns CORRA draft generation for the Begleit-Mail.
// FocusCockpitBar's lamp is email-tab-only; the invoice tab has its own inline button.

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CockpitInvoiceForm({ customerId, customerName, onCorraInvoiceDraft }: Props) {
  const loadAll       = useFinanceStore(s => s.loadAll)
  const workspaceId   = useWorkspaceStore(s => s.activeWorkspaceId)
  const userId        = useAuthStore(s => s.user?.id)
  const showToast     = useToastStore(s => s.show)

  const [beschreibung, setBeschreibung] = useState('')
  const [betrag, setBetrag]             = useState('')
  const [dueDate, setDueDate]           = useState(defaultDueDate)
  const [saving, setSaving]         = useState(false)
  const [generating, setGenerating] = useState(false)

  const betragNum = parseFloat(betrag.replace(',', '.')) || 0

  const handleCreate = async () => {
    if (!beschreibung.trim() || betragNum <= 0 || !workspaceId || !userId) return
    setSaving(true)
    try {
      await FinanceService.createInvoice({
        workspaceId,
        createdBy: userId,
        accountId: customerId ?? '',
        date: todayISO(),
        dueDate,
        status: 'draft',
        taxMode: 'standard',
        subtotal: betragNum,
        taxAmount: 0,
        total: betragNum,
        items: [{
          title: beschreibung.trim(),
          quantity: 1,
          unitPrice: betragNum,
          taxRate: 0,
          total: betragNum,
          sortOrder: 0,
        }],
      })
      if (workspaceId) loadAll(workspaceId).catch(() => {})
      showToast({ message: 'Rechnung erstellt (Entwurf).', variant: 'success' })
      setBeschreibung('')
      setBetrag('')
      setDueDate(defaultDueDate())
    } catch {
      showToast({ message: 'Rechnung konnte nicht erstellt werden.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Customer chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#484858', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Für</span>
        <span style={{
          background: 'oklch(60% 0.25 280 / 0.12)', color: 'oklch(75% 0.2 280)',
          borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
        }}>
          {customerName || 'Allgemein'}
        </span>
      </div>

      {/* Fields grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 140px', gap: 8 }}>
        <input
          autoFocus
          value={beschreibung}
          onChange={e => setBeschreibung(e.target.value)}
          placeholder="Leistung beschreiben…"
          style={{
            padding: '9px 12px', borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
            color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={betrag}
            onChange={e => setBetrag(e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            style={{
              width: '100%', padding: '9px 28px 9px 12px', borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
              color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)',
            }}
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#484858', fontSize: 12 }}>€</span>
        </div>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          style={{
            padding: '9px 8px', borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
            color: 'var(--fg)', fontSize: 11, outline: 'none',
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#484858' }}>Fällig in {Math.round((new Date(dueDate).getTime() - Date.now()) / 86_400_000)} Tagen</span>
        <div style={{ flex: 1 }} />
        {/* CORRA Begleit-Mail button — only active when beschreibung + betrag filled */}
        {betragNum > 0 && beschreibung.trim() && (
          <button
            type="button"
            onClick={async () => {
              setGenerating(true)
              try {
                const draft = await generateCorraDraft({
                  kind: 'invoice',
                  customerName,
                  amount: betragNum,
                  dealTitle: beschreibung.trim(),
                })
                onCorraInvoiceDraft(
                  `Rechnung: ${beschreibung.trim()}`,
                  draft || `Anbei die Rechnung über ${betragNum.toLocaleString('de-DE')} € für ${beschreibung.trim()}.`,
                )
              } catch {
                onCorraInvoiceDraft(
                  `Rechnung: ${beschreibung.trim()}`,
                  `Anbei die Rechnung über ${betragNum.toLocaleString('de-DE')} € für ${beschreibung.trim()}.`,
                )
              } finally {
                setGenerating(false)
              }
            }}
            disabled={generating}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', borderRadius: 99,
              border: '1px solid oklch(60% 0.25 280 / 0.3)',
              background: 'oklch(60% 0.25 280 / 0.06)',
              color: 'oklch(75% 0.2 280)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {generating ? '…' : '✦'} Begleit-Mail
          </button>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={!beschreibung.trim() || betragNum <= 0 || saving || !customerId}
          style={{
            padding: '7px 18px', borderRadius: 99, border: 'none',
            background: !beschreibung.trim() || betragNum <= 0 || saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
            color: !beschreibung.trim() || betragNum <= 0 || saving ? '#484858' : 'var(--accent-ink)',
            fontSize: 12, fontWeight: 700,
            cursor: !beschreibung.trim() || betragNum <= 0 || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Wird erstellt…' : 'Rechnung erstellen →'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep CockpitInvoiceForm
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/cockpit/CockpitInvoiceForm.tsx
git commit -m "feat(cockpit): CockpitInvoiceForm — quick invoice creation with single item"
```

---

## Task 4: CockpitMailForm

**Files:**
- Create: `src/components/focus/cockpit/CockpitMailForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/cockpit/CockpitMailForm.tsx
import { useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { invoke } from '@tauri-apps/api/core'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import type { Contact } from '@/types/contact.types'
import { log } from '@/lib/logger'

export interface CockpitMailFormRef {
  fillDraft: (subject: string, body: string) => void
}

interface Props {
  customerId: string | undefined
  customerName: string
  /** Signals to parent that a CORRA draft can be triggered (for lamp) */
  onSubjectChange: (subject: string) => void
}

export const CockpitMailForm = forwardRef<CockpitMailFormRef, Props>(
  function CockpitMailForm({ customerId, customerName, onSubjectChange }, ref) {
    const mailAccounts = useMailStore(s => s.accounts)
    const showToast    = useToastStore(s => s.show)

    const [to, setTo]           = useState('')
    const [subject, setSubject] = useState('')
    const [sending, setSending] = useState(false)

    // Load primary contact email
    useEffect(() => {
      if (!customerId) return
      invoke<Contact[]>('get_contacts', { accountId: customerId })
        .then(contacts => {
          const primary = contacts.find(c => c.email)
          if (primary?.email) setTo(primary.email)
        })
        .catch((err: unknown) => log.warn('Failed to load contacts for cockpit mail', { err }))
    }, [customerId])

    const editor = useEditor({
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Nachricht schreiben — oder CORRA-Lampe klicken für Entwurf…' }),
      ],
      editorProps: {
        attributes: {
          style: 'outline: none; min-height: 60px; font-size: 13px; line-height: 1.7; color: var(--fg); font-family: inherit;',
        },
      },
    })

    // Expose fillDraft for external pre-fill (from invoice CORRA)
    useImperativeHandle(ref, () => ({
      fillDraft(newSubject: string, body: string) {
        setSubject(newSubject)
        editor?.commands.setContent(`<p>${body.replace(/\n/g, '</p><p>')}</p>`)
      },
    }))

    // Notify parent of subject changes (for lamp state)
    useEffect(() => {
      onSubjectChange(subject)
    }, [subject, onSubjectChange])

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
        setTo('')
        setSubject('')
        editor?.commands.clearContent()
      } catch {
        showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
      } finally {
        setSending(false)
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* AN */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#484858', width: 40, flexShrink: 0 }}>AN</span>
          <input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="E-Mail-Adresse…"
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.07)', background: '#141419',
              color: 'var(--fg)', fontSize: 12, outline: 'none',
            }}
          />
        </div>

        {/* BETREFF */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#484858', width: 40, flexShrink: 0 }}>BETREFF</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Betreff…"
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.07)', background: '#141419',
              color: 'var(--fg)', fontSize: 12, fontWeight: 600, outline: 'none',
            }}
          />
        </div>

        {/* TipTap body */}
        <div style={{
          background: '#141419', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 9, padding: '10px 12px', minHeight: 72,
        }}>
          <EditorContent editor={editor} />
        </div>

        {/* Send button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: '7px 20px', borderRadius: 99, border: 'none',
              background: sending ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
              color: sending ? '#484858' : 'var(--accent-ink)',
              fontSize: 12, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Wird gesendet…' : '↑ Senden'}
          </button>
        </div>
      </div>
    )
  }
)
```

- [ ] **Step 2: Check Contact type has `email` field**

```bash
grep -n "email" src/types/contact.types.ts | head -5
```

Expected: a line like `email?: string` or `email: string`. If the field is named differently, update the component.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep CockpitMailForm
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/focus/cockpit/CockpitMailForm.tsx
git commit -m "feat(cockpit): CockpitMailForm — TipTap email composer with forwardRef fillDraft"
```

---

## Task 5: FocusCockpitBar

**Files:**
- Create: `src/components/focus/FocusCockpitBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusCockpitBar.tsx
import { useRef, useState, useCallback } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useDealsStore } from '@/store/deals.store'
import { generateCorraDraft } from '@/lib/ai/corra'
import { useToastStore } from '@/store/toast.store'
import { CorraLamp } from './cockpit/CorraLamp'
import { CockpitTaskForm } from './cockpit/CockpitTaskForm'
import { CockpitInvoiceForm } from './cockpit/CockpitInvoiceForm'
import { CockpitMailForm } from './cockpit/CockpitMailForm'
import type { LampState } from './cockpit/CorraLamp'
import type { CockpitMailFormRef } from './cockpit/CockpitMailForm'

type Tab = 'task' | 'invoice' | 'email'

interface Props {
  customerId: string | undefined
  customerName: string
}

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'task',    icon: '+',  label: 'Task'     },
  { id: 'invoice', icon: '€',  label: 'Rechnung' },
  { id: 'email',   icon: '✉',  label: 'E-Mail'   },
]

export function FocusCockpitBar({ customerId, customerName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('task')
  const [lampState, setLampState] = useState<LampState>('off')
  const [mailSubject, setMailSubject] = useState('')
  const [invoiceBetrag, setInvoiceBetrag] = useState(0)

  const mailRef       = useRef<CockpitMailFormRef>(null)
  const activities    = useActivitiesStore(s => s.activities)
  const allDeals      = useDealsStore(s => s.deals)
  const showToast     = useToastStore(s => s.show)

  // Lamp readiness
  const emailLampReady   = activeTab === 'email'   && mailSubject.trim().length > 3
  const invoiceLampReady = activeTab === 'invoice' && invoiceBetrag > 0
  const currentLampState: LampState = lampState === 'loading'
    ? 'loading'
    : emailLampReady || invoiceLampReady ? 'ready' : 'off'

  const handleMailSubjectChange = useCallback((s: string) => setMailSubject(s), [])

  const handleSwitchToEmail = useCallback((subject: string, body: string) => {
    setActiveTab('email')
    // Small delay so the form mounts before we call fillDraft
    setTimeout(() => mailRef.current?.fillDraft(subject, body), 50)
  }, [])

  const handleLampClick = async () => {
    if (currentLampState !== 'ready') return
    setLampState('loading')
    try {
      if (activeTab === 'email') {
        const lastAct  = [...activities]
          .filter(a => a.accountId === customerId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        const openDeal = allDeals.find(d => d.accountId === customerId && d.value)

        const draft = await generateCorraDraft({
          kind: 'followup',
          customerName,
          topic: mailSubject,
          notes: [lastAct?.title, openDeal?.title].filter(Boolean).join(', ') || undefined,
        })
        if (draft) {
          mailRef.current?.fillDraft(mailSubject, draft)
        }
      }
      // invoice lamp click → handled by CockpitInvoiceForm via onCorraInvoiceDraft prop
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setLampState('off')
    }
  }

  const handleInvoiceCorraRequest = async (subject: string, body: string) => {
    handleSwitchToEmail(subject, body)
  }

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.07)',
      background: '#0f0f14',
      flexShrink: 0,
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 14px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              color: activeTab === tab.id ? 'var(--fg)' : '#484858',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
              transition: 'all 180ms',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 5, fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: activeTab === tab.id ? 'rgba(181,240,35,0.1)' : 'transparent',
              color: activeTab === tab.id ? 'var(--accent)' : '#484858',
            }}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* CORRA Lamp */}
        <CorraLamp state={currentLampState} onClick={handleLampClick} />
      </div>

      {/* Form area */}
      <div style={{ padding: '14px 20px 16px' }}>
        {activeTab === 'task' && (
          <CockpitTaskForm
            customerId={customerId}
            customerName={customerName}
            onCreated={() => {}}
          />
        )}
        {activeTab === 'invoice' && (
          <CockpitInvoiceForm
            customerId={customerId}
            customerName={customerName}
            onCorraInvoiceDraft={handleInvoiceCorraRequest}
          />
        )}
        {activeTab === 'email' && (
          <CockpitMailForm
            ref={mailRef}
            customerId={customerId}
            customerName={customerName}
            onSubjectChange={handleMailSubjectChange}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify deals store field name**

```bash
grep -n "deals:" src/store/deals.store.ts | head -3
```

Expected: `deals: Deal[]`. If the field is different (e.g. `items`), update `useDealsStore(s => s.deals)` in `FocusCockpitBar.tsx`.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "FocusCockpitBar|cockpit"
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

Expected: all 2589 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/focus/FocusCockpitBar.tsx
git commit -m "feat(cockpit): FocusCockpitBar — Task/Rechnung/E-Mail tabs + CorraLamp"
```

---

## Task 6: Wire FocusCockpitBar into FocusSessionView

**Files:**
- Modify: `src/components/focus/FocusSessionView.tsx`

- [ ] **Step 1: Read the current center column structure**

Read `src/components/focus/FocusSessionView.tsx` lines 175–230 to find the center column div. It looks like:

```tsx
{/* Center: active card OR CORRA chat */}
{showCorra ? (
  <FocusCorraChat ... />
) : (
  <div style={{
    flex: 1, minWidth: 0,
    overflowY: 'auto',
    padding: '32px 40px',
    ...
  }}>
    <div style={{ width: '100%', maxWidth: 580 }}>
      {isReminder ? ... }
    </div>
  </div>
)}
```

- [ ] **Step 2: Add the import**

At the top of `FocusSessionView.tsx`, add:
```ts
import { FocusCockpitBar } from './FocusCockpitBar'
```

- [ ] **Step 3: Wrap center column in a flex-column container**

The center needs to become a flex-column so the bar sits below the cards. Replace the current center structure:

```tsx
{/* Center: active card OR CORRA chat */}
{showCorra ? (
  <FocusCorraChat
    stack={stack}
    currentIndex={currentIndex}
    onClose={() => setShowCorra(false)}
  />
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

- [ ] **Step 4: TypeScript check — no errors anywhere**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all 2589 tests pass.

- [ ] **Step 6: Manual smoke test**

```bash
npm run tauri dev
```

Test checklist:
- Focus öffnet → Kunden-Auswahl ✓
- Session startet → Cockpit Bar sichtbar unten ✓
- Tab "Task" → Formular mit Titel + Prio-Pills erscheint ✓
- Task erstellt → Toast "Task erstellt" + leert sich ✓
- Tab "Rechnung" → Beschreibung + Betrag + Fälligkeit ✓
- Betrag > 0 → CorraLamp leuchtet lila ✓
- Rechnung erstellt → Toast "Rechnung erstellt (Entwurf)" ✓
- Tab "E-Mail" → An + Betreff + TipTap-Body erscheint ✓
- Betreff > 3 Zeichen → CorraLamp leuchtet ✓
- Lampe klicken → CORRA generiert Draft → Body füllt sich ✓
- E-Mail senden → Toast "E-Mail gesendet" ✓
- ESC im TipTap → schließt nicht die Session (INPUT/TEXTAREA-Guard greift) ✓

- [ ] **Step 7: Commit**

```bash
git add src/components/focus/FocusSessionView.tsx
git commit -m "feat(cockpit): wire FocusCockpitBar into FocusSessionView center column"
```
