# Lead Score UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pipe `leadScore`/`scoreFactors` from the Rust backend through the Customer type to the UI, replace the frontend-computed Health Score card with a real Lead Score card (ring + breakdown bars), and add a compact score badge to the client list sidebar.

**Architecture:** Three tasks in dependency order — data layer first (Customer type + service mapping), then DashboardPane (replaces Health Score card), then ClientsRoute (adds badge). No new files, no Rust changes, no new stores.

**Tech Stack:** TypeScript, React, Tailwind CSS, Vitest, Zustand (`useCustomersStore`)

---

## File Map

| File | Change |
|------|--------|
| `src/types/customer.types.ts` | Add `leadScore: number`, `scoreFactors: Record<string, number>` to `Customer` |
| `src/services/customer.service.ts` | Map two new fields in `accountToCustomer()` |
| `src/services/customer.service.test.ts` | Update `mockCustomer` + add mapping test |
| `src/components/customer/tabs/DashboardPane.tsx` | Replace Health Score card; add score helpers |
| `src/routes/ClientsRoute.tsx` | Add `scoreColor` helper + score badge in client list |

---

## Task 1: Data Layer — Customer type + service mapping

**Files:**
- Modify: `src/types/customer.types.ts`
- Modify: `src/services/customer.service.ts`
- Modify: `src/services/customer.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new test to `src/services/customer.service.test.ts`. Also update `mockCustomer` to include the two new required fields (TypeScript will require this once we add them to the interface). The new test verifies that `accountToCustomer` maps `leadScore` and `scoreFactors` from the Account response.

Full updated file:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { CustomerService } from './customer.service'
import type { Customer } from '@/types/customer.types'

const mockCustomer: Customer = {
  id: '1',
  name: 'Test GmbH',
  status: 'aktiv',
  priority: 'normal',
  tags: [],
  isPrivate: false,
  workspaceId: 'ws-1',
  goals: [],
  socialLinks: '{}',
  leadScore: 0,
  scoreFactors: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('CustomerService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAll calls get_accounts command with workspaceId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([mockCustomer])
    const result = await CustomerService.getAll('ws-1')
    expect(invoke).toHaveBeenCalledWith('get_accounts', { workspaceId: 'ws-1' })
    expect(result[0].id).toBe('1')
  })

  it('upsert calls upsert_account with payload', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockCustomer)
    const payload = { name: 'Test GmbH', workspaceId: 'ws-1', createdBy: 'u-1' }
    await CustomerService.upsert(payload)
    expect(invoke).toHaveBeenCalledWith('upsert_account', expect.objectContaining({ payload: expect.any(Object) }))
  })

  it('delete calls delete_account with id and workspaceId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await CustomerService.delete('1', 'ws-1')
    expect(invoke).toHaveBeenCalledWith('delete_account', { id: '1', workspaceId: 'ws-1' })
  })

  it('maps leadScore and scoreFactors from account to customer', async () => {
    const mockAccount = {
      id: '2', name: 'Hot Lead GmbH', kind: 'company',
      status: 'aktiv', priority: 'high', tags: [], goals: [],
      isPrivate: false, workspaceId: 'ws-1', createdBy: 'u-1',
      socialLinks: '{}', leadScore: 75,
      scoreFactors: { qualified_meeting: 25, strong_interest: 50 },
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(invoke).mockResolvedValueOnce([mockAccount])
    const result = await CustomerService.getAll('ws-1')
    expect(result[0].leadScore).toBe(75)
    expect(result[0].scoreFactors).toEqual({ qualified_meeting: 25, strong_interest: 50 })
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```powershell
npm run test:run -- src/services/customer.service.test.ts
```

Expected: TypeScript error — `leadScore` does not exist on type `Customer`. The last test also fails because the mapping doesn't exist yet.

- [ ] **Step 3: Add fields to Customer type**

Full updated `src/types/customer.types.ts`:

```ts
import type { TimestampedEntity } from './common.types'

export type CustomerStatus = 'lead' | 'aktiv' | 'inaktiv' | 'lost'
export type Priority = 'low' | 'normal' | 'high'

export interface SocialLinks {
  instagram?: string
  linkedin?: string
  website?: string
}

export interface Customer extends TimestampedEntity {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status: CustomerStatus
  priority: Priority
  tags: string[]
  isPrivate: boolean
  workspaceId: string
  industry?: string
  contactPerson?: string
  goals: string[]
  socialLinks: string
  internalNotes?: string
  street?: string
  zip?: string
  city?: string
  country?: string
  leadScore: number
  scoreFactors: Record<string, number>
}

export interface UpsertCustomerPayload {
  id?: string
  name: string
  company?: string
  email?: string
  phone?: string
  status?: CustomerStatus
  priority?: Priority
  tags?: string[]
  workspaceId: string
  createdBy: string
  industry?: string
  contactPerson?: string
  goals?: string[]
  socialLinks?: string
  internalNotes?: string
  street?: string
  zip?: string
  city?: string
  country?: string
}
```

- [ ] **Step 4: Map fields in customer.service.ts**

In `accountToCustomer()`, add two lines after `country: a.country,`:

```ts
function accountToCustomer(a: Account): Customer {
  return {
    id: a.id,
    name: a.name,
    company: a.kind === 'company' ? a.name : undefined,
    status: (a.status === 'prospect' ? 'lead' : a.status === 'churned' ? 'lost' : a.status) as Customer['status'],
    priority: (a.priority === 'vip' ? 'high' : a.priority) as Customer['priority'],
    tags: a.tags,
    isPrivate: a.isPrivate,
    workspaceId: a.workspaceId,
    industry: a.industry,
    goals: a.goals,
    socialLinks: a.socialLinks,
    internalNotes: a.internalNotes,
    street: a.street,
    zip: a.zip,
    city: a.city,
    country: a.country,
    leadScore: a.leadScore,
    scoreFactors: a.scoreFactors,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}
```

- [ ] **Step 5: Run test — verify it passes**

```powershell
npm run test:run -- src/services/customer.service.test.ts
```

Expected: 4 tests pass. No TypeScript errors.

- [ ] **Step 6: Typecheck**

```powershell
npm run typecheck
```

Expected: no errors. If `CustomerModal.tsx` or `ProfilPane.tsx` construct `Customer` objects inline, TypeScript may flag missing `leadScore`/`scoreFactors` — fix by adding `leadScore: 0, scoreFactors: {}` to those literal objects.

- [ ] **Step 7: Commit**

```powershell
git add src/types/customer.types.ts src/services/customer.service.ts src/services/customer.service.test.ts
git commit -m "feat(crm): pipe leadScore + scoreFactors through Customer type"
```

---

## Task 2: Lead Score Card in DashboardPane

Replace the frontend-computed Health Score card with the real Lead Score card (ring + horizontal bar breakdown).

**Files:**
- Modify: `src/components/customer/tabs/DashboardPane.tsx`

**Context:** The file is ~338 lines. Key structural changes:
- Remove `computeHealthScore`, old `scoreColor`, old `scoreLabel` functions (top of file)
- Add new `scoreColor`, `scoreLabel`, `prettyFactor` functions
- Add `useCustomersStore` import + `customer`/`leadScore`/`scoreFactors`/`factors` in component body
- Replace the Health Score card JSX (~lines 152–170) with the new Lead Score card

- [ ] **Step 1: Replace helper functions**

At the top of `src/components/customer/tabs/DashboardPane.tsx`, remove:
```ts
function computeHealthScore(...) { ... }   // lines 10–31
function scoreColor(score: number) { ... } // lines 33–37
function scoreLabel(score: number) { ... } // lines 38–42
```

Replace with:
```ts
function scoreColor(score: number): string {
  if (score >= 70) return '#D0FC69'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Hot'
  if (score >= 40) return 'Warm'
  return 'Cold'
}

function prettyFactor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
```

- [ ] **Step 2: Add useCustomersStore import**

At the top of the file, add the import alongside existing store imports:

```ts
import { useCustomersStore } from '@/store/customers.store'
```

- [ ] **Step 3: Update component body**

Inside `DashboardPane({ customerId })`, remove:
```ts
const score = computeHealthScore(todos, notes, followUps)
const color = scoreColor(score)
const label = scoreLabel(score)
```

Add (after the existing store subscriptions, before `const allActivity`):
```ts
const customer     = useCustomersStore(s => s.customers.find(c => c.id === customerId))
const leadScore    = customer?.leadScore ?? 0
const scoreFactors = customer?.scoreFactors ?? {}
const factors      = Object.entries(scoreFactors)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 6)
```

- [ ] **Step 4: Replace Health Score card JSX**

Find the Health Score card (inside `{/* ── Row 1: KPIs ── */}`, first `<Card>` block, roughly lines 152–170):

```tsx
{/* Health Score */}
<Card>
  <div className="flex items-center gap-4">
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border2)" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round" strokeDasharray={`${score} ${100 - score}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-[var(--text)]">{score}</span>
      </div>
    </div>
    <div>
      <p className="text-[10px] text-[var(--text2)] uppercase tracking-wide mb-0.5">Health Score</p>
      <p className="text-sm font-semibold" style={{ color }}>{label}</p>
      <p className="text-[10px] text-[var(--text2)] mt-1 opacity-60">Bald KI-gesteuert</p>
    </div>
  </div>
</Card>
```

Replace entirely with:

```tsx
{/* Lead Score */}
<Card>
  <div className="flex items-center gap-4">
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border2)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.9" fill="none"
          stroke={scoreColor(leadScore)} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${leadScore} ${100 - leadScore}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold" style={{ color: scoreColor(leadScore) }}>{leadScore}</span>
      </div>
    </div>
    <div>
      <p className="text-[10px] text-[var(--text2)] uppercase tracking-wide mb-0.5">Lead Score</p>
      <p className="text-sm font-semibold" style={{ color: scoreColor(leadScore) }}>{scoreLabel(leadScore)}</p>
      <p className="text-[10px] text-[var(--text2)] mt-1 opacity-60">Rules Engine</p>
    </div>
  </div>

  <div className="mt-4 pt-3 border-t border-[var(--border)]">
    {factors.length === 0 ? (
      <p className="text-xs text-[var(--text2)]">Noch keine Aktivität</p>
    ) : (
      <div className="flex flex-col gap-2">
        {factors.map(([key, points]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text2)] w-28 truncate flex-shrink-0">
              {prettyFactor(key)}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((points / leadScore) * 100)}%`,
                  background: scoreColor(leadScore),
                  opacity: 0.85,
                }}
              />
            </div>
            <span
              className="text-[11px] font-medium w-8 text-right flex-shrink-0"
              style={{ color: scoreColor(leadScore) }}
            >
              +{points}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
</Card>
```

- [ ] **Step 5: Typecheck**

```powershell
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Visual check**

Start the app (`npm run tauri dev`), open a client, go to the Dashboard tab. Verify:
- Ring shows 0 with red color and "Cold" label when no rules have fired
- "Noch keine Aktivität" text appears in the breakdown area
- The other two KPI cards (Letzte Interaktion, Nächste Aktion) are unchanged

- [ ] **Step 7: Commit**

```powershell
git add src/components/customer/tabs/DashboardPane.tsx
git commit -m "feat(crm): Lead Score Card replaces Health Score in DashboardPane"
```

---

## Task 3: Score Badge in Client List

Add a small colored score badge to each client row in the left sidebar of `ClientsRoute`.

**Files:**
- Modify: `src/routes/ClientsRoute.tsx`

- [ ] **Step 1: Add scoreColor helper**

Add this function near the top of `src/routes/ClientsRoute.tsx`, after the existing `relativeTime` helper:

```ts
function scoreColor(score: number): string {
  if (score >= 70) return '#D0FC69'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}
```

- [ ] **Step 2: Add badge to client list rows**

Find the client list button inside `filtered.map(c => ...)`. The inner layout currently is:

```tsx
<div className="min-w-0 flex-1">
  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
  <p className="text-xs text-[var(--text2)] truncate">{relativeTime(c.updatedAt)}</p>
</div>
```

Replace with:

```tsx
<div className="min-w-0 flex-1">
  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
  <div className="flex items-center justify-between gap-1">
    <p className="text-xs text-[var(--text2)] truncate">{relativeTime(c.updatedAt)}</p>
    {c.leadScore > 0 && (
      <span
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{
          background: scoreColor(c.leadScore) + '22',
          color: scoreColor(c.leadScore),
        }}
      >
        {c.leadScore}
      </span>
    )}
  </div>
</div>
```

- [ ] **Step 3: Typecheck**

```powershell
npm run typecheck
```

Expected: no errors. `c.leadScore` is now available because Task 1 added it to the `Customer` type.

- [ ] **Step 4: Visual check**

With the app running, look at the client list sidebar. Verify:
- Clients with `leadScore === 0` show no badge (silent)
- Clients with score 1–39 show a red badge
- Clients with score 40–69 show an amber badge
- Clients with score 70–100 show a green (#D0FC69) badge

To test with a real score: log an activity with outcome "interested" for a client — the Rules Engine fires and updates `lead_score` in the DB. Reload the client list.

- [ ] **Step 5: Run full test suite**

```powershell
npm run test:run
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/routes/ClientsRoute.tsx
git commit -m "feat(crm): lead score badge in client list sidebar"
```
