# KI-Datenschutz-Transparenz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen endnutzer-sichtbaren In-App-Transparenzhinweis ergänzen, dass KI-Funktionen Inhalte an Anthropic (USA) übermitteln — als neue Settings-Sektion „Datenschutz" plus dezenter Hinweis im KORA-Begrüßungsscreen.

**Architecture:** Eine neue statische React-Komponente (`DatenschutzSettings`) wird als zusätzlicher Settings-Tab eingehängt (Type-Union + Sidebar-Eintrag + Render-Switch + `VALID_TABS`). Der KORA-Idle-View bekommt eine Hinweiszeile, die per `setAppView('settings')` + `setSettingsTab('datenschutz')` in die Sektion springt. Reiner Frontend-Text, keine Logik, kein Backend.

**Tech Stack:** React + TypeScript, Zustand (`useUiStore`), Vitest + @testing-library/react, Inline-Styles mit CSS-Custom-Properties (`--surface`/`--border`/`--fg-*`).

**Spec:** `docs/superpowers/specs/2026-06-25-ki-datenschutz-transparenz-design.md`

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/components/settings/DatenschutzSettings.tsx` | **neu** — statische Text-Sektion (KI-Transparenz) |
| `src/components/settings/DatenschutzSettings.test.tsx` | **neu** — Render-Test (Überschrift + Anthropic/USA) |
| `src/store/ui.store.ts` | `SettingsTab`-Union um `'datenschutz'` erweitern |
| `src/routes/SettingsRoute.tsx` | Import, `VALID_TABS` + Render-Switch ergänzen |
| `src/components/settings/SettingsSidebar.tsx` | Sidebar-Eintrag „Datenschutz" (für alle sichtbar) |
| `src/components/corra/CorraIdleView.tsx` | Hinweiszeile + Navigation zur Sektion |

---

## Task 1: DatenschutzSettings-Komponente (TDD)

**Files:**
- Create: `src/components/settings/DatenschutzSettings.tsx`
- Test: `src/components/settings/DatenschutzSettings.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/settings/DatenschutzSettings.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DatenschutzSettings } from './DatenschutzSettings'

afterEach(cleanup)

describe('DatenschutzSettings', () => {
  it('renders the KI privacy heading', () => {
    render(<DatenschutzSettings />)
    expect(screen.getByText('KI-Funktionen & Datenschutz')).toBeTruthy()
  })

  it('names Anthropic and the USA as the data recipient', () => {
    render(<DatenschutzSettings />)
    expect(screen.getByText(/Anthropic PBC \(USA\)/)).toBeTruthy()
    expect(screen.getByText(/nicht zum Training/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/DatenschutzSettings.test.tsx`
Expected: FAIL — `Failed to resolve import "./DatenschutzSettings"` (Komponente existiert noch nicht).

- [ ] **Step 3: Write the component**

Create `src/components/settings/DatenschutzSettings.tsx`:

```tsx
import type { ReactNode } from 'react'

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        flexShrink: 0, width: 110, fontSize: 11, fontWeight: 600,
        color: 'var(--fg-muted)', textTransform: 'uppercase',
        letterSpacing: '0.04em', paddingTop: 1,
      }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
        {children}
      </div>
    </div>
  )
}

export function DatenschutzSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Datenschutz</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>
          Wie Cultera Focus mit KI-Funktionen und deinen Daten umgeht
        </p>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>KI-Funktionen &amp; Datenschutz</h3>

        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg-muted)', margin: 0 }}>
          Cultera Focus bietet KI-gestützte Funktionen — den KORA-Assistenten, Textentwürfe,
          Kunden-Briefings und Mahntext-Vorschläge. Dafür übermitteln wir die jeweils nötigen
          Inhalte an unseren Dienstleister <strong>Anthropic PBC (USA)</strong> und lassen sie
          dort verarbeiten.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoRow label="Wann">
            Nur wenn du eine KI-Funktion aktiv nutzt (KORA anschreiben, Entwurf/Briefing/Mahntext
            anfordern). Ohne deine Aktion gehen keine Daten an die KI.
          </InfoRow>
          <InfoRow label="Welche Daten">
            Je nach Funktion z. B. Kundennamen, Kontaktdaten, Notizen, Rechnungs-/Angebotsdaten
            und deine Chat-Eingaben.
          </InfoRow>
          <InfoRow label="Zweck">
            Erzeugung von Vorschlägen, Entwürfen und Zusammenfassungen.
          </InfoRow>
          <InfoRow label="Anbieter">
            Anthropic PBC, San Francisco, USA. Über die API übermittelte Inhalte werden
            standardmäßig <strong>nicht zum Training</strong> der Modelle verwendet.
          </InfoRow>
        </div>

        <p style={{
          fontSize: 12, fontStyle: 'italic', color: 'var(--fg-dim)', margin: 0,
          paddingTop: 12, borderTop: '1px solid var(--border)',
        }}>
          Rechtsgrundlage der Übermittlung in die USA (z. B. Standardvertragsklauseln / AVV mit
          Anthropic) sowie die vollständige Datenschutzerklärung: wird ergänzt.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/settings/DatenschutzSettings.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/DatenschutzSettings.tsx src/components/settings/DatenschutzSettings.test.tsx
git commit -m "feat(settings): DatenschutzSettings — KI-Transparenz-Sektion (statisch)"
```

---

## Task 2: SettingsTab-Type + SettingsRoute verdrahten

**Files:**
- Modify: `src/store/ui.store.ts:74`
- Modify: `src/routes/SettingsRoute.tsx` (Import, `VALID_TABS` Zeile 21, Switch Zeile 27-36)

- [ ] **Step 1: SettingsTab-Union erweitern**

In `src/store/ui.store.ts`, Zeile 74, `'datenschutz'` ergänzen:

```ts
export type SettingsTab = 'workspace' | 'profil' | 'aussehen' | 'module' | 'integrationen' | 'datenschutz' | 'developer' | 'gefahrenzone' | 'auftraege'
```

- [ ] **Step 2: SettingsRoute — Import + VALID_TABS + Switch**

In `src/routes/SettingsRoute.tsx`:

Import nach den anderen Settings-Imports (nach Zeile 11) ergänzen:

```tsx
import { DatenschutzSettings } from '@/components/settings/DatenschutzSettings'
```

`VALID_TABS` (Zeile 21) um `'datenschutz'` erweitern — **kritisch**, sonst wirft der Redirect-`useEffect` den Tab zurück auf `'workspace'`:

```tsx
  const VALID_TABS = ['workspace', 'aussehen', 'module', 'integrationen', 'datenschutz', 'developer', 'gefahrenzone', 'auftraege']
```

Im `switch (settingsTab)` (vor `case 'developer':`) den Case ergänzen:

```tsx
      case 'datenschutz':   return <DatenschutzSettings />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: kein Fehler (leere Ausgabe nach der tsc-Zeile).

- [ ] **Step 4: Commit**

```bash
git add src/store/ui.store.ts src/routes/SettingsRoute.tsx
git commit -m "feat(settings): Datenschutz-Tab in SettingsRoute + Type verdrahtet"
```

---

## Task 3: Sidebar-Eintrag „Datenschutz"

**Files:**
- Modify: `src/components/settings/SettingsSidebar.tsx:3` (Icon-Import), `:5-13` (ITEMS)

- [ ] **Step 1: ShieldCheck-Icon importieren**

In `src/components/settings/SettingsSidebar.tsx`, Zeile 3, `ShieldCheck` zur lucide-Import-Liste hinzufügen:

```tsx
import { Building2, LayoutGrid, Plug, Code2, AlertTriangle, Clock, Palette, ShieldCheck } from 'lucide-react'
```

- [ ] **Step 2: Eintrag nach „Integrationen" einfügen**

Im `ITEMS`-Array (nach dem `integrationen`-Eintrag, vor `developer`) ergänzen — **kein `dividerBefore`, für alle sichtbar** (nicht wie `developer` gegated):

```tsx
  { key: 'datenschutz',   label: 'Datenschutz',    icon: ShieldCheck                    },
```

Das `ITEMS`-Array sieht danach so aus:

```tsx
const ITEMS: { key: SettingsTab; label: string; icon: LucideIcon; dividerBefore?: boolean }[] = [
  { key: 'workspace',     label: 'Unternehmen',   icon: Building2                      },
  { key: 'aussehen',      label: 'Aussehen',       icon: Palette                        },
  { key: 'auftraege',     label: 'Aufträge',       icon: Clock,      dividerBefore: true },
  { key: 'module',        label: 'Module',         icon: LayoutGrid, dividerBefore: true },
  { key: 'integrationen', label: 'Integrationen',  icon: Plug                           },
  { key: 'datenschutz',   label: 'Datenschutz',    icon: ShieldCheck                    },
  { key: 'developer',     label: 'Entwickler',     icon: Code2,      dividerBefore: true },
  { key: 'gefahrenzone',  label: 'Gefahrenzone',   icon: AlertTriangle                  },
]
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: kein Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsSidebar.tsx
git commit -m "feat(settings): Datenschutz in der Settings-Sidebar (für alle sichtbar)"
```

---

## Task 4: KORA-Inline-Hinweis im Idle-View

**Files:**
- Modify: `src/components/corra/CorraIdleView.tsx` (Store-Selektoren ~Zeile 30, Markup nach dem Input-Block ~Zeile 233)

- [ ] **Step 1: Store-Setter selektieren**

In `src/components/corra/CorraIdleView.tsx`, bei den bestehenden `useUiStore`-Selektoren (nach Zeile 30 `const theme = useUiStore(s => s.theme)`), zwei Setter ergänzen:

```tsx
  const setAppView     = useUiStore(s => s.setAppView)
  const setSettingsTab = useUiStore(s => s.setSettingsTab)
```

- [ ] **Step 2: Hinweiszeile unter dem Input einfügen**

Direkt **nach** dem schließenden `</div>` des `corra-input-wrap`-Blocks (nach Zeile 233, noch innerhalb des Content-Containers mit `maxWidth: 560`) einfügen:

```tsx
        {/* Datenschutz-Hinweis — KI sendet an Anthropic (USA) */}
        <button
          type="button"
          onClick={() => { setSettingsTab('datenschutz'); setAppView('settings') }}
          style={{
            marginTop: 14, width: '100%',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            color: 'var(--fg-dim)', fontSize: 11, fontFamily: 'inherit',
          }}
        >
          <span aria-hidden>🛈</span>
          KI-Antworten werden von Anthropic (USA) erzeugt. Mehr erfahren →
        </button>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: kein Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/corra/CorraIdleView.tsx
git commit -m "feat(corra): Datenschutz-Hinweis im KORA-Idle-View (Link zu Settings)"
```

---

## Task 5: Gesamt-Verifikation

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: kein Fehler.

- [ ] **Step 2: Vollständige Test-Suite**

Run: `npm run test:run`
Expected: alle Tests grün (bisher 476 + 2 neue = 478).

- [ ] **Step 3: Visueller Abnahme-Check (User am Steuer)**

Im Tauri-Fenster: Einstellungen → „Datenschutz" zeigt die KI-Sektion; KORA-Idle-View zeigt unten die Hinweiszeile; Klick darauf öffnet Einstellungen → Datenschutz.

---

## Self-Review-Ergebnis

- **Spec-Abdeckung:** Settings-Sektion (Task 1–3), KORA-Hinweis (Task 4), Text 1:1 aus Spec inkl. „wird ergänzt"-Platzhalter (Task 1), Render-Test (Task 1). Alle Spec-Punkte haben eine Task.
- **Platzhalter:** Der einzige „wird ergänzt"-Text ist der **gewollte** Rechtsgrundlage-Platzhalter aus der Spec — kein Plan-Platzhalter.
- **Typ-Konsistenz:** `'datenschutz'` identisch in `SettingsTab` (Task 2), `VALID_TABS` (Task 2), Sidebar-`key` (Task 3), Switch-`case` (Task 2), Navigation (Task 4). `setAppView`/`setSettingsTab` existieren in `ui.store.ts`.
- **Kritischer Punkt abgedeckt:** `VALID_TABS` in `SettingsRoute.tsx` muss `'datenschutz'` enthalten, sonst Redirect — explizit in Task 2 Step 2.
