# Kunden-Badge + Cockpit-Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an open-item count badge per customer in the customer list, and replace the "Cy fragen" AI section in the customer cockpit with a rule-based feed showing todos, mails, and open items for that customer.

**Architecture:** A pure `computeOpenCount` function (testable without React) reads from four stores and is wrapped in a `useCustomerOpenCount` hook. `CustomerFeedPane` renders three sections (Aufgaben, Mails, Offen) directly from those stores. `CockpitPane` swaps out the briefing block for `CustomerFeedPane`.

**Tech Stack:** React + TypeScript, Zustand stores, Vitest, lucide-react, inline CSS styles (no Tailwind).

---

### Task 1: `useCustomerOpenCount` hook (TDD)

**Files:**
- Create: `src/hooks/useCustomerOpenCount.ts`
- Create: `src/hooks/useCustomerOpenCount.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCustomerOpenCount.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeOpenCount } from './useCustomerOpenCount'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'
import type { Invoice } from '@/types/finance.types'

function makeTodo(p: Partial<Todo> & { id: string }): Todo {
  return {
    id: p.id, title: 'x', status: p.status ?? 'open',
    priority: 'p2', bucket: 'today', checklist: [], tags: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

function makeEmail(p: Partial<EmailHeader> & { id: string }): EmailHeader {
  return {
    id: p.id, accountId: 'acc1', uid: 1, folder: 'INBOX',
    subject: 'Test', fromAddr: 'a@b.com', fromName: 'A',
    toAddrs: [], sentAt: '2026-01-01T00:00:00Z',
    isRead: p.isRead ?? false,
    customerId: p.customerId !== undefined ? p.customerId : 'c1',
  }
}

function makeFollowUp(p: Partial<FollowUp> & { id: string }): FollowUp {
  return {
    id: p.id, customerId: p.customerId ?? 'c1',
    title: 'Nachfassen', dueDate: '2026-06-15',
    status: p.status ?? 'offen', priority: 'normal',
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function makeInvoice(p: Partial<Invoice> & { id: string }): Invoice {
  return {
    id: p.id, workspaceId: 'ws1', createdBy: 'u1',
    accountId: p.accountId ?? 'c1',
    date: '2026-01-01', dueDate: '2026-06-01',
    status: p.status ?? 'open', taxMode: 'standard',
    subtotal: 1000, taxAmount: 190, total: 1190,
    bankInfo: '', isSuggestion: false, pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('computeOpenCount', () => {
  it('returns 0 when all arrays are empty', () => {
    expect(computeOpenCount('c1', [], [], [], [])).toBe(0)
  })

  it('counts open and in_progress todos, excludes done', () => {
    const todos = [
      makeTodo({ id: 't1', customerId: 'c1', status: 'open' }),
      makeTodo({ id: 't2', customerId: 'c1', status: 'in_progress' }),
      makeTodo({ id: 't3', customerId: 'c1', status: 'done' }),
      makeTodo({ id: 't4', customerId: 'c2', status: 'open' }),
    ]
    expect(computeOpenCount('c1', todos, [], [], [])).toBe(2)
  })

  it('counts unread emails for the customer, excludes read and other customers', () => {
    const emails = [
      makeEmail({ id: 'e1', customerId: 'c1', isRead: false }),
      makeEmail({ id: 'e2', customerId: 'c1', isRead: true }),
      makeEmail({ id: 'e3', customerId: 'c2', isRead: false }),
    ]
    expect(computeOpenCount('c1', [], emails, [], [])).toBe(1)
  })

  it('counts all follow-ups for the customer regardless of status', () => {
    const followUps = [
      makeFollowUp({ id: 'f1', customerId: 'c1', status: 'offen' }),
      makeFollowUp({ id: 'f2', customerId: 'c1', status: 'erledigt' }),
      makeFollowUp({ id: 'f3', customerId: 'c2', status: 'offen' }),
    ]
    expect(computeOpenCount('c1', [], [], followUps, [])).toBe(2)
  })

  it('counts open and overdue invoices, excludes paid/draft/cancelled', () => {
    const invoices = [
      makeInvoice({ id: 'i1', accountId: 'c1', status: 'open' }),
      makeInvoice({ id: 'i2', accountId: 'c1', status: 'overdue' }),
      makeInvoice({ id: 'i3', accountId: 'c1', status: 'paid' }),
      makeInvoice({ id: 'i4', accountId: 'c1', status: 'draft' }),
      makeInvoice({ id: 'i5', accountId: 'c2', status: 'open' }),
    ]
    expect(computeOpenCount('c1', [], [], [], invoices)).toBe(2)
  })

  it('sums all four sources together', () => {
    const todos     = [makeTodo({ id: 't1', customerId: 'c1' })]
    const emails    = [makeEmail({ id: 'e1', customerId: 'c1', isRead: false })]
    const followUps = [makeFollowUp({ id: 'f1', customerId: 'c1' })]
    const invoices  = [makeInvoice({ id: 'i1', accountId: 'c1', status: 'overdue' })]
    expect(computeOpenCount('c1', todos, emails, followUps, invoices)).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useCustomerOpenCount.test.ts`
Expected: FAIL with "Cannot find module './useCustomerOpenCount'"

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useCustomerOpenCount.ts`:

```ts
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useFinanceStore } from '@/store/finance.store'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'
import type { Invoice } from '@/types/finance.types'

export function computeOpenCount(
  customerId: string,
  todos: Todo[],
  emails: EmailHeader[],
  followUps: FollowUp[],
  invoices: Invoice[],
): number {
  const todoCount = todos.filter(
    t => t.customerId === customerId && t.status !== 'done',
  ).length

  const mailCount = emails.filter(
    e => e.customerId === customerId && !e.isRead,
  ).length

  const followUpCount = followUps.filter(
    f => f.customerId === customerId,
  ).length

  const invoiceCount = invoices.filter(
    i => i.accountId === customerId && (i.status === 'open' || i.status === 'overdue'),
  ).length

  return todoCount + mailCount + followUpCount + invoiceCount
}

export function useCustomerOpenCount(customerId: string): number {
  const allTodos     = useTodosStore(s => s.allTodos)
  const emails       = useMailStore(s => s.emails)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const invoices     = useFinanceStore(s => s.invoices)
  return computeOpenCount(customerId, allTodos, emails, allFollowUps, invoices)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useCustomerOpenCount.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCustomerOpenCount.ts src/hooks/useCustomerOpenCount.test.ts
git commit -m "feat(hooks): useCustomerOpenCount — Summe offener Punkte pro Kunde"
```

---

### Task 2: Open-count badge in `ClientListRow`

**Files:**
- Modify: `src/routes/ClientsRoute.tsx`

- [ ] **Step 1: Add import and `OpenCountBadge` component**

In `src/routes/ClientsRoute.tsx`, add to the existing import block at the top:

```ts
import { useCustomerOpenCount } from '@/hooks/useCustomerOpenCount'
```

After the `SignalBadge` function (around line 124, before the `COL_TEMPLATE` constant), add:

```tsx
function OpenCountBadge({ customerId }: { customerId: string }) {
  const count = useCustomerOpenCount(customerId)
  if (count === 0) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, borderRadius: 999,
      background: 'var(--accent)', color: 'var(--accent-ink)',
      fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
      padding: '0 5px', flexShrink: 0,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}
```

- [ ] **Step 2: Wire badge into the Signal cell**

In `ClientListRow`, find:

```tsx
      {/* Signal */}
      <div><SignalBadge row={row} /></div>
```

Replace with:

```tsx
      {/* Signal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SignalBadge row={row} />
        <OpenCountBadge customerId={row.customer.id} />
      </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/ClientsRoute.tsx
git commit -m "feat(clients): open-count badge per Kunde in Kundenliste"
```

---

### Task 3: `CustomerFeedPane` component

**Files:**
- Create: `src/components/customer/tabs/CustomerFeedPane.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/customer/tabs/CustomerFeedPane.tsx`:

```tsx
import { useMemo } from 'react'
import { CheckSquare, Mail, FileText, Clock } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useFinanceStore } from '@/store/finance.store'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'
import type { Invoice } from '@/types/finance.types'

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function relTimeShort(iso: string): string {
  const t = new Date(iso).getTime()
  const min = Math.floor((Date.now() - t) / 60_000)
  if (min < 60) return `vor ${Math.max(1, min)} Min.`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? 'vor 1 Std.' : `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d === 1) return 'gestern'
  if (d < 30) return `vor ${d} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

function todayIso(): string {
  return new Date().toLocaleDateString('sv')
}

const PRIORITY_ORDER: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3 }

const PRIORITY_COLORS: Record<string, { bg: string; ink: string }> = {
  p1: { bg: 'oklch(72% 0.20 25 / 0.15)',  ink: 'oklch(72% 0.20 25)' },
  p2: { bg: 'oklch(82% 0.17 60 / 0.15)',  ink: 'oklch(82% 0.17 60)' },
  p3: { bg: 'oklch(82% 0.18 145 / 0.12)', ink: 'oklch(82% 0.18 145)' },
  p4: { bg: 'var(--surface-3)',            ink: 'var(--fg-dim)' },
}

const BUCKET_LABELS: Record<string, string> = {
  today: 'Heute', in_progress: 'In Bearbeitung', backlog: 'Backlog',
}

// ── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count }: {
  icon: React.ElementType<{ size?: number; style?: React.CSSProperties }>
  label: string
  count: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      <Icon size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
      }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
          ({count})
        </span>
      )}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '8px 0', fontStyle: 'italic' }}>
      {text}
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 0', borderBottom: '1px solid var(--border)',
}

// ── Aufgaben ─────────────────────────────────────────────────────────────────

function AufgabenSection({ todos }: { todos: Todo[] }) {
  const sorted = useMemo(() => [...todos].sort((a, b) => {
    const diff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    return diff !== 0 ? diff : b.updatedAt.localeCompare(a.updatedAt)
  }), [todos])

  return (
    <div>
      <SectionHeader icon={CheckSquare} label="Aufgaben" count={sorted.length} />
      {sorted.length === 0
        ? <EmptyRow text="Keine offenen Aufgaben" />
        : sorted.map(todo => {
          const pc = PRIORITY_COLORS[todo.priority] ?? PRIORITY_COLORS.p4
          return (
            <div key={todo.id} style={rowStyle}>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                background: pc.bg, color: pc.ink, textTransform: 'uppercase',
              }}>
                {todo.priority}
              </span>
              <span style={{
                flex: 1, fontSize: 13, color: 'var(--fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {todo.title}
              </span>
              <span style={{
                fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0,
                fontFamily: 'var(--font-mono)',
              }}>
                {BUCKET_LABELS[todo.bucket] ?? todo.bucket}
              </span>
            </div>
          )
        })
      }
    </div>
  )
}

// ── Mails ────────────────────────────────────────────────────────────────────

function MailsSection({ emails }: { emails: EmailHeader[] }) {
  const top5 = useMemo(() =>
    [...emails].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 5),
  [emails])

  return (
    <div>
      <SectionHeader icon={Mail} label="Mails" count={emails.length} />
      {top5.length === 0
        ? <EmptyRow text="Keine ungelesenen Mails" />
        : top5.map(email => (
          <div key={email.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 600, color: 'var(--fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {email.fromName || email.fromAddr}
              </div>
              <div style={{
                fontSize: 11.5, color: 'var(--fg-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {email.subject.length > 60 ? `${email.subject.slice(0, 60)}…` : email.subject}
              </div>
            </div>
            <span style={{
              fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0,
              fontFamily: 'var(--font-mono)',
            }}>
              {relTimeShort(email.sentAt)}
            </span>
          </div>
        ))
      }
    </div>
  )
}

// ── Offen (Rechnungen + Follow-ups) ──────────────────────────────────────────

function OffenSection({ invoices, followUps }: { invoices: Invoice[]; followUps: FollowUp[] }) {
  const today = todayIso()

  const sortedInvoices = useMemo(() => [...invoices].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return a.dueDate.localeCompare(b.dueDate)
  }), [invoices])

  const sortedFollowUps = useMemo(() =>
    [...followUps].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  [followUps])

  const total = invoices.length + followUps.length

  return (
    <div>
      <SectionHeader icon={FileText} label="Offen" count={total} />
      {total === 0 ? (
        <EmptyRow text="Nichts Offenes" />
      ) : (
        <>
          {sortedInvoices.map(inv => {
            const isOverdue = inv.status === 'overdue'
            const dueFmt = new Date(inv.dueDate).toLocaleDateString('de-DE', {
              day: '2-digit', month: 'short',
            })
            return (
              <div key={inv.id} style={rowStyle}>
                <span style={{
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                  textTransform: 'uppercase',
                  background: isOverdue ? 'oklch(72% 0.20 25 / 0.12)' : 'var(--surface-3)',
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg-dim)',
                }}>
                  {isOverdue ? 'Überfällig' : 'Offen'}
                </span>
                <span style={{
                  flex: 1, fontSize: 13, color: 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {inv.number ? `Rechnung ${inv.number}` : 'Rechnung (Entwurf)'}
                </span>
                <span style={{
                  fontSize: 12, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0, fontWeight: 600,
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg)',
                }}>
                  {fmtEuro(inv.total)}
                </span>
                <span style={{
                  fontSize: 11, flexShrink: 0, fontFamily: 'var(--font-mono)',
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg-dim)',
                }}>
                  {dueFmt}
                </span>
              </div>
            )
          })}
          {sortedFollowUps.map(fu => {
            const isOverdue = fu.dueDate < today
            const dueFmt = new Date(fu.dueDate).toLocaleDateString('de-DE', {
              day: '2-digit', month: 'short',
            })
            return (
              <div key={fu.id} style={rowStyle}>
                <Clock size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 13, color: 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {fu.title}
                </span>
                <span style={{
                  fontSize: 11, flexShrink: 0, fontFamily: 'var(--font-mono)',
                  color: isOverdue ? 'oklch(72% 0.20 25)' : 'var(--fg-dim)',
                }}>
                  {dueFmt}
                </span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

interface Props {
  accountId: string
}

export function CustomerFeedPane({ accountId }: Props) {
  const allTodos     = useTodosStore(s => s.allTodos)
  const emails       = useMailStore(s => s.emails)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const invoices     = useFinanceStore(s => s.invoices)

  const todos = useMemo(
    () => allTodos.filter(t => t.customerId === accountId && t.status !== 'done'),
    [allTodos, accountId],
  )
  const unreadEmails = useMemo(
    () => emails.filter(e => e.customerId === accountId && !e.isRead),
    [emails, accountId],
  )
  const followUps = useMemo(
    () => allFollowUps.filter(f => f.customerId === accountId),
    [allFollowUps, accountId],
  )
  const openInvoices = useMemo(
    () => invoices.filter(i =>
      i.accountId === accountId && (i.status === 'open' || i.status === 'overdue'),
    ),
    [invoices, accountId],
  )

  const allEmpty = todos.length === 0 && unreadEmails.length === 0 &&
    followUps.length === 0 && openInvoices.length === 0

  if (allEmpty) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 0', gap: 8,
        color: 'var(--fg-dim)',
      }}>
        <span style={{ fontSize: 20 }}>✓</span>
        <span style={{ fontSize: 13 }}>Alles erledigt</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AufgabenSection todos={todos} />
      <MailsSection emails={unreadEmails} />
      <OffenSection invoices={openInvoices} followUps={followUps} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors from the new file

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/tabs/CustomerFeedPane.tsx
git commit -m "feat(cockpit): CustomerFeedPane — Aufgaben/Mails/Offen Feed"
```

---

### Task 4: Remove "Cy fragen", integrate `CustomerFeedPane` in `CockpitPane`

**Files:**
- Modify: `src/components/customer/tabs/CockpitPane.tsx`

Context on what to remove: The file at the top of `CockpitPane` has a `BriefingState` type, a `NextMoveCard` sub-component, and inside `export function CockpitPane`:
- Several store subscriptions used only for briefing: `allTodos`, `allEvents`, `allInvoices`, `notes`, `emails`, `followUps` (lines ~528–533)
- State: `briefState`, `setBriefState`, `skipped`, `setSkipped` (line ~534–535)
- `runBriefing` async function (lines ~537–556)
- A `useEffect` that resets briefing state on `customerId` change (lines ~558–562)
- In JSX: the `{!skipped && <NextMoveCard ... />}` block (lines ~644–652)

- [ ] **Step 1: Add `CustomerFeedPane` import**

Add to imports in `src/components/customer/tabs/CockpitPane.tsx`:

```ts
import { CustomerFeedPane } from '@/components/customer/tabs/CustomerFeedPane'
```

- [ ] **Step 2: Remove AI-related imports**

Remove from the lucide-react import line the three icons: `Sparkles`, `RefreshCw`, `EyeOff`.
Keep: `Calendar, Wallet, TrendingUp, Phone, ArrowRight, AlertTriangle, Mail as MailIcon, Clock as ClockIcon`.

Remove this import entirely:
```ts
import {
  generateBriefing, MissingApiKeyError, type CustomerBriefing,
} from '@/lib/ai/briefing'
```

- [ ] **Step 3: Remove `BriefingState` type and `NextMoveCard` component**

Remove the block starting with `type BriefingState =` through the end of the `NextMoveCard` function (lines ~172–430 approximately). These are: the `BriefingState` type union, and the entire `function NextMoveCard(...)` definition.

- [ ] **Step 4: Remove briefing state and logic from `CockpitPane` body**

Inside `export function CockpitPane`, remove:

These six store subscriptions (used only for briefing):
```ts
  const allTodos     = useTodosStore(s => s.allTodos)
  const allEvents    = useCalendarStore(s => s.events)
  const allInvoices  = useFinanceStore(s => s.invoices)
  const notes        = useNotesModuleStore(s => s.entries)
  const emails       = useMailStore(s => s.emails)
  const followUps    = useCrmStore(s => s.allFollowUps)
```

These state declarations:
```ts
  const [briefState, setBriefState] = useState<BriefingState>({ kind: 'idle' })
  const [skipped, setSkipped] = useState(false)
```

The `runBriefing` function:
```ts
  const runBriefing = async () => { ... }
```

The reset `useEffect`:
```ts
  useEffect(() => {
    setBriefState({ kind: 'idle' })
    setSkipped(false)
  }, [customerId])
```

Also remove unused imports that are now dead: `useCalendarStore`, `useNotesModuleStore`, `useMailStore`, `useNotesModuleStore` — check which of these were only used by briefing and remove those import lines.

- [ ] **Step 5: Replace `NextMoveCard` block with `CustomerFeedPane`**

In the JSX return, find:

```tsx
      {/* ── Naechster Zug ─────────────────────────────────────────────── */}
      {!skipped && (
        <NextMoveCard
          customerId={customerId}
          state={briefState}
          onRegenerate={runBriefing}
          onSkip={() => setSkipped(true)}
        />
      )}
```

Replace with:

```tsx
      {/* ── Feed ──────────────────────────────────────────────────────── */}
      <CustomerFeedPane accountId={customerId} />
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/customer/tabs/CockpitPane.tsx
git commit -m "feat(cockpit): CustomerFeedPane ersetzt Cy-fragen-Sektion"
```

---

## Self-Review

**Spec coverage:**
- ✅ `useCustomerOpenCount` hook with pure `computeOpenCount` function — Task 1
- ✅ Badge in `ClientListRow`: accent pill, only if count > 0, cap at 99+ — Task 2
- ✅ `CustomerFeedPane` with 3 sections — Task 3
- ✅ Aufgaben: sorted p1→p4, then updatedAt desc, bucket label (Heute/In Bearbeitung/Backlog) — Task 3
- ✅ Mails: unread only, max 5, newest first, fromName + subject (60 chars) + relative timestamp — Task 3
- ✅ Offen: invoices (overdue before open), then follow-ups by date; overdue colored red — Task 3
- ✅ All-empty state "✓ Alles erledigt" — Task 3
- ✅ Remove all AI briefing code (NextMoveCard, BriefingState, generateBriefing, state vars) — Task 4
- ✅ Replace with `<CustomerFeedPane accountId={customerId} />` — Task 4

**Placeholder scan:** None found. All code is complete.

**Type consistency:**
- `computeOpenCount(customerId, todos, emails, followUps, invoices)` — same signature in test and implementation
- `CustomerFeedPane` receives `accountId: string` — passed as `accountId={customerId}` in Task 4
- `OpenCountBadge` receives `customerId: string` — called with `row.customer.id` (Customer.id exists)
- `FollowUp.customerId` matches filter `f.customerId === customerId` — correct field name from `crm.types.ts`
- `Invoice.accountId` matches filter `i.accountId === accountId` — correct field name from `finance.types.ts`
