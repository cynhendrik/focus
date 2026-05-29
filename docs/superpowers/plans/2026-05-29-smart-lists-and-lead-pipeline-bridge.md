# Smart Lists & Lead → Pipeline Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei Sales-Modul-Lücken schließen: (1) Drop eines Leads in 4. Spalte "Termin gebucht" triggert automatisch Customer-Convert + Deal-Anlage in erster Pipeline-Stage, (2) `SmartListsRoute` wird vom Placeholder zu vollwertiger Linear-Style-Filter-View für Customers.

**Architecture:**
- Toast-Infrastruktur als Zustand-Store + TS-Component (ersetzt das hacky `_showToast` im legacy `Toast.jsx`), genutzt für Lead→Deal-Bestätigung
- Lead→Deal-Bridge: neue Store-Action `convertToDeal` orchestriert `convertToClient` + `DealsService.upsert`. Trigger via 4. Drag-Spalte mit `id: 'call_booked'`
- SmartLists-Route nutzt bestehende Komponenten (`SmartListsSection`, `SmartListModal`, `smart-list-filter`) und ergänzt: gefilterte Customer-Tabelle, Tags+Industry-Filter im Modal

**Tech Stack:** React + TypeScript + Zustand + Tauri-Invoke, Vitest für Unit-Tests

---

## Was bereits existiert (NICHT neu bauen)

- `src/lib/smart-list-filter.ts` mit `applySmartListFilter(customers, filter, lastActivity)` — pure function, 11 unit tests grün
- `src/store/smart-lists.store.ts` mit `activeListId`, `setActive`, `load`, `upsert`, `remove`
- `src/components/smart-lists/SmartListsSection.tsx` — collapsible Listen-Container
- `src/components/smart-lists/SmartListItem.tsx` — Listen-Zeile mit Live-Match-Count
- `src/components/smart-lists/SmartListModal.tsx` — CRUD-Modal (Name, Icon-Picker, Status, Priority, Score-Range, Inactive-Days)
- `src/types/smart-list.types.ts` — SmartList/SmartListFilter Types

**Modal-Lücken:** keine Tags-, keine Industry-Felder (sind im Type, aber UI fehlt) → wird ergänzt.

**Toast-Legacy:** `src/components/ui/Toast.jsx` existiert mit module-level `_showToast`-Trick und `ToastProvider`. Wird durch TS-Version mit Zustand-Store und Action-Button-Support ersetzt. Aktuelle Nutzung: nur in `src/App.legacy.jsx` (dead code, nicht in aktivem `App.tsx`-Pfad). Migration daher trivial — Datei einfach löschen.

---

## Task 1: Toast Store

**Files:**
- Create: `src/store/toast.store.ts`
- Test: `src/store/toast.store.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/store/toast.store.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useToastStore } from './toast.store'

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends toast with generated id', () => {
    useToastStore.getState().show({ message: 'Hello' })
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Hello')
    expect(toasts[0].id).toBeTruthy()
  })

  it('auto-dismisses after duration (default 4000ms)', () => {
    useToastStore.getState().show({ message: 'Bye' })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(4001)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('dismiss(id) removes toast', () => {
    useToastStore.getState().show({ message: 'A' })
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('supports action with label and onClick', () => {
    const onClick = vi.fn()
    useToastStore.getState().show({
      message: 'Deal angelegt',
      action: { label: '→ Pipeline öffnen', onClick },
    })
    expect(useToastStore.getState().toasts[0].action?.label).toBe('→ Pipeline öffnen')
    useToastStore.getState().toasts[0].action?.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/toast.store.test.ts`
Expected: FAIL with "Cannot find module './toast.store'"

- [ ] **Step 3: Implement toast store**

```ts
// src/store/toast.store.ts
import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  action?: ToastAction
  variant?: 'success' | 'error' | 'info'
}

interface ToastState {
  toasts: Toast[]
  show: (input: { message: string; action?: ToastAction; variant?: Toast['variant']; durationMs?: number }) => void
  dismiss: (id: string) => void
}

const DEFAULT_DURATION = 4000

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  show: ({ message, action, variant = 'success', durationMs = DEFAULT_DURATION }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set(s => ({ toasts: [...s.toasts, { id, message, action, variant }] }))
    setTimeout(() => get().dismiss(id), durationMs)
  },

  dismiss: (id) => {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  },
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/toast.store.test.ts`
Expected: all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/store/toast.store.ts src/store/toast.store.test.ts
git commit -m "feat(toast): zustand toast store with action support"
```

---

## Task 2: Toast Component (TypeScript)

**Files:**
- Create: `src/components/ui/Toast.tsx`
- Check existing callsites: `src/components/ui/Toast.jsx` consumers

- [ ] **Step 1: Find existing Toast.jsx callsites**

Run: `grep -rn "useToast\|ToastProvider" src/ --include="*.tsx" --include="*.ts" --include="*.jsx"`

Note all files using `useToast` or `ToastProvider`. They will be migrated in Task 3.

- [ ] **Step 2: Create Toast.tsx**

```tsx
// src/components/ui/Toast.tsx
import { AnimatePresence, motion } from 'framer-motion'
import { useToastStore, type Toast as ToastT } from '@/store/toast.store'
import { X } from 'lucide-react'

const VARIANT_BG: Record<NonNullable<ToastT['variant']>, string> = {
  success: 'var(--accent)',
  error:   'oklch(65% 0.22 25)',
  info:    'var(--surface-2)',
}

const VARIANT_FG: Record<NonNullable<ToastT['variant']>, string> = {
  success: 'var(--accent-ink)',
  error:   '#fff',
  info:    'var(--fg)',
}

export function ToastViewport() {
  const toasts  = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map(t => {
          const variant = t.variant ?? 'success'
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: VARIANT_BG[variant],
                color: VARIANT_FG[variant],
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                fontSize: 13, fontWeight: 500,
                pointerEvents: 'auto',
                minWidth: 240, maxWidth: 380,
              }}
            >
              <span style={{ flex: 1 }}>{t.message}</span>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                  style={{
                    background: 'rgba(0,0,0,0.12)', border: 'none',
                    padding: '4px 10px', borderRadius: 6,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    color: VARIANT_FG[variant],
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                title="Schließen"
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  cursor: 'pointer', color: VARIANT_FG[variant], opacity: 0.7,
                  display: 'flex', alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Toast.tsx
git commit -m "feat(toast): TypeScript ToastViewport component"
```

---

## Task 3: Mount ToastViewport and Delete Legacy Toast

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/ui/Toast.jsx`

`Toast.jsx` is only referenced in the dead `App.legacy.jsx` file, never imported in active `App.tsx`. Safe to delete after mounting the new viewport.

- [ ] **Step 1: Add ToastViewport import to App.tsx**

In `src/App.tsx`, after the existing `DownloadToast` import:

```tsx
import { DownloadToast }   from '@/components/ui/DownloadToast'
import { ToastViewport }   from '@/components/ui/Toast'
```

- [ ] **Step 2: Mount ToastViewport in JSX**

Find `<DownloadToast />` in the App return JSX and add `<ToastViewport />` right after:

```tsx
<DownloadToast />
<ToastViewport />
```

- [ ] **Step 3: Delete legacy Toast.jsx**

```bash
rm src/components/ui/Toast.jsx
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (App.legacy.jsx is `.jsx`, not part of TS build; its broken import is fine)

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: all pass (including toast store tests from Task 1)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/ui/Toast.jsx
git commit -m "feat(toast): mount ToastViewport, remove legacy Toast.jsx"
```

---

## Task 4: convertToDeal Action in leads.store

**Files:**
- Modify: `src/store/leads.store.ts`
- Test: `src/store/leads.store.test.ts` (extend existing or create)

- [ ] **Step 1: Write failing test**

Add to `src/store/leads.store.test.ts` (create if missing — model after `src/store/customers.store.test.ts`):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLeadsStore } from './leads.store'
import { usePipelineStore } from './pipeline.store'
import { useDealsStore } from './deals.store'
import { LeadsService } from '@/services/leads.service'
import { DealsService } from '@/services/deals.service'
import type { Lead } from '@/types/lead.types'

const mockLead: Lead = {
  id: 'lead-1', workspaceId: 'ws1', name: 'Acme GmbH', email: null,
  accountType: 'lead', pipelineStage: 'replied', leadStatus: 'warm',
  leadSource: 'manual', leadSourceDetail: null, companyName: null,
  linkedinUrl: null, lastActivityAt: null, nextFollowUpAt: null,
  engagementScore: 0, reEngageDate: null, convertedAt: null,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
}

describe('useLeadsStore.convertToDeal', () => {
  beforeEach(() => {
    useLeadsStore.setState({ leads: [mockLead], isLoading: false, error: null })
    useDealsStore.setState({ deals: [] })
    usePipelineStore.setState({
      stages: [
        { id: 'stage-1', workspaceId: 'ws1', name: 'discovery', label: 'Discovery', orderIndex: 0, color: '#blue', isWon: false, isLost: false, createdAt: '', updatedAt: '' },
        { id: 'stage-2', workspaceId: 'ws1', name: 'won', label: 'Won', orderIndex: 99, color: '#green', isWon: true, isLost: false, createdAt: '', updatedAt: '' },
      ],
      isLoading: false, error: null,
    } as any)
  })

  it('throws if no active pipeline stages', async () => {
    usePipelineStore.setState({ stages: [], isLoading: false, error: null } as any)
    await expect(
      useLeadsStore.getState().convertToDeal('lead-1', 'ws1', 'user-1')
    ).rejects.toThrow(/Keine Pipeline-Stage/)
    expect(useLeadsStore.getState().leads).toHaveLength(1)
  })

  it('converts lead and creates deal in first active stage', async () => {
    const convertSpy = vi.spyOn(LeadsService, 'convertToClient').mockResolvedValue({ ...mockLead, accountType: 'customer' as any })
    const upsertSpy  = vi.spyOn(DealsService, 'upsert').mockResolvedValue({
      id: 'deal-1', workspaceId: 'ws1', createdBy: 'user-1', accountId: 'lead-1',
      customerId: 'lead-1', title: 'Acme GmbH', stage: 'discovery', value: 0,
      currency: 'EUR', createdAt: '', updatedAt: '',
    })

    await useLeadsStore.getState().convertToDeal('lead-1', 'ws1', 'user-1')

    expect(convertSpy).toHaveBeenCalledWith('lead-1')
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws1',
      createdBy: 'user-1',
      accountId: 'lead-1',
      customerId: 'lead-1',
      title: 'Acme GmbH',
      stage: 'discovery',
      value: 0,
    }))
    expect(useLeadsStore.getState().leads).toHaveLength(0)
    expect(useDealsStore.getState().deals).toHaveLength(1)
  })

  it('rolls back on convertToClient failure (lead remains)', async () => {
    vi.spyOn(LeadsService, 'convertToClient').mockRejectedValue(new Error('network'))
    await expect(
      useLeadsStore.getState().convertToDeal('lead-1', 'ws1', 'user-1')
    ).rejects.toThrow()
    expect(useLeadsStore.getState().leads).toHaveLength(1)
    expect(useDealsStore.getState().deals).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/leads.store.test.ts`
Expected: FAIL with "convertToDeal is not a function" or test errors

- [ ] **Step 3: Implement convertToDeal in leads.store.ts**

Add to the `LeadsState` interface:

```ts
convertToDeal: (id: string, workspaceId: string, userId: string) => Promise<void>
```

Add to the store implementation (after the existing `convertToClient` action):

```ts
convertToDeal: async (id, workspaceId, userId) => {
  const lead = get().leads.find(l => l.id === id)
  if (!lead) throw new Error('Lead nicht gefunden')

  const stages = usePipelineStore.getState().activeStages()
  if (stages.length === 0) {
    throw new Error('Keine Pipeline-Stage konfiguriert')
  }
  const firstStage = stages[0]

  // 1) Convert lead → customer (changes account_type in DB)
  await LeadsService.convertToClient(id)

  // 2) Create deal pointing to the now-customer (same ID)
  const userIdSafe = userId || lead.workspaceId  // never empty, but createdBy is required
  const deal = await DealsService.upsert({
    workspaceId,
    createdBy: userIdSafe,
    accountId: id,
    customerId: id,
    title: lead.name,
    stage: firstStage.name,
    value: 0,
  })

  // 3) Update local state — remove lead, add deal
  useLeadsStore.setState(s => ({ leads: s.leads.filter(l => l.id !== id) }))
  useDealsStore.setState(s => ({ deals: [...s.deals, deal] }))
},
```

Required new imports at top of `leads.store.ts`:

```ts
import { usePipelineStore } from './pipeline.store'
import { useDealsStore } from './deals.store'
import { DealsService } from '@/services/deals.service'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/leads.store.test.ts`
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/store/leads.store.ts src/store/leads.store.test.ts
git commit -m "feat(leads): convertToDeal action — converts lead and creates deal in first pipeline stage"
```

---

## Task 5: "Termin gebucht" Column in LeadsRoute

**Files:**
- Modify: `src/routes/LeadsRoute.tsx`

- [ ] **Step 1: Add 'call_booked' to COLUMNS array**

In `src/routes/LeadsRoute.tsx`, find the `COLUMNS` constant (around line 64). Note: existing columns use `LeadStatus` typing (`'new' | 'attempted' | 'warm'`), but `call_booked` is a `PipelineStage`, not a `LeadStatus`. We need to widen the column ID type.

Change:

```ts
const COLUMNS: { id: LeadStatus; label: string; hoverBg: string; dot: string }[] = [
  { id: 'new',       label: 'New In',    hoverBg: 'rgba(59,130,246,0.10)',  dot: '#60a5fa' },
  { id: 'attempted', label: 'Attempted', hoverBg: 'rgba(251,191,36,0.10)',  dot: '#fbbf24' },
  { id: 'warm',      label: 'Warm Lead', hoverBg: 'rgba(74,222,128,0.10)',  dot: '#4ade80' },
]
```

To:

```ts
type ColumnId = LeadStatus | 'call_booked'

const COLUMNS: { id: ColumnId; label: string; hoverBg: string; dot: string }[] = [
  { id: 'new',         label: 'New In',          hoverBg: 'rgba(59,130,246,0.10)',  dot: '#60a5fa' },
  { id: 'attempted',   label: 'Attempted',       hoverBg: 'rgba(251,191,36,0.10)',  dot: '#fbbf24' },
  { id: 'warm',        label: 'Warm Lead',       hoverBg: 'rgba(74,222,128,0.10)',  dot: '#4ade80' },
  { id: 'call_booked', label: 'Termin gebucht',  hoverBg: 'rgba(208,252,105,0.12)', dot: '#D0FC69' },
]
```

- [ ] **Step 2: Update `leadsForCol` and `LeadColumn` props to accept ColumnId**

The `LeadColumn` component's `col` prop currently types as `typeof COLUMNS[number]` which now includes 'call_booked' — no further change needed there. But `leadsForCol(status: LeadStatus)` filters by `leadStatus`. For 'call_booked', there will never be matching leads since converted leads are removed from the store. Update:

```ts
const leadsForCol = (status: ColumnId) =>
  status === 'call_booked'
    ? []   // Drop-only column — converted leads disappear from board
    : boardLeads.filter(l => l.leadStatus === status)
```

- [ ] **Step 3: Update `handleDragEnd` to detect 'call_booked' drop**

Find the existing `handleDragEnd`:

```ts
const handleDragEnd = (e: DragEndEvent) => {
  setActiveLead(null)
  if (!e.over) return
  const newStatus = e.over.id as LeadStatus
  const lead = boardLeads.find(l => l.id === e.active.id)
  if (lead && lead.leadStatus !== newStatus) {
    bulkUpdate({ ids: [lead.id], status: newStatus }, workspaceId)
  }
}
```

Replace with:

```ts
const handleDragEnd = (e: DragEndEvent) => {
  setActiveLead(null)
  if (!e.over) return
  const targetId = e.over.id as ColumnId
  const lead = boardLeads.find(l => l.id === e.active.id)
  if (!lead) return

  if (targetId === 'call_booked') {
    handleConvertToDeal(lead)
    return
  }

  if (lead.leadStatus !== targetId) {
    bulkUpdate({ ids: [lead.id], status: targetId as LeadStatus }, workspaceId)
  }
}
```

- [ ] **Step 4: Implement handleConvertToDeal helper**

Add inside `PhasenBoard` component, near the other handlers. Also add the imports/hooks at the top:

```ts
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { useToastStore } from '@/store/toast.store'

// Inside PhasenBoard:
const convertToDeal = useLeadsStore(s => s.convertToDeal)
const userId        = useAuthStore(s => s.user?.id ?? '')
const setAppView    = useUiStore(s => s.setAppView)
const showToast     = useToastStore(s => s.show)

const handleConvertToDeal = async (lead: Lead) => {
  try {
    await convertToDeal(lead.id, workspaceId, userId)
    showToast({
      message: `Deal angelegt — ${lead.name}`,
      action: { label: '→ Pipeline öffnen', onClick: () => setAppView('pipeline') },
    })
  } catch (err) {
    showToast({
      message: err instanceof Error ? err.message : 'Konvertierung fehlgeschlagen',
      variant: 'error',
    })
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/routes/LeadsRoute.tsx
git commit -m "feat(leads): 4th column 'Termin gebucht' triggers lead→deal conversion"
```

---

## Task 6: Manual Test — Lead → Pipeline Bridge

- [ ] **Step 1: Start dev server**

Run: `npm run tauri dev`
Wait for window to open.

- [ ] **Step 2: Create a test lead**

Navigate Sidebar → Sales → Leads (or directly: Leads). Click `+ Lead`. Fill: Name "Test Acme", email any, source "Manuell". Save.

- [ ] **Step 3: Drag through stages**

Drag the new Lead card from "New In" → "Attempted" → "Warm Lead". Verify each drag persists the stage change.

- [ ] **Step 4: Drag to "Termin gebucht"**

Drag the Warm Lead card into "Termin gebucht" column. Expected:
- Card disappears from board within 200ms (fade-out animation)
- Toast appears bottom-right: "Deal angelegt — Test Acme" with "→ Pipeline öffnen" button
- Toast auto-dismisses after 4 seconds

- [ ] **Step 5: Verify Customer + Deal exist**

- Click sidebar → Clients (or "Kunden"): "Test Acme" appears in the customer list
- Click sidebar → Sales → Pipeline: New Deal "Test Acme" appears in the first pipeline stage with value 0

- [ ] **Step 6: Click toast action shortcut (re-test)**

Convert another lead via drag-to-call_booked. While toast is visible, click "→ Pipeline öffnen". Expected: navigate to Pipeline view, toast dismisses.

- [ ] **Step 7: No-stages error case**

If you have a way to clear pipeline stages (or temporarily set `usePipelineStore.setState({ stages: [] })` via React DevTools), retry the drag. Expected: error toast "Keine Pipeline-Stage konfiguriert", lead stays on board.

(Skip if not easily testable — unit test covers this branch.)

---

## Task 7: Add Tags Filter to SmartListModal

**Files:**
- Modify: `src/components/smart-lists/SmartListModal.tsx`

- [ ] **Step 1: Add tags input UI**

In `SmartListModal.tsx`, after the "Kein Kontakt seit" block (around line 169, before the action buttons), add:

```tsx
{/* Tags */}
<div>
  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>
    Tags (kommagetrennt)
  </label>
  <input
    type="text"
    value={(filter.tags ?? []).join(', ')}
    onChange={e => {
      const raw = e.target.value
      const tags = raw.split(',').map(t => t.trim()).filter(Boolean)
      setFilter(f => ({ ...f, tags: tags.length ? tags : undefined }))
    }}
    placeholder="z.B. vip, webinar-2025"
    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }}
  />
  <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>
    Kunde muss ALLE genannten Tags haben (AND-Logik).
  </div>
</div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/smart-lists/SmartListModal.tsx
git commit -m "feat(smart-lists): tags filter in modal"
```

---

## Task 8: Add Industry Filter to SmartListModal

**Files:**
- Modify: `src/components/smart-lists/SmartListModal.tsx`

`Customer.industry` is a freeform string (e.g. "Pharma", "Mittelstand", "Logistik") — set per customer at onboarding or manually. The `INDUSTRIES` constant from `OnboardingWizard.tsx` describes the USER's business profile, not the customer's industry, so we don't use it here. Instead: derive distinct industry values from the current customer list and show them as toggleable chips.

- [ ] **Step 1: Import useCustomersStore**

At top of `SmartListModal.tsx`, add:

```ts
import { useCustomersStore } from '@/store/customers.store'
import { useMemo } from 'react'
```

- [ ] **Step 2: Derive distinct industries inside the component**

Add inside the `SmartListModal` function, after the existing hook calls (around line 38, after `useState` calls):

```ts
const customers = useCustomersStore(s => s.customers)
const availableIndustries = useMemo(() => {
  const set = new Set<string>()
  for (const c of customers) {
    if (c.industry && c.industry.trim()) set.add(c.industry.trim())
  }
  return [...set].sort()
}, [customers])
```

- [ ] **Step 3: Add industry chip UI**

After the Tags block from Task 7, add:

```tsx
{/* Industry */}
{availableIndustries.length > 0 && (
  <div>
    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Branche</label>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {availableIndustries.map(ind => {
        const active = filter.industry?.includes(ind) ?? false
        return (
          <button
            key={ind}
            onClick={() => setFilter(f => ({ ...f, industry: toggle(f.industry, ind) }))}
            style={{
              padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 500,
              background: active ? 'var(--accent-soft)' : 'transparent',
              color:      active ? 'var(--accent)' : 'var(--fg-muted)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            {ind}
          </button>
        )
      })}
    </div>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/smart-lists/SmartListModal.tsx
git commit -m "feat(smart-lists): industry filter chips derived from existing customers"
```

---

## Task 9: CustomerTableFiltered Component

**Files:**
- Create: `src/components/smart-lists/CustomerTableFiltered.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/smart-lists/CustomerTableFiltered.tsx
import { useUiStore } from '@/store/ui.store'
import type { Customer } from '@/types/customer.types'

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv', lead: 'Lead', inaktiv: 'Inaktiv', lost: 'Lost',
}
const STATUS_TONE: Record<string, string> = {
  aktiv: 'ok', lead: 'accent', inaktiv: 'warn', lost: 'bad',
}
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig', normal: 'Normal', high: 'Hoch',
}

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Heute'
  if (d === 1) return 'Gestern'
  if (d < 7) return `vor ${d}T`
  if (d < 30) return `vor ${Math.floor(d / 7)}W`
  return `vor ${Math.floor(d / 30)}M`
}

export function CustomerTableFiltered({
  customers, lastActivity,
}: {
  customers:    Customer[]
  lastActivity: Map<string, string | null>
}) {
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView  = useUiStore(s => s.setAppView)

  const openCustomer = (id: string) => {
    setSelected(id)
    setAppView('clients')
  }

  if (customers.length === 0) {
    return (
      <div style={{
        padding: '60px 20px', textAlign: 'center',
        color: 'var(--fg-dim)', fontSize: 13,
      }}>
        Keine Kunden matchen diesen Filter.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={th}>Name</th>
            <th style={th}>Status</th>
            <th style={th}>Priorität</th>
            <th style={{ ...th, textAlign: 'right' }}>Score</th>
            <th style={th}>Branche</th>
            <th style={th}>Letzte Aktivität</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => {
            const last = lastActivity.get(c.id)
            return (
              <tr
                key={c.id}
                onClick={() => openCustomer(c.id)}
                style={{
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'background 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                <td style={td}>
                  <span className="chip" data-tone={STATUS_TONE[c.status] ?? ''}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td style={td}>{PRIORITY_LABEL[c.priority] ?? c.priority}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{c.leadScore}</td>
                <td style={{ ...td, color: 'var(--fg-muted)' }}>{c.industry ?? '—'}</td>
                <td style={{ ...td, color: 'var(--fg-muted)', fontSize: 12 }}>
                  {last ? relTime(last) : 'noch nie'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--fg-dim)',
}
const td: React.CSSProperties = {
  padding: '12px 14px',
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/smart-lists/CustomerTableFiltered.tsx
git commit -m "feat(smart-lists): CustomerTableFiltered component"
```

---

## Task 10: Rewrite SmartListsRoute

**Files:**
- Modify: `src/routes/SmartListsRoute.tsx`

- [ ] **Step 1: Read existing SmartListsRoute to preserve structure**

Run: `cat src/routes/SmartListsRoute.tsx`

Confirm it is the 13-line placeholder. Backup not needed — we rewrite.

- [ ] **Step 2: Write the full rewrite**

```tsx
// src/routes/SmartListsRoute.tsx
import { useEffect, useMemo, useState } from 'react'
import { Plus, ListFilter } from 'lucide-react'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { applySmartListFilter } from '@/lib/smart-list-filter'
import { SmartListItem } from '@/components/smart-lists/SmartListItem'
import { SmartListModal } from '@/components/smart-lists/SmartListModal'
import { CustomerTableFiltered } from '@/components/smart-lists/CustomerTableFiltered'
import type { SmartList } from '@/types/smart-list.types'

const ACTIVE_STORAGE_KEY = 'cynera:smartlists:active-v1'

export function SmartListsRoute() {
  const lists        = useSmartListsStore(s => s.lists)
  const activeListId = useSmartListsStore(s => s.activeListId)
  const setActive    = useSmartListsStore(s => s.setActive)
  const remove       = useSmartListsStore(s => s.remove)

  const customers    = useCustomersStore(s => s.customers)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const [editing, setEditing] = useState<SmartList | 'new' | null>(null)

  // Persist activeListId across reloads
  useEffect(() => {
    if (activeListId) {
      try { localStorage.setItem(ACTIVE_STORAGE_KEY, activeListId) } catch {}
    } else {
      try { localStorage.removeItem(ACTIVE_STORAGE_KEY) } catch {}
    }
  }, [activeListId])

  useEffect(() => {
    if (activeListId || lists.length === 0) return
    let stored: string | null = null
    try { stored = localStorage.getItem(ACTIVE_STORAGE_KEY) } catch {}
    if (stored && lists.some(l => l.id === stored)) {
      setActive(stored)
    } else {
      setActive(lists[0].id)
    }
  }, [lists, activeListId, setActive])

  const activityMap = useMemo(
    () => new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt])),
    [lastActivity],
  )

  const activeList = useMemo(
    () => lists.find(l => l.id === activeListId) ?? null,
    [lists, activeListId],
  )

  const filtered = useMemo(
    () => activeList
      ? applySmartListFilter(customers, activeList.filter, activityMap)
      : customers,
    [customers, activeList, activityMap],
  )

  const systemLists = lists.filter(l => l.isSystem)
  const userLists   = lists.filter(l => !l.isSystem)

  return (
    <div style={{
      display: 'flex', height: '100%', background: 'var(--bg)',
    }}>
      {/* Left Panel */}
      <aside style={{
        width: 260, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '20px 0 16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px 14px',
        }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, letterSpacing: '-0.005em' }}>
            Smart Lists
          </h2>
          <button
            onClick={() => setEditing('new')}
            title="Neue Liste"
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, padding: 4, cursor: 'pointer',
              color: 'var(--fg-muted)', display: 'flex',
            }}
          >
            <Plus size={13} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
          {systemLists.length > 0 && (
            <SmartListGroup label="System">
              {systemLists.map(list => (
                <SmartListItem
                  key={list.id}
                  list={list}
                  active={activeListId === list.id}
                  onClick={() => setActive(list.id)}
                  onEdit={() => setEditing(list)}
                />
              ))}
            </SmartListGroup>
          )}

          {userLists.length > 0 && (
            <SmartListGroup label="Meine Listen">
              {userLists.map(list => (
                <SmartListItem
                  key={list.id}
                  list={list}
                  active={activeListId === list.id}
                  onClick={() => setActive(list.id)}
                  onEdit={() => setEditing(list)}
                  onDelete={() => {
                    if (activeListId === list.id) setActive(null)
                    remove(list.id)
                  }}
                />
              ))}
            </SmartListGroup>
          )}

          {lists.length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--fg-dim)', fontSize: 12, textAlign: 'center' }}>
              Noch keine Smart Lists.<br />Klick + um eine zu erstellen.
            </div>
          )}
        </div>
      </aside>

      {/* Right Panel */}
      <main style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {activeList ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{activeList.icon}</span>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em' }}>
                {activeList.name}
              </h1>
              <span style={{
                fontSize: 12, color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)',
              }}>
                {filtered.length} Kunden
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-muted)' }}>
              <ListFilter size={16} />
              <span style={{ fontSize: 14 }}>Wähle eine Smart List links</span>
            </div>
          )}

          {activeList && !activeList.isSystem && (
            <button
              onClick={() => setEditing(activeList)}
              className="btn-ghost"
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              Filter bearbeiten
            </button>
          )}
        </div>

        {/* Table */}
        <CustomerTableFiltered customers={filtered} lastActivity={activityMap} />
      </main>

      {editing && (
        <SmartListModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SmartListGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        padding: '6px 14px 4px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color: 'var(--fg-dim)', textTransform: 'uppercase',
      }}>{label}</div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/routes/SmartListsRoute.tsx
git commit -m "feat(smart-lists): SmartListsRoute — full Linear-style filter view"
```

---

## Task 11: Manual Test — Smart Lists Route

- [ ] **Step 1: Open dev server**

If not running: `npm run tauri dev`. Otherwise refresh window.

- [ ] **Step 2: Navigate to Smart Lists**

Sidebar → Sales → Smart Lists.

- [ ] **Step 3: Verify system lists visible**

System-seeded smart lists appear under "System" group. Click one — customer table on right populates with matching customers.

- [ ] **Step 4: Create new list**

Click `+` button top-left. Modal opens. Fill: Name "Test VIP", select an icon, check Status "Aktiv", set Score min 70. Save.

- [ ] **Step 5: Verify new list works**

"Test VIP" appears under "Meine Listen". Click it — table filters to aktive Kunden mit Score ≥ 70.

- [ ] **Step 6: Edit list**

Click "Filter bearbeiten" top-right. Modal reopens with current values. Change a filter, save. Table updates.

- [ ] **Step 7: Delete list**

Hover over "Test VIP" in the sidebar. Click `✕`. List disappears.

- [ ] **Step 8: Test Tags + Industry filters**

Create another list with at least one tag and one industry selected. Verify filtering matches expected customers.

- [ ] **Step 9: Persistence test**

Close and reopen the app. The Smart Lists route should restore the previously active list.

- [ ] **Step 10: Click customer row**

Click any row in the customer table. Expected: navigates to `clients` view with that customer selected.

---

## Self-Review Checklist

After implementation:

- [ ] Run full test suite: `npx vitest run` — all green
- [ ] Run full typecheck: `npx tsc --noEmit` — clean
- [ ] Lead drag-and-drop end-to-end works (Task 6 verified)
- [ ] Smart Lists end-to-end works (Task 11 verified)
- [ ] No console errors in dev tools while using either feature
- [ ] Legacy `Toast.jsx` deleted, all callsites migrated
