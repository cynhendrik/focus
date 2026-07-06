# Bulk-Newcomer-Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user select multiple "possible lead" newcomer candidates in `LeverageMailRoute` and promote them all to Leads in one action, instead of one at a time.

**Architecture:** Pure UI addition to one existing file. Reuses the `Set<string>`-based multi-select pattern already used in `src/components/mail/CreateCampaignModal.tsx` and the existing single-lead-creation path (`handleCreateLead` → `useLeadsStore.upsert`). No new components, services, Rust, or DB changes.

**Tech Stack:** React, TypeScript, Zustand.

## Global Constraints

- No Rust/DB changes. No new components or services.
- No confirmation dialog before bulk-creating (leads are cheaply deletable; the existing per-lead delete button already covers undo).
- No name/phone editing in the bulk path — `name: mail.fromName || mail.fromAddr`, `email: mail.fromAddr`, no phone. Users who want to edit before creating keep using the existing single-row form.
- Bulk creation must not abort on the first failure — use `Promise.allSettled`, report success/failure counts in one toast, and keep failed candidates selected for retry.
- Selection UI (checkbox column + "Alle auswählen (N)") applies ONLY to the `candidates` section (the "Unbekannte Absender — mögliche Leads" list). The `UnknownMailRow` component is also reused, unchanged, for the separate collapsed `autoSorted` ("automatisch aussortiert") list further down the same file — that second call site does not get selection UI, per spec scope.
- No new test file for `LeverageMailRoute.tsx` — matches this codebase's convention of not adding RTL tests for large route components (e.g. `NavSidebar.tsx`, `LeadDetailModal.tsx` also have none). Verification is the full `npx vitest run` regression + `npx tsc --noEmit` + a manual smoke test.

---

### Task 1: Multi-select + bulk-promote candidates in `LeverageMailRoute`

**Files:**
- Modify: `src/routes/leverage/LeverageMailRoute.tsx`

**Interfaces:**
- Consumes: `handleCreateLead(payload: { name: string; email: string; phone?: string }): Promise<Lead>` (already defined in this file, unchanged). `useToastStore` (`@/store/toast.store`) — selector `s.show: (opts: { message: string; variant: 'success'|'error'; durationMs?: number }) => void`, same shape already used in `LeadDetailModal.tsx`.
- Produces: nothing consumed by later tasks — this is the only task in the plan.

This task adds UI-level state and a bulk-action handler with no new pure logic worth a standalone unit test (the `Set` toggle logic is a direct copy of the already-untested pattern in `CreateCampaignModal.tsx`). Verification is the full regression suite plus a manual smoke test, in Steps 8-9.

- [ ] **Step 1: Add the `useToastStore` import**

At the top of `src/routes/leverage/LeverageMailRoute.tsx`, change:

```typescript
import { useMemo, useState, useEffect } from 'react'
import { Inbox, UserPlus, ChevronRight, ChevronDown, EyeOff, Eye, AtSign, Ban } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { useLeadsStore } from '@/store/leads.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { MailService } from '@/services/mail.service'
import { classifyMails, matchesIgnoredSender } from '@/lib/mail/newcomer'
import { log } from '@/lib/logger'
import type { EmailHeader, IgnoredSender } from '@/types/mail.types'
```

to:

```typescript
import { useMemo, useState, useEffect } from 'react'
import { Inbox, UserPlus, ChevronRight, ChevronDown, EyeOff, Eye, AtSign, Ban } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { useLeadsStore } from '@/store/leads.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { classifyMails, matchesIgnoredSender } from '@/lib/mail/newcomer'
import { log } from '@/lib/logger'
import type { EmailHeader, IgnoredSender } from '@/types/mail.types'
```

- [ ] **Step 2: Add `selected`/`onToggleSelect` props to `UnknownMailRow`, and a checkbox column**

Change the function signature from:

```typescript
function UnknownMailRow({ mail, expanded, onToggle, onCreateLead, onIgnore }: {
  mail: EmailHeader
  expanded: boolean
  onToggle: () => void
  onCreateLead: (payload: { name: string; email: string; phone?: string }) => Promise<void>
  onIgnore: (pattern: string, scope: IgnoredSender['scope']) => void
}) {
```

to:

```typescript
function UnknownMailRow({ mail, expanded, onToggle, onCreateLead, onIgnore, selected, onToggleSelect }: {
  mail: EmailHeader
  expanded: boolean
  onToggle: () => void
  onCreateLead: (payload: { name: string; email: string; phone?: string }) => Promise<void>
  onIgnore: (pattern: string, scope: IgnoredSender['scope']) => void
  selected?: boolean
  onToggleSelect?: () => void
}) {
```

(`selected`/`onToggleSelect` are optional — the `autoSorted` list further down reuses this same component without passing them, and must keep rendering exactly as it does today.)

Then change the header-row grid from:

```typescript
      <div
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '16px 1fr auto auto auto',
          alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer',
          background: expanded ? 'var(--surface-2)' : 'transparent',
        }}
      >
        <span style={{ color: 'var(--fg-dim)', display: 'flex' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
```

to:

```typescript
      <div
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '20px 16px 1fr auto auto auto',
          alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer',
          background: expanded ? 'var(--surface-2)' : 'transparent',
        }}
      >
        {onToggleSelect
          ? (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect()}
              onClick={e => e.stopPropagation()}
            />
          )
          : <span />}
        <span style={{ color: 'var(--fg-dim)', display: 'flex' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
```

(The grid gains one column — `20px` for the checkbox slot — always present so the `candidates` and `autoSorted` lists keep visually aligned rows; when `onToggleSelect` is absent, an empty `<span />` fills that slot instead of a checkbox.)

- [ ] **Step 3: Add selection state and toast selector to `LeverageMailRoute`**

Change:

```typescript
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAutoSorted, setShowAutoSorted] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
```

to:

```typescript
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAutoSorted, setShowAutoSorted] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCreating, setBulkCreating] = useState(false)
  const showToast = useToastStore(s => s.show)
```

- [ ] **Step 4: Add `toggleSelect`, `toggleAll`, and `handleBulkCreateLeads`**

Directly below the existing `handleIgnore` function (after its closing `}`, before `const totalCount = ...`), add:

```typescript
  const toggleSelect = (id: string) => {
    setSelectedIds(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleAll = () => {
    const ids = candidates.map(m => m.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (allSelected) { ids.forEach(id => n.delete(id)) }
      else { ids.forEach(id => n.add(id)) }
      return n
    })
  }

  async function handleBulkCreateLeads() {
    const targets = candidates.filter(m => selectedIds.has(m.id))
    if (targets.length === 0) return
    setBulkCreating(true)
    const results = await Promise.allSettled(
      targets.map(m => handleCreateLead({ name: m.fromName || m.fromAddr, email: m.fromAddr })),
    )
    const succeededIds = targets
      .filter((_, i) => results[i].status === 'fulfilled')
      .map(m => m.id)
    const failedCount = results.length - succeededIds.length
    setSelectedIds(prev => {
      const next = new Set(prev)
      succeededIds.forEach(id => next.delete(id))
      return next
    })
    setBulkCreating(false)
    showToast({
      message: failedCount === 0
        ? `${succeededIds.length} Lead${succeededIds.length === 1 ? '' : 's'} angelegt.`
        : `${succeededIds.length} von ${targets.length} Leads angelegt, ${failedCount} fehlgeschlagen.`,
      variant: failedCount === 0 ? 'success' : 'error',
    })
  }
```

- [ ] **Step 5: Add the "Alle auswählen" row and bulk-action button above the candidates list**

Change:

```typescript
        {candidates.length > 0 && (
          <>
            <SectionHeader label="Unbekannte Absender — mögliche Leads" count={candidates.length} />
            {candidates.map(m => (
              <UnknownMailRow
                key={m.id}
                mail={m}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(id => id === m.id ? null : m.id)}
                onCreateLead={handleCreateLead}
                onIgnore={handleIgnore}
              />
            ))}
          </>
        )}
```

to:

```typescript
        {candidates.length > 0 && (
          <>
            <SectionHeader label="Unbekannte Absender — mögliche Leads" count={candidates.length} />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '6px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)',
              }}>
                <input
                  type="checkbox"
                  checked={candidates.length > 0 && candidates.every(m => selectedIds.has(m.id))}
                  onChange={toggleAll}
                />
                Alle auswählen ({candidates.length})
              </label>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkCreateLeads}
                  disabled={bulkCreating}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    border: '1px solid var(--accent)', cursor: bulkCreating ? 'default' : 'pointer',
                    background: 'var(--accent-soft)', color: 'var(--accent-text)',
                    fontFamily: 'inherit', opacity: bulkCreating ? 0.6 : 1,
                  }}
                >
                  {bulkCreating ? 'Wird angelegt…' : `${selectedIds.size} Lead${selectedIds.size === 1 ? '' : 's'} anlegen`}
                </button>
              )}
            </div>
            {candidates.map(m => (
              <UnknownMailRow
                key={m.id}
                mail={m}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(id => id === m.id ? null : m.id)}
                onCreateLead={handleCreateLead}
                onIgnore={handleIgnore}
                selected={selectedIds.has(m.id)}
                onToggleSelect={() => toggleSelect(m.id)}
              />
            ))}
          </>
        )}
```

(The `autoSorted` call site of `UnknownMailRow`, further down in the same file, is left completely unchanged — it does not pass `selected`/`onToggleSelect`, so it renders the empty-`<span/>` branch from Step 2 and keeps behaving exactly as today.)

- [ ] **Step 6: Type-check and run the full test suite**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

Run:

```bash
npx vitest run
```

Expected: all tests pass, same count as before this task (no test files touched).

- [ ] **Step 7: Manual smoke test**

If you can launch and interact with the running desktop app in your environment, verify by hand:
1. Open the "Newcomer" nav tab with at least 2 unknown-sender candidates present. Each row shows a checkbox; clicking one does NOT expand/collapse the row.
2. Click "Alle auswählen (N)" → all candidate checkboxes become checked, and a "N Leads anlegen" button appears.
3. Click "N Leads anlegen" → button shows "Wird angelegt…", then a toast reports how many leads were created; the promoted candidates disappear from the list (they now match as known leads), and the "Alle auswählen"/bulk button disappear along with them since `selectedIds` is now empty.
4. Toggle a single checkbox (not "select all") → only the bulk button for that one candidate appears, labelled "1 Lead anlegen".
5. Confirm the separate "automatisch aussortiert" collapsed section (if any items are present) shows rows WITHOUT a checkbox, unaffected by this change.

If you cannot run/click through the app in your environment, say so explicitly in your report rather than claiming it passed — this is expected in a sandboxed environment.

- [ ] **Step 8: Commit**

```bash
git add src/routes/leverage/LeverageMailRoute.tsx
git commit -m "$(cat <<'EOF'
feat(newcomer): Mehrfachauswahl fuer Newcomer-Leads

Checkbox pro Kandidatenzeile + "Alle auswaehlen" + Bulk-Button, analog
dem Set<string>-Muster aus CreateCampaignModal.tsx. Ruft den
bestehenden handleCreateLead-Pfad je Kandidat auf (Promise.allSettled,
Sammel-Toast bei Teilfehlern, fehlgeschlagene bleiben ausgewaehlt).
Betrifft nur die "moegliche Leads"-Liste, nicht die separate
automatisch-aussortiert-Sektion.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all 6 numbered changes in the spec (state, row props/checkbox, section header selection row, toggle helpers, bulk handler, toast import) map onto Steps 1-5. Acceptance criteria (checkbox per row, "Alle auswählen", bulk button visibility/disabled state, success/partial-failure toast, tests green) are covered by Steps 5-6. "Nicht im Scope" items (confirmation dialog, phone/name editing, abort-on-first-failure) are explicitly absent from the implementation.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact command with expected output.
- **Type consistency:** `UnknownMailRow`'s new optional props (`selected?: boolean`, `onToggleSelect?: () => void`) are used identically at both call sites — passed at the `candidates` site (Step 5), omitted at the untouched `autoSorted` site — and the component's internal render (Step 2) checks `onToggleSelect` truthiness to decide between checkbox and spacer, consistent with both usages. `handleCreateLead`'s payload shape (`{ name, email, phone? }`) used in Step 4's `handleBulkCreateLeads` matches its existing signature (Step 4 omits `phone`, which is optional).
- **Gap found during planning, resolved directly:** the spec's Step 2 description ("Grid-Spalten `'16px 1fr auto auto auto'` → `'20px 16px 1fr auto auto auto'`") didn't account for `UnknownMailRow` having a second call site (`autoSorted` list) that must NOT gain a checkbox per spec scope. Resolved by making the new props optional and always reserving the grid column (checkbox or empty spacer) so both call sites stay visually aligned without behavior leaking between them — documented in this plan's Global Constraints and Step 2.
