# Onboarding-Anleitung & Hilfe — Design

**Datum:** 2026-06-14
**Status:** Freigegeben (Design), bereit für Implementierungsplan

## Ziel

Neue Nutzer (Tester wie echte Kunden) sollen die App **ohne Beispieldaten** kennenlernen. Statt vorgeladener Demo-Kunden bekommen sie:

1. einen **animierten Willkommens-Moment** beim ersten Start,
2. eine **app-weite Onboarding-Leiste oben** mit 5 echten Schritten, die sich **automatisch abhaken**, sobald die Aktion wirklich ausgeführt wurde, und bei 5/5 verschwindet,
3. einen **Hilfe-Drawer** („?"-Button), der jederzeit alle Funktionen kurz erklärt.

Keine Fake-/Testdaten mehr. Der Nutzer baut von Anfang an echte Daten auf.

## Nicht-Ziele

- Keine interaktiven In-App-Tooltips/Coachmarks auf einzelnen Buttons (eigenes, späteres Thema).
- Keine Volltext-Tutorials mit Screenshots — die Hilfe ist bewusst **kurz** (1–2 Sätze je Funktion).
- Kein serverseitiger Hilfe-Content — alles statisch im Frontend.

## Bestehender Stand (Ausgangslage)

- `src/components/onboarding/OnboardingWizard.tsx` — einmaliger Modal-Wizard, lädt **Branchen-Beispielkunden** (`INDUSTRIES[].sampleCustomers`). Flag `cynera:onboarding-completed-v1`. **→ wird entfernt.**
- `src/lib/seed-ai-summaries.ts` — `seedSampleAiSummaries()` schreibt Demo-KI-Texte auf bestehende Todos. Aufruf in `src/App.tsx` (Welle 2). Flag `cynera.tasks.ai-summary-seeded.v1`. **→ wird entfernt.**
- `PipelineService.seed` / `LeadStagesService.seed` (in `App.tsx`) — legen **leere Kanban-Spalten** an (Konfiguration, keine Fake-Kunden). **→ bleibt unverändert.**
- Relevante Stores: `useCustomersStore` (Kunden), `useNotesStore` (`notes`), `useTodosStore` (`allTodos`), `useLeadsStore` (`leads`), `useDealsStore` (`deals`), `useUiStore` (`appView`, `setAppView`, `AppView`). Privat-Sentinel: `PRIVATE_CUSTOMER_ID = '__cynera_privat__'` aus `src/types/customer.types.ts`.

## Architektur — Komponenten

### 1. `WelcomeIntro` *(neu)* — `src/components/onboarding/WelcomeIntro.tsx`
Vollbild-Auftritt beim **allerersten** Start, mit framer-motion (bereits im Projekt).

- **Aurora-Optik:** geschichteter, driftender Farb-Glow in Brand-Palette (Blau dominant, Hauch Violett/Teal), weiche Vignette, feines Film-Korn. Titel „Willkommen." tritt einmal sanft auf (fade + rise), atmet leicht, langsamer Glanz-Sweep; Tagline in Mono; „↵ Los geht's"-Button (pulsierend).
- **Verhalten:** Klick auf „Los geht's" **oder** Enter → animierter Exit (fade/scale) → App erscheint mit Onboarding-Leiste. Respektiert `prefers-reduced-motion` (dann statisch/sofort).
- **Einmaligkeit:** rendert nur, wenn `welcomeSeen === false`. Beim Schließen `markWelcomeSeen()`.
- **Props:** `{ onDone: () => void }`.

### 2. `OnboardingBar` *(neu)* — `src/components/onboarding/OnboardingBar.tsx`
Schmale, **app-weite** Leiste, gerendert in `AppShell` **über** dem Hauptinhalt (oberhalb von NavSidebar-Content / Routen-Bereich).

- **Inhalt:** 5 Step-Pills mit Nummer/Häkchen + Label, Fortschritt „n/5", ✕ zum Ausblenden.
- **Zustände je Pill:** offen / aktuell (erster offener) / erledigt (durchgestrichen + grünes ✓).
- **Klick auf Pill:** navigiert an die passende Stelle (siehe Tabelle), via `useUiStore.setAppView(...)` (+ ggf. `setSelectedCustomer(null)` für Clients).
- **Sichtbarkeit:** sichtbar wenn `barDismissed === false` **und** `allDone === false`. Bei Erreichen von 5/5 → kurze Erfolgs-Animation, danach blendet die Leiste aus (durch `allDone === true`; `barDismissed` muss dafür nicht gesetzt werden).
- **Reduced-motion:** Übergänge minimal.

### 3. `HelpDrawer` *(neu)* — `src/components/help/HelpDrawer.tsx`
Slide-over-Panel von rechts, ausgelöst über einen **„?"-Button unten in `NavSidebar`** (`src/components/layout/NavSidebar.tsx`).

- **Aufbau:**
  - **Kopf:** „Erste Schritte · n/5" — die 5 Schritte als kompakte Liste mit Status (auch nach Ausblenden der oberen Leiste hier wiederfindbar). Klick auf einen Schritt navigiert wie die Pills.
  - **Körper:** „Alle Funktionen" — Kategorien aus `help-content.ts`, je Eintrag aufklappbar mit kurzer Erklärung + „Dorthin"-Link (`setAppView`).
- **Offen/zu:** `helpOpen: boolean` + `setHelpOpen` in `ui.store` (konsistent mit `appView`). Schließt per ✕, Klick außerhalb, Esc.

### 4. `onboarding.store.ts` *(neu)* — `src/store/onboarding.store.ts`
Zustand + **gerastete** Erkennung (Ansatz 2: einmal erfüllt = bleibt erfüllt).

```ts
type StepId = 'kunde' | 'notiz' | 'aufgabe' | 'lead' | 'corra'

interface OnboardingState {
  // gerastete Flags — einmal true, bleiben true
  done: Record<StepId, boolean>
  corraOpened: boolean
  welcomeSeen: boolean
  barDismissed: boolean

  markWelcomeSeen: () => void
  dismissBar: () => void
  markCorraOpened: () => void
  // prüft Live-Bedingungen gegen die Stores und rastet erfüllte Schritte ein
  reconcile: () => void
}
```

- Persistenz: `zustand/persist`, localStorage-Key `cynera-onboarding-v1` (Datenebene bleibt „cynera", siehe Rebrand-Konvention).
- `reconcile()` liest die anderen Stores und setzt `done[step] = true`, sobald die Bedingung erfüllt ist; setzt **nie** zurück.
- Abgeleiteter Helfer `allDone = STEP_IDS.every(id => done[id])`.

**Erkennungs-Logik (in `reconcile`):**

| Step | Bedingung |
|------|-----------|
| `kunde` | `useCustomersStore` enthält ≥ 1 Kunden mit `id !== PRIVATE_CUSTOMER_ID` |
| `notiz` | `useNotesStore.notes.length > 0` |
| `aufgabe` | `useTodosStore.allTodos.length > 0` |
| `lead` | `useLeadsStore.leads.length > 0` **oder** `useDealsStore.deals.length > 0` |
| `corra` | `corraOpened === true` |

**Wann läuft `reconcile()`?**
- Beim App-Start nach dem initialen Laden.
- Über Store-Subscriptions: `OnboardingBar`/`AppShell` abonnieren die relevanten Stores und rufen `reconcile()` bei Änderungen (debounced/idempotent).
- `corra`: `markCorraOpened()` wird ausgelöst, wenn `appView === 'corra'` gesetzt wird (Subscription auf `ui.store.appView`), danach `reconcile()`.

### 5. `help-content.ts` *(neu)* — `src/lib/help-content.ts`
Statische, typisierte Inhaltsquelle.

```ts
export interface HelpEntry { title: string; body: string; view?: AppView }
export interface HelpCategory { id: string; label: string; entries: HelpEntry[] }
export const HELP_CONTENT: HelpCategory[]
```

Kategorien (je Eintrag 1–2 Sätze + optionaler `view`-Link):
**Kunden & Kontakte · Notizen · Aufgaben & Aktivitäten · Leads & Pipeline · Rechnungen & Angebote · Zeiterfassung · Mail · Kalender · Corra/KI · Dateien/Ablage.**

## Erststart-Ablauf

1. App startet, `welcomeSeen === false` → `WelcomeIntro` (Aurora) als Vollbild.
2. „Los geht's"/Enter → Exit-Animation → `markWelcomeSeen()` → App sichtbar.
3. `OnboardingBar` oben mit 0/5. Nutzer arbeitet echt; bei jeder passenden Aktion rastet ein Schritt ein.
4. „?"-Drawer jederzeit verfügbar (Erste-Schritte + alle Funktionen).
5. Bei 5/5: kurze Erfolgs-Animation, Leiste verschwindet. Drawer bleibt dauerhaft.

## Entfernen (Beispieldaten)

- `src/components/onboarding/OnboardingWizard.tsx` **löschen** (inkl. `INDUSTRIES`, `SampleCustomer`, `hasCompletedOnboarding`, `markOnboardingComplete`). Aufrufstelle (vermutlich `App.tsx`/`AppShell`) auf `WelcomeIntro` umstellen.
- `src/lib/seed-ai-summaries.ts` **löschen** + Aufruf `seedSampleAiSummaries()` in `src/App.tsx` (Welle 2) entfernen.
- `PipelineService.seed` / `LeadStagesService.seed` **bleiben**.

## Edge Cases

- **Reduced motion:** WelcomeIntro & Leiste mit minimalen/keinen Animationen.
- **Bestehende Nutzer mit echten Daten** (z. B. der aktuelle Entwickler mit 9 Kunden): sollen **weder** WelcomeIntro **noch** die Onboarding-Leiste sehen. Dafür ein einmaliger **Bootstrap** beim Erstanlegen des `onboarding.store` (noch kein persistierter Zustand vorhanden): existiert bereits echte Datenlage (≥ 1 echter Kunde **oder** Notizen/Todos vorhanden), dann `welcomeSeen = true` **und** `barDismissed = true` setzen, anschließend `reconcile()` (rastet erledigte Schritte ein). Ergebnis: kein Willkommen, keine Leiste — nur der „?"-Drawer bleibt verfügbar. Brandneue, leere Installationen durchlaufen den vollen Ablauf.
- **Daten später gelöscht:** dank Rasterung bleibt der Schritt erledigt — kein Zurückspringen.
- **Bar manuell ausgeblendet (✕):** `barDismissed = true`; Erste-Schritte weiter im Drawer sichtbar.

## Tests

- `onboarding.store` Unit-Tests: `reconcile()` rastet pro Bedingung korrekt ein; rastet **nicht** zurück nach Löschen; `corra`/`welcome`/`dismiss`-Flags; `allDone`.
- `help-content`: jede `view`-Referenz ist ein gültiger `AppView`.
- Komponenten-Smoke: `OnboardingBar` zeigt korrekten Fortschritt; verschwindet bei 5/5; Pills navigieren. `HelpDrawer` öffnet/schließt; Kategorien rendern.

## Betroffene/neue Dateien

**Neu:** `src/components/onboarding/WelcomeIntro.tsx`, `src/components/onboarding/OnboardingBar.tsx`, `src/components/help/HelpDrawer.tsx`, `src/store/onboarding.store.ts`, `src/lib/help-content.ts` (+ Tests).
**Geändert:** `src/components/layout/AppShell.tsx` (Bar + WelcomeIntro + Drawer einhängen), `src/components/layout/NavSidebar.tsx` („?"-Button), `src/App.tsx` (Seed-Aufruf entfernen, Wizard→WelcomeIntro).
**Gelöscht:** `src/components/onboarding/OnboardingWizard.tsx`, `src/lib/seed-ai-summaries.ts`.
