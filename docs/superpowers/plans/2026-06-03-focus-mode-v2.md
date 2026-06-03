# Focus Mode v2 — Kunden-Session + Batch-Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Focus Mode from a flat priority queue to a customer-session system: user picks a customer, sees all their tasks as a batch grid, works through them, then moves to the next customer.

**Architecture:** `FocusShell` gains a routing state (`activeCustomerId`). When `null`, it shows `FocusCustomerSelect` (new). When set, it shows `FocusSessionView` (new): 3-column layout with `FocusCustomerPanel` (left), active task card (center, reusing existing card components), and `FocusBatchSidebar` (right). `FocusWorkspace` is retired and replaced by the routing logic inside `FocusSessionView`.

**Tech Stack:** React 18, TypeScript, Zustand stores (`useTodosStore`, `useAccountsStore`, `useFinanceStore`, `useActivitiesStore`, `useDealsStore`), Tauri invoke, Lucide icons, existing CSS vars (`--fg`, `--accent`, `--surface-2`, etc.), Vitest for tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/hooks/useFocusStack.ts` | Modify | Add `CustomerFocusGroup` type + `groupFocusByCustomer` function |
| `src/hooks/useFocusStack.test.ts` | Modify | Tests for `groupFocusByCustomer` |
| `src/lib/ai/corra.ts` | Modify | Add `generateCorraContextHint` (synchronous, rule-based) |
| `src/hooks/useCorraContextHint.ts` | Create | Hook that pulls store data and calls `generateCorraContextHint` |
| `src/components/focus/FocusShell.tsx` | Modify | Add `activeCustomerId` state, route to Select vs Session |
| `src/components/focus/FocusCustomerSelect.tsx` | Create | Kunden-Auswahl entry screen |
| `src/components/focus/FocusCustomerPanel.tsx` | Create | Left column: KPIs, contacts, activity, session progress |
| `src/components/focus/FocusBatchSidebar.tsx` | Modify | Replace queue logic: now shows current customer's tasks as mini-tiles |
| `src/components/focus/FocusSessionView.tsx` | Create | 3-column session orchestrator + card routing |
| `src/components/focus/FocusCardReminder.tsx` | Modify | Add CORRA hint box + WhatsApp channel tab |
| `src/components/focus/FocusCardFollowUp.tsx` | Modify | Add CORRA hint box + WhatsApp channel tab |
| `src/components/focus/FocusCardDefault.tsx` | Modify | Add CORRA hint box + Schnellnotiz |
| `src/components/focus/FocusCardInvoice.tsx` | Modify | Add CORRA hint box |

---

## Task 1: `groupFocusByCustomer` + types

**Files:**
- Modify: `src/hooks/useFocusStack.ts`
- Modify: `src/hooks/useFocusStack.test.ts`

- [ ] **Step 1: Add the types and function to `useFocusStack.ts`**

Add these exports after the existing `sortFocus` function:

```ts
// src/hooks/useFocusStack.ts  — append after sortFocus

import type { Account } from '@/types/account.types'

export type FocusUrgency = 'critical' | 'high' | 'normal' | 'low'

export interface CustomerFocusGroup {
  customerId: string | null  // null = tasks with no customerId ("Allgemein")
  customerName: string
  tasks: Todo[]
  urgency: FocusUrgency
}

function computeUrgency(tasks: Todo[]): FocusUrgency {
  if (tasks.some(t => t.actionType === 'send_reminder')) return 'critical'
  if (tasks.some(t => t.priority === 'p1' || t.actionType === 'create_invoice')) return 'high'
  if (tasks.every(t => t.priority === 'p4')) return 'low'
  return 'normal'
}

const URGENCY_ORDER: Record<FocusUrgency, number> = { critical: 0, high: 1, normal: 2, low: 3 }

export function groupFocusByCustomer(
  stack: Todo[],
  accounts: Account[],
): CustomerFocusGroup[] {
  const map = new Map<string | null, Todo[]>()
  for (const todo of stack) {
    const key = todo.customerId ?? null
    map.set(key, [...(map.get(key) ?? []), todo])
  }
  const groups: CustomerFocusGroup[] = []
  for (const [customerId, tasks] of map) {
    const account = customerId ? accounts.find(a => a.id === customerId) : undefined
    groups.push({
      customerId,
      customerName: account?.name ?? (customerId ? customerId.slice(0, 8) : 'Allgemein'),
      tasks: [...tasks].sort(sortFocus),
      urgency: computeUrgency(tasks),
    })
  }
  return groups.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency])
}
```

- [ ] **Step 2: Write the tests**

Add to `src/hooks/useFocusStack.test.ts`:

```ts
import { groupFocusByCustomer } from './useFocusStack'
import type { Account } from '@/types/account.types'

function makeAccount(id: string, name: string): Account {
  return {
    id, name, workspaceId: 'w1', createdBy: 'u1',
    kind: 'company', status: 'aktiv', priority: 'normal',
    tags: [], goals: [], isPrivate: false,
    socialLinks: '', leadScore: 0, scoreFactors: {},
    createdAt: '2026-01-01T00:00:00', updatedAt: '2026-01-01T00:00:00',
  }
}

describe('groupFocusByCustomer', () => {
  it('groups tasks by customerId', () => {
    const tasks = [
      makeTodo({ id: 'a', customerId: 'c1' }),
      makeTodo({ id: 'b', customerId: 'c2' }),
      makeTodo({ id: 'c', customerId: 'c1' }),
    ]
    const accounts = [makeAccount('c1', 'Acme'), makeAccount('c2', 'Beta')]
    const groups = groupFocusByCustomer(tasks, accounts)
    expect(groups.map(g => g.customerId)).toContain('c1')
    expect(groups.find(g => g.customerId === 'c1')?.tasks).toHaveLength(2)
    expect(groups.find(g => g.customerId === 'c2')?.tasks).toHaveLength(1)
  })

  it('puts send_reminder tasks as critical urgency', () => {
    const tasks = [makeTodo({ id: 'a', customerId: 'c1', actionType: 'send_reminder' })]
    const groups = groupFocusByCustomer(tasks, [makeAccount('c1', 'Acme')])
    expect(groups[0].urgency).toBe('critical')
  })

  it('sorts critical before normal', () => {
    const tasks = [
      makeTodo({ id: 'a', customerId: 'c1', priority: 'p3' }),
      makeTodo({ id: 'b', customerId: 'c2', actionType: 'send_reminder' }),
    ]
    const accounts = [makeAccount('c1', 'Acme'), makeAccount('c2', 'Beta')]
    const groups = groupFocusByCustomer(tasks, accounts)
    expect(groups[0].customerId).toBe('c2')
  })

  it('uses "Allgemein" for tasks without customerId', () => {
    const tasks = [makeTodo({ id: 'a' })]
    const groups = groupFocusByCustomer(tasks, [])
    expect(groups[0].customerId).toBeNull()
    expect(groups[0].customerName).toBe('Allgemein')
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/hooks/useFocusStack.test.ts
```

Expected: all tests pass (both existing `sortFocus`/`isToday` tests and new `groupFocusByCustomer` tests).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFocusStack.ts src/hooks/useFocusStack.test.ts
git commit -m "feat(focus): groupFocusByCustomer helper + CustomerFocusGroup type"
```

---

## Task 2: `generateCorraContextHint` + `useCorraContextHint` hook

**Files:**
- Modify: `src/lib/ai/corra.ts`
- Create: `src/hooks/useCorraContextHint.ts`

- [ ] **Step 1: Add `generateCorraContextHint` to `corra.ts`**

Append after `generateCorraDraft`:

```ts
// src/lib/ai/corra.ts — append at end

export type CorraHintTaskKind = 'reminder' | 'followup' | 'invoice' | 'general'

export interface CorraContextHintInput {
  customerName: string
  taskKind: CorraHintTaskKind
  avgPaymentDays?: number   // avg days to pay from invoice history
  daysOverdue?: number      // days since dueDate on current invoice
  lastContactDays?: number  // days since last activity
  openDealValue?: number
  openDealTitle?: string
}

function formatEurHint(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function generateCorraContextHint(input: CorraContextHintInput): string {
  const parts: string[] = []

  if (input.taskKind === 'reminder') {
    if (input.avgPaymentDays && input.daysOverdue) {
      if (input.daysOverdue > input.avgPaymentDays * 1.5) {
        parts.push(`${input.customerName} zahlt normalerweise in ${input.avgPaymentDays} Tagen — Tag ${input.daysOverdue} ist ungewöhnlich.`)
      }
    }
    if (input.daysOverdue !== undefined) {
      parts.push(input.daysOverdue > 14 ? 'Ton: bestimmt, aber fair.' : 'Ton: freundlich — wahrscheinlich nur vergessen.')
    }
  }

  if (input.taskKind === 'followup') {
    if (input.lastContactDays && input.lastContactDays > 30) {
      parts.push(`Letzter Kontakt vor ${input.lastContactDays} Tagen — kurz mit dem Kontext einsteigen.`)
    } else if (input.lastContactDays && input.lastContactDays < 3) {
      parts.push('Letzter Kontakt war erst vor Kurzem — knapp halten.')
    }
  }

  if (input.openDealValue && input.openDealTitle) {
    parts.push(`Offener Deal: „${input.openDealTitle}" (${formatEurHint(input.openDealValue)}) — Beziehung schonen.`)
  }

  return parts.slice(0, 2).join(' ')
}
```

- [ ] **Step 2: Create `src/hooks/useCorraContextHint.ts`**

```ts
import { useMemo } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useDealsStore } from '@/store/deals.store'
import { useActivitiesStore } from '@/store/activities.store'
import { generateCorraContextHint } from '@/lib/ai/corra'
import type { CorraHintTaskKind } from '@/lib/ai/corra'

export function useCorraContextHint(
  customerId: string | undefined,
  customerName: string,
  taskKind: CorraHintTaskKind,
  invoiceId?: string,
): string {
  const invoices    = useFinanceStore(s => s.invoices)
  const allDeals    = useDealsStore(s => s.deals)
  const activities  = useActivitiesStore(s => s.activities)

  return useMemo(() => {
    if (!customerId) return ''

    // Average payment days: compare dueDate vs updatedAt on paid invoices for this customer
    const paidInvoices = invoices.filter(
      i => i.accountId === customerId && i.status === 'paid' && i.dueDate && i.updatedAt,
    )
    let avgPaymentDays: number | undefined
    if (paidInvoices.length > 0) {
      const daysArr = paidInvoices.map(i => {
        const due  = new Date(i.dueDate!).getTime()
        const paid = new Date(i.updatedAt).getTime()
        return Math.max(0, Math.floor((paid - due) / 86_400_000))
      })
      avgPaymentDays = Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
    }

    // Days overdue for current invoice
    let daysOverdue: number | undefined
    if (invoiceId) {
      const inv = invoices.find(i => i.id === invoiceId)
      if (inv?.dueDate) {
        daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000))
      }
    }

    // Last contact days
    const customerActivities = activities.filter(a => a.accountId === customerId || a.customerId === customerId)
    let lastContactDays: number | undefined
    if (customerActivities.length > 0) {
      const latest = customerActivities
        .map(a => new Date(a.updatedAt ?? a.createdAt).getTime())
        .sort((a, b) => b - a)[0]
      lastContactDays = Math.floor((Date.now() - latest) / 86_400_000)
    }

    // Open deal
    const openDeal = allDeals.find(d => (d.accountId === customerId || d.customerId === customerId) && d.value)
    
    return generateCorraContextHint({
      customerName,
      taskKind,
      avgPaymentDays,
      daysOverdue,
      lastContactDays,
      openDealValue: openDeal?.value,
      openDealTitle: openDeal?.title,
    })
  }, [customerId, customerName, taskKind, invoiceId, invoices, allDeals, activities])
}
```

- [ ] **Step 3: Check that the deals store has a `deals` array**

```bash
grep -n "deals:" src/store/deals.store.ts | head -5
```

Expected: a line like `deals: Deal[]`. If the field is named differently (e.g. `items`), update `useCorraContextHint.ts` accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/corra.ts src/hooks/useCorraContextHint.ts
git commit -m "feat(focus): generateCorraContextHint + useCorraContextHint hook"
```

---

## Task 3: FocusShell routing update

**Files:**
- Modify: `src/components/focus/FocusShell.tsx`

- [ ] **Step 1: Rewrite FocusShell with routing state**

```tsx
// src/components/focus/FocusShell.tsx
import { useEffect, useState } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFocusStack } from '@/hooks/useFocusStack'
import { useOverdueTaskSync } from '@/hooks/useOverdueTaskSync'
import { useInvoiceSuggestionSync } from '@/hooks/useInvoiceSuggestionSync'
import { FocusCustomerSelect } from './FocusCustomerSelect'
import { FocusSessionView } from './FocusSessionView'

export function FocusShell() {
  const loadFinance       = useFinanceStore(s => s.loadAll)
  const invoices          = useFinanceStore(s => s.invoices)
  const loadMailAccounts  = useMailStore(s => s.loadAccounts)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const focusApi          = useFocusStack()

  // null  = show Kunden-Auswahl
  // string = in session for that customerId
  // 'none' = in session for tasks without a customer
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeWorkspaceId) return
    if (invoices.length === 0) loadFinance(activeWorkspaceId)
  }, [activeWorkspaceId, invoices.length, loadFinance])

  useEffect(() => { loadMailAccounts() }, [loadMailAccounts])

  useOverdueTaskSync()
  useInvoiceSuggestionSync()

  return (
    <div className="focus-backdrop">
      <div className="focus-aurora" aria-hidden />
      {activeCustomerId === null ? (
        <FocusCustomerSelect
          stack={focusApi.stack}
          onSelectCustomer={setActiveCustomerId}
        />
      ) : (
        <FocusSessionView
          customerId={activeCustomerId === 'none' ? undefined : activeCustomerId}
          onBack={() => setActiveCustomerId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing `FocusShell.tsx` (the new components don't exist yet — that's OK, errors for missing files are expected until Tasks 4–7 are done).

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusShell.tsx
git commit -m "feat(focus): FocusShell routing — Kunden-Auswahl vs Session state"
```

---

## Task 4: FocusCustomerSelect

**Files:**
- Create: `src/components/focus/FocusCustomerSelect.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusCustomerSelect.tsx
import { useMemo } from 'react'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore } from '@/store/ui.store'
import { groupFocusByCustomer } from '@/hooks/useFocusStack'
import type { Todo } from '@/types/todo.types'
import type { FocusUrgency } from '@/hooks/useFocusStack'

interface Props {
  stack: Todo[]
  onSelectCustomer: (customerId: string) => void
}

const URGENCY_BADGE: Record<FocusUrgency, { label: string; color: string; bg: string }> = {
  critical: { label: 'DRINGEND',   color: 'oklch(72% 0.18 25)',  bg: 'oklch(72% 0.18 25 / 0.1)' },
  high:     { label: 'HOCH',       color: 'oklch(72% 0.18 25)',  bg: 'oklch(72% 0.18 25 / 0.08)' },
  normal:   { label: 'NORMAL',     color: 'var(--fg-dim)',        bg: 'oklch(50% 0 0 / 0.06)' },
  low:      { label: 'NIEDRIG',    color: 'var(--fg-dim)',        bg: 'oklch(50% 0 0 / 0.04)' },
}

const ACTION_ICON: Record<string, string> = {
  send_reminder: '€',
  create_invoice: '€',
  followup: '↻',
  reply_mail: '✉',
  write_offer: '↗',
  call: '📞',
}

function getTaskColor(t: Todo): string {
  if (t.actionType === 'send_reminder' || t.actionType === 'create_invoice') return 'oklch(72% 0.18 25)'
  if (t.actionType === 'followup' || t.actionType === 'reply_mail') return 'var(--info)'
  if (t.actionType === 'write_offer') return 'var(--accent)'
  if (t.priority === 'p1') return 'oklch(72% 0.18 25)'
  return 'var(--fg-dim)'
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

export function FocusCustomerSelect({ stack, onSelectCustomer }: Props) {
  const accounts   = useAccountsStore(s => s.accounts)
  const setAppView = useUiStore(s => s.setAppView)

  const groups = useMemo(() => groupFocusByCustomer(stack, accounts), [stack, accounts])

  const totalTasks    = stack.length
  const totalCustomers = groups.length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        height: 48, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 28px', gap: 20,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Focus</span>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', letterSpacing: '0.03em' }}>
            Wen arbeitest du heute ab?
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)',
          background: 'var(--surface-2)', padding: '3px 10px', borderRadius: 99,
        }}>
          {totalCustomers} Kunden · {totalTasks} Tasks
        </span>
        <button
          type="button"
          onClick={() => setAppView('dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg)', fontSize: 11, cursor: 'pointer',
          }}
        >
          Schließen
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)',
            background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3,
          }}>ESC</span>
        </button>
      </div>

      {/* Grid */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '28px 36px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
        gap: 14,
        alignContent: 'start',
      }}>
        {groups.map(group => {
          const badge   = URGENCY_BADGE[group.urgency]
          const custId  = group.customerId ?? 'none'
          const inits   = initials(group.customerName)

          return (
            <div
              key={custId}
              onClick={() => onSelectCustomer(custId)}
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${group.urgency === 'critical' || group.urgency === 'high' ? 'oklch(72% 0.18 25 / 0.2)' : 'var(--border)'}`,
                borderRadius: 16, overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                transition: 'all 200ms',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '16px 18px 12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 99,
                  background: 'linear-gradient(135deg, var(--accent), oklch(60% 0.25 280))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 12, color: 'var(--accent-ink)', flexShrink: 0,
                }}>
                  {inits}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
                    {group.customerName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                    {group.tasks.length} {group.tasks.length === 1 ? 'Task' : 'Tasks'}
                  </div>
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 700,
                  color: badge.color,
                  letterSpacing: '-0.02em', flexShrink: 0,
                }}>
                  {group.tasks.length}
                </div>
              </div>

              {/* Task list */}
              <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0', flex: 1 }}>
                {group.tasks.slice(0, 4).map((t, i) => {
                  const color = getTaskColor(t)
                  const icon  = t.actionType ? (ACTION_ICON[t.actionType] ?? '✓') : '✓'
                  return (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 18px',
                      borderBottom: i < Math.min(group.tasks.length, 4) - 1 ? '1px solid oklch(50% 0 0 / 0.06)' : undefined,
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: `${color}18`, color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700,
                      }}>
                        {icon}
                      </div>
                      <div style={{
                        flex: 1, minWidth: 0,
                        fontSize: 11, color: 'var(--fg-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.title}
                      </div>
                    </div>
                  )
                })}
                {group.tasks.length > 4 && (
                  <div style={{ fontSize: 10, color: 'var(--fg-dim)', padding: '6px 18px' }}>
                    +{group.tasks.length - 4} weitere…
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 18px',
                borderTop: '1px solid var(--border)',
                background: 'oklch(50% 0 0 / 0.03)',
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: badge.color, background: badge.bg,
                  padding: '2px 8px', borderRadius: 99,
                }}>
                  {badge.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Session starten →
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FocusCustomerSelect
```

Expected: no errors on this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusCustomerSelect.tsx
git commit -m "feat(focus): FocusCustomerSelect — Kunden-Auswahl entry screen"
```

---

## Task 5: FocusCustomerPanel (left column)

**Files:**
- Create: `src/components/focus/FocusCustomerPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusCustomerPanel.tsx
import { useEffect } from 'react'
import { useAccountsStore } from '@/store/accounts.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useFinanceStore } from '@/store/finance.store'
import { ChevronLeft } from 'lucide-react'

interface Props {
  customerId: string | undefined
  customerName: string
  completedCount: number
  totalCount: number
  onBack: () => void
}

function kv(label: string, value: string, sub?: string, valueColor?: string) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 12px',
    }}>
      <div style={{
        fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor ?? 'var(--fg)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

const ACT_COLOR: Record<string, string> = {
  email: 'var(--info)', call: '#888', note: 'var(--accent)', invoice: 'oklch(72% 0.18 25)',
}

export function FocusCustomerPanel({ customerId, customerName, completedCount, totalCount, onBack }: Props) {
  const accounts   = useAccountsStore(s => s.accounts)
  const activities = useActivitiesStore(s => s.activities)
  const loadActs   = useActivitiesStore(s => s.loadForCustomer)
  const invoices   = useFinanceStore(s => s.invoices)

  useEffect(() => {
    if (customerId) loadActs(customerId).catch(() => {})
  }, [customerId, loadActs])

  const account = accounts.find(a => a.id === customerId)

  const customerInvoices = invoices.filter(i => i.accountId === customerId)
  const openInvoiceTotal = customerInvoices
    .filter(i => i.status !== 'paid')
    .reduce((sum, i) => sum + i.total, 0)

  const recentActs = [...activities]
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .slice(0, 4)

  const inits = customerName.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'oklch(8% 0 0)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Customer header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 99,
            background: 'linear-gradient(135deg, var(--accent), oklch(60% 0.25 280))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 11, color: 'var(--accent-ink)', flexShrink: 0,
          }}>
            {inits}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customerName}
            </div>
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'oklch(82% 0.2 125 / 0.1)', color: 'var(--accent)',
              padding: '2px 6px', borderRadius: 99, display: 'inline-block', marginTop: 2,
            }}>
              Aktiv · Session
            </div>
          </div>
        </div>

        {/* Session progress */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{
            fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 6,
          }}>
            Session-Fortschritt
          </div>
          <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, marginBottom: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width 400ms ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-dim)' }}>
            <span>{completedCount} von {totalCount}</span>
            <span style={{ color: 'var(--accent)' }}>{pct}%</span>
          </div>
        </div>

        {/* KPIs */}
        {kv('Pipeline-Phase', account?.pipelinePhaseLabel ?? '—', account?.status ?? undefined)}

        {kv('Letzter Kontakt',
          recentActs[0]
            ? `${Math.floor((Date.now() - new Date(recentActs[0].updatedAt ?? recentActs[0].createdAt).getTime()) / 86_400_000)} Tage`
            : '—',
          recentActs[0]?.type ?? undefined,
        )}
        {openInvoiceTotal > 0 && kv(
          'Offene Rechnungen',
          `${openInvoiceTotal.toLocaleString('de-DE')} €`,
          `${customerInvoices.filter(i => i.status !== 'paid').length} offen`,
          'oklch(72% 0.18 25)',
        )}

        {/* Contacts */}
        {account?.website && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', fontSize: 11, color: 'var(--fg-muted)' }}>
              <span style={{ color: 'var(--fg-dim)', fontSize: 10 }}>🌐</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.website}</span>
            </div>
          </div>
        )}

        {/* Activity timeline */}
        {recentActs.length > 0 && (
          <div>
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 8,
            }}>
              Letzte Aktivität
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {recentActs.map((act, i) => {
                const daysAgo = Math.floor((Date.now() - new Date(act.updatedAt ?? act.createdAt).getTime()) / 86_400_000)
                return (
                  <div key={act.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 0',
                    borderBottom: i < recentActs.length - 1 ? '1px solid oklch(50% 0 0 / 0.06)' : undefined,
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: 99, flexShrink: 0, marginTop: 4,
                      background: ACT_COLOR[act.type] ?? 'var(--fg-dim)',
                    }} />
                    <div style={{ flex: 1, fontSize: 10, color: 'var(--fg-dim)', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                        {act.title || act.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', flexShrink: 0, marginTop: 2 }}>
                      {daysAgo === 0 ? 'Heute' : `${daysAgo}d`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Back button */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%', padding: '8px 10px', borderRadius: 9,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-dim)', fontSize: 11, cursor: 'pointer',
          }}
        >
          <ChevronLeft size={13} />
          Alle Kunden
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the KPIs store has a `kpis` array**

```bash
grep -n "kpis:" src/store/kpis.store.ts | head -5
```

Expected: a line like `kpis: Kpi[]`. The import in `FocusCustomerPanel` can be removed if unused.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus/FocusCustomerPanel.tsx
git commit -m "feat(focus): FocusCustomerPanel — left column with KPIs, activity, session progress"
```

---

## Task 6: FocusBatchSidebar (right column — current customer's tasks)

**Files:**
- Modify: `src/components/focus/FocusBatchSidebar.tsx`

The current `FocusBatchSidebar` shows the global upcoming queue. Replace it with the customer-scoped batch view.

- [ ] **Step 1: Rewrite `FocusBatchSidebar.tsx`**

```tsx
// src/components/focus/FocusBatchSidebar.tsx
import { useTodosStore } from '@/store/todos.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { Todo } from '@/types/todo.types'

interface Props {
  stack: Todo[]         // customer-scoped stack from useFocusStack(customerId)
  currentIndex: number
  completedToday: number
  totalToday: number    // global todos-done count for today stats
}

function getTypeMeta(t: Todo): { icon: string; label: string; color: string; bg: string } {
  if (t.actionType === 'send_reminder')
    return { icon: '€', label: 'Mahnung',        color: 'oklch(72% 0.18 25)', bg: 'oklch(72% 0.18 25 / 0.1)' }
  if (t.actionType === 'create_invoice')
    return { icon: '€', label: 'Rechnung',        color: 'oklch(72% 0.18 25)', bg: 'oklch(72% 0.18 25 / 0.1)' }
  if (t.actionType === 'reply_mail')
    return { icon: '✉', label: 'Antwort',         color: 'var(--info)',          bg: 'oklch(78% 0.13 235 / 0.1)' }
  if (t.actionType === 'followup')
    return { icon: '↻', label: 'Follow-Up',       color: 'var(--warn)',          bg: 'oklch(82% 0.16 70 / 0.1)' }
  if (t.actionType === 'write_offer')
    return { icon: '↗', label: 'Angebot',         color: 'var(--accent)',        bg: 'var(--accent-soft)' }
  if (t.actionType === 'call')
    return { icon: '📞', label: 'Anruf',          color: 'var(--fg-muted)',      bg: 'oklch(50% 0 0 / 0.08)' }
  return    { icon: '✓', label: 'Task',            color: 'var(--fg-dim)',        bg: 'oklch(50% 0 0 / 0.07)' }
}

const isSimpleTask = (t: Todo) =>
  !t.actionType ||
  t.actionType === 'call' ||
  (t.checklist.length === 0 && !t.actionType)

export function FocusBatchSidebar({ stack, currentIndex, completedToday, totalToday }: Props) {
  const complete = useTodosStore(s => s.complete)
  const mailsSentToday = 0 // placeholder — no mail-sent counter in store yet

  const current  = stack[currentIndex]
  const openCount = stack.filter(t => t.status !== 'done').length

  return (
    <div style={{
      width: 260, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      background: 'oklch(8% 0 0)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px 10px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Alle Tasks</span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 99,
          background: 'oklch(82% 0.2 125 / 0.1)', color: 'var(--accent)',
        }}>
          {stack.length - openCount} / {stack.length}
        </span>
      </div>

      {/* Today stats strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { val: completedToday, lbl: 'Erledigt', color: 'var(--accent)' },
          { val: openCount,      lbl: 'Offen',    color: 'var(--fg)' },
          { val: mailsSentToday, lbl: 'Mails',    color: 'var(--info)' },
        ].map(({ val, lbl, color }, i) => (
          <div key={lbl} style={{
            flex: 1, padding: '10px 0', textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--border)' : undefined,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color }}>{val}</div>
            <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginTop: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Task tiles */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {stack.map((t, idx) => {
          const meta    = getTypeMeta(t)
          const isCurrent = idx === currentIndex
          const isDone  = t.status === 'done'

          return (
            <div
              key={t.id}
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${isCurrent ? 'oklch(82% 0.2 125 / 0.35)' : 'var(--border)'}`,
                boxShadow: isCurrent ? '0 0 0 1px oklch(82% 0.2 125 / 0.12)' : undefined,
                borderRadius: 11, padding: '11px 13px',
                opacity: isDone ? 0.35 : 1,
                display: 'flex', flexDirection: 'column', gap: 7,
                background: isCurrent ? 'oklch(82% 0.2 125 / 0.03)' : 'var(--surface-2)',
              }}
            >
              {/* Type row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 7,
                  background: meta.bg, color: meta.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {meta.icon}
                </div>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  textTransform: 'uppercase', fontWeight: 700, color: meta.color,
                }}>
                  {meta.label}
                </span>
                {isCurrent && (
                  <div style={{
                    marginLeft: 'auto', width: 6, height: 6, borderRadius: 99,
                    background: 'var(--accent)', boxShadow: '0 0 4px var(--accent)',
                  }} />
                )}
                {isDone && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>✓</span>
                )}
              </div>

              {/* Title */}
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.3 }}>{t.title}</div>

              {/* Quick-complete for simple tasks */}
              {isSimpleTask(t) && !isDone && !isCurrent && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => { complete(t.id).catch(() => {}) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 9px', borderRadius: 99, border: 'none',
                      background: 'oklch(50% 0 0 / 0.08)',
                      color: 'var(--fg-dim)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Sofort ✓
                  </button>
                </div>
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
git add src/components/focus/FocusBatchSidebar.tsx
git commit -m "feat(focus): FocusBatchSidebar — customer-scoped batch mini-tiles with quick-complete"
```

---

## Task 7: FocusSessionView (3-column orchestrator)

**Files:**
- Create: `src/components/focus/FocusSessionView.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/focus/FocusSessionView.tsx
import { useEffect, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useTodosStore } from '@/store/todos.store'
import { useFocusStack } from '@/hooks/useFocusStack'
import { FocusCustomerPanel } from './FocusCustomerPanel'
import { FocusBatchSidebar } from './FocusBatchSidebar'
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusCardInvoice } from './FocusCardInvoice'
import { FocusCardFollowUp } from './FocusCardFollowUp'
import { Sparkles } from 'lucide-react'

interface Props {
  customerId: string | undefined
  onBack: () => void
}

export function FocusSessionView({ customerId, onBack }: Props) {
  const focusApi    = useFocusStack(customerId)
  const { current, currentIndex, total, stack, prev, skip, complete, postpone, completedToday } = focusApi
  const allTodos    = useTodosStore(s => s.allTodos)
  const accounts    = useAccountsStore(s => s.accounts)
  const setAppView  = useUiStore(s => s.setAppView)
  const [showCorra, setShowCorra] = useState(false)

  const account = customerId ? accounts.find(a => a.id === customerId) : undefined
  const customerName = account?.name ?? (customerId ? 'Kunden-Session' : 'Allgemein')

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onBack(); return }
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); postpone() }
      if (e.key === ' ' &&
          current?.actionType !== 'send_reminder' &&
          current?.actionType !== 'create_invoice' &&
          current?.actionType !== 'followup' &&
          current?.actionType !== 'reply_mail') {
        e.preventDefault(); complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, skip, postpone, complete, current?.actionType, onBack])

  // When all tasks done, show success briefly then go back to customer select
  useEffect(() => {
    if (stack.length === 0) {
      const timer = setTimeout(onBack, 1800)
      return () => clearTimeout(timer)
    }
  }, [stack.length, onBack])

  // Progress dots in top bar
  const dots = Math.min(total, 5)
  const ProgressDots = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: dots }, (_, i) => (
        <div key={i} style={{
          width:  i === currentIndex ? 8 : 5,
          height: i === currentIndex ? 8 : 5,
          borderRadius: 99,
          background: i === currentIndex ? 'var(--accent)' : i < currentIndex ? 'oklch(50% 0 0 / 0.35)' : 'oklch(50% 0 0 / 0.2)',
          boxShadow: i === currentIndex ? '0 0 5px var(--accent)' : undefined,
          transition: 'all 260ms',
        }} />
      ))}
      {total > 5 && <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>+{total - 5}</span>}
    </div>
  )

  // Top bar
  const TopBar = (
    <div style={{
      height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 28px', gap: 20,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Focus</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)' }}>
          {customerName} · Session
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        {ProgressDots}
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', flexShrink: 0 }}>
          {total > 0 ? `${currentIndex + 1} / ${total}` : '—'}
        </span>
        <div style={{ flex: 1, height: 3, borderRadius: 99, background: 'oklch(50% 0 0 / 0.15)', overflow: 'hidden' }}>
          <div style={{ width: `${total > 0 ? ((currentIndex + 1) / total) * 100 : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width 300ms ease' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setShowCorra(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid var(--border)',
            background: showCorra ? 'var(--accent-soft)' : 'transparent',
            color: showCorra ? 'var(--accent)' : 'var(--fg-dim)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Sparkles size={12} />
          CORRA
        </button>
        <button
          type="button"
          onClick={() => setAppView('dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg)', fontSize: 11, cursor: 'pointer',
          }}
        >
          Schließen
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>ESC</span>
        </button>
      </div>
    </div>
  )

  // All done state
  if (stack.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {TopBar}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🙌</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            {customerName} — alles erledigt!
          </h2>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>Geht zurück zur Kunden-Auswahl…</p>
        </div>
      </div>
    )
  }

  if (!current) return null

  const isReminder = current.actionType === 'send_reminder'
  const isInvoice  = current.actionType === 'create_invoice'
  const isFollowup = current.actionType === 'followup' || current.actionType === 'reply_mail'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {TopBar}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: customer panel */}
        <FocusCustomerPanel
          customerId={customerId}
          customerName={customerName}
          completedCount={completedToday}
          totalCount={total + completedToday}
          onBack={onBack}
        />

        {/* Center: active card */}
        <div style={{
          flex: 1, minWidth: 0, overflowY: 'auto',
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

        {/* Right: batch sidebar */}
        <FocusBatchSidebar
          stack={stack}
          currentIndex={currentIndex}
          completedToday={completedToday}
          totalToday={allTodos.filter(t => t.status === 'done' && t.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. Fix any type mismatches before proceeding.

- [ ] **Step 3: Start the dev server and test the flow manually**

```bash
npm run tauri dev
```

Test checklist:
- Open Focus mode → see Kunden-Auswahl screen ✓
- Click a customer card → enter 3-column session ✓
- Left panel shows customer name + session progress ✓
- Center shows the active task card ✓
- Right shows the customer's task tiles ✓
- ESC goes back to Kunden-Auswahl ✓

- [ ] **Step 4: Commit**

```bash
git add src/components/focus/FocusSessionView.tsx
git commit -m "feat(focus): FocusSessionView — 3-column session orchestrator"
```

---

## Task 8: CORRA hint + WhatsApp tab on FocusCardReminder and FocusCardFollowUp

**Files:**
- Modify: `src/components/focus/FocusCardReminder.tsx`
- Modify: `src/components/focus/FocusCardFollowUp.tsx`

- [ ] **Step 1: Add CORRA hint + WhatsApp to `FocusCardReminder.tsx`**

Add these imports at the top of the file (after existing imports):
```ts
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
import { MessageCircle } from 'lucide-react'
```

Add channel state inside the component (after existing `useState` calls):
```ts
const [channel, setChannel] = useState<'email' | 'whatsapp'>('email')
```

Add the hint call after `dunningLevel` is computed:
```ts
const corraHint = useCorraContextHint(
  invoice?.accountId,
  account?.name ?? '',
  'reminder',
  invoice?.id,
)
```

Replace the existing `{/* Channel picker + CORRA label */}` block's channel buttons with:
```tsx
<div style={{ display: 'flex', gap: 6 }}>
  <button
    type="button"
    onClick={() => setChannel('email')}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 8,
      background: channel === 'email' ? 'var(--accent)' : 'transparent',
      color: channel === 'email' ? 'var(--accent-ink)' : 'var(--fg-dim)',
      border: channel === 'email' ? 'none' : '1px solid var(--border)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}
  >
    <Mail size={12} /> E-Mail
  </button>
  <button
    type="button"
    onClick={() => setChannel('whatsapp')}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 8,
      background: channel === 'whatsapp' ? 'var(--accent)' : 'transparent',
      color: channel === 'whatsapp' ? 'var(--accent-ink)' : 'var(--fg-dim)',
      border: channel === 'whatsapp' ? 'none' : '1px solid var(--border)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}
  >
    <MessageCircle size={12} /> WhatsApp
  </button>
</div>
```

Add the CORRA hint box **before** `{/* Compose area */}` (between the description text and the compose block):
```tsx
{corraHint && (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 9,
    padding: '11px 14px', borderRadius: 10,
    background: 'oklch(60% 0.25 280 / 0.06)',
    border: '1px solid oklch(60% 0.25 280 / 0.15)',
  }}>
    <span style={{
      width: 22, height: 22, borderRadius: 99, flexShrink: 0,
      background: 'oklch(60% 0.25 280 / 0.2)', color: 'oklch(75% 0.2 280)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
    }}>✦</span>
    <span style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
      <span style={{ color: 'oklch(75% 0.2 280)', fontWeight: 500 }}>CORRA: </span>
      {corraHint}
    </span>
  </div>
)}
```

Update the `handleSend` function to show a toast when WhatsApp is selected:
```ts
const handleSend = async () => {
  if (channel === 'whatsapp') {
    showToast({ message: 'WhatsApp-Versand kommt bald.', variant: 'info' })
    return
  }
  // ... existing email send logic unchanged
}
```

Hide the `{/* BETREFF */}` row when channel === 'whatsapp':
```tsx
{channel === 'email' && (
  <div style={{ /* BETREFF row — unchanged */ }}>
    {/* ... */}
  </div>
)}
```

- [ ] **Step 2: Apply the same CORRA hint + WhatsApp to `FocusCardFollowUp.tsx`**

Add imports:
```ts
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
import { MessageCircle } from 'lucide-react'
```

Add state:
```ts
const [channel, setChannel] = useState<'email' | 'whatsapp'>('email')
```

Add hint (after `account` is resolved):
```ts
const corraHint = useCorraContextHint(
  todo.customerId,
  account?.name ?? '',
  'followup',
)
```

Add the channel buttons and CORRA hint box using the exact same JSX as in `FocusCardReminder` above (same structure, same styling).

In `handleSend`, add the WhatsApp guard at the top:
```ts
if (channel === 'whatsapp') {
  showToast({ message: 'WhatsApp-Versand kommt bald.', variant: 'info' })
  return
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "FocusCardReminder|FocusCardFollowUp"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/focus/FocusCardReminder.tsx src/components/focus/FocusCardFollowUp.tsx
git commit -m "feat(focus): CORRA hint + WhatsApp channel tab on Reminder and FollowUp cards"
```

---

## Task 9: CORRA hint + Schnellnotiz on FocusCardDefault, CORRA hint on FocusCardInvoice

**Files:**
- Modify: `src/components/focus/FocusCardDefault.tsx`
- Modify: `src/components/focus/FocusCardInvoice.tsx`

- [ ] **Step 1: Add CORRA hint to `FocusCardDefault.tsx`**

Add import:
```ts
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
```

Add hint call inside `FocusCardDefault` (after `account` is resolved):
```ts
const corraHint = useCorraContextHint(
  todo.customerId,
  account?.name ?? '',
  'general',
)
```

Insert the CORRA hint box **after the notes paragraph** and **before `{/* Checklist */}`**:
```tsx
{corraHint && (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 9,
    padding: '11px 14px', borderRadius: 10,
    background: 'oklch(60% 0.25 280 / 0.06)',
    border: '1px solid oklch(60% 0.25 280 / 0.15)',
  }}>
    <span style={{
      width: 22, height: 22, borderRadius: 99, flexShrink: 0,
      background: 'oklch(60% 0.25 280 / 0.2)', color: 'oklch(75% 0.2 280)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
    }}>✦</span>
    <span style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
      <span style={{ color: 'oklch(75% 0.2 280)', fontWeight: 500 }}>CORRA: </span>
      {corraHint}
    </span>
  </div>
)}
```

- [ ] **Step 2: Add Schnellnotiz to `FocusCardDefault.tsx`**

Add these imports:
```ts
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
```

Add state:
```ts
const [noteText, setNoteText]   = useState('')
const [showNote, setShowNote]   = useState(false)
const [savingNote, setSavingNote] = useState(false)
const createActivity = useActivitiesStore(s => s.create)
const userId         = useAuthStore(s => s.user?.id)
```

Add the Schnellnotiz block **before `{/* Actions */}`**:
```tsx
{/* Schnellnotiz */}
{todo.customerId && (
  <div>
    {!showNote ? (
      <button
        type="button"
        onClick={() => setShowNote(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '10px 14px', borderRadius: 10,
          border: '1px dashed var(--border)', background: 'transparent',
          color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 14 }}>✎</span>
        Schnellnotiz hinzufügen…
      </button>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          autoFocus
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Notiz…"
          rows={3}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', fontSize: 13, outline: 'none',
            resize: 'none', fontFamily: 'inherit', lineHeight: 1.6,
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={!noteText.trim() || savingNote}
            onClick={async () => {
              if (!noteText.trim() || !todo.customerId || !workspaceId || !userId) return
              setSavingNote(true)
              try {
                await createActivity({
                  workspaceId,
                  createdBy: userId,
                  accountId: todo.customerId,
                  customerId: todo.customerId,
                  type: 'note',
                  title: 'Schnellnotiz aus Focus',
                  body: noteText.trim(),
                })
                setNoteText('')
                setShowNote(false)
              } catch {
                // fail silently — note is a convenience feature
              } finally {
                setSavingNote(false)
              }
            }}
            style={{
              padding: '7px 16px', borderRadius: 99, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {savingNote ? 'Speichert…' : 'Speichern'}
          </button>
          <button
            type="button"
            onClick={() => { setShowNote(false); setNoteText('') }}
            style={{
              padding: '7px 14px', borderRadius: 99,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
            }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

Note: `workspaceId` is already available via `useWorkspaceStore` which is already imported in the component.

- [ ] **Step 3: Add CORRA hint to `FocusCardInvoice.tsx`**

Add import:
```ts
import { useCorraContextHint } from '@/hooks/useCorraContextHint'
```

Add hint call after `account` is resolved:
```ts
const corraHint = useCorraContextHint(
  invoice?.accountId,
  account?.name ?? '',
  'invoice',
  invoice?.id,
)
```

Insert the CORRA hint box **after `{todo.notes && ...}` paragraph** and **before `{/* Invoice preview */}`**:
```tsx
{corraHint && (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 9,
    padding: '11px 14px', borderRadius: 10,
    background: 'oklch(60% 0.25 280 / 0.06)',
    border: '1px solid oklch(60% 0.25 280 / 0.15)',
  }}>
    <span style={{
      width: 22, height: 22, borderRadius: 99, flexShrink: 0,
      background: 'oklch(60% 0.25 280 / 0.2)', color: 'oklch(75% 0.2 280)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
    }}>✦</span>
    <span style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
      <span style={{ color: 'oklch(75% 0.2 280)', fontWeight: 500 }}>CORRA: </span>
      {corraHint}
    </span>
  </div>
)}
```

- [ ] **Step 4: Run full TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: 0 errors.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/focus/FocusCardDefault.tsx src/components/focus/FocusCardInvoice.tsx
git commit -m "feat(focus): CORRA hint on all cards + Schnellnotiz on FocusCardDefault"
```

---

## Final: End-to-end smoke test

- [ ] **Start dev app**

```bash
npm run tauri dev
```

- [ ] **Walk through the full flow:**

1. Klicke "Focus" im Hauptmenü → Kunden-Auswahl-Screen erscheint ✓
2. Kunden-Karten zeigen Tasks mit Icons und Dringlichkeits-Badge ✓
3. Klicke einen Kunden → 3-Spalten-Session öffnet sich ✓
4. Linkes Panel zeigt Kunden-KPIs + Session-Fortschrittsbalken ✓
5. Rechtes Panel zeigt alle Tasks des Kunden als Mini-Kacheln ✓
6. Aktiver Task ist grün hervorgehoben ✓
7. Simpler Task (kein actionType) hat "Sofort ✓" Button in Mini-Kachel ✓
8. Klicke "Sofort ✓" → Task verschwindet aus der Kachel (ausgegraut) ✓
9. CORRA-Hint erscheint auf den Karten wenn Kunden-Kontext vorhanden ✓
10. E-Mail / WhatsApp Tab auf Reminder- und FollowUp-Karten sichtbar ✓
11. WhatsApp klicken → Toast "kommt bald" ✓
12. Schnellnotiz auf generischen Tasks öffnet Textarea ✓
13. Alle Tasks erledigt → "alles erledigt" Screen → auto-zurück zur Auswahl ✓
14. ESC aus Session → Kunden-Auswahl ✓
15. ESC aus Auswahl → Dashboard ✓

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat(focus): Focus Mode v2 — Kunden-Session + Batch-Grid complete"
```
