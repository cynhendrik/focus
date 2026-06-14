# Onboarding-Anleitung & Hilfe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beispieldaten entfernen und durch einen animierten Willkommens-Moment, eine app-weite 5-Schritte-Onboarding-Leiste (auto-abhakend) und einen Hilfe-Drawer ersetzen.

**Architecture:** Ein neuer `onboarding.store` (zustand + persist) hält **gerastete** Schritt-Flags und leitet sie aus den bestehenden Daten-Stores ab (einmal erfüllt = bleibt erfüllt). Drei neue Präsentations-Komponenten (`WelcomeIntro`, `OnboardingBar`, `HelpDrawer`) werden in `App.tsx` innerhalb von `AppShell` eingehängt. Ein `useOnboardingSync`-Hook treibt die Reconciliation. Der alte `OnboardingWizard` und das `seed-ai-summaries`-Modul werden gelöscht.

**Tech Stack:** React, TypeScript, Zustand (+persist), framer-motion, Vitest + @testing-library/react (jsdom), lucide-react.

---

## File Structure

**Neu:**
- `src/store/onboarding.store.ts` — Zustand-Store: gerastete Flags, `reconcile`, `bootstrap`, Schritt-Metadaten. Single source of truth für Onboarding-Fortschritt.
- `src/store/onboarding.store.test.ts` — Unit-Tests der Store-Logik.
- `src/components/onboarding/useOnboardingSync.ts` — Hook: abonniert Daten-Stores → `reconcile`; `appView==='corra'` → `markCorraOpened`.
- `src/components/onboarding/useOnboardingSync.test.tsx` — Test der Verdrahtung.
- `src/components/onboarding/WelcomeIntro.tsx` — animierter Aurora-Auftritt (einmalig).
- `src/components/onboarding/WelcomeIntro.test.tsx` — Smoke-Test.
- `src/components/onboarding/OnboardingBar.tsx` — app-weite Schritt-Leiste oben.
- `src/components/onboarding/OnboardingBar.test.tsx` — Sichtbarkeit/Fortschritt/Navigation.
- `src/lib/help-content.ts` — statischer Hilfe-Inhalt (Kategorien → Funktionen).
- `src/lib/help-content.test.ts` — Validierung der `view`-Referenzen.
- `src/components/help/HelpDrawer.tsx` — Hilfe-Panel von rechts.
- `src/components/help/HelpDrawer.test.tsx` — rendert Schritte + Kategorien, schließt.

**Geändert:**
- `src/store/ui.store.ts` — `helpOpen` + `setHelpOpen`.
- `src/components/layout/NavSidebar.tsx` — „Hilfe"-Button (öffnet Drawer).
- `src/App.tsx` — Komponenten einhängen, `bootstrap()` statt Seed, Wizard-Logik entfernen.

**Gelöscht:**
- `src/components/onboarding/OnboardingWizard.tsx`
- `src/lib/seed-ai-summaries.ts`

---

## Task 1: onboarding.store — Kern-Logik (gerastet)

**Files:**
- Create: `src/store/onboarding.store.ts`
- Test: `src/store/onboarding.store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/store/onboarding.store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useOnboardingStore, ONBOARDING_STEP_IDS, ONBOARDING_STEPS, selectAllDone } from './onboarding.store'
import { useCustomersStore } from './customers.store'
import { useNotesStore } from './notes.store'
import { useTodosStore } from './todos.store'
import { useLeadsStore } from './leads.store'
import { useDealsStore } from './deals.store'
import { PRIVATE_CUSTOMER_ID } from '@/types/customer.types'
import type { Customer } from '@/types/customer.types'
import type { Note } from '@/types/note.types'

const cust = (id: string): Customer => ({ id, name: id } as Customer)
const note = (id: string): Note => ({ id } as Note)

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({
    done: { kunde: false, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: false, barDismissed: false, bootstrapped: false,
  })
  useCustomersStore.setState({ customers: [] })
  useNotesStore.setState({ notes: [] })
  useTodosStore.setState({ allTodos: [] })
  useLeadsStore.setState({ leads: [] })
  useDealsStore.setState({ deals: [] })
})

describe('onboarding.store', () => {
  it('has 5 steps with valid metadata', () => {
    expect(ONBOARDING_STEP_IDS).toEqual(['kunde', 'notiz', 'aufgabe', 'lead', 'corra'])
    expect(ONBOARDING_STEPS.map(s => s.id)).toEqual(ONBOARDING_STEP_IDS)
  })

  it('latches "kunde" when a real customer exists (ignores Privat)', () => {
    useCustomersStore.setState({ customers: [cust(PRIVATE_CUSTOMER_ID)] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.kunde).toBe(false)

    useCustomersStore.setState({ customers: [cust(PRIVATE_CUSTOMER_ID), cust('c1')] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.kunde).toBe(true)
  })

  it('does not un-latch a step after data is removed', () => {
    useNotesStore.setState({ notes: [note('n1')] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.notiz).toBe(true)

    useNotesStore.setState({ notes: [] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.notiz).toBe(true)
  })

  it('latches "lead" from either a lead or a deal', () => {
    useDealsStore.setState({ deals: [{ id: 'd1' } as any] })
    useOnboardingStore.getState().reconcile()
    expect(useOnboardingStore.getState().done.lead).toBe(true)
  })

  it('markCorraOpened latches the corra step', () => {
    useOnboardingStore.getState().markCorraOpened()
    expect(useOnboardingStore.getState().done.corra).toBe(true)
  })

  it('selectAllDone is true only when every step is done', () => {
    expect(selectAllDone(useOnboardingStore.getState())).toBe(false)
    useOnboardingStore.setState({ done: { kunde: true, notiz: true, aufgabe: true, lead: true, corra: true } })
    expect(selectAllDone(useOnboardingStore.getState())).toBe(true)
  })

  it('bootstrap on pre-existing data skips welcome and bar', () => {
    useCustomersStore.setState({ customers: [cust('c1')] })
    useOnboardingStore.getState().bootstrap()
    const s = useOnboardingStore.getState()
    expect(s.welcomeSeen).toBe(true)
    expect(s.barDismissed).toBe(true)
    expect(s.bootstrapped).toBe(true)
    expect(s.done.kunde).toBe(true)
  })

  it('bootstrap on empty install keeps welcome (shows intro)', () => {
    useOnboardingStore.getState().bootstrap()
    const s = useOnboardingStore.getState()
    expect(s.welcomeSeen).toBe(false)
    expect(s.barDismissed).toBe(false)
    expect(s.bootstrapped).toBe(true)
  })

  it('bootstrap runs only once', () => {
    useOnboardingStore.getState().bootstrap()
    useCustomersStore.setState({ customers: [cust('c1')] })
    useOnboardingStore.getState().bootstrap() // no-op second time
    expect(useOnboardingStore.getState().welcomeSeen).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/onboarding.store.test.ts`
Expected: FAIL — cannot resolve `./onboarding.store`.

- [ ] **Step 3: Write the store**

```ts
// src/store/onboarding.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCustomersStore } from '@/store/customers.store'
import { useNotesStore } from '@/store/notes.store'
import { useTodosStore } from '@/store/todos.store'
import { useLeadsStore } from '@/store/leads.store'
import { useDealsStore } from '@/store/deals.store'
import { PRIVATE_CUSTOMER_ID } from '@/types/customer.types'
import type { AppView } from '@/store/ui.store'

export type OnboardingStepId = 'kunde' | 'notiz' | 'aufgabe' | 'lead' | 'corra'

export interface OnboardingStepMeta {
  id: OnboardingStepId
  label: string
  hint: string
  view: AppView
}

/** Schritt-Metadaten — geteilt von OnboardingBar und HelpDrawer (DRY). */
export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  { id: 'kunde',   label: 'Kunde anlegen',     hint: 'Lege deinen ersten echten Kunden an.',        view: 'clients' },
  { id: 'notiz',   label: 'Notiz anlegen',     hint: 'Halte deine erste Notiz fest.',               view: 'notes' },
  { id: 'aufgabe', label: 'Aufgabe erstellen', hint: 'Erstelle deine erste Aufgabe.',               view: 'dashboard' },
  { id: 'lead',    label: 'Lead anlegen',      hint: 'Bring deinen ersten Lead in die Pipeline.',   view: 'leverage_leads' },
  { id: 'corra',   label: 'KI-Briefing öffnen',hint: 'Probier KORA — deinen KI-Assistenten.',       view: 'corra' },
]

export const ONBOARDING_STEP_IDS: OnboardingStepId[] = ONBOARDING_STEPS.map(s => s.id)

type DoneMap = Record<OnboardingStepId, boolean>
const EMPTY_DONE: DoneMap = { kunde: false, notiz: false, aufgabe: false, lead: false, corra: false }

interface OnboardingState {
  done: DoneMap
  corraOpened: boolean
  welcomeSeen: boolean
  barDismissed: boolean
  bootstrapped: boolean
  markWelcomeSeen: () => void
  dismissBar: () => void
  markCorraOpened: () => void
  reconcile: () => void
  bootstrap: () => void
}

function hasRealCustomer(): boolean {
  return useCustomersStore.getState().customers.some(c => c.id !== PRIVATE_CUSTOMER_ID)
}

function hasAnyRealData(): boolean {
  return hasRealCustomer()
    || useNotesStore.getState().notes.length > 0
    || useTodosStore.getState().allTodos.length > 0
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      done: { ...EMPTY_DONE },
      corraOpened: false,
      welcomeSeen: false,
      barDismissed: false,
      bootstrapped: false,

      markWelcomeSeen: () => set({ welcomeSeen: true }),
      dismissBar: () => set({ barDismissed: true }),
      markCorraOpened: () => { set({ corraOpened: true }); get().reconcile() },

      reconcile: () => {
        const cur = get().done
        const next: DoneMap = {
          kunde:   cur.kunde   || hasRealCustomer(),
          notiz:   cur.notiz   || useNotesStore.getState().notes.length > 0,
          aufgabe: cur.aufgabe || useTodosStore.getState().allTodos.length > 0,
          lead:    cur.lead    || useLeadsStore.getState().leads.length > 0 || useDealsStore.getState().deals.length > 0,
          corra:   cur.corra   || get().corraOpened,
        }
        // Nur setzen, wenn sich etwas geändert hat — verhindert Render-Schleifen.
        if (ONBOARDING_STEP_IDS.some(id => next[id] !== cur[id])) set({ done: next })
      },

      bootstrap: () => {
        if (get().bootstrapped) return
        if (hasAnyRealData()) set({ welcomeSeen: true, barDismissed: true })
        set({ bootstrapped: true })
        get().reconcile()
      },
    }),
    {
      name: 'cynera-onboarding-v1',
      partialize: (s) => ({
        done: s.done,
        corraOpened: s.corraOpened,
        welcomeSeen: s.welcomeSeen,
        barDismissed: s.barDismissed,
        bootstrapped: s.bootstrapped,
      }),
    }
  )
)

export function selectAllDone(s: OnboardingState): boolean {
  return ONBOARDING_STEP_IDS.every(id => s.done[id])
}

export function selectDoneCount(s: OnboardingState): number {
  return ONBOARDING_STEP_IDS.filter(id => s.done[id]).length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/onboarding.store.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/onboarding.store.ts src/store/onboarding.store.test.ts
git commit -m "feat(onboarding): add latched onboarding store"
```

---

## Task 2: useOnboardingSync — Reconcile-Verdrahtung

**Files:**
- Create: `src/components/onboarding/useOnboardingSync.ts`
- Test: `src/components/onboarding/useOnboardingSync.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/onboarding/useOnboardingSync.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOnboardingSync } from './useOnboardingSync'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { Customer } from '@/types/customer.types'

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({
    done: { kunde: false, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: false, barDismissed: false, bootstrapped: true,
  })
  useCustomersStore.setState({ customers: [] })
  useUiStore.setState({ appView: 'dashboard' })
})

describe('useOnboardingSync', () => {
  it('reconciles when a data store changes', () => {
    renderHook(() => useOnboardingSync())
    useCustomersStore.setState({ customers: [{ id: 'c1', name: 'A' } as Customer] })
    expect(useOnboardingStore.getState().done.kunde).toBe(true)
  })

  it('marks corra opened when appView becomes corra', () => {
    renderHook(() => useOnboardingSync())
    useUiStore.getState().setAppView('corra')
    expect(useOnboardingStore.getState().done.corra).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/onboarding/useOnboardingSync.test.tsx`
Expected: FAIL — cannot resolve `./useOnboardingSync`.

- [ ] **Step 3: Write the hook**

```ts
// src/components/onboarding/useOnboardingSync.ts
import { useEffect } from 'react'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useCustomersStore } from '@/store/customers.store'
import { useNotesStore } from '@/store/notes.store'
import { useTodosStore } from '@/store/todos.store'
import { useLeadsStore } from '@/store/leads.store'
import { useDealsStore } from '@/store/deals.store'
import { useUiStore } from '@/store/ui.store'

/**
 * Treibt die Onboarding-Reconciliation: abonniert die Daten-Stores und rastet
 * erfüllte Schritte ein; erkennt das Öffnen von KORA über appView.
 * Einmal in App.tsx mounten.
 */
export function useOnboardingSync(): void {
  useEffect(() => {
    const reconcile = () => useOnboardingStore.getState().reconcile()
    reconcile()
    const unsubs = [
      useCustomersStore.subscribe(reconcile),
      useNotesStore.subscribe(reconcile),
      useTodosStore.subscribe(reconcile),
      useLeadsStore.subscribe(reconcile),
      useDealsStore.subscribe(reconcile),
      useUiStore.subscribe((s) => {
        if (s.appView === 'corra' && !useOnboardingStore.getState().corraOpened) {
          useOnboardingStore.getState().markCorraOpened()
        }
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/onboarding/useOnboardingSync.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/useOnboardingSync.ts src/components/onboarding/useOnboardingSync.test.tsx
git commit -m "feat(onboarding): add reconcile sync hook"
```

---

## Task 3: ui.store — helpOpen-State

**Files:**
- Modify: `src/store/ui.store.ts`

- [ ] **Step 1: Add `helpOpen` to the state interface**

In `interface UiState` (nach `zeitPanelOpen: boolean`, ~Zeile 101) hinzufügen:

```ts
  helpOpen: boolean
```

Und in den Methoden-Block (nach `setZeitPanelOpen: ...`, ~Zeile 119) hinzufügen:

```ts
  setHelpOpen: (open: boolean) => void
```

- [ ] **Step 2: Add the initial value + setter**

Im `create`-Initialobjekt (nach `zeitPanelOpen: false,`, ~Zeile 141) hinzufügen:

```ts
      helpOpen: false,
```

Und bei den Settern (nach `setZeitPanelOpen: ...`, ~Zeile 181) hinzufügen:

```ts
      setHelpOpen: (open) =>
        set({ helpOpen: open }),
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

> Hinweis: `helpOpen` bewusst **nicht** in `partialize` aufnehmen — die Hilfe soll bei jedem Start geschlossen sein.

- [ ] **Step 4: Commit**

```bash
git add src/store/ui.store.ts
git commit -m "feat(ui): add helpOpen state for help drawer"
```

---

## Task 4: WelcomeIntro — animierter Aurora-Auftritt

**Files:**
- Create: `src/components/onboarding/WelcomeIntro.tsx`
- Test: `src/components/onboarding/WelcomeIntro.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/onboarding/WelcomeIntro.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { WelcomeIntro } from './WelcomeIntro'

afterEach(cleanup)

describe('WelcomeIntro', () => {
  it('renders the welcome headline', () => {
    render(<WelcomeIntro onDone={() => {}} />)
    expect(screen.getByText('Willkommen.')).toBeTruthy()
  })

  it('calls onDone when the CTA is clicked', () => {
    const onDone = vi.fn()
    render(<WelcomeIntro onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /los geht/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/onboarding/WelcomeIntro.test.tsx`
Expected: FAIL — cannot resolve `./WelcomeIntro`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/onboarding/WelcomeIntro.tsx
import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface Props {
  onDone: () => void
}

/**
 * Einmaliger Willkommens-Auftritt beim ersten Start: geschichtete Aurora-Glows
 * in Brand-Palette, Vignette, feines Korn, Titel mit Glanz-Sweep. Enter oder
 * Klick auf „Los geht's" beendet ihn.
 */
export function WelcomeIntro({ onDone }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.1, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500, overflow: 'hidden',
        background: 'radial-gradient(120% 90% at 50% 18%, #0d1322 0%, #07090e 70%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Aurora-Schichten */}
      <div className="aurora-rot" />
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
      <div className="aurora-blob aurora-blob-c" />
      <div className="aurora-vignette" />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.15, duration: 1.1, ease: [0.2, 0.7, 0.1, 1] }}
        style={{ position: 'relative', zIndex: 4, textAlign: 'center' }}
      >
        <h1 className="aurora-title">Willkommen.</h1>
        <p style={{
          marginTop: 14, fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
          letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(180,200,235,0.62)',
        }}>
          Dein Cultera Focus ist bereit
        </p>
        <button
          type="button"
          onClick={onDone}
          style={{
            marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '10px 20px', borderRadius: 99, cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(140,175,255,0.28)',
            color: '#dfe8ff', fontSize: 13, backdropFilter: 'blur(6px)',
          }}
        >
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9fb6ff' }}>↵</span>
          Los geht's
        </button>
      </motion.div>
    </motion.div>
  )
}
```

- [ ] **Step 4: Add the Aurora CSS**

Append an `src/index.css` (oder die zentrale globale CSS-Datei, in der `:root`-Tokens liegen):

```css
/* ── Onboarding: Aurora Welcome ─────────────────────────────────────── */
.aurora-rot {
  position: absolute; inset: -50%; z-index: 1;
  background: conic-gradient(from 200deg, #3b6df4, #6f5bff, #1fb6a6, #3b6df4);
  filter: blur(64px); opacity: 0.30; animation: aurora-rot 22s linear infinite;
}
.aurora-blob { position: absolute; z-index: 1; border-radius: 50%; filter: blur(58px); }
.aurora-blob-a { width: 340px; height: 340px; left: -8%; top: -22%; background: #3b6df4; opacity: 0.42; animation: aurora-drift-a 16s ease-in-out infinite; }
.aurora-blob-b { width: 300px; height: 300px; right: -6%; bottom: -26%; background: #7d5cff; opacity: 0.34; animation: aurora-drift-b 19s ease-in-out infinite; }
.aurora-blob-c { width: 220px; height: 220px; left: 46%; top: 34%; background: #19c6a8; opacity: 0.20; animation: aurora-drift-c 13s ease-in-out infinite; }
.aurora-vignette { position: absolute; inset: 0; z-index: 2; background: radial-gradient(110% 80% at 50% 42%, transparent 38%, rgba(5,7,12,0.72) 100%); }
.aurora-title {
  font-size: 38px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.05; margin: 0;
  color: transparent; -webkit-background-clip: text; background-clip: text;
  background-image: linear-gradient(100deg, rgba(255,255,255,0.82) 0 44%, #fff 50%, rgba(255,255,255,0.82) 56% 100%);
  background-size: 230% 100%; animation: aurora-shine 5.5s linear infinite;
  text-shadow: 0 2px 40px rgba(90,140,255,0.25);
}
@keyframes aurora-rot { to { transform: rotate(360deg); } }
@keyframes aurora-drift-a { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px,28px); } }
@keyframes aurora-drift-b { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-44px,-22px); } }
@keyframes aurora-drift-c { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-26px,18px) scale(1.18); } }
@keyframes aurora-shine { 0% { background-position: 140% 0; } 100% { background-position: -90% 0; } }
@media (prefers-reduced-motion: reduce) {
  .aurora-rot, .aurora-blob, .aurora-title { animation: none !important; }
}
```

> Falls die globale CSS-Datei nicht `src/index.css` heißt: in `src/main.tsx` nachsehen, welche CSS-Datei importiert wird, und dort anhängen.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/onboarding/WelcomeIntro.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/WelcomeIntro.tsx src/components/onboarding/WelcomeIntro.test.tsx src/index.css
git commit -m "feat(onboarding): add animated aurora welcome intro"
```

---

## Task 5: OnboardingBar — app-weite Schritt-Leiste

**Files:**
- Create: `src/components/onboarding/OnboardingBar.tsx`
- Test: `src/components/onboarding/OnboardingBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/onboarding/OnboardingBar.test.tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OnboardingBar } from './OnboardingBar'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useUiStore } from '@/store/ui.store'

beforeEach(() => {
  localStorage.clear()
  useOnboardingStore.setState({
    done: { kunde: true, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: true, barDismissed: false, bootstrapped: true,
  })
})
afterEach(cleanup)

describe('OnboardingBar', () => {
  it('shows progress n/5', () => {
    render(<OnboardingBar />)
    expect(screen.getByText('1 / 5')).toBeTruthy()
  })

  it('renders nothing when welcome not yet seen', () => {
    useOnboardingStore.setState({ welcomeSeen: false })
    const { container } = render(<OnboardingBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all steps are done', () => {
    useOnboardingStore.setState({ done: { kunde: true, notiz: true, aufgabe: true, lead: true, corra: true } })
    const { container } = render(<OnboardingBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when dismissed', () => {
    useOnboardingStore.setState({ barDismissed: true })
    const { container } = render(<OnboardingBar />)
    expect(container.firstChild).toBeNull()
  })

  it('navigates when a step pill is clicked', () => {
    render(<OnboardingBar />)
    fireEvent.click(screen.getByRole('button', { name: /Notiz anlegen/i }))
    expect(useUiStore.getState().appView).toBe('notes')
  })

  it('dismisses on the close button', () => {
    render(<OnboardingBar />)
    fireEvent.click(screen.getByRole('button', { name: /Ausblenden/i }))
    expect(useOnboardingStore.getState().barDismissed).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/onboarding/OnboardingBar.test.tsx`
Expected: FAIL — cannot resolve `./OnboardingBar`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/onboarding/OnboardingBar.tsx
import { Check, X } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import {
  useOnboardingStore, ONBOARDING_STEPS, selectAllDone, selectDoneCount,
} from '@/store/onboarding.store'

/**
 * Schmale, app-weite Leiste ganz oben mit den 5 Erste-Schritte-Pills.
 * Hakt automatisch ab (über den Store) und verschwindet bei 5/5 oder Ausblenden.
 */
export function OnboardingBar() {
  const done         = useOnboardingStore(s => s.done)
  const welcomeSeen  = useOnboardingStore(s => s.welcomeSeen)
  const barDismissed = useOnboardingStore(s => s.barDismissed)
  const dismissBar   = useOnboardingStore(s => s.dismissBar)
  const allDone      = useOnboardingStore(selectAllDone)
  const count        = useOnboardingStore(selectDoneCount)
  const setAppView   = useUiStore(s => s.setAppView)

  if (!welcomeSeen || barDismissed || allDone) return null

  const firstOpen = ONBOARDING_STEPS.find(s => !done[s.id])?.id

  return (
    <div className="onboarding-bar">
      <span className="onboarding-bar__label">Erste Schritte</span>
      <div className="onboarding-bar__pills">
        {ONBOARDING_STEPS.map((step, i) => {
          const isDone = done[step.id]
          const isCur  = step.id === firstOpen
          return (
            <button
              key={step.id}
              type="button"
              className="onboarding-pill"
              data-done={isDone ? 'true' : 'false'}
              data-current={isCur ? 'true' : 'false'}
              onClick={() => setAppView(step.view)}
              title={step.hint}
            >
              <span className="onboarding-pill__dot">
                {isDone ? <Check size={10} /> : i + 1}
              </span>
              <span className="onboarding-pill__label">{step.label}</span>
            </button>
          )
        })}
      </div>
      <span className="onboarding-bar__progress">{count} / {ONBOARDING_STEPS.length}</span>
      <button
        type="button"
        className="onboarding-bar__close"
        onClick={dismissBar}
        title="Ausblenden"
        aria-label="Ausblenden"
      >
        <X size={13} />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add the bar CSS**

Append an dieselbe globale CSS-Datei wie in Task 4:

```css
/* ── Onboarding: Top Bar ────────────────────────────────────────────── */
.onboarding-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px; flex-shrink: 0;
  background: var(--surface-2, #1b2030); border-bottom: 1px solid var(--border, #2b3550);
}
.onboarding-bar__label { font-size: 11px; font-weight: 700; color: var(--fg, #e6ebf5); white-space: nowrap; }
.onboarding-bar__pills { display: flex; gap: 6px; flex-wrap: wrap; }
.onboarding-pill {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
  border-radius: 99px; cursor: pointer; font-size: 11px; white-space: nowrap;
  background: transparent; border: 1px solid var(--border, #2b3550); color: var(--fg-muted, #aeb6c6);
}
.onboarding-pill[data-current="true"] { border-color: var(--accent, #5b8cff); color: var(--fg, #e6ebf5); }
.onboarding-pill[data-done="true"] { opacity: 0.65; }
.onboarding-pill[data-done="true"] .onboarding-pill__label { text-decoration: line-through; }
.onboarding-pill__dot {
  width: 15px; height: 15px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; background: rgba(255,255,255,0.12); color: var(--fg, #cfd6e4);
}
.onboarding-pill[data-current="true"] .onboarding-pill__dot { background: var(--accent, #5b8cff); color: #03102e; }
.onboarding-pill[data-done="true"] .onboarding-pill__dot { background: #37c978; color: #04210f; }
.onboarding-bar__progress { margin-left: auto; font-size: 10px; font-family: var(--font-mono, monospace); color: var(--fg-dim, #7f8aa0); }
.onboarding-bar__close { background: none; border: none; cursor: pointer; color: var(--fg-dim, #6b7587); display: inline-flex; padding: 2px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/onboarding/OnboardingBar.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/OnboardingBar.tsx src/components/onboarding/OnboardingBar.test.tsx src/index.css
git commit -m "feat(onboarding): add top onboarding step bar"
```

---

## Task 6: help-content — statische Hilfe-Inhalte

**Files:**
- Create: `src/lib/help-content.ts`
- Test: `src/lib/help-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/help-content.test.ts
import { describe, it, expect } from 'vitest'
import { HELP_CONTENT } from './help-content'

const VALID_VIEWS = new Set([
  'dashboard','profile','clients','akquise','invoices','settings','integrations',
  'posteingang','zeitmanagement','pipeline','calendar','mail','followups','leads',
  'journal','focus','corra','notes','inbox','sales',
  'leverage_inbox','leverage_leads','leverage_pipeline','leverage_mail','leverage_lead_detail',
])

describe('help-content', () => {
  it('has at least 8 categories, each with entries', () => {
    expect(HELP_CONTENT.length).toBeGreaterThanOrEqual(8)
    for (const cat of HELP_CONTENT) {
      expect(cat.label.length).toBeGreaterThan(0)
      expect(cat.entries.length).toBeGreaterThan(0)
    }
  })

  it('every entry has title + body, and any view ref is a valid AppView', () => {
    for (const cat of HELP_CONTENT) {
      for (const e of cat.entries) {
        expect(e.title.length).toBeGreaterThan(0)
        expect(e.body.length).toBeGreaterThan(0)
        if (e.view) expect(VALID_VIEWS.has(e.view)).toBe(true)
      }
    }
  })

  it('category ids are unique', () => {
    const ids = HELP_CONTENT.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/help-content.test.ts`
Expected: FAIL — cannot resolve `./help-content`.

- [ ] **Step 3: Write the content module**

```ts
// src/lib/help-content.ts
import type { AppView } from '@/store/ui.store'

export interface HelpEntry { title: string; body: string; view?: AppView }
export interface HelpCategory { id: string; label: string; entries: HelpEntry[] }

/** Kurze Erklärungen aller Funktionen — Quelle für den HelpDrawer. */
export const HELP_CONTENT: HelpCategory[] = [
  {
    id: 'kunden', label: 'Kunden & Kontakte',
    entries: [
      { title: 'Kunden anlegen', body: 'Lege Firmen und Personen an, pflege Status, Priorität, Tags und Kontaktdaten. Jeder Kunde hat eine eigene Akte mit Aktivitäten, Notizen, Dateien und Finanzen.', view: 'clients' },
      { title: 'Aktivitäten-Timeline', body: 'In der Kundenakte siehst du unter „Aktivitäten" die komplette Historie: Mails, Calls, Notizen, Aufgaben und KPIs auf einen Blick.', view: 'clients' },
    ],
  },
  {
    id: 'notizen', label: 'Notizen',
    entries: [
      { title: 'Notizen festhalten', body: 'Schreibe freie Notizen — global oder direkt an einem Kunden. Ideal für Gesprächsnotizen und Ideen.', view: 'notes' },
    ],
  },
  {
    id: 'aufgaben', label: 'Aufgaben & Aktivitäten',
    entries: [
      { title: 'Aufgaben erstellen', body: 'Lege To-dos mit Priorität, Fälligkeit und Buckets (Heute/In Arbeit) an. Per ⌘⇧N schnell erfassen.', view: 'dashboard' },
      { title: 'Heute-Cockpit', body: 'Die „Heute"-Ansicht bündelt fällige Aufgaben, Mails und Follow-Ups als priorisierte Queue.', view: 'dashboard' },
    ],
  },
  {
    id: 'leads', label: 'Leads & Pipeline',
    entries: [
      { title: 'Leads qualifizieren', body: 'Erfasse Leads, qualifiziere oder disqualifiziere sie und wandle sie in Deals um.', view: 'leverage_leads' },
      { title: 'Pipeline', body: 'Ziehe Deals durch deine Pipeline-Stufen bis zum Abschluss (Won/Lost).', view: 'leverage_pipeline' },
    ],
  },
  {
    id: 'finanzen', label: 'Rechnungen & Angebote',
    entries: [
      { title: 'Rechnung schreiben', body: 'Erstelle Rechnungen mit Positionen, exportiere als PDF und verwalte das Mahnwesen bei Überfälligkeit.', view: 'invoices' },
      { title: 'Angebote', body: 'Schreibe Angebote und überführe sie bei Annahme direkt in eine Rechnung.', view: 'invoices' },
    ],
  },
  {
    id: 'zeit', label: 'Zeiterfassung',
    entries: [
      { title: 'Zeit erfassen', body: 'Erfasse Arbeitszeiten pro Kunde/Auftrag mit Timer und rechne Aufträge stundenbasiert ab.', view: 'zeitmanagement' },
    ],
  },
  {
    id: 'mail', label: 'Mail',
    entries: [
      { title: 'Postfach verbinden', body: 'Binde dein IMAP-Postfach ein und bearbeite Mails direkt in der App — verknüpft mit Kunden.', view: 'posteingang' },
    ],
  },
  {
    id: 'kalender', label: 'Kalender',
    entries: [
      { title: 'Termine', body: 'Plane Termine und sieh sie im Kalender; verknüpfe sie mit Kunden und Aufgaben.', view: 'calendar' },
    ],
  },
  {
    id: 'corra', label: 'Corra / KI',
    entries: [
      { title: 'KORA KI-Assistent', body: 'KORA bereitet dir vor jedem Call ein KI-Briefing und priorisiert deinen Tag. Öffne ihn über die Seitenleiste (⌘K).', view: 'corra' },
    ],
  },
  {
    id: 'dateien', label: 'Dateien & Ablage',
    entries: [
      { title: 'Dateien ablegen', body: 'Lege Dokumente pro Kunde ab und nutze die Workspace-Ablage für rechnungsbezogene PDFs.', view: 'clients' },
    ],
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/help-content.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/help-content.ts src/lib/help-content.test.ts
git commit -m "feat(help): add static help content"
```

---

## Task 7: HelpDrawer — Hilfe-Panel von rechts

**Files:**
- Create: `src/components/help/HelpDrawer.tsx`
- Test: `src/components/help/HelpDrawer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/help/HelpDrawer.test.tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HelpDrawer } from './HelpDrawer'
import { useUiStore } from '@/store/ui.store'
import { useOnboardingStore } from '@/store/onboarding.store'

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState({ helpOpen: true, appView: 'dashboard' })
  useOnboardingStore.setState({
    done: { kunde: true, notiz: false, aufgabe: false, lead: false, corra: false },
    corraOpened: false, welcomeSeen: true, barDismissed: false, bootstrapped: true,
  })
})
afterEach(cleanup)

describe('HelpDrawer', () => {
  it('renders nothing when closed', () => {
    useUiStore.setState({ helpOpen: false })
    const { container } = render(<HelpDrawer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders first-steps progress and feature categories', () => {
    render(<HelpDrawer />)
    expect(screen.getByText(/Erste Schritte/i)).toBeTruthy()
    expect(screen.getByText('Rechnungen & Angebote')).toBeTruthy()
    expect(screen.getByText('Zeiterfassung')).toBeTruthy()
  })

  it('closes via the close button', () => {
    render(<HelpDrawer />)
    fireEvent.click(screen.getByRole('button', { name: /schließen/i }))
    expect(useUiStore.getState().helpOpen).toBe(false)
  })

  it('navigates and closes when an entry link is clicked', () => {
    render(<HelpDrawer />)
    fireEvent.click(screen.getByText('Zeiterfassung'))           // Kategorie aufklappen
    fireEvent.click(screen.getByRole('button', { name: /Zeit erfassen/i }))
    expect(useUiStore.getState().appView).toBe('zeitmanagement')
    expect(useUiStore.getState().helpOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/help/HelpDrawer.test.tsx`
Expected: FAIL — cannot resolve `./HelpDrawer`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/help/HelpDrawer.tsx
import { useState } from 'react'
import { X, Check, ChevronRight } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useOnboardingStore, ONBOARDING_STEPS, selectDoneCount } from '@/store/onboarding.store'
import { HELP_CONTENT } from '@/lib/help-content'
import type { AppView } from '@/store/ui.store'

/** Hilfe-Panel von rechts: Erste-Schritte + alle Funktionen nach Kategorie. */
export function HelpDrawer() {
  const helpOpen   = useUiStore(s => s.helpOpen)
  const setHelpOpen = useUiStore(s => s.setHelpOpen)
  const setAppView = useUiStore(s => s.setAppView)
  const done       = useOnboardingStore(s => s.done)
  const doneCount  = useOnboardingStore(selectDoneCount)
  const [openCat, setOpenCat] = useState<string | null>(null)

  if (!helpOpen) return null

  const go = (view: AppView) => { setAppView(view); setHelpOpen(false) }

  return (
    <div className="help-drawer__overlay" onClick={() => setHelpOpen(false)}>
      <aside className="help-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="help-drawer__head">
          <h2 className="help-drawer__title">Hilfe & Erste Schritte</h2>
          <button type="button" className="help-drawer__close" onClick={() => setHelpOpen(false)}
            title="Schließen" aria-label="Schließen">
            <X size={16} />
          </button>
        </header>

        <div className="help-drawer__body">
          <div className="help-drawer__group-label">Erste Schritte · {doneCount} / {ONBOARDING_STEPS.length}</div>
          {ONBOARDING_STEPS.map(step => (
            <button key={step.id} type="button" className="help-step" data-done={done[step.id] ? 'true' : 'false'}
              onClick={() => go(step.view)}>
              <span className="help-step__dot">{done[step.id] ? <Check size={11} /> : null}</span>
              <span>{step.label}</span>
            </button>
          ))}

          <div className="help-drawer__group-label" style={{ marginTop: 16 }}>Alle Funktionen</div>
          {HELP_CONTENT.map(cat => {
            const isOpen = openCat === cat.id
            return (
              <div key={cat.id} className="help-cat">
                <button type="button" className="help-cat__head"
                  onClick={() => setOpenCat(isOpen ? null : cat.id)}>
                  <span>{cat.label}</span>
                  <ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                </button>
                {isOpen && (
                  <div className="help-cat__body">
                    {cat.entries.map(e => (
                      <div key={e.title} className="help-entry">
                        <div className="help-entry__title">{e.title}</div>
                        <div className="help-entry__body">{e.body}</div>
                        {e.view && (
                          <button type="button" className="help-entry__link" onClick={() => go(e.view!)}>
                            {e.title} öffnen <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
```

> Hinweis für den Test „navigates and closes": Der „Dorthin"-Button trägt den Text „<Titel> öffnen", daher matcht `name: /Zeit erfassen/i` den Button „Zeit erfassen öffnen".

- [ ] **Step 4: Add the drawer CSS**

Append an dieselbe globale CSS-Datei:

```css
/* ── Help Drawer ────────────────────────────────────────────────────── */
.help-drawer__overlay { position: fixed; inset: 0; z-index: 9200; background: rgba(0,0,0,0.4); display: flex; justify-content: flex-end; }
.help-drawer { width: 360px; max-width: 92vw; height: 100%; background: var(--surface, #14171f); border-left: 1px solid var(--border, #2b3550); display: flex; flex-direction: column; box-shadow: -12px 0 32px rgba(0,0,0,0.4); }
.help-drawer__head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border, #2b3550); }
.help-drawer__title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fg, #e6ebf5); }
.help-drawer__close { background: none; border: none; cursor: pointer; color: var(--fg-dim, #7f8aa0); display: inline-flex; }
.help-drawer__body { flex: 1; overflow-y: auto; padding: 14px 16px; }
.help-drawer__group-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-dim, #7f8aa0); margin-bottom: 8px; }
.help-step { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border-radius: 8px; background: none; border: none; cursor: pointer; color: var(--fg, #cfd6e4); font-size: 12.5px; text-align: left; }
.help-step:hover { background: var(--surface-2, #1b2030); }
.help-step__dot { width: 16px; height: 16px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border, #2b3550); color: #37c978; flex-shrink: 0; }
.help-step[data-done="true"] .help-step__dot { background: #37c978; color: #04210f; border-color: #37c978; }
.help-step[data-done="true"] { opacity: 0.7; }
.help-cat { border-top: 1px solid var(--border, #20242e); }
.help-cat__head { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 11px 8px; background: none; border: none; cursor: pointer; color: var(--fg, #e6ebf5); font-size: 13px; font-weight: 600; }
.help-cat__body { padding: 0 8px 10px; display: flex; flex-direction: column; gap: 12px; }
.help-entry__title { font-size: 12.5px; font-weight: 600; color: var(--fg, #e6ebf5); }
.help-entry__body { font-size: 12px; color: var(--fg-muted, #8b95a8); line-height: 1.5; margin-top: 2px; }
.help-entry__link { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; padding: 0; background: none; border: none; cursor: pointer; color: var(--accent, #5b8cff); font-size: 11.5px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/help/HelpDrawer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/help/HelpDrawer.tsx src/components/help/HelpDrawer.test.tsx src/index.css
git commit -m "feat(help): add help drawer with first-steps + feature reference"
```

---

## Task 8: NavSidebar — „Hilfe"-Button

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`

- [ ] **Step 1: Import the icon + helpOpen setter**

In der Icon-Import-Liste aus `lucide-react` (~Zeile 10-14) `HelpCircle` ergänzen:

```ts
  Settings, PanelLeftClose, PanelLeftOpen, Sparkles, HelpCircle,
```

In `NavSidebar()` bei den Store-Selektoren (~Zeile 45-48) ergänzen:

```ts
  const setHelpOpen     = useUiStore(s => s.setHelpOpen)
```

- [ ] **Step 2: Add the Hilfe button before „Einstellungen"**

Direkt **vor** dem Settings-`NavItem` (~Zeile 139, nach `<div style={{ flex: 1 }} />`) einfügen:

```tsx
      <NavItem icon={HelpCircle} label="Hilfe" active={false}
        onClick={() => setHelpOpen(true)} />
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/NavSidebar.tsx
git commit -m "feat(nav): add help button to sidebar"
```

---

## Task 9: App.tsx verdrahten + Beispieldaten entfernen

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/onboarding/OnboardingWizard.tsx`, `src/lib/seed-ai-summaries.ts`

- [ ] **Step 1: Replace imports**

In `src/App.tsx` die Zeilen 66-67 ersetzen:

```ts
import { OnboardingWizard, hasCompletedOnboarding } from '@/components/onboarding/OnboardingWizard'
import { seedSampleAiSummaries } from '@/lib/seed-ai-summaries'
```

durch:

```ts
import { WelcomeIntro } from '@/components/onboarding/WelcomeIntro'
import { OnboardingBar } from '@/components/onboarding/OnboardingBar'
import { HelpDrawer } from '@/components/help/HelpDrawer'
import { useOnboardingSync } from '@/components/onboarding/useOnboardingSync'
import { useOnboardingStore } from '@/store/onboarding.store'
```

- [ ] **Step 2: Remove the dismissed-state hook**

Zeile 98 entfernen:

```ts
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
```

(Falls `useState` danach nirgends mehr genutzt wird, Import unverändert lassen — andere Stellen nutzen es weiterhin; nicht entfernen.)

- [ ] **Step 3: Replace the seed call with bootstrap + mount sync hook**

Zeile 174 `seedSampleAiSummaries()` ersetzen durch:

```ts
      useOnboardingStore.getState().bootstrap()
```

Und bei den übrigen Hook-Aufrufen am Komponenten-Ende (neben `useSyncBridge()` / `useMailAutoSync()`, ~Zeile 185-186) ergänzen:

```ts
  useOnboardingSync()
```

- [ ] **Step 4: Replace the welcome/onboarding selectors + render**

Den `showOnboarding`-Block (Zeilen 238-244) ersetzen durch:

```tsx
  // Erststart: WelcomeIntro nur nach Bootstrap und solange nicht gesehen.
  const welcomeSeen   = useOnboardingStore(s => s.welcomeSeen)
  const bootstrapped  = useOnboardingStore(s => s.bootstrapped)
  const markWelcomeSeen = useOnboardingStore(s => s.markWelcomeSeen)
  const showWelcome = bootstrapped && !welcomeSeen && !!activeWorkspaceId
```

> `useOnboardingStore`-Hooks gehören an den Anfang der Komponente zu den anderen Store-Selektoren (Rules of Hooks). Wenn der `showOnboarding`-Block tiefer in der Funktion stand, die drei Selektoren stattdessen oben bei den anderen `useUiStore`/Store-Selektoren deklarieren und hier nur `const showWelcome = ...` belassen.

- [ ] **Step 5: Mount the components in the AppShell tree**

Den Render-Block (Zeilen 246-273) anpassen: `<OnboardingBar />` als **erstes** Kind in `<AppShell>` (über `<div className="app">`), und unten `<OnboardingWizard .../>` durch `WelcomeIntro` + `HelpDrawer` ersetzen:

```tsx
  return (
    <AppShell>
      <OnboardingBar />
      <div className="app" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
        <NavSidebar />
        <main className="main">
          <Topbar />
          <div className="main-content">
            <ErrorBoundary>
              <RouteSwitch viewKey={routeKey}>
                <Suspense fallback={<div style={{ flex: 1 }} />}>
                  {renderMain()}
                </Suspense>
              </RouteSwitch>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
      {pickerOpen && <ClientPicker />}
      <Suspense fallback={null}><QuickCaptureModal /></Suspense>
      <ZeitPanel />
      <DownloadToast />
      <ToastViewport />
      <Suspense fallback={null}><GlobalQuickComposer /></Suspense>
      <HelpDrawer />
      {showWelcome && <WelcomeIntro onDone={markWelcomeSeen} />}
    </AppShell>
  )
}
```

- [ ] **Step 6: Delete the old files**

```bash
git rm src/components/onboarding/OnboardingWizard.tsx src/lib/seed-ai-summaries.ts
```

- [ ] **Step 7: Verify no dangling references**

Run: `npx vitest run src/store/onboarding.store.test.ts src/components/onboarding src/components/help/HelpDrawer.test.tsx src/lib/help-content.test.ts`
Then: `npx tsc --noEmit`
Expected: alle Tests grün, keine TS-Fehler. Falls `tsc` über `customersCount` oder andere jetzt-ungenutzte Variablen meckert, ungenutzte Reste entfernen.

- [ ] **Step 8: Full check + commit**

Run: `npm run test:run` and `npx tsc --noEmit`
Expected: gesamte Test-Suite grün, kein TS-Fehler.

```bash
git add src/App.tsx
git commit -m "feat(onboarding): wire welcome/bar/drawer into app, remove sample data"
```

---

## Self-Review-Ergebnis (vom Plan-Autor)

- **Spec-Abdeckung:** WelcomeIntro (Task 4), OnboardingBar (Task 5), HelpDrawer (Task 7), onboarding.store mit Rasterung + Bootstrap (Task 1), help-content (Task 6), „?"-Button (Task 8), Wizard/Seed-Entfernung (Task 9), `helpOpen` (Task 3), Reconcile-Treiber inkl. Corra-Erkennung (Task 2). Kanban-Seeds bleiben unangetastet (nicht referenziert). ✓
- **Platzhalter:** keine — jeder Code-Schritt enthält vollständigen Code. ✓
- **Typ-Konsistenz:** `OnboardingStepId`, `ONBOARDING_STEPS`, `ONBOARDING_STEP_IDS`, `selectAllDone`, `selectDoneCount`, `markWelcomeSeen`, `dismissBar`, `markCorraOpened`, `bootstrap`, `helpOpen`/`setHelpOpen` durchgängig identisch über alle Tasks verwendet. ✓
