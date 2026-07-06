# Legacy pipelineStage-Cleanup + Nav-Badge-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead `Lead.pipelineStage` concept (frozen at `'inbox'` for every real lead, zero live writers) from the TypeScript/React layer, and fix the Nav-Sidebar "Leads" badge, which currently reads that dead field and therefore shows "all leads" instead of "new/unworked leads".

**Architecture:** Pure TypeScript/React cleanup — no Rust, no DB migration. The `PipelineStage` type and `Lead.pipelineStage` field are deleted along with everything that only exists to serve them (4 dead selectors in `leads.store.ts`, and a fully dead `updateStage` vertical spanning `leads.store.ts` → `accounts.gateway.ts` → `leads.service.ts`, discovered during planning to have zero callers and to be typed with `PipelineStage`, so it cannot survive the type's removal). The Nav badge is fixed by extracting a small pure helper function (matching the existing `src/lib/leads/*.ts` pattern) that counts leads in the first *open* lead stage, using the live `leadStatus` + `useLeadStagesStore` system that `LeverageLeadsRoute` already uses.

**Tech Stack:** React, TypeScript, Zustand, Vitest.

## Global Constraints

- No Rust/DB changes. The `accounts.pipeline_stage` SQLite/Supabase column stays untouched (out of scope per approved spec).
- Wire format to Rust must stay compatible: omitting `pipelineStage` from `UpsertLeadPayload` is safe because Rust's `pipeline_stage: Option<String>` field defaults to `None` → `"inbox"` when the JSON key is absent (serde's built-in behavior for missing `Option<T>` fields).
- `npx vitest run`, `npx tsc --noEmit` must stay green after every task. `cargo test` is unaffected (no Rust touched) but is safe to skip re-running.

---

### Task 1: Remove `PipelineStage` type, `Lead.pipelineStage`, and the dead `updateStage` vertical

**Files:**
- Modify: `src/types/lead.types.ts`
- Modify: `src/store/leads.store.ts`
- Modify: `src/data/accounts.gateway.ts`
- Modify: `src/services/leads.service.ts`
- Modify: `src/data/accounts.mapper.ts`
- Modify: `src/lib/lead-payload.ts`
- Modify: `src/data/accounts.mapper.test.ts`
- Modify: `src/store/leads.store.test.ts`
- Modify: `src/lib/lead-payload.test.ts`
- Modify: `src/lib/ai/corra-intelligence.test.ts`
- Modify: `src/lib/tour/fixtures.ts`

**Interfaces:**
- Produces: `Lead` (no `pipelineStage` field), `UpsertLeadPayload` (no `pipelineStage` field) — both still exported from `@/types/lead.types`, used unchanged by Task 2.
- Removed from the public surface (must not be referenced anywhere after this task): `PipelineStage` type, `Lead.pipelineStage`, `UpsertLeadPayload.pipelineStage`, `useLeadsStore().newLeads/attemptedLeads/warmLeads/lostLeads`, `useLeadsStore().updateStage`, `AccountsGateway.updateStage`, `LeadsService.updateStage`.

This task is a coordinated deletion across production code and its tests — there is no new behavior to drive with a failing test first, so verification happens via the full type-check + test suite at the end instead of per-file red/green.

- [ ] **Step 1: Remove `PipelineStage` type and `pipelineStage` field from `src/types/lead.types.ts`**

Replace the whole file content from line 24 (`export type PipelineStage =`) through the end of the `Lead` interface (line 56) with:

```typescript
// Stage names stored in DB (migrated to German in v19; accepts any string for custom stages)
export type LeadStatus = 'new' | 'attempted' | 'warm' | 'lost_reengage'
  | 'neu' | 'kontaktiert' | 'qualifiziert' | 'disqualifiziert'
  | string

export type LeadSource = 'zoom' | 'generic' | 'manual' | 'inbox' | 'linkedin' | 'website' | 'event' | 'newsletter'

export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string | null
  phone: string | null
  accountType: 'lead'
  leadStatus: LeadStatus
  leadSource: LeadSource
  leadSourceDetail: string | null
  companyName: string | null
  linkedinUrl: string | null
  lastActivityAt: string | null
  nextFollowUpAt: string | null
  engagementScore: number
  reEngageDate: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
}
```

(This drops the `PipelineStage` type definition, the `// Canonical pipeline stage` / `pipelineStage: PipelineStage` line, and the now-inaccurate `// Legacy (still on DB, preserved for compat)` comment — that comment sat directly above `leadStatus`, which is actually the live field; keeping it would mislead the next reader.)

Then, in the `UpsertLeadPayload` interface, remove the `pipelineStage?: PipelineStage` line so it reads:

```typescript
export interface UpsertLeadPayload {
  id?: string
  workspaceId: string
  name: string
  email?: string
  phone?: string
  leadStatus?: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  companyName?: string
  linkedinUrl?: string
  reEngageDate?: string
}
```

Leave `BulkUpdateLeadsPayload` and `PendingLead` untouched.

- [ ] **Step 2: Remove the dead `updateStage` action and the 4 dead selectors from `src/store/leads.store.ts`**

Change the import on line 11 from:

```typescript
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload, PipelineStage } from '@/types/lead.types'
```

to:

```typescript
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload } from '@/types/lead.types'
```

In the `LeadsState` interface, remove the line `updateStage: (id: string, stage: PipelineStage) => Promise<void>` and the four lines `newLeads: () => Lead[]`, `attemptedLeads: () => Lead[]`, `warmLeads: () => Lead[]`, `lostLeads: () => Lead[]`. The interface's stage-related section should read:

```typescript
  /** Board-Drag: Karte SOFORT lokal in die Zielspalte (leadStatus) setzen, dann im
   *  Hintergrund persistieren; bei Fehler zurückrollen. Kein await/Reload → kein Ruckeln. */
  moveLeadStage: (id: string, status: string) => void
  reEngageLeads: () => Lead[]
```

In the implementation object, remove the entire `updateStage: async (id, stage) => { ... }` block (originally lines 187-195, directly above `moveLeadStage`), and remove the four lines:

```typescript
  newLeads: () => get().leads.filter(l => l.pipelineStage === 'inbox'),
  attemptedLeads: () => get().leads.filter(l => l.pipelineStage === 'waiting_reply'),
  warmLeads: () => get().leads.filter(l => l.pipelineStage === 'replied'),
  lostLeads: () => get().leads.filter(l => l.pipelineStage === 'lost'),
```

leaving only `reEngageLeads: () => get().leads.filter(l => l.reEngageDate != null),` at the end of the object.

- [ ] **Step 3: Remove `updateStage` from `src/data/accounts.gateway.ts`**

Change the import on line 7 from:

```typescript
import type { Lead, UpsertLeadPayload, PipelineStage, BulkUpdateLeadsPayload } from '@/types/lead.types'
```

to:

```typescript
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload } from '@/types/lead.types'
```

Remove the entire method:

```typescript
  async updateStage(id: string, stage: PipelineStage): Promise<Lead> {
    if (!shared()) return LeadsService.updateStage(id, stage)
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('accounts')
      .update({ pipeline_stage: stage, updated_at: now })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return accountRowToLead(data)
  },
```

- [ ] **Step 4: Remove `updateStage` from `src/services/leads.service.ts`**

Change the import on line 3 from:

```typescript
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload, PendingLead, PipelineStage } from '@/types/lead.types'
```

to:

```typescript
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload, PendingLead } from '@/types/lead.types'
```

Remove the entire method:

```typescript
  updateStage(id: string, stage: PipelineStage): Promise<Lead> {
    return invoke('update_lead_stage', { id, stage })
  },
```

- [ ] **Step 5: Remove `pipelineStage` from `src/data/accounts.mapper.ts`**

In `accountRowToLead`, remove the line `pipelineStage: r.pipeline_stage ?? 'inbox',`.

In `leadPayloadToAccountRow`, remove the line `pipeline_stage: p.pipelineStage ?? 'inbox',`.

- [ ] **Step 6: Remove `pipelineStage` from `src/lib/lead-payload.ts`**

Remove the line `pipelineStage: lead.pipelineStage,` from the returned object in `leadToUpsertPayload`.

Also update the doc comment above the function — remove the now-irrelevant `pipeline_stage→"inbox"` clause so the comment doesn't reference a field this function no longer sends:

```typescript
/**
 * Rebuild a complete UpsertLeadPayload from an existing lead.
 *
 * The Rust `upsert_lead` command overwrites every column from the payload on
 * conflict, falling back to defaults when a field is absent (lead_status→"neu",
 * re_engage_date→NULL). A partial payload therefore silently resets the
 * lead's stage and pulls re-engage leads back onto the board. Editing one
 * field must round-trip the whole lead.
 */
```

- [ ] **Step 7: Update `src/data/accounts.mapper.test.ts`**

Remove `pipeline_stage: 'inbox',` from the shared `row` fixture object (near the top of the file).

Remove the assertion `expect(lead.pipelineStage).toBe('inbox')` from the `'accountRowToLead mappt snake_case → camelCase'` test.

Remove `pipelineStage: 'inbox',` from the full-object `toEqual(...)` in the `'accountRowToLead mappt ALLE 19 Felder vollständig'` test, and rename that test to `'accountRowToLead mappt ALLE 18 Felder vollständig'` (one field fewer after removal).

Remove `expect(r.pipeline_stage).toBe('inbox')   // default` from the `'leadPayloadToAccountRow setzt account_type=lead, created_by und defaults'` test.

In the `'leadPayloadToAccountRow reicht EXPLIZITE Werte durch (nicht die Defaults)'` test, remove `pipelineStage: 'won',` from the input object and remove `expect(r.pipeline_stage).toBe('won')` from the assertions.

- [ ] **Step 8: Update `src/store/leads.store.test.ts`**

Remove `updateStage: vi.fn(),` from the `LeadsService` mock factory (the method no longer exists on the real module).

Remove `pipelineStage: 'replied',` from the `mockLead` fixture object.

- [ ] **Step 9: Update `src/lib/lead-payload.test.ts`**

Remove `pipelineStage: 'replied',` from the `makeLead()` helper's default object.

Remove the assertion `expect(payload.pipelineStage).toBe('replied')` from the `'round-trips every column the backend overwrites on upsert'` test.

- [ ] **Step 10: Update `src/lib/ai/corra-intelligence.test.ts`**

Change line `const lead = { id: 'lead-1', name: 'Sven Klar', pipelineStage: 'replied' } as Lead` to:

```typescript
    const lead = { id: 'lead-1', name: 'Sven Klar' } as Lead
```

Change line `const lead = { id: 'lead-cold', name: 'Alte Spur', pipelineStage: 'waiting_reply', lastActivityAt: '2026-01-01T00:00:00.000Z' } as Lead` to:

```typescript
    const lead = {
      id: 'lead-cold', name: 'Alte Spur',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
    } as Lead
```

Change line `const won = { id: 'l-won', name: 'Gewonnen', pipelineStage: 'won', lastActivityAt: '2026-01-01T00:00:00.000Z' } as Lead` to:

```typescript
    const won = { id: 'l-won', name: 'Gewonnen', lastActivityAt: '2026-01-01T00:00:00.000Z' } as Lead
```

- [ ] **Step 11: Update `src/lib/tour/fixtures.ts`**

In `tourLeads`, remove `pipelineStage: 'inbox', ` from the `tour-lead-1` object and `pipelineStage: 'replied', ` from the `tour-lead-2` object. The array should read:

```typescript
export const tourLeads: Lead[] = [
  { id: 'tour-lead-1', workspaceId: TOUR_WS, name: 'Studio Voss', accountType: 'lead',
    leadStatus: 'neu', leadSource: 'website', engagementScore: 20,
    createdAt: TS, updatedAt: TS, email: 'voss@example.com', phone: null, leadSourceDetail: null,
    companyName: 'Studio Voss', linkedinUrl: null, lastActivityAt: null, nextFollowUpAt: null,
    reEngageDate: null, convertedAt: null },
  { id: 'tour-lead-2', workspaceId: TOUR_WS, name: 'Café Mira', accountType: 'lead',
    leadStatus: 'warm', leadSource: 'event', engagementScore: 55,
    createdAt: TS, updatedAt: TS, email: 'mira@example.com', phone: null, leadSourceDetail: null,
    companyName: 'Café Mira', linkedinUrl: null, lastActivityAt: null, nextFollowUpAt: null,
    reEngageDate: null, convertedAt: null },
]
```

- [ ] **Step 12: Verify nothing else references the removed API**

Run:

```bash
grep -rn "pipelineStage\|PipelineStage" src/ --include='*.ts' --include='*.tsx'
```

Expected: no output (empty). If anything appears outside the 11 files above, inspect and remove it before continuing — it means an additional caller wasn't caught during planning.

- [ ] **Step 13: Type-check and run the full test suite**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

Run:

```bash
npx vitest run
```

Expected: all tests pass (same count as before minus any assertions removed in Steps 7-11; no new failures).

- [ ] **Step 14: Commit**

```bash
git add src/types/lead.types.ts src/store/leads.store.ts src/data/accounts.gateway.ts src/services/leads.service.ts src/data/accounts.mapper.ts src/lib/lead-payload.ts src/data/accounts.mapper.test.ts src/store/leads.store.test.ts src/lib/lead-payload.test.ts src/lib/ai/corra-intelligence.test.ts src/lib/tour/fixtures.ts
git commit -m "refactor(leads): entferne totes pipelineStage-Feld + updateStage-Kette

pipelineStage blieb fuer jeden echten Lead fuer immer auf 'inbox'
eingefroren (kein Aufrufer aendert es); das live genutzte Stage-System
ist leadStatus + useLeadStagesStore. updateStage (Store/Gateway/Service)
hatte null Aufrufer und war nur ueber PipelineStage getypt, daher mit
entfernt. Keine DB-/Rust-Aenderung: das Feld wird einfach nicht mehr
gesendet, Rust faellt ohnehin auf 'inbox' zurueck."
```

---

### Task 2: Fix the Nav-Sidebar "Leads" badge to count leads in the first open stage

**Files:**
- Create: `src/lib/leads/nav-badge.ts`
- Create: `src/lib/leads/nav-badge.test.ts`
- Modify: `src/components/layout/NavSidebar.tsx`

**Interfaces:**
- Consumes: `Lead` (`leadStatus: string`), `LeadStage` (`name: string`, `isQualified: boolean`, `isDisqualified: boolean`) from `@/types/lead.types` — both unchanged by Task 1.
- Produces: `countLeadsInFirstOpenStage(leads: Lead[], stages: LeadStage[]): number`, exported from `src/lib/leads/nav-badge.ts`, consumed by `NavSidebar.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/leads/nav-badge.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { countLeadsInFirstOpenStage } from './nav-badge'
import type { Lead, LeadStage } from '@/types/lead.types'

function stage(overrides: Partial<LeadStage> = {}): LeadStage {
  return {
    id: 's1', workspaceId: 'ws1', name: 'neu', label: 'Neu', orderIndex: 0,
    color: '#000', isQualified: false, isDisqualified: false, createdAt: '',
    ...overrides,
  }
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1', workspaceId: 'ws1', name: 'Test', email: null, phone: null,
    accountType: 'lead', leadStatus: 'neu', leadSource: 'manual',
    leadSourceDetail: null, companyName: null, linkedinUrl: null,
    lastActivityAt: null, nextFollowUpAt: null, engagementScore: 0,
    reEngageDate: null, convertedAt: null, createdAt: '', updatedAt: '',
    ...overrides,
  }
}

describe('countLeadsInFirstOpenStage', () => {
  it('counts leads whose leadStatus matches the first open stage', () => {
    const stages = [
      stage({ name: 'neu', orderIndex: 0 }),
      stage({ id: 's2', name: 'kontaktiert', orderIndex: 1 }),
    ]
    const leads = [
      lead({ id: 'l1', leadStatus: 'neu' }),
      lead({ id: 'l2', leadStatus: 'neu' }),
      lead({ id: 'l3', leadStatus: 'kontaktiert' }),
    ]
    expect(countLeadsInFirstOpenStage(leads, stages)).toBe(2)
  })

  it('skips qualified/disqualified stages when finding the first open one', () => {
    const stages = [
      stage({ id: 's0', name: 'qualifiziert', orderIndex: 0, isQualified: true }),
      stage({ id: 's1', name: 'neu', orderIndex: 1 }),
    ]
    const leads = [
      lead({ id: 'l1', leadStatus: 'qualifiziert' }),
      lead({ id: 'l2', leadStatus: 'neu' }),
    ]
    expect(countLeadsInFirstOpenStage(leads, stages)).toBe(1)
  })

  it('returns 0 when no open stages exist', () => {
    const stages = [stage({ isQualified: true })]
    expect(countLeadsInFirstOpenStage([lead()], stages)).toBe(0)
  })

  it('returns 0 when there are no leads', () => {
    expect(countLeadsInFirstOpenStage([], [stage()])).toBe(0)
  })

  it('returns 0 when no stages are configured at all', () => {
    expect(countLeadsInFirstOpenStage([lead()], [])).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/lib/leads/nav-badge.test.ts`
Expected: FAIL — `Cannot find module './nav-badge'` (the module doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/leads/nav-badge.ts`:

```typescript
import type { Lead, LeadStage } from '@/types/lead.types'

/**
 * Nav-Badge "Leads": zählt Leads in der ersten offenen Stage (nicht
 * qualifiziert/disqualifiziert). `stages` muss bereits nach orderIndex
 * aufsteigend sortiert sein (so liefert es useLeadStagesStore).
 */
export function countLeadsInFirstOpenStage(leads: Lead[], stages: LeadStage[]): number {
  const firstOpen = stages.find(s => !s.isQualified && !s.isDisqualified)
  if (!firstOpen) return 0
  return leads.filter(l => l.leadStatus === firstOpen.name).length
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/lib/leads/nav-badge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the helper into `NavSidebar.tsx`**

Add the import (alongside the other store imports near the top):

```typescript
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { countLeadsInFirstOpenStage } from '@/lib/leads/nav-badge'
```

Replace the line:

```typescript
  const newLeadsCount = useLeadsStore(s => s.newLeads().length)
```

with:

```typescript
  const leads          = useLeadsStore(s => s.leads)
  const leadStages      = useLeadStagesStore(s => s.stages)
  const newLeadsCount   = countLeadsInFirstOpenStage(leads, leadStages)
```

- [ ] **Step 6: Run the full test suite and type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

Run:

```bash
npx vitest run
```

Expected: all tests pass, including the 5 new `nav-badge.test.ts` tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/leads/nav-badge.ts src/lib/leads/nav-badge.test.ts src/components/layout/NavSidebar.tsx
git commit -m "fix(nav): Leads-Badge zaehlt neue Leads statt aller Leads

Badge nutzte das eingefrorene pipelineStage-Feld (immer 'inbox') und
zeigte dadurch effektiv die Gesamtzahl aller Leads. Neuer Helfer
countLeadsInFirstOpenStage zaehlt stattdessen ueber das live genutzte
leadStatus + useLeadStagesStore-System, konsistent mit LeverageLeadsRoute."
```

---

## Self-Review Notes

- **Spec coverage:** Spec bullets 1-6 (`lead.types.ts`, `leads.store.ts`, `NavSidebar.tsx`, `accounts.mapper.ts`, `lead-payload.ts`, all 5 named test/fixture files) are each covered by an explicit step. The spec's "Nicht im Scope" items (Rust command, DB column, other P2 items) are untouched.
- **Scope refinement vs. spec:** the approved spec didn't explicitly name `accounts.gateway.ts`/`leads.service.ts`/the `updateStage` action, because those were found during planning to be a second dead vertical typed with `PipelineStage`. Removing them is a direct, necessary consequence of removing the `PipelineStage` type (can't leave a method typed with a deleted type) and matches the spec's stated goal of removing "the dead pipelineStage concept" — not an unrelated scope expansion.
- **Type consistency:** `Lead`/`UpsertLeadPayload`/`LeadStage` field names used in Task 2's test fixtures (`leadStatus`, `isQualified`, `isDisqualified`, `orderIndex`) match the definitions in `src/types/lead.types.ts` exactly (`LeadStage` is untouched by Task 1).
- **No placeholders:** every step has complete, exact code or an exact command with expected output.
