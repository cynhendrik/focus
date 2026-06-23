# Geld-Kreislauf / Mahnwesen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Mahn-Kreislauf zum Selbst-Drehen bringen: Nudge-Karte auf „Heute" → Review → 1-Klick-Versand, mit korrekt hochzählender Mahnstufe und gestaffelten Mahngebühren.

**Architecture:** Ansatz A — bestehende Engine (`getDunningState`) wiederverwenden. Der Kern-Bug: es entstehen nie `send_reminder`-To-dos (Hook nicht gemountet) → Stufe bleibt 0. Fix: ein neuer `dunning.service` legt beim erfolgreichen Versand ein *abgeschlossenes* `send_reminder`-To-do mit Gebühren-Snapshot an; daraus leitet `getDunningState` die Stufe ab. Keine neue Tabelle, keine Migration.

**Tech Stack:** React + TypeScript, Zustand-Stores (`getState()` aus Services), Vitest, Tauri-Commands (`email_send`, `save_pdf`, `get_contacts`), `@react-pdf/renderer` (lazy).

---

## Referenz: bestehende APIs (verifiziert)

- `useFinanceStore`: `invoices: Invoice[]`, `payments: Payment[]`, `updateInvoiceStatus(id, status)`, `loadAll(workspaceId)`.
- `useTodosStore`: `allTodos: Todo[]`, `upsert(payload: UpsertTodoPayload): Promise<Todo>`, `complete(id)`.
- `useAccountsStore`: `accounts` (`{ id, name, ... }`).
- `useMailStore`: `accounts` (Mail-Konten, `[0].id`).
- `useCompanyStore`: `profile: CompanyProfile`, `saveProfile(profile)`.
- `useToastStore`: `show({ message, variant })`.
- `useWorkspaceStore`: `activeWorkspaceId`.
- `invoice-status.ts`: `isOverdue(invoice)`, `paidAmount(payments, invoiceId)`, `remaining(invoice, paid)`, `todayLocalISO()`.
- `useOverdueTaskSync.ts`: exportiert `getDunningState(invoice, todos): DunningState`, `shouldCreateReminderTask`, `DunningState`. Konstanten `DUNNING_COOLDOWN_DAYS = {0:7,1:14,2:21}`, `MAX_AUTO_LEVEL = 2`. Der Hook `useOverdueTaskSync()` ist **ungenutzt**.
- `generateCorraDraft` aus `@/lib/ai/corra`: `({ kind:'reminder', customerName, invoiceNumber, amount, dueDate, daysOverdue, dunningLevel }) => Promise<string>`.
- `MailService.sendEmail({ accountId, to, subject, bodyText, attachmentPaths? })` aus `@/services/mail.service`.
- `FinanceService.getInvoice(id)` aus `@/services/finance.service`.
- `getInvoicePdfBytes(fullInvoice, profile, account)` — lazy aus `@/components/finance/InvoicePDF`.
- Tauri: `invoke<Contact[]>('get_contacts', { accountId })`, `invoke<string>('save_pdf', { bytes, suggestedName })`.

## File Structure

- **Create** `src/services/dunning.service.ts` — pure Helpers (Gebühren, Beträge, Selektoren, Tags) + `sendReminder`-Orchestrierung.
- **Create** `src/services/dunning.service.test.ts` — Unit-Tests der Helfer + `recordReminderSent`.
- **Create** `src/components/finance/DunningReviewModal.tsx` — Review-Liste + Versand.
- **Create** `src/components/finance/DunningNudgeCard.tsx` — Heute-Karte.
- **Modify** `src/types/company.types.ts` — `CompanyProfile.dunningFees?: number[]`.
- **Modify** `src/hooks/useOverdueTaskSync.ts` — `phase` in `DunningState`; toten Hook entfernen.
- **Modify** `src/components/finance/MahnwesenPanel.tsx` — nutzt `dunning.service`, „eskaliert"-Sektion.
- **Modify** `src/components/settings/WorkspaceSettings.tsx` — drei Gebühren-Felder.
- **Modify** `src/routes/DashboardRoute.tsx` — Karte einhängen.

---

## Task 1: Gebühren-Typ + reine Gebühren-/Betrags-Helfer

**Files:**
- Modify: `src/types/company.types.ts`
- Create: `src/services/dunning.service.ts`
- Test: `src/services/dunning.service.test.ts`

- [ ] **Step 1: `dunningFees` zum Profil-Typ ergänzen**

In `src/types/company.types.ts` im `CompanyProfile`-Interface nach `invoiceAccentColor?: string` ergänzen:

```typescript
  invoiceAccentColor?: string
  /** Mahngebühr je Stufe in Euro [Zahlungserinnerung, 1. Mahnung, 2. Mahnung]. */
  dunningFees?: number[]
```

- [ ] **Step 2: Failing-Test schreiben**

Create `src/services/dunning.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DUNNING_FEES, dunningFee, parseFeeTag, reminderFeeTags,
} from './dunning.service'

describe('dunningFee', () => {
  it('uses default staffel 0/5/10 by level', () => {
    expect(dunningFee(0)).toBe(0)
    expect(dunningFee(1)).toBe(5)
    expect(dunningFee(2)).toBe(10)
  })
  it('clamps levels beyond the config to the last fee', () => {
    expect(dunningFee(3)).toBe(10)
  })
  it('honours a custom fee config', () => {
    expect(dunningFee(1, [0, 7.5, 15])).toBe(7.5)
  })
  it('falls back to 0 for an empty config', () => {
    expect(dunningFee(1, [])).toBe(0)
  })
})

describe('parseFeeTag', () => {
  it('parses cent tags to euro', () => {
    expect(parseFeeTag('fee:500')).toBe(5)
    expect(parseFeeTag('fee:0')).toBe(0)
  })
  it('ignores non-fee tags', () => {
    expect(parseFeeTag('priority:p1')).toBe(0)
  })
})

describe('reminderFeeTags', () => {
  it('snapshots the level fee as a cent tag', () => {
    expect(reminderFeeTags(1)).toEqual(['fee:500'])
    expect(reminderFeeTags(2, [0, 5, 12])).toEqual(['fee:1200'])
  })
  it('emits fee:0 for the free Zahlungserinnerung', () => {
    expect(reminderFeeTags(0)).toEqual(['fee:0'])
  })
  it('exposes the default staffel', () => {
    expect(DEFAULT_DUNNING_FEES).toEqual([0, 5, 10])
  })
})
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run src/services/dunning.service.test.ts`
Expected: FAIL — `Failed to resolve import "./dunning.service"`.

- [ ] **Step 4: Minimale Implementierung**

Create `src/services/dunning.service.ts`:

```typescript
import type { Todo } from '@/types/todo.types'
import type { Invoice, Payment } from '@/types/finance.types'
import { paidAmount, remaining } from '@/lib/invoice-status'

/** Default-Mahngebühr je Stufe in Euro: [Zahlungserinnerung, 1. Mahnung, 2. Mahnung]. */
export const DEFAULT_DUNNING_FEES = [0, 5, 10]

/** Gebühr der Stufe (Euro). Stufen jenseits der Config werden auf die letzte geklemmt. */
export function dunningFee(level: number, fees: number[] = DEFAULT_DUNNING_FEES): number {
  if (fees.length === 0) return 0
  return fees[level] ?? fees[fees.length - 1] ?? 0
}

/** 'fee:<cent>' → Euro; alles andere → 0. */
export function parseFeeTag(tag: string): number {
  if (!tag.startsWith('fee:')) return 0
  const cent = Number(tag.slice(4))
  return Number.isFinite(cent) ? cent / 100 : 0
}

/** Snapshot-Tags, die beim Versand am abgeschlossenen To-do hängen. */
export function reminderFeeTags(level: number, fees: number[] = DEFAULT_DUNNING_FEES): string[] {
  return [`fee:${Math.round(dunningFee(level, fees) * 100)}`]
}

/** Summe der bereits berechneten Gebühren (Euro) aus abgeschlossenen Reminder-To-dos. */
export function accruedFees(todos: Todo[], invoiceId: string): number {
  return todos
    .filter(t => t.sourceRef === invoiceId && t.actionType === 'send_reminder' && t.status === 'done')
    .flatMap(t => t.tags)
    .reduce((sum, tag) => sum + parseFeeTag(tag), 0)
}

/** Offener Gesamtbetrag inkl. der Gebühr der gerade fälligen Stufe (Euro). */
export function outstandingWithPendingFee(
  invoice: Invoice, payments: Payment[], todos: Todo[], level: number,
  fees: number[] = DEFAULT_DUNNING_FEES,
): number {
  const paid = paidAmount(payments, invoice.id)
  const base = remaining(invoice, paid)
  return Math.round((base + accruedFees(todos, invoice.id) + dunningFee(level, fees)) * 100) / 100
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run src/services/dunning.service.test.ts`
Expected: PASS (alle 9 Asserts grün).

- [ ] **Step 6: Commit**

```bash
git add src/types/company.types.ts src/services/dunning.service.ts src/services/dunning.service.test.ts
git commit -m "feat(dunning): fee staffel helpers + dunningFees profile field"
```

---

## Task 2: `getDunningState` um `phase` erweitern, toten Hook entfernen

**Files:**
- Modify: `src/hooks/useOverdueTaskSync.ts`
- Test: `src/hooks/useOverdueTaskSync.test.ts` (vorhanden — erweitern)

- [ ] **Step 1: Failing-Test ergänzen**

In `src/hooks/useOverdueTaskSync.test.ts` am Dateiende ergänzen (Import oben um `getDunningState` erweitern, falls noch nicht vorhanden):

```typescript
import { getDunningState } from './useOverdueTaskSync'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'

const baseInvoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1', workspaceId: 'w', createdBy: 'u', accountId: 'a',
  date: '2020-01-01', dueDate: '2020-01-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
})

const doneReminder = (updatedAt: string): Todo => ({
  id: 't' + updatedAt, title: 'x', status: 'done', priority: 'p2', bucket: 'done',
  checklist: [], tags: ['fee:0'], source: 'finance', actionType: 'send_reminder',
  sourceRef: 'inv1', createdAt: '', updatedAt,
})

describe('getDunningState.phase', () => {
  it('phase=due for a fresh overdue invoice (no reminders yet)', () => {
    expect(getDunningState(baseInvoice(), []).phase).toBe('due')
  })
  it('phase=cooldown right after a reminder was completed', () => {
    const today = new Date().toISOString()
    expect(getDunningState(baseInvoice(), [doneReminder(today)]).phase).toBe('cooldown')
  })
  it('phase=escalated after the 3rd completed reminder (past 2. Mahnung)', () => {
    const old = '2020-02-01T00:00:00.000Z'
    const todos = [doneReminder(old), doneReminder(old), doneReminder(old)]
    expect(getDunningState(baseInvoice(), todos).phase).toBe('escalated')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run src/hooks/useOverdueTaskSync.test.ts`
Expected: FAIL — `phase` is undefined / not a property of `DunningState`.

- [ ] **Step 3: `DunningState` + `getDunningState` anpassen**

In `src/hooks/useOverdueTaskSync.ts`:

Interface erweitern:

```typescript
export interface DunningState {
  level: number
  canCreate: boolean
  phase: 'due' | 'cooldown' | 'escalated'
  label: string
  priority: 'p1' | 'p2'
}
```

Den frühen Return (nicht überfällig) anpassen:

```typescript
  if (!isOverdue(invoice)) return { level: 0, canCreate: false, phase: 'cooldown', label: '', priority: 'p2' }
```

Den „max level"-Branch:

```typescript
  // Already at max level — don't auto-create
  if (level >= MAX_AUTO_LEVEL + 1) {
    return { level, canCreate: false, phase: 'escalated', label, priority: 'p1' }
  }
```

Den „open reminder exists"-Branch (`phase: 'cooldown'`):

```typescript
  if (related.some(t => t.status !== 'done')) {
    return { level, canCreate: false, phase: 'cooldown', label, priority: level >= 1 ? 'p1' : 'p2' }
  }
```

Den Cooldown-Branch (`phase: 'cooldown'`):

```typescript
    if (daysSince < cooldown) {
      return { level, canCreate: false, phase: 'cooldown', label, priority: level >= 1 ? 'p1' : 'p2' }
    }
```

Den finalen Return (`phase: 'due'`):

```typescript
  return {
    level,
    canCreate: true,
    phase: 'due',
    label,
    priority: level >= 1 ? 'p1' : 'p2',
  }
```

- [ ] **Step 4: Toten Hook entfernen**

Aus `src/hooks/useOverdueTaskSync.ts` die komplette Funktion `export function useOverdueTaskSync() { ... }` (inkl. ihrer `useEffect`-Logik) löschen, ebenso die jetzt nur dort genutzten Imports (`useEffect`, `useFinanceStore`, `useTodosStore`, `useAccountsStore`, `log`). `getDunningState`, `shouldCreateReminderTask`, `DunningState`, die Konstanten und die Imports `isOverdue`, `Invoice`, `Todo` bleiben.

- [ ] **Step 5: Tests + Typecheck laufen lassen**

Run: `npx vitest run src/hooks/useOverdueTaskSync.test.ts`
Expected: PASS (bestehende + 3 neue Tests).
Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useOverdueTaskSync.ts src/hooks/useOverdueTaskSync.test.ts
git commit -m "feat(dunning): add phase to DunningState, drop unused useOverdueTaskSync hook"
```

---

## Task 3: Selektoren `dueReminders` / `escalatedInvoices` + `recordReminderSent`

**Files:**
- Modify: `src/services/dunning.service.ts`
- Test: `src/services/dunning.service.test.ts`

- [ ] **Step 1: Failing-Test ergänzen**

In `src/services/dunning.service.test.ts` ergänzen (Import-Zeile oben um die neuen Symbole erweitern):

```typescript
import { dueReminders, escalatedInvoices } from './dunning.service'
import type { Invoice } from '@/types/finance.types'

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1', workspaceId: 'w', createdBy: 'u', accountId: 'a',
  date: '2020-01-01', dueDate: '2020-01-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
})
const accounts = [{ id: 'a', name: 'Acme GmbH' }] as any

describe('dueReminders', () => {
  it('lists a fresh overdue invoice with level 0 and customer name', () => {
    const res = dueReminders([inv()], [], accounts, [0, 5, 10], [])
    expect(res).toHaveLength(1)
    expect(res[0].customerName).toBe('Acme GmbH')
    expect(res[0].level).toBe(0)
    expect(res[0].amountDue).toBe(119) // remaining + 0 fees + level-0 fee 0
  })
  it('skips suggestions and non-overdue invoices', () => {
    const notDue = inv({ id: 'i2', dueDate: '2999-01-01' })
    const suggestion = inv({ id: 'i3', isSuggestion: true })
    expect(dueReminders([notDue, suggestion], [], accounts, [0, 5, 10], [])).toHaveLength(0)
  })
})

describe('escalatedInvoices', () => {
  it('lists invoices past the 2. Mahnung', () => {
    const done = (i: number) => ({
      id: 'r' + i, title: 'x', status: 'done', priority: 'p2', bucket: 'done',
      checklist: [], tags: ['fee:0'], source: 'finance', actionType: 'send_reminder',
      sourceRef: 'inv1', createdAt: '', updatedAt: '2020-02-01T00:00:00.000Z',
    }) as any
    const res = escalatedInvoices([inv()], [done(1), done(2), done(3)], accounts)
    expect(res.map(r => r.invoice.id)).toEqual(['inv1'])
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run src/services/dunning.service.test.ts`
Expected: FAIL — `dueReminders`/`escalatedInvoices` not exported.

- [ ] **Step 3: Selektoren + Typen implementieren**

In `src/services/dunning.service.ts` ergänzen (Imports oben um `getDunningState` und `isOverdue` erweitern):

```typescript
import { getDunningState } from '@/hooks/useOverdueTaskSync'
import { isOverdue } from '@/lib/invoice-status'

export interface AccountLite { id: string; name: string }

export interface DueReminder {
  invoice: Invoice
  customerName: string
  level: number
  daysOverdue: number
  amountDue: number   // remaining + accrued fees + pending level fee (Euro)
}

export interface EscalatedItem {
  invoice: Invoice
  customerName: string
  level: number
  daysOverdue: number
}

function daysOverdueOf(dueDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000))
}

function nameOf(accounts: AccountLite[], accountId: string): string {
  return accounts.find(a => a.id === accountId)?.name ?? '—'
}

/** Jetzt fällige Mahnungen (phase 'due'), höchste Stufe zuerst, dann älteste. */
export function dueReminders(
  invoices: Invoice[], todos: Todo[], accounts: AccountLite[],
  fees: number[] = DEFAULT_DUNNING_FEES, payments: Payment[] = [],
): DueReminder[] {
  return invoices
    .filter(i => isOverdue(i) && !i.isSuggestion && getDunningState(i, todos).phase === 'due')
    .map(invoice => {
      const level = getDunningState(invoice, todos).level
      return {
        invoice,
        customerName: nameOf(accounts, invoice.accountId),
        level,
        daysOverdue: daysOverdueOf(invoice.dueDate),
        amountDue: outstandingWithPendingFee(invoice, payments, todos, level, fees),
      }
    })
    .sort((a, b) => b.level - a.level || a.invoice.dueDate.localeCompare(b.invoice.dueDate))
}

/** Rechnungen, die nach der 2. Mahnung eine manuelle Entscheidung brauchen. */
export function escalatedInvoices(
  invoices: Invoice[], todos: Todo[], accounts: AccountLite[],
): EscalatedItem[] {
  return invoices
    .filter(i => isOverdue(i) && !i.isSuggestion && getDunningState(i, todos).phase === 'escalated')
    .map(invoice => ({
      invoice,
      customerName: nameOf(accounts, invoice.accountId),
      level: getDunningState(invoice, todos).level,
      daysOverdue: daysOverdueOf(invoice.dueDate),
    }))
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run src/services/dunning.service.test.ts`
Expected: PASS (alle bisherigen + 4 neue).

- [ ] **Step 5: Commit**

```bash
git add src/services/dunning.service.ts src/services/dunning.service.test.ts
git commit -m "feat(dunning): dueReminders + escalatedInvoices selectors"
```

---

## Task 4: `sendReminder`-Orchestrierung (Versand + Stufen-Bugfix)

**Files:**
- Modify: `src/services/dunning.service.ts`
- Test: `src/services/dunning.service.test.ts`

- [ ] **Step 1: Failing-Test für `recordReminderSent` (mockt den Todo-Store)**

In `src/services/dunning.service.test.ts` ergänzen:

```typescript
import { recordReminderSent } from './dunning.service'
import { vi } from 'vitest'

// vi.mock wird gehoistet — die Mock-Fn via vi.hoisted bereitstellen,
// sonst "Cannot access 'mockUpsert' before initialization".
const { mockUpsert } = vi.hoisted(() => ({ mockUpsert: vi.fn() }))
vi.mock('@/store/todos.store', () => ({
  useTodosStore: { getState: () => ({ upsert: mockUpsert }) },
}))

describe('recordReminderSent', () => {
  it('creates a DONE send_reminder todo with the fee snapshot tag', async () => {
    mockUpsert.mockClear()
    await recordReminderSent(inv({ accountId: 'a' }), 1, [0, 5, 10])
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const payload = mockUpsert.mock.calls[0][0]
    expect(payload.status).toBe('done')
    expect(payload.bucket).toBe('done')
    expect(payload.actionType).toBe('send_reminder')
    expect(payload.sourceRef).toBe('inv1')
    expect(payload.customerId).toBe('a')
    expect(payload.tags).toEqual(['fee:500'])
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run src/services/dunning.service.test.ts -t recordReminderSent`
Expected: FAIL — `recordReminderSent` not exported.

- [ ] **Step 3: `recordReminderSent` + `sendReminder` implementieren**

In `src/services/dunning.service.ts` ergänzen (zusätzliche Imports oben):

```typescript
import { invoke } from '@tauri-apps/api/core'
import { useTodosStore } from '@/store/todos.store'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { MailService } from '@/services/mail.service'
import { FinanceService } from '@/services/finance.service'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Contact } from '@/types/contact.types'

const LEVEL_LABEL = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
function levelLabel(level: number): string { return LEVEL_LABEL[level] ?? '2. Mahnung' }
function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Protokolliert einen gesendeten Mahnschritt als abgeschlossenes To-do (treibt die Stufe). */
export async function recordReminderSent(
  invoice: Invoice, level: number, fees: number[] = DEFAULT_DUNNING_FEES,
): Promise<void> {
  await useTodosStore.getState().upsert({
    customerId: invoice.accountId,
    title: `${levelLabel(level)} · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)}`,
    status: 'done',
    bucket: 'done',
    priority: level >= 1 ? 'p1' : 'p2',
    source: 'finance',
    actionType: 'send_reminder',
    sourceRef: invoice.id,
    checklist: [],
    tags: reminderFeeTags(level, fees),
  })
}

export interface DunningSendResult { invoiceId: string; ok: boolean; error?: string }

/**
 * Versendet eine Mahnung: Kontakt-Mail → KORA-Text → PDF (optional) → SMTP →
 * bei Erfolg recordReminderSent (Stufe zählt hoch). Wirft nie — gibt ein Result zurück
 * (für isolierten Batch-Versand).
 */
export async function sendReminder(invoice: Invoice, level: number): Promise<DunningSendResult> {
  const fail = (error: string): DunningSendResult => ({ invoiceId: invoice.id, ok: false, error })
  try {
    const mailAccount = useMailStore.getState().accounts[0]
    if (!mailAccount) return fail('Kein E-Mail-Konto konfiguriert.')

    const contacts = await invoke<Contact[]>('get_contacts', { accountId: invoice.accountId }).catch(() => [])
    const recipient = contacts.find(c => c.email)?.email
    if (!recipient) return fail('Keine E-Mail-Adresse für diesen Kunden.')

    const accounts = useAccountsStore.getState().accounts
    const account = accounts.find(a => a.id === invoice.accountId)
    const profile = useCompanyStore.getState().profile
    const fees = profile.dunningFees ?? DEFAULT_DUNNING_FEES
    const customerName = account?.name ?? 'Kunde'
    const days = daysOverdueOf(invoice.dueDate)
    const payments = useFinanceStore.getState().payments
    const todos = useTodosStore.getState().allTodos
    const amountDue = outstandingWithPendingFee(invoice, payments, todos, level, fees)

    const body = await generateCorraDraft({
      kind: 'reminder', customerName,
      invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
      amount: amountDue, dueDate: invoice.dueDate, daysOverdue: days, dunningLevel: level,
    }).catch(() =>
      `Sehr geehrte Damen und Herren,\n\nwir erinnern an die offene Rechnung ${invoice.number ?? ''} `
      + `über ${fmtEur(amountDue)} €.\n\nMit freundlichen Grüßen`,
    )

    let pdfPath: string | null = null
    if (account) {
      try {
        const full = await FinanceService.getInvoice(invoice.id)
        const { getInvoicePdfBytes } = await import('@/components/finance/InvoicePDF')
        const bytes = await getInvoicePdfBytes(full, profile, account)
        const safe = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
        const filename = `${levelLabel(level)}_${invoice.number ?? invoice.id.slice(0, 8)}_${safe}.pdf`
        pdfPath = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
      } catch { /* PDF optional */ }
    }

    await MailService.sendEmail({
      accountId: mailAccount.id,
      to: [recipient],
      subject: `${levelLabel(level)} · Rechnung ${invoice.number ?? ''} · ${fmtEur(amountDue)} €`,
      bodyText: body,
      ...(pdfPath ? { attachmentPaths: [pdfPath] } : {}),
    })

    await recordReminderSent(invoice, level, fees)
    return { invoiceId: invoice.id, ok: true }
  } catch (err) {
    log.warn('sendReminder failed', { invoiceId: invoice.id, err })
    return fail('Versand fehlgeschlagen.')
  }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run src/services/dunning.service.test.ts`
Expected: PASS (inkl. `recordReminderSent`-Test).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler. (Falls `Contact` keinen `email`-String hat, Pfad in `src/types/contact.types.ts` prüfen — Feld heißt `email?: string`.)

- [ ] **Step 6: Commit**

```bash
git add src/services/dunning.service.ts src/services/dunning.service.test.ts
git commit -m "feat(dunning): sendReminder orchestration + records completed step (level bugfix)"
```

---

## Task 5: Gebühren-Felder in den Einstellungen

**Files:**
- Modify: `src/components/settings/WorkspaceSettings.tsx`

- [ ] **Step 1: Mahngebühren-Sektion einfügen**

In `src/components/settings/WorkspaceSettings.tsx` direkt **nach** dem schließenden `</div>` des „Company Profile"-Blocks (vor `<InvoiceNumberSettings />`, siehe Zeile ~161) einfügen:

```tsx
      {/* Mahngebühren */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Mahngebühren</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Gestaffelt je Mahnstufe (Euro)</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'].map((lbl, i) => (
            <Field
              key={i}
              label={lbl}
              value={String((form.dunningFees ?? [0, 5, 10])[i] ?? 0)}
              onChange={(v) => setForm(p => {
                const next = [...(p.dunningFees ?? [0, 5, 10])]
                next[i] = v === '' ? 0 : Number(v)
                return { ...p, dunningFees: next }
              })}
              placeholder="0"
            />
          ))}
        </div>
      </div>
```

(`Field` ist im selben Modul definiert/verwendet; `form`/`setForm` existieren bereits.)

- [ ] **Step 2: Typecheck + Lauf**

Run: `npm run typecheck`
Expected: keine Fehler (`dunningFees` ist in `CompanyProfile` aus Task 1).

- [ ] **Step 3: Manuell verifizieren (kurz)**

Dev-Server läuft. Einstellungen → Unternehmen öffnen: „Mahngebühren"-Sektion mit drei Feldern (0 / 5 / 10) sichtbar; Wert ändern + „Speichern" → nach Reload erhalten.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/WorkspaceSettings.tsx
git commit -m "feat(dunning): configurable dunning fees in company settings"
```

---

## Task 6: `DunningReviewModal` — Review-Liste + Versand

**Files:**
- Create: `src/components/finance/DunningReviewModal.tsx`

- [ ] **Step 1: Komponente anlegen**

Create `src/components/finance/DunningReviewModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { X, Send, Loader, AlertTriangle } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'
import { dueReminders, sendReminder, DEFAULT_DUNNING_FEES } from '@/services/dunning.service'
import type { Contact } from '@/types/contact.types'

const LEVEL_LABEL = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
const fmtEur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DunningReviewModal({ onClose }: { onClose: () => void }) {
  const invoices    = useFinanceStore(s => s.invoices)
  const payments    = useFinanceStore(s => s.payments)
  const loadAll     = useFinanceStore(s => s.loadAll)
  const todos       = useTodosStore(s => s.allTodos)
  const accounts    = useAccountsStore(s => s.accounts)
  const fees        = useCompanyStore(s => s.profile.dunningFees) ?? DEFAULT_DUNNING_FEES
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const showToast   = useToastStore(s => s.show)

  const items = dueReminders(invoices, todos, accounts, fees, payments)
  const [emails, setEmails]   = useState<Record<string, string | null>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [batch, setBatch]     = useState(false)

  // Empfänger-Adressen laden (async), um „nicht sendbar" zu markieren
  useEffect(() => {
    let alive = true
    const accountIds = [...new Set(items.map(i => i.invoice.accountId))]
    Promise.all(accountIds.map(async id => {
      const contacts = await invoke<Contact[]>('get_contacts', { accountId: id }).catch(() => [])
      return [id, contacts.find(c => c.email)?.email ?? null] as const
    })).then(pairs => { if (alive) setEmails(Object.fromEntries(pairs)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, todos])

  const sendOne = async (invoiceId: string, level: number) => {
    setSending(invoiceId)
    const res = await sendReminder(items.find(i => i.invoice.id === invoiceId)!.invoice, level)
    setSending(null)
    showToast(res.ok
      ? { message: 'Mahnung gesendet.', variant: 'success' }
      : { message: res.error ?? 'Versand fehlgeschlagen.', variant: 'error' })
    if (workspaceId) await loadAll(workspaceId)
  }

  const sendAll = async () => {
    setBatch(true)
    let ok = 0, failed = 0
    for (const it of items) {
      if (emails[it.invoice.accountId] == null) { failed++; continue }
      const res = await sendReminder(it.invoice, it.level)
      res.ok ? ok++ : failed++
    }
    setBatch(false)
    showToast({ message: `${ok} gesendet${failed ? `, ${failed} fehlgeschlagen` : ''}.`, variant: failed ? 'error' : 'success' })
    if (workspaceId) await loadAll(workspaceId)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0% 0 0 / 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(640px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Mahnungen prüfen &amp; senden</div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{items.length} fällig</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen" style={{ background: 'transparent', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {items.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>Keine fälligen Mahnungen.</div>
          )}
          {items.map(it => {
            const email = emails[it.invoice.accountId]
            const noMail = email === null
            return (
              <div key={it.invoice.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.customerName}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{LEVEL_LABEL[it.level] ?? '2. Mahnung'}</span>
                    <span>· {it.daysOverdue}d überfällig</span>
                    <span>· {fmtEur(it.amountDue)} €</span>
                    {noMail && <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} />keine E-Mail</span>}
                    {email && <span style={{ color: 'var(--fg-muted)' }}>· {email}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={noMail || sending === it.invoice.id || batch}
                  onClick={() => sendOne(it.invoice.id, it.level)}
                  style={{
                    height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid var(--accent)',
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    cursor: noMail ? 'not-allowed' : 'pointer', opacity: noMail ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                  }}
                >
                  {sending === it.invoice.id ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
                  Senden
                </button>
              </div>
            )
          })}
        </div>

        {items.length > 0 && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={sendAll} disabled={batch} style={{
              height: 36, padding: '0 18px', borderRadius: 9, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, opacity: batch ? 0.6 : 1,
            }}>
              {batch ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
              Alle senden
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/DunningReviewModal.tsx
git commit -m "feat(dunning): DunningReviewModal — batch + single send with no-email guard"
```

---

## Task 7: `DunningNudgeCard` + Einhängen in `DashboardRoute`

**Files:**
- Create: `src/components/finance/DunningNudgeCard.tsx`
- Modify: `src/routes/DashboardRoute.tsx`

- [ ] **Step 1: Karte anlegen**

Create `src/components/finance/DunningNudgeCard.tsx`:

```tsx
import { useState } from 'react'
import { Bell, ChevronRight } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { dueReminders, DEFAULT_DUNNING_FEES } from '@/services/dunning.service'
import { DunningReviewModal } from './DunningReviewModal'

const fmtEur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DunningNudgeCard() {
  const invoices = useFinanceStore(s => s.invoices)
  const payments = useFinanceStore(s => s.payments)
  const todos    = useTodosStore(s => s.allTodos)
  const accounts = useAccountsStore(s => s.accounts)
  const fees     = useCompanyStore(s => s.profile.dunningFees) ?? DEFAULT_DUNNING_FEES
  const [open, setOpen] = useState(false)

  const items = dueReminders(invoices, todos, accounts, fees, payments)
  if (items.length === 0) return null
  const total = items.reduce((s, i) => s + i.amountDue, 0)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
        padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
        background: 'oklch(72% 0.18 25 / 0.08)', border: '1px solid oklch(72% 0.18 25 / 0.3)',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'oklch(72% 0.18 25 / 0.16)', color: 'var(--danger)',
        }}>
          <Bell size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {items.length} Mahnung{items.length !== 1 ? 'en' : ''} fällig
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
            offen {fmtEur(total)} € · Prüfen &amp; senden
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
      </button>
      {open && <DunningReviewModal onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 2: In `DashboardRoute` einhängen**

In `src/routes/DashboardRoute.tsx` den Import ergänzen:

```tsx
import { DunningNudgeCard } from '@/components/finance/DunningNudgeCard'
```

Die Karte am oberen Rand des Dashboard-Inhalts einsetzen (im äußersten Inhalts-Container, vor den bestehenden StatCards/Listen). Konkret die erste Kind-Komponente im Haupt-`return`-Container rendern:

```tsx
      <DunningNudgeCard />
```

(Sie rendert `null`, wenn nichts fällig ist — kostet also nichts, wenn der Kreislauf leer ist.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/DunningNudgeCard.tsx src/routes/DashboardRoute.tsx
git commit -m "feat(dunning): Heute nudge card opening the review modal"
```

---

## Task 8: `MahnwesenPanel` auf den Service umstellen + „eskaliert"-Sektion

**Files:**
- Modify: `src/components/finance/MahnwesenPanel.tsx`

- [ ] **Step 1: Sende-Logik durch den Service ersetzen**

In `src/components/finance/MahnwesenPanel.tsx` die lokale `sendReminder`-Funktion (ca. Zeilen 214–272) ersetzen durch einen Aufruf des Service. Neuer Import oben:

```tsx
import { sendReminder as serviceSendReminder, escalatedInvoices } from '@/services/dunning.service'
```

Die Komponenten-interne `sendReminder` so umschreiben (Signatur bleibt `(invoice, customerName, dunningLevel)`, damit `MahnRow.onSend` unverändert funktioniert):

```tsx
  const sendReminder = async (invoice: Invoice, _customerName: string, dunningLevel: number) => {
    setSending(invoice.id)
    const res = await serviceSendReminder(invoice, dunningLevel)
    setSending(null)
    showToast(res.ok
      ? { message: 'Mahnung gesendet.', variant: 'success' }
      : { message: res.error ?? 'Senden fehlgeschlagen.', variant: 'error' })
    if (workspaceId) loadAll(workspaceId)
  }
```

Damit entfallen die nun ungenutzten Imports `generateCorraDraft`, `MailService`, `FinanceService`, `invoke`, `Contact` aus dieser Datei — entfernen (Typecheck zeigt sie als unbenutzt). `getDunningState`, `isOverdue`, `fmtEur`, `daysOverdue` bleiben.

- [ ] **Step 2: „Eskaliert"-Sektion ergänzen**

Im JSX des Panels nach der Liste der `waitingItems` (am Ende der Render-Struktur, vor dem schließenden Container) eine ruhige Sektion für eskalierte Rechnungen einfügen:

```tsx
      {(() => {
        const escalated = escalatedInvoices(invoices, allTodos, accounts)
        if (escalated.length === 0) return null
        return (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-dim)', padding: '0 18px 8px' }}>
              Braucht Entscheidung
            </div>
            {escalated.map(e => (
              <div key={e.invoice.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.customerName}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                    nach 2. Mahnung · {e.daysOverdue}d überfällig · Inkasso / abschreiben / persönlich
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>{fmtEur(e.invoice.total)} €</span>
              </div>
            ))}
          </div>
        )
      })()}
```

- [ ] **Step 3: Typecheck + Tests**

Run: `npm run typecheck`
Expected: keine Fehler.
Run: `npx vitest run`
Expected: PASS (gesamte Suite grün — keine Regression).

- [ ] **Step 4: Manuell verifizieren**

Dev-Server: Finanzen → Mahnwesen. Eine überfällige Rechnung mit hinterlegter Kunden-Mail senden → Toast „gesendet"; Panel neu berechnet, dieselbe Rechnung steht jetzt in „warten" (Cooldown), Stufe ist hochgezählt. Heute-Dashboard zeigt die Nudge-Karte, solange etwas fällig ist.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/MahnwesenPanel.tsx
git commit -m "refactor(dunning): MahnwesenPanel uses dunning.service + escalated section"
```

---

## Abschluss

- [ ] **Volle Verifikation**

Run: `npm run typecheck && npx vitest run`
Expected: Typecheck sauber, gesamte Test-Suite grün.

Manuell (Dev-Server, eingeloggt mit Mail-Konto):
1. Einstellungen → Mahngebühren 0/5/10 prüfen/anpassen.
2. Überfällige Rechnung mit Kunden-Mail → Heute zeigt Nudge-Karte → „Prüfen & senden" → „Alle senden" → Toast-Ergebnis.
3. Erneut öffnen: dieselbe Rechnung ist im Cooldown (nicht mehr „due"); Betrag in der Review enthält die Gebühr.
4. Nach (simuliert) 3 Versänden steht die Rechnung unter „Braucht Entscheidung" im Mahnwesen-Tab.
