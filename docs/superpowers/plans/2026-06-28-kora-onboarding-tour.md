# KORA-Erststart-Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine angebotene, geführte 5-Stopp-Erststart-Tour, in der KORA durch die App führt — mit Schau-Daten, die **nur im Speicher** leben und am Tour-Ende spurlos verschwinden — plus echte Empty-States als „jetzt du"-Zustand danach.

**Architecture:** Ein `tour.store` (Zustandsmaschine, persistiert nur `seen`). Tour-Fixtures sind typkonforme In-Memory-Objekte; `applyTourFixtures()` setzt die relevanten Stores **direkt per setState** (NIE über Gateways → nichts persistiert), `clearTourFixtures()` leert + lädt die echten (leeren) Daten neu. Ein global gemountetes `TourGuide`-Overlay navigiert pro Stopp durch die Ansichten und zeigt eine KORA-Sprechblase. Eine `TourOfferCard` bietet die Tour nach dem Onboarding an. Empty-State-CTAs auf Dashboard/Leads/Finanzen.

**Tech Stack:** React + TS + Zustand, Vitest + @testing-library/react. Keine DB-/Cloud-/Tauri-Änderung.

## Global Constraints

- **Flüchtigkeit ist die Kern-Eigenschaft:** Schau-Daten werden ausschließlich per `useXStore.setState(...)` gesetzt, **niemals** über ein Gateway/Service. Zwischen `applyTourFixtures` und `clearTourFixtures` darf **kein** Gateway-`create/upsert/update` aufgerufen werden (per Test garantiert). Nichts landet in SQLite/Cloud → nichts zu löschen.
- **Angeboten, nicht erzwungen:** Karte „KORA zeigt dir die App (2 Min)" mit Start/Später; nur auf Start läuft die Tour. `seen` wird persistiert → Angebot nur einmal.
- **5 Stopps, geskriptete Texte (kein Live-KI-Call):** Dashboard → Kundenakte → Finanzen → Leads → KORA.
- **Spotlight = abgedunkelter Backdrop + KORA-Sprechblase** (kein pixelgenaues Element-Cutout in v1).
- Fixture-IDs mit Präfix `tour-`.
- Git: nur **gezielte** `git add <pfad>` — nie `git add -A`. **Nicht anfassen:** `.gitignore`, `*.key*`.
- Nach jeder Task: `npx tsc --noEmit -p tsconfig.json` sauber + `npx vitest run` grün (Basis 636).

---

### Task 1: `tour.store` (Zustandsmaschine)

**Files:**
- Create: `src/store/tour.store.ts`
- Test: `src/store/tour.store.test.ts`

**Interfaces:**
- Produces: `useTourStore` mit `{ active: boolean; step: number; seen: boolean; stepCount: number; offer(): void; start(): void; next(): void; prev(): void; skip(): void; finish(): void }`. `start/finish/skip` rufen die Fixture-Funktionen NICHT direkt (Entkopplung) — die Verdrahtung macht `TourGuide`/`TourOfferCard` über Effekte auf `active`. Persistiert nur `seen`.

- [ ] **Step 1: Failing test** — `src/store/tour.store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useTourStore, TOUR_STEP_COUNT } from './tour.store'

beforeEach(() => { useTourStore.setState({ active: false, step: 0, seen: false }) })

describe('useTourStore', () => {
  it('start aktiviert bei Schritt 0', () => {
    useTourStore.getState().start()
    expect(useTourStore.getState().active).toBe(true)
    expect(useTourStore.getState().step).toBe(0)
  })
  it('next/prev bleiben in den Grenzen', () => {
    useTourStore.getState().start()
    for (let i = 0; i < TOUR_STEP_COUNT + 3; i++) useTourStore.getState().next()
    expect(useTourStore.getState().step).toBe(TOUR_STEP_COUNT - 1)
    for (let i = 0; i < TOUR_STEP_COUNT + 3; i++) useTourStore.getState().prev()
    expect(useTourStore.getState().step).toBe(0)
  })
  it('finish deaktiviert + setzt seen', () => {
    useTourStore.getState().start()
    useTourStore.getState().finish()
    expect(useTourStore.getState().active).toBe(false)
    expect(useTourStore.getState().seen).toBe(true)
  })
  it('skip = finish (seen=true, inaktiv)', () => {
    useTourStore.getState().start(); useTourStore.getState().skip()
    expect(useTourStore.getState().active).toBe(false)
    expect(useTourStore.getState().seen).toBe(true)
  })
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/store/tour.store.test.ts`.

- [ ] **Step 3: Implement** — `src/store/tour.store.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Anzahl der Tour-Stopps (Dashboard → Kunde → Finanzen → Leads → KORA). */
export const TOUR_STEP_COUNT = 5

interface TourState {
  active: boolean
  step: number
  seen: boolean
  offer: () => void
  start: () => void
  next: () => void
  prev: () => void
  skip: () => void
  finish: () => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      active: false,
      step: 0,
      seen: false,
      offer: () => { /* Anzeige steuert TourOfferCard über `seen`; no-op-Platzhalter für künftige Trigger */ },
      start: () => set({ active: true, step: 0 }),
      next: () => set({ step: Math.min(TOUR_STEP_COUNT - 1, get().step + 1) }),
      prev: () => set({ step: Math.max(0, get().step - 1) }),
      skip: () => set({ active: false, seen: true }),
      finish: () => set({ active: false, seen: true }),
    }),
    { name: 'focus-tour-v1', partialize: (s) => ({ seen: s.seen }) },
  ),
)
```
(`stepCount` aus dem Interface entfällt — Komponenten importieren `TOUR_STEP_COUNT`. `offer` bleibt als no-op-Hook für spätere Trigger; die Karte gated selbst über `seen`.)

- [ ] **Step 4: Run → PASS**; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/tour.store.ts src/store/tour.store.test.ts
git commit -m "feat(tour): tour state machine (active/step, seen persisted)"
```

---

### Task 2: Tour-Fixtures (typkonforme Schau-Daten)

**Files:**
- Create: `src/lib/tour/fixtures.ts`
- Test: `src/lib/tour/fixtures.test.ts`

**Interfaces:**
- Consumes: types `Customer` (`@/types/customer.types`), `Account` (`@/types/account.types`), `Todo` (`@/types/todo.types`), `Invoice`+`FinanceKpis` (`@/types/finance.types`), `Lead` (`@/types/lead.types`), `FollowUp` (`@/types/crm.types`), `Activity` (`@/types/pipeline.types`).
- Produces: `TOUR_WS = 'tour-ws'`; `TOUR_CUSTOMER_ID = 'tour-cust-1'`; und exportierte Arrays `tourCustomers: Customer[]`, `tourAccounts: Account[]`, `tourTodos: Todo[]`, `tourInvoices: Invoice[]`, `tourKpis: FinanceKpis`, `tourLeads: Lead[]`, `tourFollowUps: FollowUp[]`, `tourActivities: Activity[]`. Alle IDs mit Präfix `tour-`.

- [ ] **Step 1: Failing test** — `src/lib/tour/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { tourCustomers, tourAccounts, tourTodos, tourInvoices, tourKpis, tourLeads, tourActivities, TOUR_CUSTOMER_ID } from './fixtures'

describe('tour fixtures', () => {
  it('alle IDs sind tour-präfixiert (nichts kollidiert mit echten Daten)', () => {
    const ids = [...tourCustomers, ...tourAccounts, ...tourTodos, ...tourInvoices, ...tourLeads, ...tourActivities].map(x => x.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(id => id.startsWith('tour-'))).toBe(true)
  })
  it('enthält eine überfällige Rechnung (Mahnwesen leuchtet)', () => {
    expect(tourInvoices.some(i => i.status === 'overdue')).toBe(true)
  })
  it('enthält den geöffneten Beispiel-Kunden + dessen Timeline', () => {
    expect(tourCustomers.some(c => c.id === TOUR_CUSTOMER_ID)).toBe(true)
    expect(tourActivities.some(a => a.customerId === TOUR_CUSTOMER_ID || a.accountId === TOUR_CUSTOMER_ID)).toBe(true)
  })
  it('KPIs zeigen Umsatz + überfällig', () => {
    expect(tourKpis.overdueCount).toBeGreaterThan(0)
    expect(tourKpis.yearRevenue).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — `src/lib/tour/fixtures.ts`. Vollständige, typkonforme Objekte. (Datums-Strings sind statische ISO-Werte — KEIN `Date.now()`/`new Date()` nötig; feste Beispielwerte genügen und halten Tests deterministisch.)

```ts
import type { Customer } from '@/types/customer.types'
import type { Account } from '@/types/account.types'
import type { Todo } from '@/types/todo.types'
import type { Invoice, FinanceKpis } from '@/types/finance.types'
import type { Lead } from '@/types/lead.types'
import type { FollowUp } from '@/types/crm.types'
import type { Activity } from '@/types/pipeline.types'

export const TOUR_WS = 'tour-ws'
export const TOUR_CUSTOMER_ID = 'tour-cust-1'

const TS = '2026-06-01T09:00:00.000Z'           // generische created/updated-Zeit
const baseCust = { tags: [] as string[], goals: [] as string[], isPrivate: false, workspaceId: TOUR_WS,
  socialLinks: '{}', leadScore: 0, scoreFactors: {} as Record<string, number>, archivedAt: null,
  createdAt: TS, updatedAt: TS }

export const tourCustomers: Customer[] = [
  { ...baseCust, id: TOUR_CUSTOMER_ID, name: 'Bergmann Design GmbH', status: 'aktiv', priority: 'high',
    company: 'Bergmann Design GmbH', email: 'kontakt@bergmann.example', industry: 'Agentur', city: 'München' },
  { ...baseCust, id: 'tour-cust-2', name: 'Nordlicht Studios', status: 'aktiv', priority: 'normal',
    company: 'Nordlicht Studios', email: 'hallo@nordlicht.example', industry: 'Film', city: 'Hamburg' },
  { ...baseCust, id: 'tour-cust-3', name: 'Frau Dr. Klein', status: 'aktiv', priority: 'normal',
    email: 'klein@example.com', city: 'Berlin' },
]

const baseAcc = { workspaceId: TOUR_WS, createdBy: 'tour-user', kind: 'company' as const, priority: 'normal' as const,
  tags: [] as string[], goals: [] as string[], isPrivate: false, socialLinks: '{}', leadScore: 0,
  scoreFactors: {} as Record<string, number>, createdAt: TS, updatedAt: TS }

export const tourAccounts: Account[] = [
  { ...baseAcc, id: TOUR_CUSTOMER_ID, name: 'Bergmann Design GmbH', status: 'aktiv', priority: 'high' },
  { ...baseAcc, id: 'tour-cust-2', name: 'Nordlicht Studios', status: 'aktiv' },
  { ...baseAcc, id: 'tour-cust-3', name: 'Frau Dr. Klein', kind: 'individual', status: 'aktiv' },
]

export const tourTodos: Todo[] = [
  { id: 'tour-todo-1', title: 'Angebot für Bergmann finalisieren', status: 'open', priority: 'p1', bucket: 'today',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: TOUR_CUSTOMER_ID, dueDate: '2026-06-28', scheduledAt: '2026-06-28T14:00:00.000Z' },
  { id: 'tour-todo-2', title: 'Rechnung Nordlicht nachfassen', status: 'open', priority: 'p2', bucket: 'backlog',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: 'tour-cust-2', dueDate: '2026-06-20' },
  { id: 'tour-todo-3', title: 'Kickoff-Notizen verschickt', status: 'done', priority: 'p3', bucket: 'done',
    checklist: [], tags: [], createdAt: TS, updatedAt: TS, customerId: TOUR_CUSTOMER_ID },
]

const baseInv = { workspaceId: TOUR_WS, createdBy: 'tour-user', taxMode: 'standard' as const, bankInfo: '',
  isSuggestion: false, pendingSync: false, createdAt: TS, updatedAt: TS }

export const tourInvoices: Invoice[] = [
  { ...baseInv, id: 'tour-inv-1', accountId: TOUR_CUSTOMER_ID, number: 'RE-2026-001', date: '2026-05-02', dueDate: '2026-05-16',
    status: 'paid', subtotal: 3000, taxAmount: 570, total: 3570 },
  { ...baseInv, id: 'tour-inv-2', accountId: 'tour-cust-2', number: 'RE-2026-002', date: '2026-05-20', dueDate: '2026-06-03',
    status: 'overdue', subtotal: 1200, taxAmount: 228, total: 1428 },
]

export const tourKpis: FinanceKpis = {
  monthRevenue: 3570, yearRevenue: 18420, openCount: 1, openTotal: 1428,
  overdueCount: 1, overdueTotal: 1428, suggestionCount: 0, topClients: [],
}

export const tourLeads: Lead[] = [
  { id: 'tour-lead-1', workspaceId: TOUR_WS, name: 'Studio Voss', accountType: 'lead', pipelineStage: 'inbox',
    leadStatus: 'neu', leadSource: 'website', engagementScore: 20, createdAt: TS, updatedAt: TS,
    email: 'voss@example.com', phone: null, leadSourceDetail: null, companyName: 'Studio Voss', linkedinUrl: null,
    lastActivityAt: null, nextFollowUpAt: null, reEngageDate: null, convertedAt: null },
  { id: 'tour-lead-2', workspaceId: TOUR_WS, name: 'Café Mira', accountType: 'lead', pipelineStage: 'replied',
    leadStatus: 'warm', leadSource: 'event', engagementScore: 55, createdAt: TS, updatedAt: TS,
    email: 'mira@example.com', phone: null, leadSourceDetail: null, companyName: 'Café Mira', linkedinUrl: null,
    lastActivityAt: null, nextFollowUpAt: null, reEngageDate: null, convertedAt: null },
]

export const tourFollowUps: FollowUp[] = [
  { id: 'tour-fu-1', customerId: TOUR_CUSTOMER_ID, title: 'Nach Angebot nachfassen', dueDate: '2026-06-30', status: 'offen', priority: 'high', createdAt: TS },
]

export const tourActivities: Activity[] = [
  { id: 'tour-act-1', workspaceId: TOUR_WS, createdBy: 'tour-user', accountId: TOUR_CUSTOMER_ID, customerId: TOUR_CUSTOMER_ID,
    type: 'note', status: 'done', title: 'Kickoff-Call', body: 'Projekt-Scope besprochen, Angebot zugesagt.', createdAt: TS, updatedAt: TS },
  { id: 'tour-act-2', workspaceId: TOUR_WS, createdBy: 'tour-user', accountId: TOUR_CUSTOMER_ID, customerId: TOUR_CUSTOMER_ID,
    type: 'task', status: 'open', title: 'Angebot finalisieren', dueAt: '2026-06-28T14:00:00.000Z', createdAt: TS, updatedAt: TS },
]
```
**Hinweis an Implementer:** Falls tsc Feldfehler meldet (Typ-Drift gegenüber dieser Referenz), die Fixtures an die ECHTEN Typen anpassen (tsc ist die Wahrheit) — KEINE Felder erfinden, fehlende Pflichtfelder ergänzen.

- [ ] **Step 4: Run → PASS**; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tour/fixtures.ts src/lib/tour/fixtures.test.ts
git commit -m "feat(tour): typed in-memory tour fixtures (tour- prefixed)"
```

---

### Task 3: Fixture-Injektion/Verwerfen + Lade-Schutz

**Files:**
- Create: `src/lib/tour/apply.ts`
- Test: `src/lib/tour/apply.test.ts`
- Modify: `src/App.tsx` (Workspace-Lade-Effekt: bei aktiver Tour überspringen)

**Interfaces:**
- Consumes: alle Fixture-Arrays (Task 2), die Stores (`useCustomersStore`/`useAccountsStore`/`useTodosStore`/`useFinanceStore`/`useLeadsStore`/`useCrmStore`/`useActivitiesStore`), `useTourStore`.
- Produces: `applyTourFixtures(): void` (setzt Stores per setState), `clearTourFixtures(workspaceId: string): void` (leert + lädt echte Daten neu).

- [ ] **Step 1: Failing test** — `src/lib/tour/apply.test.ts` (mockt ALLE Gateways, um die Flüchtigkeit zu beweisen):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Gateways mocken → falls die Tour irgendwas persistiert, schlagen die Assertions an.
const gw = { create: vi.fn(), upsert: vi.fn(), update: vi.fn() }
vi.mock('@/data/accounts.gateway', () => ({ AccountsGateway: gw }))
vi.mock('@/data/customers.gateway', () => ({ CustomersGateway: gw }))
vi.mock('@/data/invoices.gateway', () => ({ InvoicesGateway: gw }))

import { applyTourFixtures, clearTourFixtures } from './apply'
import { useCustomersStore } from '@/store/customers.store'
import { useFinanceStore } from '@/store/finance.store'
import { useLeadsStore } from '@/store/leads.store'
import { tourCustomers } from './fixtures'

beforeEach(() => {
  vi.clearAllMocks()
  useCustomersStore.setState({ customers: [] } as any)
  useFinanceStore.setState({ invoices: [], kpis: null } as any)
  useLeadsStore.setState({ leads: [] } as any)
})

describe('tour apply/clear', () => {
  it('applyTourFixtures füllt die Stores aus dem Speicher', () => {
    applyTourFixtures()
    expect(useCustomersStore.getState().customers.length).toBe(tourCustomers.length)
    expect(useFinanceStore.getState().invoices.length).toBeGreaterThan(0)
    expect(useLeadsStore.getState().leads.length).toBeGreaterThan(0)
  })
  it('schreibt NICHTS über Gateways (flüchtig)', () => {
    applyTourFixtures()
    expect(gw.create).not.toHaveBeenCalled()
    expect(gw.upsert).not.toHaveBeenCalled()
    expect(gw.update).not.toHaveBeenCalled()
  })
  it('clearTourFixtures leert die Tour-Daten wieder', () => {
    applyTourFixtures()
    clearTourFixtures('real-ws')
    expect(useCustomersStore.getState().customers.every(c => !c.id.startsWith('tour-'))).toBe(true)
    expect(useFinanceStore.getState().invoices.every(i => !i.id.startsWith('tour-'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — `src/lib/tour/apply.ts`:

```ts
import { useCustomersStore } from '@/store/customers.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useTodosStore } from '@/store/todos.store'
import { useFinanceStore } from '@/store/finance.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCrmStore } from '@/store/crm.store'
import { useActivitiesStore } from '@/store/activities.store'
import {
  tourCustomers, tourAccounts, tourTodos, tourInvoices, tourKpis, tourLeads, tourFollowUps, tourActivities,
} from './fixtures'

/** Schau-Daten NUR im Speicher in die Stores setzen — kein Gateway, nichts persistiert. */
export function applyTourFixtures(): void {
  useCustomersStore.setState({ customers: tourCustomers } as any)
  useAccountsStore.setState({ accounts: tourAccounts } as any)
  useTodosStore.setState({ todos: tourTodos, allTodos: tourTodos } as any)
  useFinanceStore.setState({ invoices: tourInvoices, kpis: tourKpis } as any)
  useLeadsStore.setState({ leads: tourLeads } as any)
  useCrmStore.setState({ followUps: tourFollowUps, allFollowUps: tourFollowUps } as any)
  useActivitiesStore.setState({ activities: tourActivities } as any)
}

/** Tour-Daten verwerfen + echte (im frischen Workspace leere) Daten zurückladen. */
export function clearTourFixtures(workspaceId: string): void {
  useCustomersStore.setState({ customers: [] } as any)
  useAccountsStore.setState({ accounts: [] } as any)
  useTodosStore.setState({ todos: [], allTodos: [] } as any)
  useFinanceStore.setState({ invoices: [], kpis: null } as any)
  useLeadsStore.setState({ leads: [] } as any)
  useCrmStore.setState({ followUps: [], allFollowUps: [] } as any)
  useActivitiesStore.setState({ activities: [] } as any)
  // Echte Daten neu laden (mirror App.tsx Lade-Welle 1). Funktionsnamen real prüfen
  // (tsc): die gleichen, die App.tsx beim Workspace-Eintritt ruft.
  const fin = useFinanceStore.getState() as any
  fin.loadAll?.(workspaceId); fin.loadKpis?.(workspaceId)
  ;(useTodosStore.getState() as any).loadAll?.(workspaceId)
  ;(useCustomersStore.getState() as any).init?.()
  ;(useCrmStore.getState() as any).loadAll?.(workspaceId)
  ;(useLeadsStore.getState() as any).loadLeads?.(workspaceId)
}
```
**Hinweis:** die optionalen `?.`-Loader-Aufrufe defensiv halten; die echten Loader-Namen aus `App.tsx:171-175`/den Stores verifizieren und exakt einsetzen (für einen frischen leeren Workspace ist „leer setzen" allein schon korrekt; die Reloads sind für den Wiederhol-Fall mit echten Daten).

- [ ] **Step 4: App.tsx Lade-Schutz** — im Workspace-Lade-Effekt (`App.tsx:165-208`) als erste Zeile innerhalb des Effekts ergänzen:
```tsx
    if (useTourStore.getState().active) return
```
(Import `import { useTourStore } from '@/store/tour.store'` ergänzen.) Defensiv: verhindert, dass ein erneut feuernder Load die Fixtures überschreibt.

- [ ] **Step 5: Run → PASS**; tsc clean; volle Suite grün.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tour/apply.ts src/lib/tour/apply.test.ts src/App.tsx
git commit -m "feat(tour): ephemeral fixture apply/clear (no gateway writes) + load guard"
```

---

### Task 4: `TourGuide`-Overlay + Mount

**Files:**
- Create: `src/components/tour/TourGuide.tsx`
- Test: `src/components/tour/TourGuide.test.tsx`
- Modify: `src/App.tsx` (Mount + apply/clear an `active` koppeln)

**Interfaces:**
- Consumes: `useTourStore`, `applyTourFixtures`/`clearTourFixtures`, `useUiStore` (`setAppView`, `openCustomerAt`), `useWorkspaceStore.activeWorkspaceId`, `TOUR_CUSTOMER_ID`.
- Produces: `export function TourGuide()`.

- [ ] **Step 1: Failing test** — `src/components/tour/TourGuide.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const setAppView = vi.fn(); const openCustomerAt = vi.fn()
vi.mock('@/store/ui.store', () => ({ useUiStore: Object.assign(
  (sel: any) => sel({ setAppView, openCustomerAt }),
  { getState: () => ({ setAppView, openCustomerAt }) }) }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: Object.assign(
  (sel: any) => sel({ activeWorkspaceId: 'real-ws' }), { getState: () => ({ activeWorkspaceId: 'real-ws' }) }) }))
vi.mock('@/lib/tour/apply', () => ({ applyTourFixtures: vi.fn(), clearTourFixtures: vi.fn() }))

import { TourGuide } from './TourGuide'
import { useTourStore } from '@/store/tour.store'

beforeEach(() => { setAppView.mockClear(); openCustomerAt.mockClear(); useTourStore.setState({ active: false, step: 0, seen: false }) })
afterEach(cleanup)

describe('TourGuide', () => {
  it('rendert nichts wenn inaktiv', () => {
    render(<TourGuide />)
    expect(screen.queryByText('KORA')).toBeNull()
  })
  it('zeigt den Text des aktuellen Stopps und navigiert pro Schritt', () => {
    useTourStore.setState({ active: true, step: 0 })
    render(<TourGuide />)
    expect(screen.getByText(/Tag/)).toBeTruthy()       // Stopp 0 = Dashboard-Text
    fireEvent.click(screen.getByText('Weiter'))
    expect(useTourStore.getState().step).toBe(1)
  })
  it('letzter Stopp beendet die Tour', () => {
    useTourStore.setState({ active: true, step: 4 })
    render(<TourGuide />)
    fireEvent.click(screen.getByText(/Los geht/))
    expect(useTourStore.getState().active).toBe(false)
    expect(useTourStore.getState().seen).toBe(true)
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — `src/components/tour/TourGuide.tsx`:

```tsx
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTourStore, TOUR_STEP_COUNT } from '@/store/tour.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { applyTourFixtures, clearTourFixtures } from '@/lib/tour/apply'
import { TOUR_CUSTOMER_ID } from '@/lib/tour/fixtures'

interface Stop { text: string; go: (nav: { setAppView: (v: any) => void; openCustomerAt: (id: string, tab?: any) => void }) => void }

const STOPS: Stop[] = [
  { text: 'Das ist dein Tag — Umsatz, fällige Aufgaben und meine Queue auf einen Blick.', go: n => n.setAppView('dashboard') },
  { text: 'Die Kundenakte: Timeline, Aufgaben, Notizen und Finanzen an einem Ort.', go: n => n.openCustomerAt(TOUR_CUSTOMER_ID, 'verlauf') },
  { text: 'Finanzen: Rechnungen, Angebote, Mahnwesen — die rote Rechnung ist überfällig.', go: n => n.setAppView('invoices') },
  { text: 'Akquise: Leads wandern durch die Phasen, bis sie Kunden werden.', go: n => n.setAppView('leverage_leads') },
  { text: 'Und ich bin immer hier — frag mich nach deinem Tag. Jetzt bist du dran!', go: n => n.setAppView('corra') },
]

export function TourGuide() {
  const active = useTourStore(s => s.active)
  const step   = useTourStore(s => s.step)
  const next   = useTourStore(s => s.next)
  const prev   = useTourStore(s => s.prev)
  const skip   = useTourStore(s => s.skip)
  const finish = useTourStore(s => s.finish)
  const setAppView     = useUiStore(s => s.setAppView)
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  // Fixtures injizieren solange aktiv; beim Beenden verwerfen.
  useEffect(() => {
    if (!active) return
    applyTourFixtures()
    return () => { clearTourFixtures(useWorkspaceStore.getState().activeWorkspaceId ?? '') }
  }, [active])

  // Pro Stopp in die passende Ansicht navigieren.
  useEffect(() => {
    if (!active) return
    STOPS[step]?.go({ setAppView, openCustomerAt })
  }, [active, step, setAppView, openCustomerAt])

  if (!active) return null
  const isLast = step >= TOUR_STEP_COUNT - 1

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 940, background: 'oklch(0% 0 0 / 0.45)', pointerEvents: 'none' }} />
      <div style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 950,
        width: 'min(460px, calc(100vw - 40px))', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 24px 60px -16px oklch(0% 0 0 / 0.5)', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-gradient)', boxShadow: '0 0 8px var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>✦</span>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--fg-dim)' }}>KORA</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-dim)' }}>{step + 1}/{TOUR_STEP_COUNT}</span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.5 }}>{STOPS[step]?.text}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button onClick={skip} style={{ fontSize: 12, color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Überspringen</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {step > 0 && <button onClick={prev} style={{ fontSize: 13, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', cursor: 'pointer' }}>Zurück</button>}
            <button onClick={() => (isLast ? finish() : next())} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>
              {isLast ? 'Los geht’s' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
```
(Backdrop `pointerEvents:'none'`, damit die Tour die darunterliegende Ansicht zeigt, ohne Klicks abzufangen; nur die Sprechblase ist interaktiv.)

- [ ] **Step 4: In App.tsx mounten** — `import { TourGuide } from '@/components/tour/TourGuide'` ergänzen und `<TourGuide />` als Geschwister neben `<TeamChatOverlay />` rendern (z. B. direkt danach).

- [ ] **Step 5: Run Test → PASS**; tsc + volle Suite grün.

- [ ] **Step 6: Commit**

```bash
git add src/components/tour/TourGuide.tsx src/components/tour/TourGuide.test.tsx src/App.tsx
git commit -m "feat(tour): TourGuide overlay (5 stops, KORA bubble, navigates per stop)"
```

---

### Task 5: `TourOfferCard` (Angebot nach Onboarding)

**Files:**
- Create: `src/components/tour/TourOfferCard.tsx`
- Test: `src/components/tour/TourOfferCard.test.tsx`
- Modify: `src/App.tsx` (Mount nach `<CompanyStep />`)

**Interfaces:**
- Consumes: `useTourStore` (`seen`, `active`, `start`, `finish`), `useOnboardingStore` (`companyDone`, `bootstrapped`), `useWorkspaceStore.activeWorkspaceId`.
- Produces: `export function TourOfferCard()` — sichtbar nur wenn `companyDone && bootstrapped && activeWorkspaceId && !seen && !active`.

- [ ] **Step 1: Failing test** — `src/components/tour/TourOfferCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
vi.mock('@/store/onboarding.store', () => ({ useOnboardingStore: (sel: any) => sel({ companyDone: true, bootstrapped: true }) }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: (sel: any) => sel({ activeWorkspaceId: 'real-ws' }) }))
import { TourOfferCard } from './TourOfferCard'
import { useTourStore } from '@/store/tour.store'

beforeEach(() => { useTourStore.setState({ active: false, step: 0, seen: false }) })
afterEach(cleanup)

describe('TourOfferCard', () => {
  it('sichtbar bei !seen; Start startet die Tour', () => {
    render(<TourOfferCard />)
    expect(screen.getByText(/zeigt dir die App/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Tour starten|Start/))
    expect(useTourStore.getState().active).toBe(true)
  })
  it('Später setzt seen ohne Tour', () => {
    render(<TourOfferCard />)
    fireEvent.click(screen.getByText('Später'))
    expect(useTourStore.getState().seen).toBe(true)
    expect(useTourStore.getState().active).toBe(false)
  })
  it('unsichtbar wenn schon gesehen', () => {
    useTourStore.setState({ seen: true })
    const { container } = render(<TourOfferCard />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — `src/components/tour/TourOfferCard.tsx`:

```tsx
import { useTourStore } from '@/store/tour.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useWorkspaceStore } from '@/store/workspace.store'

export function TourOfferCard() {
  const seen   = useTourStore(s => s.seen)
  const active = useTourStore(s => s.active)
  const start  = useTourStore(s => s.start)
  const finish = useTourStore(s => s.finish)
  const companyDone   = useOnboardingStore(s => s.companyDone)
  const bootstrapped  = useOnboardingStore(s => s.bootstrapped)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  if (!companyDone || !bootstrapped || !activeWorkspaceId || seen || active) return null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 920, background: 'oklch(0% 0 0 / 0.35)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 921,
        width: 'min(420px, calc(100vw - 48px))', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: 'var(--shadow-2)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-gradient)', boxShadow: '0 0 8px var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>✦</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>KORA zeigt dir die App</span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          In 2 Minuten führe ich dich einmal durch alles — mit Beispiel-Daten, die danach wieder verschwinden. Dein Workspace bleibt sauber.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button onClick={() => finish()} style={{ fontSize: 12.5, color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 12px' }}>Später</button>
          <button onClick={() => start()} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>Tour starten</button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: In App.tsx mounten** — `import { TourOfferCard } from '@/components/tour/TourOfferCard'` + `<TourOfferCard />` direkt nach `<CompanyStep />` (vor `{showWelcome && ...}`) rendern.

- [ ] **Step 5: Run Test → PASS**; tsc + volle Suite grün.

- [ ] **Step 6: Commit**

```bash
git add src/components/tour/TourOfferCard.tsx src/components/tour/TourOfferCard.test.tsx src/App.tsx
git commit -m "feat(tour): first-login offer card (start/later)"
```

---

### Task 6: Echte Empty-States (Dashboard / Leads / Finanzen)

**Files:**
- Modify: `src/routes/DashboardRoute.tsx` (Leer-Zustand mit CTA + Queue-Leerhinweis)
- Modify: `src/routes/LeadsRoute.tsx` (leere Spalte → „Ersten Lead anlegen")
- Modify: `src/routes/FinanceRoute.tsx` (leere Liste → CTA)
- Test: `src/routes/DashboardRoute.test.tsx` (create, falls nicht vorhanden) — minimaler Empty-State-Test

**Interfaces:**
- Consumes: `useUiStore.setAppView`/`openCustomerAt`, `useTourStore.start` (für „Tour wiederholen"-Button im Dashboard-Leerzustand).

- [ ] **Step 1: Failing test** — `src/routes/DashboardRoute.test.tsx` (nur der Empty-State; mockt die Stores auf leer). Da DashboardRoute viele Stores zieht, den Test schlank halten: rendern mit leeren Stores und prüfen, dass ein Erststart-CTA erscheint.

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DashboardRoute } from './DashboardRoute'
// (Stores sind leer im Default-Zustand der Testumgebung.)
afterEach(cleanup)

describe('DashboardRoute empty state', () => {
  it('zeigt einen Erststart-CTA wenn nichts da ist', () => {
    render(<DashboardRoute />)
    expect(screen.getByText(/Leg los|Ersten Kunden|Erste Schritte/)).toBeTruthy()
  })
})
```
**Hinweis:** Falls DashboardRoute ohne umfangreiches Store-/Provider-Setup nicht rendert, den Empty-State in eine kleine, separat testbare Komponente `DashboardEmptyState` (`src/routes/DashboardRoute.tsx` oder `src/components/dashboard/DashboardEmptyState.tsx`) auslagern und DIESE testen (rendert immer den CTA). Das ist der saubere, isoliert testbare Schnitt.

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement**
  - **Dashboard:** Wenn keine Kunden/Tasks/Rechnungen/KPIs vorhanden (alles leer), oben eine „Leg los"-Karte rendern: kurzer Text + Buttons „Ersten Kunden anlegen" (`setAppView('clients')`) und „Tour wiederholen" (`useTourStore.getState().start()`). Die CORRA-Queue-Sektion: wenn leer, statt gar nichts einen dezenten Hinweis „Noch nichts zu tun — leg deinen ersten Kunden an." (Exakte Bedingung: dort wo heute `!queueLoading && currentItem &&` steht — einen `: <EmptyHint/>`-Zweig ergänzen.)
  - **Leads:** in der leeren Kanban-Spalte den `<span>Leer</span>` (`LeadsRoute.tsx:494-498`) um einen CTA-Button „Ersten Lead anlegen" ergänzen (ruft den bestehenden Lead-Anlegen-Pfad/`openCreate`).
  - **Finanzen:** beim leeren Rechnungs-Zustand („Keine Rechnungen", `FinanceRoute.tsx:832`) einen CTA „Neue Rechnung" auch ohne Daten anzeigen (rollenabhängig wie bestehend — Admin sieht den Button).

  Komponente `DashboardEmptyState` (empfohlener isolierter Schnitt):
```tsx
import { useUiStore } from '@/store/ui.store'
import { useTourStore } from '@/store/tour.store'

export function DashboardEmptyState() {
  const setAppView = useUiStore(s => s.setAppView)
  const startTour  = useTourStore(s => s.start)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 24, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Leg los 👋</div>
      <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
        Noch nichts hier. Leg deinen ersten Kunden an — oder lass dir von KORA die App zeigen.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => setAppView('clients')} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>Ersten Kunden anlegen</button>
        <button onClick={() => startTour()} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', cursor: 'pointer' }}>Tour wiederholen</button>
      </div>
    </div>
  )
}
```
  Im Dashboard diese Karte rendern, wenn der Workspace leer ist (keine Kunden UND keine Tasks UND keine Rechnungen).

- [ ] **Step 4: Run → PASS**; tsc + volle Suite grün.

- [ ] **Step 5: Commit**

```bash
git add src/routes/DashboardRoute.tsx src/routes/LeadsRoute.tsx src/routes/FinanceRoute.tsx src/components/dashboard/DashboardEmptyState.tsx src/routes/DashboardRoute.test.tsx
git commit -m "feat(onboarding): real empty-state CTAs on dashboard/leads/finance"
```
(Pfad `DashboardEmptyState.tsx` nur falls ausgelagert; sonst aus dem `git add` weglassen.)

---

### Task 7: „Tour wiederholen" im Hilfe-Drawer

**Files:**
- Modify: `src/lib/help-content.ts` (`HelpEntry` um optionales `action?: () => void` erweitern + Eintrag)
- Modify: `src/components/help/HelpDrawer.tsx` (Eintrag mit `action` ausführen statt nur `view`)
- Test: `src/lib/help-content.test.ts` (Eintrag „Tour" vorhanden)

**Interfaces:**
- Consumes: `useTourStore.getState().start`.

- [ ] **Step 1: `HelpEntry` erweitern** — in `src/lib/help-content.ts` das Interface um `action?: () => void` ergänzen; einen Eintrag in eine sinnvolle Kategorie (z. B. „Erste Schritte"/erste Kategorie) aufnehmen:
```ts
{ title: 'Tour wiederholen', body: 'KORA führt dich noch einmal durch die App.', action: () => import('@/store/tour.store').then(m => m.useTourStore.getState().start()) }
```
(Dynamischer Import vermeidet eine Modul-Zyklus-Gefahr; alternativ statischer Import oben, falls kein Zyklus.)

- [ ] **Step 2: `HelpDrawer` Eintrag-Klick** — in `src/components/help/HelpDrawer.tsx` beim Klick auf einen Eintrag: wenn `entry.action` vorhanden → `entry.action()` (+ Drawer schließen); sonst wie bisher `entry.view` → `setAppView`.

- [ ] **Step 3: Test** — in `src/lib/help-content.test.ts` ergänzen:
```ts
it('enthält einen "Tour wiederholen"-Eintrag mit action', () => {
  const all = HELP_CONTENT.flatMap(c => c.entries)
  const tour = all.find(e => e.title === 'Tour wiederholen')
  expect(tour).toBeTruthy()
  expect(typeof tour!.action).toBe('function')
})
```
(Importnamen `HELP_CONTENT` real prüfen.)

- [ ] **Step 4: Run → PASS**; tsc + volle Suite grün.

- [ ] **Step 5: Commit**

```bash
git add src/lib/help-content.ts src/components/help/HelpDrawer.tsx src/lib/help-content.test.ts
git commit -m "feat(tour): 'Tour wiederholen' entry in help drawer"
```

---

## Abschluss-Verifikation

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün (Basis 636 + ~16 neue).
- [ ] **Flüchtigkeit (Kern):** der `apply.test.ts`-Test beweist 0 Gateway-Writes während der Tour.
- [ ] **Manuell (frischer Workspace):** nach Onboarding erscheint die Angebots-Karte → „Tour starten" → 5 Stopps mit Schau-Daten (Dashboard zeigt Umsatz/überfällig, Kundenakte gefüllt, Finanzen mit roter Rechnung, Leads im Board, KORA) → „Los geht's" → Schau-Daten **weg**, Workspace leer, Dashboard zeigt „Leg los"-CTA. Kein einziger Demo-Datensatz bleibt (App neu starten → nichts da). „Später" überspringt; Hilfe → „Tour wiederholen" startet erneut.

## Spec-Coverage (Self-Review)
- §1 tour.store → Task 1 ✅. §2 Fixtures → Task 2 ✅. §3 apply/clear (flüchtig, 0 Writes) → Task 3 ✅. §4 Lade-Unterdrückung → Task 3 Step 4 ✅. §5 TourGuide (5 Stopps, KORA-Bubble, Navigation) → Task 4 ✅. §6 Angebots-Karte (angeboten, nicht erzwungen) → Task 5 ✅. §7 Empty-States → Task 6 ✅. §8 Tour wiederholen → Task 7 ✅.
- YAGNI: kein Demo-Workspace, kein Video, keine Live-KI-Erzählung, kein Element-Cutout-Spotlight. Keine DB-/Cloud-Änderung.
- Typkonsistenz: `TOUR_STEP_COUNT`/`TOUR_CUSTOMER_ID`/`applyTourFixtures`/`clearTourFixtures`/`useTourStore` durchgängig.
