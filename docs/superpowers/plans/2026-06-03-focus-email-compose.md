# Focus E-Mail Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable composing and sending emails directly in the Focus session body for `reply_mail` and `write_email` todos, showing the original email when available.

**Architecture:** New `FocusBodyEmail` component follows the existing `FocusBodyInvoice`/`FocusBodyFollowUp` pattern. Route `reply_mail` and `write_email` action types to it in `FocusWorkSurface`. Update `createMailTodo` in `MailRoute` to store `sourceRef` + structured `notes`. Strip `reply_mail` from `FocusBodyFollowUp`.

**Tech Stack:** React + TypeScript, TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`), `MailService.getBody` / `MailService.sendEmail`, `generateCorraDraft`, `useAccountsStore`, `useMailStore`, `useToastStore`, vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/types/todo.types.ts` | Add `'write_email'` to `TodoActionType` |
| Modify | `src/routes/MailRoute.tsx` | Add `sourceRef` + structured `notes` to `createMailTodo` |
| **Create** | `src/components/focus/FocusBodyEmail.tsx` | New body component: original mail + compose + CORRA |
| Create | `src/components/focus/FocusBodyEmail.test.ts` | Unit tests for `parseNotes` helper |
| Modify | `src/components/focus/FocusWorkSurface.tsx` | Add `isEmail` routing, import `FocusBodyEmail` |
| Modify | `src/components/focus/FocusBodyFollowUp.tsx` | Remove all `isReplyMail` branching |

---

## Task 1: Add `write_email` to `TodoActionType`

**Files:**
- Modify: `src/types/todo.types.ts`

- [ ] **Step 1: Update the type union**

In `src/types/todo.types.ts`, change line 5:

```ts
// Before:
export type TodoActionType = 'send_reminder' | 'create_invoice' | 'followup' | 'reply_mail' | 'write_offer' | 'call'

// After:
export type TodoActionType = 'send_reminder' | 'create_invoice' | 'followup' | 'reply_mail' | 'write_email' | 'write_offer' | 'call'
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/todo.types.ts
git commit -m "feat(focus): add write_email to TodoActionType"
```

---

## Task 2: Update `createMailTodo` to store `sourceRef` and structured notes

**Files:**
- Modify: `src/routes/MailRoute.tsx` (around line 88–104)

- [ ] **Step 1: Update the `upsertTodo` call**

In `src/routes/MailRoute.tsx`, replace the body of `createMailTodo` (the `upsertTodo` call):

```ts
// Before (lines 88–104):
try {
  await upsertTodo({
    title:       `${selectedEmail.subject ?? '(Mail)'} beantworten`,
    customerId:  selectedEmail.customerId ?? undefined,
    priority:    'p2',
    bucket:      scheduledStr.slice(0, 10) === todayStr ? 'today' : 'backlog',
    scheduledAt: scheduledStr,
    actionType:  'reply_mail',
    source:      'manual',
    notes:       `Von: ${selectedEmail.fromName ? `${selectedEmail.fromName} <${selectedEmail.fromAddr}>` : selectedEmail.fromAddr}`,
    checklist:   [],
    tags:        [],
  })

// After:
try {
  const displayStr = selectedEmail.fromName
    ? `${selectedEmail.fromName} <${selectedEmail.fromAddr}>`
    : selectedEmail.fromAddr

  await upsertTodo({
    title:       `${selectedEmail.subject ?? '(Mail)'} beantworten`,
    customerId:  selectedEmail.customerId ?? undefined,
    priority:    'p2',
    bucket:      scheduledStr.slice(0, 10) === todayStr ? 'today' : 'backlog',
    scheduledAt: scheduledStr,
    actionType:  'reply_mail',
    source:      'manual',
    sourceRef:   selectedEmail.id,
    notes:       [
      `Von: ${displayStr}`,
      `fromAddr: ${selectedEmail.fromAddr}`,
      `sentAt: ${selectedEmail.sentAt}`,
    ].join('\n'),
    checklist:   [],
    tags:        [],
  })
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/MailRoute.tsx
git commit -m "feat(mail): store sourceRef and structured notes in reply_mail todo"
```

---

## Task 3: Create `FocusBodyEmail` with tests

**Files:**
- Create: `src/components/focus/FocusBodyEmail.tsx`
- Create: `src/components/focus/FocusBodyEmail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/focus/FocusBodyEmail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseNotes } from './FocusBodyEmail'

describe('parseNotes', () => {
  it('extracts fromAddr, sentAt, and fromLine from structured notes', () => {
    const notes = [
      'Von: John Doe <john@example.com>',
      'fromAddr: john@example.com',
      'sentAt: 2026-06-01T10:00:00Z',
    ].join('\n')

    const result = parseNotes(notes)

    expect(result.fromAddr).toBe('john@example.com')
    expect(result.sentAt).toBe('2026-06-01T10:00:00Z')
    expect(result.fromLine).toBe('John Doe <john@example.com>')
  })

  it('returns empty strings when notes are undefined', () => {
    const result = parseNotes(undefined)
    expect(result.fromAddr).toBe('')
    expect(result.sentAt).toBe('')
    expect(result.fromLine).toBe('')
  })

  it('handles old-format notes without fromAddr/sentAt lines', () => {
    const result = parseNotes('Von: someone@example.com')
    expect(result.fromAddr).toBe('')
    expect(result.sentAt).toBe('')
    expect(result.fromLine).toBe('someone@example.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run src/components/focus/FocusBodyEmail.test.ts
```

Expected: FAIL — `parseNotes` not found

- [ ] **Step 3: Create `FocusBodyEmail.tsx` with `parseNotes` export and full component**

Create `src/components/focus/FocusBodyEmail.tsx`:

```tsx
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

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

export function parseNotes(notes: string | undefined): { fromAddr: string; sentAt: string; fromLine: string } {
  const text = notes ?? ''
  const fromAddr = /^fromAddr: (.+)$/m.exec(text)?.[1]?.trim() ?? ''
  const sentAt   = /^sentAt: (.+)$/m.exec(text)?.[1]?.trim() ?? ''
  const fromLine = text.split('\n')[0]?.replace(/^Von: /, '') ?? ''
  return { fromAddr, sentAt, fromLine }
}

export function FocusBodyEmail({ todo, onComplete, onSkip, onPostpone }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const account  = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const isReply  = todo.actionType === 'reply_mail'

  const { fromAddr, sentAt, fromLine } = parseNotes(todo.notes)

  const [to, setTo]       = useState(fromAddr)
  const [subject, setSubject] = useState(
    isReply ? `Re: ${todo.title.replace(/ beantworten$/, '')}` : ''
  )
  const [originalBody, setOriginalBody]         = useState<string | null>(null)
  const [originalLoading, setOriginalLoading]   = useState(false)
  const [sending, setSending]                   = useState(false)
  const [generating, setGenerating]             = useState(false)
  const [hasCorraDraft, setHasCorraDraft]       = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Nachricht schreiben…' }),
    ],
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 80px; font-size: 14px; line-height: 1.65; color: var(--fg); font-family: inherit;',
      },
    },
  })

  useEffect(() => {
    if (!todo.sourceRef) return
    setOriginalLoading(true)
    MailService.getBody(todo.sourceRef)
      .then(b => setOriginalBody(b.bodyText))
      .catch((err: unknown) => {
        log.warn('Could not load original mail body', { err })
        setOriginalBody(null)
      })
      .finally(() => setOriginalLoading(false))
  }, [todo.sourceRef])

  useEffect(() => {
    if (!editor) return
    setGenerating(true)
    generateCorraDraft({
      kind: 'reply_mail',
      customerName: account?.name ?? '',
      contactName: fromLine,
      subject: todo.title,
      notes: todo.notes,
    })
      .then(draft => {
        if (draft) {
          editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
          setHasCorraDraft(true)
        }
      })
      .catch(() => {
        editor.commands.setContent(
          '<p>Guten Tag,</p><p>vielen Dank für Ihre Nachricht. Ich melde mich kurz dazu.</p>'
        )
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id, editor])

  const regenerate = useCallback(async () => {
    if (generating || !editor) return
    setGenerating(true)
    try {
      const draft = await generateCorraDraft({
        kind: 'reply_mail',
        customerName: account?.name ?? '',
        contactName: fromLine,
        subject,
        notes: todo.notes,
      })
      if (draft) {
        editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
        setHasCorraDraft(true)
      }
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }, [generating, editor, account?.name, fromLine, subject, todo.notes, showToast])

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
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const sentAtFormatted = sentAt
    ? (() => { try { return new Date(sentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return null } })()
    : null

  return (
    <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Original mail block */}
      {todo.sourceRef && (
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)',
            }}>Original</span>
            <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 600 }}>{fromLine}</span>
            {sentAtFormatted && (
              <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 'auto' }}>{sentAtFormatted}</span>
            )}
          </div>
          <div style={{ padding: '12px 16px', maxHeight: 180, overflowY: 'auto' }}>
            {originalLoading ? (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Lade Mail…
              </span>
            ) : originalBody ? (
              <pre style={{
                fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', margin: 0, fontFamily: 'inherit', lineHeight: 1.6,
              }}>
                {originalBody}
              </pre>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Nachrichtentext nicht verfügbar.</span>
            )}
          </div>
        </div>
      )}

      {/* Compose block */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)',
          }}>
            {isReply ? 'Antwort verfassen' : 'E-Mail verfassen'}
          </span>
          {hasCorraDraft && !generating && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Sparkles size={9} /> CORRA-ENTWURF · EDITIERBAR
            </span>
          )}
          {generating && (
            <span style={{
              fontSize: 9, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center',
              gap: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            }}>
              <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CORRA DENKT…
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 52,
          }}>AN</span>
          <input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="E-Mail-Adresse…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 52,
          }}>BETREFF</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Betreff…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }}
          />
        </div>

        <div style={{ padding: '12px 16px', minHeight: 100 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px',
            borderRadius: 99, border: 'none',
            background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)',
            color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700,
            boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)',
            cursor: (sending || generating) ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}
        >
          <Send size={14} />
          {sending ? 'Wird gesendet…' : isReply ? 'Antwort senden' : 'E-Mail senden'}
        </button>

        <button
          type="button"
          onClick={regenerate}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating
            ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Sparkles size={13} />
          }
          Corra neu
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Morgen <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
            color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px',
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:run src/components/focus/FocusBodyEmail.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/focus/FocusBodyEmail.tsx src/components/focus/FocusBodyEmail.test.ts
git commit -m "feat(focus): add FocusBodyEmail — original mail + compose + CORRA"
```

---

## Task 4: Update `FocusWorkSurface` routing

**Files:**
- Modify: `src/components/focus/FocusWorkSurface.tsx`

- [ ] **Step 1: Add import and update routing constants**

In `src/components/focus/FocusWorkSurface.tsx`:

Add import after `FocusBodyFollowUp` import:
```tsx
import { FocusBodyEmail } from './FocusBodyEmail'
```

Replace the three `is*` constants (lines 22–25):

```tsx
// Before:
const isReminder = todo.actionType === 'send_reminder'
const isInvoice  = todo.actionType === 'create_invoice'
const isFollowup = todo.actionType === 'followup' || todo.actionType === 'reply_mail'

// After:
const isReminder = todo.actionType === 'send_reminder'
const isInvoice  = todo.actionType === 'create_invoice'
const isEmail    = todo.actionType === 'reply_mail' || todo.actionType === 'write_email'
const isFollowup = todo.actionType === 'followup'
```

- [ ] **Step 2: Update the render tree**

Replace the conditional body render (inside the inner `<div style={{ flex: 1, ... }}>`) :

```tsx
// Before:
{isReminder ? (
  <FocusBodyReminder todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
) : isInvoice ? (
  <FocusBodyInvoice todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
) : isFollowup ? (
  <FocusBodyFollowUp todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
) : (
  <FocusBodyDefault todo={todo} onComplete={onComplete} />
)}

// After:
{isReminder ? (
  <FocusBodyReminder todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
) : isInvoice ? (
  <FocusBodyInvoice todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
) : isEmail ? (
  <FocusBodyEmail todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
) : isFollowup ? (
  <FocusBodyFollowUp todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />
) : (
  <FocusBodyDefault todo={todo} onComplete={onComplete} />
)}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/focus/FocusWorkSurface.tsx
git commit -m "feat(focus): route reply_mail and write_email todos to FocusBodyEmail"
```

---

## Task 5: Clean up `FocusBodyFollowUp` — remove `reply_mail` branching

**Files:**
- Modify: `src/components/focus/FocusBodyFollowUp.tsx`

- [ ] **Step 1: Remove `isReplyMail` and simplify**

Make the following changes in `src/components/focus/FocusBodyFollowUp.tsx`:

**Remove line 31:**
```tsx
// Delete this line:
const isReplyMail = todo.actionType === 'reply_mail'
```

**Remove line 32:**
```tsx
// Delete this line:
const accentColor = isReplyMail ? 'var(--info)' : ACCENT
```

**Line 36 — simplify subject initial value:**
```tsx
// Before:
const [subject, setSubject]         = useState(isReplyMail ? 'Re: …' : 'Kurz nachgehakt')

// After:
const [subject, setSubject]         = useState('Kurz nachgehakt')
```

**Lines 60–64 — CORRA auto-draft effect — remove ternary:**
```tsx
// Before:
generateCorraDraft(
  isReplyMail
    ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName, subject: todo.title, notes: todo.notes }
    : { kind: 'followup', customerName: account?.name ?? '', contactName, topic: todo.title, notes: todo.notes }
)

// After:
generateCorraDraft({
  kind: 'followup',
  customerName: account?.name ?? '',
  contactName,
  topic: todo.title,
  notes: todo.notes,
})
```

**Lines 80–84 — `regenerate` — remove ternary:**
```tsx
// Before:
const draft = await generateCorraDraft(
  isReplyMail
    ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName, subject: todo.title, notes: todo.notes }
    : { kind: 'followup', customerName: account?.name ?? '', contactName, topic: todo.title, notes: todo.notes }
)

// After:
const draft = await generateCorraDraft({
  kind: 'followup',
  customerName: account?.name ?? '',
  contactName,
  topic: todo.title,
  notes: todo.notes,
})
```

**Line 103 — send toast:**
```tsx
// Before:
showToast({ message: isReplyMail ? 'Antwort gesendet.' : 'Follow-Up gesendet.', variant: 'success' })

// After:
showToast({ message: 'Follow-Up gesendet.', variant: 'success' })
```

**Line 112 — contextText:**
```tsx
// Before:
const contextText = todo.notes
  ?? (isReplyMail ? 'Eine Antwort ist fällig — CORRA hat einen Entwurf vorbereitet.' : 'Kein aktiver Kontakt — Zeit für eine kurze Nachricht.')

// After:
const contextText = todo.notes ?? 'Kein aktiver Kontakt — Zeit für eine kurze Nachricht.'
```

**Line 22 — accentColor usage in JSX:**
Replace all `accentColor` references with `ACCENT` (there is one, on line ~121 `color: accentColor`).

**Send button text (line ~171):**
```tsx
// Before:
{sending ? 'Wird gesendet…' : isReplyMail ? 'Antwort senden' : 'Nachfassen'}

// After:
{sending ? 'Wird gesendet…' : 'Nachfassen'}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors (no remaining `isReplyMail` references)

- [ ] **Step 3: Run all tests**

```bash
pnpm test:run
```

Expected: all existing tests pass + `FocusBodyEmail.test.ts` (3 tests) pass

- [ ] **Step 4: Commit**

```bash
git add src/components/focus/FocusBodyFollowUp.tsx
git commit -m "refactor(focus): remove reply_mail branching from FocusBodyFollowUp"
```

---

## Task 6: Manual Verification

- [ ] **Step 1: Start the app**

```bash
pnpm tauri dev
```

- [ ] **Step 2: Test inbox → todo → focus flow**

1. Open Mail module
2. Select any incoming email from a known customer
3. Click the "Als To-Do markieren" dropdown → pick "Heute"
4. Open the Focus session (should see the new todo in the queue)
5. Verify: **Original-Mail-Block** appears at top with sender name and date
6. Verify: **AN**-Feld is pre-filled with sender's email
7. Verify: **BETREFF**-Feld is pre-filled with `Re: [original subject]`
8. Verify: CORRA-Entwurf appears in the editor body (with "CORRA DENKT…" spinner first)

- [ ] **Step 3: Test sending**

1. Edit the email body if desired
2. Click "Antwort senden"
3. Verify: success toast "E-Mail gesendet."
4. Verify: next todo appears in focus session

- [ ] **Step 4: Test CORRA regeneration**

1. Open another `reply_mail` todo in focus
2. Click "Corra neu"
3. Verify: spinner shows, new draft appears

- [ ] **Step 5: Test `write_email` todo (free compose)**

1. In the todos store or via dev tools, create a todo with `actionType: 'write_email'` and no `sourceRef`
2. Open it in focus
3. Verify: no Original-Mail-Block shown
4. Verify: AN and BETREFF fields are empty (user fills manually)
5. Verify: CORRA draft still generates
