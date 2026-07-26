# Projekt-Detail Tabs + Cockpit (Etappe 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Tab-Navigation (Cockpit/Phasen) in `ProjectDetailRoute`, add a "Nächster Zug" + Phasen-Rail + Ampel + Signale Cockpit view, and move the existing Notizen/Aufgaben content into the Phasen tab — without any new backend/DB changes.

**Architecture:** Pure-frontend etappe. Extends the existing `signals.ts` module (health/next-move logic), adds a generic reusable `TabBar` component (extracted from `CustomerRoute.tsx`'s inline pattern), adds a new `ProjectCockpit` component, and rewires `ProjectDetailRoute.tsx` to use both. No Rust/SQLite/Supabase changes.

**Tech Stack:** React + TypeScript, Zustand, Vitest, `@testing-library/react`, lucide-react.

## Global Constraints

- `HealthLevel` gains a 4th value `'unknown'` — `projectHealthBudget()`/`projectHealthStimmung()` return `'unknown'`, not `'ok'`. Anywhere `'unknown'` is displayed, it must render as a **neutral/gray** state ("noch nicht erfasst"), never green — this is a deliberate anti-value-lie decision from the spec, not negotiable.
- No hardcoded "Kora sagt..." text anywhere in this etappe — no real AI call backs it, so it would be fake.
- No Kennzahlen-Streifen (Verrechnet/Offen), no Burn-Chart — no real data source exists yet for either.
- Tab-Navigation shows **only** `Cockpit` and `Phasen` — no inert Moodboard/Team/Rechnungen tabs.
- `CustomerRoute.tsx` is **not** touched/refactored in this etappe, even though `TabBar` is extracted from its pattern — that would be unrelated, ungefragtes Refactoring.

---

## Task 1: `signals.ts` — Ehrlichkeits-Fix + `nextMove`

**Files:**
- Modify: `src/lib/projects/signals.ts`
- Modify: `src/lib/projects/signals.test.ts`

**Interfaces:**
- Produces: `HealthLevel = 'ok' | 'warn' | 'bad' | 'unknown'`; `GATE_COLOR: Record<ProjectPhase['gateState'], string>` (moved here from `ProjectsTimeline.tsx`); `formatDateDe(iso: string): string` (now exported, was private); `NextMove { kind: 'gate_pending' | 'ruhe'; tone: 'bad' | 'warn' | 'ok'; title: string; why: string; phaseId: string | null }`; `nextMove(phases: ProjectPhase[], today: Date): NextMove`. Task 2 (`ProjectsTimeline.tsx`) consumes `GATE_COLOR` and the updated `HealthLevel`. Task 5 (`ProjectCockpit.tsx`) consumes `nextMove`, `GATE_COLOR`, and the updated `projectHealthBudget`/`projectHealthStimmung`.

- [ ] **Step 1: Vor der Änderung prüfen, dass `projectHealthBudget`/`projectHealthStimmung` nur an den bekannten Stellen genutzt werden**

Run: `grep -rn "projectHealthBudget\|projectHealthStimmung" src/ --include="*.tsx" --include="*.ts"`
Expected: Treffer nur in `src/lib/projects/signals.ts`, `src/lib/projects/signals.test.ts`, `src/components/projects/ProjectsTimeline.tsx`. Falls weitere Treffer auftauchen, diese Datei(en) notieren — sie werden in Task 2 zusätzlich angepasst werden müssen (nicht in dieser Task, aber als Konzern für den Reviewer vermerken).

- [ ] **Step 2: Fehlschlagende Tests zuerst schreiben**

In `src/lib/projects/signals.test.ts`, die bestehende `describe('projectHealthBudget / projectHealthStimmung', ...)`-Sektion ersetzen und eine neue `describe('nextMove', ...)`-Sektion ergänzen (Datei komplett wie folgt):

```typescript
import { describe, it, expect } from 'vitest'
import { projectHealthZeit, projectHealthBudget, projectHealthStimmung, projectSignals, nextMove, formatDateDe } from './signals'
import type { ProjectPhase } from '@/types/project.types'

const today = new Date(2026, 4, 18) // Mo, 18.05.2026

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 50,
    ...overrides,
  }
}

describe('projectHealthZeit', () => {
  it('ist ok ohne pending Gates', () => {
    expect(projectHealthZeit([phase({ gateState: 'open' })], today)).toBe('ok')
  })
  it('ist ok, wenn das pending Gate erst in 6 Tagen fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-24' })], today)).toBe('ok')
  })
  it('ist warn, wenn das pending Gate in genau 5 Tagen fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-23' })], today)).toBe('warn')
  })
  it('ist warn, wenn das pending Gate heute fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-18' })], today)).toBe('warn')
  })
  it('ist bad, wenn das pending Gate bereits überfällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-12' })], today)).toBe('bad')
  })
  it('ignoriert pending Gates ohne Termin', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: null })], today)).toBe('ok')
  })
})

describe('projectHealthBudget / projectHealthStimmung', () => {
  it('sind in dieser Etappe fix unknown -- keine echte Datengrundlage, kein Fake-ok', () => {
    expect(projectHealthBudget()).toBe('unknown')
    expect(projectHealthStimmung()).toBe('unknown')
  })
})

describe('projectSignals', () => {
  it('liefert nur pending Gates', () => {
    const signals = projectSignals([phase({ gateState: 'open' }), phase({ id: 'ph2', gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(signals).toHaveLength(1)
    expect(signals[0].phaseId).toBe('ph2')
  })
  it('markiert überfällige Gates als bad, sonst warn', () => {
    const overdue = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-01' })], today)
    expect(overdue[0].tone).toBe('bad')
    const upcoming = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(upcoming[0].tone).toBe('warn')
  })
  it('formatiert das Datum als TT.MM.JJJJ im detail-Text', () => {
    const signals = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(signals[0].detail).toContain('22.05.2026')
  })
})

describe('formatDateDe', () => {
  it('formatiert ein YYYY-MM-DD-Datum als TT.MM.JJJJ', () => {
    expect(formatDateDe('2026-05-22')).toBe('22.05.2026')
  })
})

describe('nextMove', () => {
  it('liefert die Ruhe-Variante, wenn kein Gate pending ist', () => {
    const move = nextMove([phase({ gateState: 'open' }), phase({ id: 'ph2', gateState: 'approved' })], today)
    expect(move.kind).toBe('ruhe')
    expect(move.tone).toBe('ok')
    expect(move.phaseId).toBeNull()
  })

  it('liefert das naechste pending Gate mit tone warn, wenn nicht ueberfaellig', () => {
    const move = nextMove([phase({ id: 'ph1', gateName: 'Konzeptfreigabe', gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(move.kind).toBe('gate_pending')
    expect(move.tone).toBe('warn')
    expect(move.phaseId).toBe('ph1')
    expect(move.title).toContain('Konzeptfreigabe')
    expect(move.title).toContain('22.05.2026')
  })

  it('liefert tone bad, wenn das pending Gate ueberfaellig ist', () => {
    const move = nextMove([phase({ gateState: 'pending', gateDate: '2026-05-01' })], today)
    expect(move.tone).toBe('bad')
  })

  it('waehlt bei mehreren pending Gates das am weitesten ueberfaellige/naechste zuerst', () => {
    const move = nextMove([
      phase({ id: 'ph-later', gateState: 'pending', gateDate: '2026-06-01' }),
      phase({ id: 'ph-overdue', gateState: 'pending', gateDate: '2026-05-01' }),
    ], today)
    expect(move.phaseId).toBe('ph-overdue')
  })

  it('behandelt ein pending Gate ohne Termin als am wenigsten dringend (zuletzt)', () => {
    const move = nextMove([
      phase({ id: 'ph-no-date', gateState: 'pending', gateDate: null }),
      phase({ id: 'ph-dated', gateState: 'pending', gateDate: '2026-06-01' }),
    ], today)
    expect(move.phaseId).toBe('ph-dated')
  })
})
```

- [ ] **Step 3: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/lib/projects/signals.test.ts`
Expected: FAIL — `nextMove`, `formatDateDe`, `GATE_COLOR` sind noch nicht exportiert; `projectHealthBudget`/`projectHealthStimmung` geben noch `'ok'` zurück.

- [ ] **Step 4: `signals.ts` implementieren**

Datei komplett ersetzen:

```typescript
import type { ProjectPhase } from '@/types/project.types'

export type HealthLevel = 'ok' | 'warn' | 'bad' | 'unknown'

export interface ProjectSignal {
  kind: 'gate_pending'
  tone: 'warn' | 'bad'
  label: string
  detail: string
  phaseId: string
}

export interface NextMove {
  kind: 'gate_pending' | 'ruhe'
  tone: 'bad' | 'warn' | 'ok'
  title: string
  why: string
  phaseId: string | null
}

export const GATE_COLOR: Record<ProjectPhase['gateState'], string> = {
  approved: 'var(--ok)', pending: 'var(--warn)', open: 'var(--border-strong)',
}

const GATE_WARN_DAYS = 5

function daysUntil(dateIso: string, today: Date): number {
  const d = new Date(`${dateIso}T00:00:00`)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

export function formatDateDe(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Zeit-Ampel: aus überfälligen/bald fälligen pending-Gates abgeleitet.
 * Budget/Stimmung sind in dieser Etappe fix 'unknown' -- es gibt noch keine
 * Zeiterfassung (Budget) bzw. kein Moodboard (Stimmung), also keine echte
 * Datengrundlage. Ein fixes 'ok' waere eine Value-Luege (grüner Punkt fuer
 * "alles im Rahmen", obwohl schlicht nichts gemessen wird). */
export function projectHealthZeit(phases: ProjectPhase[], today: Date): HealthLevel {
  const pendingWithDate = phases.filter(p => p.gateState === 'pending' && p.gateDate)
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) < 0)) return 'bad'
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) <= GATE_WARN_DAYS)) return 'warn'
  return 'ok'
}

export function projectHealthBudget(): HealthLevel {
  return 'unknown'
}

export function projectHealthStimmung(): HealthLevel {
  return 'unknown'
}

/** Aktuell nur "Gate wartet"-Signale. Erweiterbar (Etappe 6: Rechnungssignale),
 * ohne dass Aufrufer (Filter, "Diese Woche wird entschieden"-Liste) sich ändern. */
export function projectSignals(phases: ProjectPhase[], today: Date): ProjectSignal[] {
  return phases
    .filter(p => p.gateState === 'pending')
    .map(p => {
      const overdue = p.gateDate ? daysUntil(p.gateDate, today) < 0 : false
      return {
        kind: 'gate_pending' as const,
        tone: overdue ? ('bad' as const) : ('warn' as const),
        label: `${p.gateName} wartet`,
        detail: p.gateDate ? `fällig ${formatDateDe(p.gateDate)}` : 'kein Termin gesetzt',
        phaseId: p.id,
      }
    })
}

/** "Nächster Zug" fürs Cockpit: das dringendste pending Gate (überfällig oder
 * am nächsten fällig zuerst, ohne Termin zuletzt), sonst eine neutrale
 * Ruhe-Meldung. Nur Gate-basiert -- Rechnungs-/Scope-/Moodboard-Zweige
 * kommen erst mit späteren Etappen dazu. */
export function nextMove(phases: ProjectPhase[], today: Date): NextMove {
  const pending = phases
    .filter(p => p.gateState === 'pending')
    .map(p => ({ p, days: p.gateDate ? daysUntil(p.gateDate, today) : Infinity }))
    .sort((a, b) => a.days - b.days)

  if (pending.length > 0) {
    const { p, days } = pending[0]
    const overdue = days < 0
    return {
      kind: 'gate_pending',
      tone: overdue ? 'bad' : 'warn',
      title: `${p.gateName} einholen` + (p.gateDate ? ` — ${formatDateDe(p.gateDate)}` : ''),
      why: `Phase „${p.name}" wartet auf Freigabe. Ohne sie startet die nächste Phase nicht.`,
      phaseId: p.id,
    }
  }

  return {
    kind: 'ruhe',
    tone: 'ok',
    title: 'Nichts brennt. Nächster Meilenstein läuft planmäßig.',
    why: 'Kein offenes Gate wartet auf Freigabe.',
    phaseId: null,
  }
}
```

- [ ] **Step 5: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/lib/projects/signals.test.ts`
Expected: PASS (17 Tests: 6 projectHealthZeit + 1 Budget/Stimmung + 3 projectSignals + 1 formatDateDe + 6 nextMove).

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/signals.ts src/lib/projects/signals.test.ts
git commit -m "feat(projects): signals -- Budget/Stimmung ehrlich als 'unknown', nextMove fuers Cockpit"
```

---

## Task 2: `ProjectsTimeline.tsx` — `GATE_COLOR` importieren, `unknown`-Farbe ergänzen

**Files:**
- Modify: `src/components/projects/ProjectsTimeline.tsx`

**Interfaces:**
- Consumes: `GATE_COLOR`, `HealthLevel` (Task 1, erweitert um `'unknown'`).
- Produces: keine neue öffentliche Schnittstelle — reine Anpassung an die Task-1-Änderungen.

- [ ] **Step 1: lokale `GATE_COLOR`-Konstante entfernen, Import ergänzen**

In `src/components/projects/ProjectsTimeline.tsx:1-12` ersetzen:

```typescript
import type { Project, ProjectPhase } from '@/types/project.types'
import type { TimelineWeek } from '@/lib/projects/timeline-weeks'
import { dateToTimelineOffset } from '@/lib/projects/timeline-weeks'
import { projectHealthZeit, projectHealthBudget, projectHealthStimmung, GATE_COLOR, type HealthLevel } from '@/lib/projects/signals'

const HEALTH_COLOR: Record<HealthLevel, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', unknown: 'var(--fg-dim)',
}
```

(Die alte, lokale `const GATE_COLOR = {...}`-Definition darunter komplett entfernen -- sie kommt jetzt aus `@/lib/projects/signals`.)

- [ ] **Step 2: Tests + Typecheck**

Run: `npx vitest run src/components/projects/ProjectsTimeline.test.tsx`
Expected: PASS (6 Tests, unverändert -- Farben werden dort nicht assertet).

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectsTimeline.tsx
git commit -m "refactor(projects): ProjectsTimeline -- GATE_COLOR aus signals.ts, unknown-Ampelfarbe"
```

---

## Task 3: `ui.store.ts` — `ProjectTab`-State

**Files:**
- Modify: `src/store/ui.store.ts`

**Interfaces:**
- Produces: `export type ProjectTab = 'cockpit' | 'phasen'`; `useUiStore().activeProjectTab: ProjectTab` (Default `'cockpit'`); `useUiStore().setActiveProjectTab(tab: ProjectTab): void`. Task 6 (`ProjectDetailRoute.tsx`) konsumiert beides.

- [ ] **Step 1: Typ + State + Setter ergänzen**

Nach der `AppView`-Typdefinition (`src/store/ui.store.ts:76-91`, vor `interface UiState`) einfügen:

```typescript
/** Tabs im Projekt-Detail. Nur die Tabs, die wirklich Inhalt haben --
 * Moodboard/Team/Rechnungen kommen erst als Tab dazu, wenn ihre jeweilige
 * Etappe (5/4/6) tatsaechlich gebaut wird. */
export type ProjectTab = 'cockpit' | 'phasen'
```

In `interface UiState` (nach `selectedProjectId: string | null` bei Zeile 116) einfügen:

```typescript
  /** Aktiver Tab im Projekt-Detail. */
  activeProjectTab: ProjectTab
```

Und den Setter in der Interface-Methodenliste (nach `setSelectedProjectId`, Zeile 136) einfügen:

```typescript
  setActiveProjectTab: (tab: ProjectTab) => void
```

- [ ] **Step 2: Initialwert + Implementierung ergänzen**

Im State-Objekt nach `selectedProjectId: null,` (Zeile 160) einfügen:

```typescript
      activeProjectTab: 'cockpit',
```

Nach der `setSelectedProjectId`-Implementierung (Zeile 219-220) einfügen:

```typescript

      setActiveProjectTab: (tab) =>
        set({ activeProjectTab: tab }),
```

- [ ] **Step 3: Persistierung ergänzen**

In `partialize` (Zeile 236-247) `activeProjectTab: s.activeProjectTab,` nach `settingsTab: s.settingsTab,` ergänzen.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i "ui.store\|project"`
Expected: keine Fehler (Datei wird noch nirgends importiert -- folgt in Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/store/ui.store.ts
git commit -m "feat(store): ProjectTab-State fuer Projekt-Detail-Tabs"
```

---

## Task 4: `TabBar` — wiederverwendbare Tab-Leiste

**Files:**
- Create: `src/components/shared/TabBar.tsx`
- Test: `src/components/shared/TabBar.test.tsx`

**Interfaces:**
- Produces: `TabBar({ tabs, activeId, onChange }): JSX.Element` mit `tabs: { id: string; label: string; icon: LucideIcon; count?: number }[]`. Task 6 (`ProjectDetailRoute.tsx`) rendert diese Komponente mit den zwei Cockpit/Phasen-Tabs.

- [ ] **Step 1: Fehlschlagenden Test zuerst schreiben**

Neue Datei `src/components/shared/TabBar.test.tsx`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from './TabBar'
import { Target, Milestone } from 'lucide-react'

afterEach(cleanup)

const tabs = [
  { id: 'a', label: 'Cockpit', icon: Target },
  { id: 'b', label: 'Phasen', icon: Milestone, count: 2 },
]

describe('TabBar', () => {
  it('rendert alle Tab-Labels', () => {
    render(<TabBar tabs={tabs} activeId="a" onChange={() => {}} />)
    expect(screen.getByText('Cockpit')).toBeTruthy()
    expect(screen.getByText('Phasen')).toBeTruthy()
  })

  it('zeigt die Badge-Zahl nur, wenn count gesetzt ist', () => {
    render(<TabBar tabs={tabs} activeId="a" onChange={() => {}} />)
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('ruft onChange mit der geklickten Tab-Id auf', () => {
    const clicked: string[] = []
    render(<TabBar tabs={tabs} activeId="a" onChange={id => clicked.push(id)} />)
    fireEvent.click(screen.getByText('Phasen'))
    expect(clicked).toEqual(['b'])
  })
})
```

Run: `npx vitest run src/components/shared/TabBar.test.tsx`
Expected: FAIL — Modul `./TabBar` existiert nicht.

- [ ] **Step 2: Komponente schreiben**

Neue Datei `src/components/shared/TabBar.tsx`:

```typescript
import type { LucideIcon } from 'lucide-react'

export interface TabDef {
  id: string
  label: string
  icon: LucideIcon
  count?: number
}

export function TabBar({ tabs, activeId, onChange }: {
  tabs: TabDef[]
  activeId: string
  onChange: (id: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0, padding: '0 24px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg)',
    }}>
      {tabs.map(t => {
        const Ic = t.icon
        const active = activeId === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '18px 18px 16px', marginRight: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: active ? 'var(--accent-text)' : 'var(--fg-dim)',
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: active ? 600 : 500,
              position: 'relative', transition: 'color 140ms',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-dim)' }}
          >
            <Ic size={15} style={{ opacity: active ? 1 : 0.85 }} />
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 18, height: 18, padding: '0 6px', borderRadius: 99,
                background: 'var(--accent-soft)', color: 'var(--accent-text)',
                fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              }}>
                {t.count}
              </span>
            )}
            {active && (
              <span style={{
                position: 'absolute', left: 18, right: 18, bottom: -1, height: 2, borderRadius: 2,
                background: 'var(--accent-gradient)', boxShadow: '0 0 12px var(--accent-glow)',
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/shared/TabBar.test.tsx`
Expected: PASS (3 Tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/TabBar.tsx src/components/shared/TabBar.test.tsx
git commit -m "feat(shared): TabBar -- wiederverwendbare Tab-Leiste (aus CustomerRoute-Pattern extrahiert)"
```

---

## Task 5: `ProjectCockpit` — Nächster Zug, Phasen-Rail, Ampel, Signale

**Files:**
- Create: `src/components/projects/ProjectCockpit.tsx`
- Test: `src/components/projects/ProjectCockpit.test.tsx`

**Interfaces:**
- Consumes: `nextMove`, `projectHealthZeit`, `projectHealthBudget`, `projectHealthStimmung`, `projectSignals`, `GATE_COLOR`, `HealthLevel` (Task 1).
- Produces: `ProjectCockpit({ phases, currentPhaseId, today, onGoToPhases }): JSX.Element`. Task 6 (`ProjectDetailRoute.tsx`) rendert diese Komponente im Cockpit-Tab.

- [ ] **Step 1: Fehlschlagenden Test zuerst schreiben**

Neue Datei `src/components/projects/ProjectCockpit.test.tsx`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectCockpit } from './ProjectCockpit'
import type { ProjectPhase } from '@/types/project.types'

afterEach(cleanup)

const today = new Date(2026, 4, 18) // Mo, 18.05.2026

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 50,
    ...overrides,
  }
}

describe('ProjectCockpit', () => {
  it('zeigt die Ruhe-Meldung, wenn kein Gate pending ist', () => {
    render(<ProjectCockpit phases={[phase()]} currentPhaseId="ph1" today={today} onGoToPhases={() => {}} />)
    expect(screen.getByText('Nichts brennt. Nächster Meilenstein läuft planmäßig.')).toBeTruthy()
  })

  it('zeigt das pending Gate im Naechster-Zug-Titel und einen CTA-Button', () => {
    render(
      <ProjectCockpit
        phases={[phase({ gateState: 'pending', gateDate: '2026-05-22' })]}
        currentPhaseId="ph1" today={today} onGoToPhases={() => {}}
      />,
    )
    expect(screen.getByText(/Konzeptfreigabe einholen/)).toBeTruthy()
    expect(screen.getByText('Zur Phase')).toBeTruthy()
  })

  it('ruft onGoToPhases auf, wenn der Zur-Phase-Button geklickt wird', () => {
    const onGoToPhases = vi.fn()
    render(
      <ProjectCockpit
        phases={[phase({ gateState: 'pending', gateDate: '2026-05-22' })]}
        currentPhaseId="ph1" today={today} onGoToPhases={onGoToPhases}
      />,
    )
    fireEvent.click(screen.getByText('Zur Phase'))
    expect(onGoToPhases).toHaveBeenCalledTimes(1)
  })

  it('zeigt "X von Y Phasen" in der Phasen-Rail-Kopfzeile', () => {
    render(
      <ProjectCockpit
        phases={[phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })]}
        currentPhaseId="ph2" today={today} onGoToPhases={() => {}}
      />,
    )
    expect(screen.getByText('1 von 2 Phasen')).toBeTruthy()
  })

  it('zeigt Budget und Stimmung in der Ampel als "noch nicht erfasst", nicht als gruen/ok', () => {
    render(<ProjectCockpit phases={[phase()]} currentPhaseId="ph1" today={today} onGoToPhases={() => {}} />)
    const labels = screen.getAllByText('noch nicht erfasst')
    expect(labels).toHaveLength(2)
  })

  it('zeigt "Alles ruhig", wenn keine Signale vorliegen', () => {
    render(<ProjectCockpit phases={[phase()]} currentPhaseId="ph1" today={today} onGoToPhases={() => {}} />)
    expect(screen.getByText('Alles ruhig.')).toBeTruthy()
  })

  it('listet Signale und ruft onGoToPhases bei Klick auf', () => {
    const onGoToPhases = vi.fn()
    render(
      <ProjectCockpit
        phases={[phase({ gateState: 'pending', gateDate: '2026-05-22' })]}
        currentPhaseId="ph1" today={today} onGoToPhases={onGoToPhases}
      />,
    )
    fireEvent.click(screen.getByText('Konzeptfreigabe wartet'))
    expect(onGoToPhases).toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/components/projects/ProjectCockpit.test.tsx`
Expected: FAIL — Modul `./ProjectCockpit` existiert nicht.

- [ ] **Step 2: Komponente schreiben**

Neue Datei `src/components/projects/ProjectCockpit.tsx`:

```typescript
import type { ProjectPhase } from '@/types/project.types'
import {
  nextMove, projectHealthZeit, projectHealthBudget, projectHealthStimmung,
  projectSignals, GATE_COLOR, type HealthLevel,
} from '@/lib/projects/signals'

const HEALTH_COLOR: Record<HealthLevel, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', unknown: 'var(--fg-dim)',
}
const HEALTH_LABEL: Record<HealthLevel, string> = {
  ok: 'im Plan', warn: 'knapp', bad: 'kritisch', unknown: 'noch nicht erfasst',
}

function NextMoveCard({ phases, today, onGoToPhases }: {
  phases: ProjectPhase[]
  today: Date
  onGoToPhases: () => void
}) {
  const move = nextMove(phases, today)
  const toneColor = move.tone === 'bad' ? 'var(--danger)' : move.tone === 'warn' ? 'var(--warn)' : 'var(--ok)'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 22, padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 3, background: toneColor }} />
      <span style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: toneColor, marginBottom: 10 }}>
        Nächster Zug
      </span>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{move.title}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--fg-muted)', maxWidth: '56ch' }}>{move.why}</p>
      {move.kind === 'gate_pending' && (
        <button className="btn-primary" onClick={onGoToPhases}>Zur Phase</button>
      )}
    </div>
  )
}

function PhasenRailCard({ phases, currentPhaseId }: { phases: ProjectPhase[]; currentPhaseId: string | null }) {
  const currentIndex = phases.findIndex(p => p.id === currentPhaseId)
  const doneCount = currentIndex < 0 ? 0 : currentIndex
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Phasen & Freigaben</h3>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--fg-dim)' }}>{doneCount} von {phases.length} Phasen</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {phases.map(phase => (
          <div key={phase.id} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden', marginBottom: 6 }}>
              <span style={{ display: 'block', height: '100%', width: `${phase.progressPercent}%`, background: 'var(--accent)' }} />
            </div>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase.name}</span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, fontSize: 10, color: 'var(--fg-dim)' }}>
              <i style={{ width: 6, height: 6, borderRadius: 1, transform: 'rotate(45deg)', background: GATE_COLOR[phase.gateState], display: 'inline-block' }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase.gateName}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AmpelCard({ phases, today }: { phases: ProjectPhase[]; today: Date }) {
  const items: { label: string; level: HealthLevel }[] = [
    { label: 'Zeit', level: projectHealthZeit(phases, today) },
    { label: 'Budget', level: projectHealthBudget() },
    { label: 'Stimmung', level: projectHealthStimmung() },
  ]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: 18 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600 }}>Ampel</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        {items.map(it => (
          <div key={it.label} style={{ flex: 1, padding: '10px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>{it.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 12.5, fontWeight: 550 }}>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH_COLOR[it.level], display: 'block' }} />
              {HEALTH_LABEL[it.level]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignaleCard({ phases, today, onOpenPhase }: { phases: ProjectPhase[]; today: Date; onOpenPhase: () => void }) {
  const signals = projectSignals(phases, today)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Signale</h3>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--fg-dim)' }}>{signals.length}</span>
      </div>
      {signals.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--fg-dim)', padding: '6px 0' }}>Alles ruhig.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {signals.map(sig => (
            <button
              key={sig.phaseId} onClick={onOpenPhase}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 2px',
                borderTop: '1px solid var(--border)', textAlign: 'left', width: '100%',
                background: 'none', border: 'none', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flex: 'none', background: sig.tone === 'bad' ? 'var(--danger)' : 'var(--warn)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 12.5, fontWeight: 550 }}>{sig.label}</strong>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>{sig.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProjectCockpit({ phases, currentPhaseId, today, onGoToPhases }: {
  phases: ProjectPhase[]
  currentPhaseId: string | null
  today: Date
  onGoToPhases: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <NextMoveCard phases={phases} today={today} onGoToPhases={onGoToPhases} />
      <PhasenRailCard phases={phases} currentPhaseId={currentPhaseId} />
      <AmpelCard phases={phases} today={today} />
      <SignaleCard phases={phases} today={today} onOpenPhase={onGoToPhases} />
    </div>
  )
}
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectCockpit.test.tsx`
Expected: PASS (7 Tests).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine neuen Fehler (Datei wird noch nirgends importiert -- folgt in Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectCockpit.tsx src/components/projects/ProjectCockpit.test.tsx
git commit -m "feat(projects): ProjectCockpit -- Naechster Zug, Phasen-Rail, Ampel, Signale"
```

---

## Task 6: `ProjectDetailRoute.tsx` — Tabs verdrahten, Kopf erweitern, Phasen-Tab umbauen

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `TabBar`, `TabDef` (Task 4); `ProjectCockpit` (Task 5); `ProjectTab`, `activeProjectTab`, `setActiveProjectTab` (Task 3); `formatDateDe` (Task 1).
- Produces: kompletter Tab-basierter Projekt-Detail-Screen.

- [ ] **Step 1: Imports ergänzen**

In `src/routes/ProjectDetailRoute.tsx:1-21` nach der letzten bestehenden Import-Zeile einfügen:

```typescript
import { Target, Milestone } from 'lucide-react'
import { TabBar } from '@/components/shared/TabBar'
import { ProjectCockpit } from '@/components/projects/ProjectCockpit'
import { formatDateDe } from '@/lib/projects/signals'
```

- [ ] **Step 2: Tab-State + Kopfzeile erweitern**

In der `ProjectDetailRoute`-Funktion, nach `const setAppView = useUiStore(s => s.setAppView)` (Zeile 282) einfügen:

```typescript
  const activeTab = useUiStore(s => s.activeProjectTab)
  const setActiveTab = useUiStore(s => s.setActiveProjectTab)
```

Nach `const isLastPhase = ...` / `const canPause = ...` (Zeile 377-378), vor dem `return (` (Zeile 380), einfügen:

```typescript
  const today = useMemo(() => new Date(), [])
  const pendingGateCount = phases.filter(p => p.gateState === 'pending').length
  const tabs = [
    { id: 'cockpit', label: 'Cockpit', icon: Target },
    { id: 'phasen', label: 'Phasen', icon: Milestone, count: pendingGateCount > 0 ? pendingGateCount : undefined },
  ]
```

- [ ] **Step 3: Header-Unterzeile mit Retainer-Daten ergänzen**

In `src/routes/ProjectDetailRoute.tsx:391-397` (der Header-`<div>`-Block mit Kicker + `<h1>`) ersetzen:

```typescript
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 650, marginBottom: 4 }}>
            {customerName}
          </div>
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 650, letterSpacing: '-0.01em' }}>{project.title}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 6 }}>
            Retainer {project.retainerMonthly.toLocaleString('de-DE')} € / Monat · {project.retainerHours} Std. inkl. · seit {formatDateDe(project.createdAt.slice(0, 10))}
          </div>
        </div>
```

(Der darauffolgende Button-`<div>`-Block mit Pausieren/Fortsetzen + Phase-abschließen bleibt unverändert -- nur der linke `<div>`-Block bekommt die neue Unterzeile.)

- [ ] **Step 4: Tab-Leiste + Tab-Inhalte einfügen, Phasen-Inhalt umbauen**

Den kompletten Block ab `{phaseError && (...)}` bis zum Ende der Funktion (`src/routes/ProjectDetailRoute.tsx:415-482`, also inklusive des bisherigen Phasen-Steppers, des 3-Spalten-Grids und der schließenden `</div>`/`)`) ersetzen durch:

```typescript
      <TabBar tabs={tabs} activeId={activeTab} onChange={id => setActiveTab(id as 'cockpit' | 'phasen')} />

      <div style={{ paddingTop: 24 }}>
        {activeTab === 'cockpit' && (
          <ProjectCockpit
            phases={phases} currentPhaseId={project.currentPhaseId} today={today}
            onGoToPhases={() => setActiveTab('phasen')}
          />
        )}

        {activeTab === 'phasen' && (
          <>
            {phaseError && (
              <div style={{ fontSize: 12, color: 'oklch(72% 0.18 25)', marginBottom: 12 }}>
                Phase konnte nicht gelöscht werden: {phaseError}
              </div>
            )}

            {phases.length === 0 ? (
              <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
                createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
            ) : (
              <>
                <Stepper
                  phases={phases} currentPhaseId={project.currentPhaseId} onDeletePhase={handleDeletePhase}
                  onUpdateProgress={(phaseId, progressPercent) => updatePhaseProgress(phaseId, project.id, progressPercent)}
                />
                <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
                  createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>📝 Notizen &amp; Konzeption</div>
                {loadingActivities ? (
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
                ) : notes.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Noch keine Notizen.</div>
                ) : (
                  notes.map(n => (
                    <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{n.body}</div>
                    </div>
                  ))
                )}
                <NewNoteForm onCreate={handleCreateNote} />
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>
                  ✅ Aufgaben{currentPhase ? ` — ${currentPhase.name}` : ''}
                </div>
                {loadingActivities ? (
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
                ) : tasksInCurrentPhase.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine Aufgaben in dieser Phase.</div>
                ) : (
                  tasksInCurrentPhase.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, color: t.status === 'done' ? 'var(--fg-dim)' : 'var(--fg)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                        {t.title}
                        {t.assignee && (
                          <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}> · {nameOf(t.assignee)}</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
                <NewTaskForm members={members} onCreate={handleCreateTask} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

Hinweis für den Implementierer: Diese Ersetzung entfernt die alte, immer sichtbare Moodboard-Platzhalter-Karte (bisher der erste `<div>` im 3-Spalten-Grid) ersatzlos, verschiebt Notizen/Aufgaben in ein 2-Spalten-Grid innerhalb des Phasen-Tabs, und verschiebt den bisherigen `phaseError`-Block + Stepper + `NewPhaseForm` ebenfalls in den Phasen-Tab (vorher immer sichtbar direkt unter dem Kopf).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler.

- [ ] **Step 6: Volle Test-Suite**

Run: `npx vitest run 2>&1 | tail -15`
Expected: alle Tests grün (Baseline vor dieser Etappe: 930 bestanden; diese Etappe fügt 17 (`signals.test.ts`, netto +7 gegenüber den 10 vorher) + 3 (`TabBar.test.tsx`) + 7 (`ProjectCockpit.test.tsx`) neue/geänderte Tests hinzu -- erwarte ca. 947 bestanden, 0 fehlgeschlagen; exakte Zahl im Report festhalten).

- [ ] **Step 7: Manuell im Dev-Build prüfen**

Im laufenden `npm run tauri dev` (oder `npm run dev` im Browser): ein bestehendes Projekt öffnen. Prüfen:
- Kopf zeigt jetzt die Retainer-Unterzeile.
- Tab-Leiste zeigt "Cockpit" (aktiv per Default) und "Phasen" (mit Badge, falls ein Gate pending ist).
- Cockpit-Tab zeigt Nächster-Zug-Karte, Phasen-Rail, Ampel (Budget/Stimmung grau "noch nicht erfasst"), Signale.
- Klick auf "Zur Phase" bzw. auf ein Signal wechselt zum Phasen-Tab.
- Phasen-Tab zeigt Stepper, "+Phase"-Formular, Notizen- und Aufgaben-Spalte wie vorher -- Moodboard-Platzhalter-Karte ist weg.
- Bestehende Funktionen (Phase löschen, Fortschritts-Regler, Notiz/Aufgabe anlegen) funktionieren unverändert.

- [ ] **Step 8: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): ProjectDetailRoute -- Tab-Navigation (Cockpit/Phasen), Retainer-Kopfzeile"
```

---

## Self-Review

**Spec-Abdeckung** (gegen `docs/superpowers/specs/2026-07-26-projekt-detail-tabs-cockpit-design.md` geprüft):
- Ehrlichkeits-Prinzip (Budget/Stimmung `'unknown'`, neutral statt grün) → Task 1, 5. ✓
- Kein Kora-Text, kein Kennzahlen-Streifen, kein Burn-Chart → Task 5 (bewusst nicht enthalten). ✓
- Nur Cockpit+Phasen-Tabs → Task 6 (`tabs`-Array hat genau zwei Einträge). ✓
- `GATE_COLOR`-Verschiebung, kein Duplikat → Task 1 + 2. ✓
- `TabBar` extrahiert, `CustomerRoute.tsx` unangetastet → Task 4 (kein `CustomerRoute.tsx` in den Files der Tasks). ✓
- Retainer-Unterzeile im Kopf, ohne `retainerMonths`-Spekulation → Task 6 Step 3. ✓
- Notizen/Aufgaben unverändert in Funktion, nur umgezogen in Phasen-Tab → Task 6 Step 4. ✓
- Phasen-Fortschritt "X von Y" via `orderIndex`/`currentPhaseId`-Ableitung, nicht `progressPercent`-basiert → `PhasenRailCard` in Task 5 nutzt `currentIndex` (Stepper-Muster), nicht `progressPercent === 100`. ✓
- Testing-Abschnitt der Spec (erweiterte `signals.test.ts`, neue `TabBar.test.tsx`/`ProjectCockpit.test.tsx`, kein Route-Test) → Task 1, 4, 5. ✓

**Platzhalter-Scan:** keine TBD/TODO, keine "Fehlerbehandlung hinzufügen"-Anweisungen ohne Code gefunden.

**Typ-Konsistenz geprüft:**
- `HealthLevel` (Task 1) ↔ `HEALTH_COLOR`/`HEALTH_LABEL`-Records in `ProjectsTimeline.tsx` (Task 2) und `ProjectCockpit.tsx` (Task 5) — alle drei decken exakt `'ok' | 'warn' | 'bad' | 'unknown'` ab.
- `nextMove`-Rückgabetyp `NextMove` (Task 1) ↔ Nutzung in `NextMoveCard` (Task 5) — Felder `kind`/`tone`/`title`/`why`/`phaseId` konsistent verwendet.
- `ProjectTab` (Task 3) ↔ `tabs`-Array-IDs (Task 6, `'cockpit'`/`'phasen'`) ↔ `activeTab === 'cockpit'`/`'phasen'`-Vergleiche (Task 6) — konsistent.
- `TabDef` (Task 4) ↔ `tabs`-Array-Literal in Task 6 — Felder `id`/`label`/`icon`/`count?` konsistent.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-26-projekt-detail-tabs-cockpit.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
