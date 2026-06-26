# Aurora Settings-Redesign + Design-System — Design

**Datum:** 2026-06-26
**Status:** freigegeben (Design, visuell validiert im Visual Companion)
**Branch:** feature/erechnung-2026-06-21
**Mockups:** `.superpowers/brainstorm/3805-1782460786/content/` (settings-directions, aurora-shell, aurora-light)

## Ziel & Kontext

Das Settings-System wird komplett im Stil **„Aurora"** neu gebaut — clean, modern,
premium (Blau→Violett-Verlauf-Akzent, weiche Karten, ruhige Hierarchie), in **Dark
und Light**. Aurora soll perspektivisch das **app-weite Design-Language** werden;
dieser Spec liefert das wiederverwendbare **Design-System** + **Settings als Pilot**.
Der app-weite Rollout (Dashboard, Kunden, Finanzen, Mail, …) folgt danach Route für
Route in **eigenen Specs** — NICHT Teil dieser Spec.

Entscheidungen des Users (2026-06-26): Stil = Aurora; Light „nach Vorgaben"
(bestehende Light-Tokens); Rollout = System + Settings zuerst, dann app-weit;
„Lizenzen & Upgrades" = Plan + Team-Seats + Zahlung.

## Scope

**In Scope:**
1. Aurora-**Design-System**: additive Tokens (Verlauf-Akzent für Dark/Light/bw) + ein
   wiederverwendbares Settings-**Primitives-Kit**.
2. Neue Settings-**Shell** (gruppierte Nav + Content-Bereich) in Aurora.
3. **Alle** bestehenden Sektionen in Aurora neu gestaltet — Funktion bleibt, nur
   Präsentation wechselt auf das Kit.
4. **Neue Sektion „Lizenzen & Upgrades"** (Plan + Seats + Zahlung, Platzhalter-Daten).

**Out of Scope (bewusst):**
- App-weiter Rollout über Settings hinaus (spätere Phasen/Specs).
- Echtes Billing-Backend (Abo/Stripe/Seats-Abrechnung) — Lizenzen zeigt vorerst
  Platzhalter/abgeleitete Daten. Keine Zahlungslogik.
- Funktionale Änderungen an der Settings-Logik (Stores/Services bleiben).

## Design-System

### Tokens (additiv zu `src/styles/globals.css`)

Bestehende Tokens bleiben (`--surface*`, `--border`, `--fg*`, `--accent`, `--radius` …).
Neu ergänzen, jeweils für `:root` (dark), `[data-theme="light"]` und die `[data-style="bw"]`-Varianten:

- `--accent-gradient`: `linear-gradient(135deg, #5b8cff, #8b5bff)` (dark/light gleich).
  bw-Variante: `var(--accent)` (einfarbig, kein Verlauf).
- `--accent-violet`: `#8b5bff` (Verlauf-Endpunkt; bw → `var(--accent)`).
- `--card-shadow`: dark `0 1px 2px rgb(0 0 0 / .25)`; light `0 1px 2px rgb(40 50 90 / .05)`.
- `--nav-active-bg`: dark `linear-gradient(90deg, rgb(91 140 255 / .20), rgb(139 91 255 / .05))`;
  light `linear-gradient(90deg, rgb(91 140 255 / .14), rgb(139 91 255 / .05))`; bw → `var(--surface-2)`.

Prinzip: Aurora nutzt den **Verlauf sparsam** (Avatar, primärer CTA, aktiver Nav-Eintrag,
Toggle-On, Pro-Badge). Flächen/Text/Borders kommen aus den bestehenden Tokens, damit
Light/Dark/bw automatisch greifen.

### Primitives-Kit

Neuer Ordner `src/components/settings/ui/` — kleine, fokussierte, token-gestylte Bausteine,
jeweils mit eigenem Render-Test wo sinnvoll:

| Primitive | Zweck |
|---|---|
| `SettingsPage` | Standard-Panel-Hülle: `maxWidth`, Header (`title`+`subtitle`), `gap`, Scroll. Ersetzt das wiederholte Inline-`<div style=…><h2>…`-Muster. |
| `SettingsSection` | Gruppen-Block mit optionalem Section-Label (mono-uppercase). |
| `SettingCard` | Weiche Karte (`--surface`, `--border`, `--radius`, `--card-shadow`). |
| `SettingRow` | Zeile: Icon-Kachel (Tönung) + Titel + Beschreibung + rechts ein `control`-Slot. |
| `AuroraToggle` | Schalter mit Verlauf-On-State (ersetzt das lokale `Toggle` in ModuleSettings). |
| `FieldRow` | Label + Input/Control (für Formular-Sektionen wie Unternehmen). |
| `IconTile` | Quadratische Icon-Kachel mit Farb-Tönung (`color`-Prop). |
| `Badge` / `Pill` | Verlauf-Badge (Pro) + Status-Pills (aktiv/geplant). |

`PlanCard`, `SeatList`, `PaymentRow` (für Lizenzen) leben in der Lizenzen-Komponente,
nutzen aber `SettingCard`/`IconTile`/`Badge`.

## Shell (neue Navigation + Layout)

Ersetzt `SettingsSidebar.tsx` + das Layout in `SettingsRoute.tsx`:

- **Nav (≈262px):** Workspace-Kopf (Verlauf-Avatar + Name + „Geteilt · Owner"), darunter
  **gruppierte** Items mit Section-Labels:
  - **Workspace:** Unternehmen, Module (mit Zähler z. B. 4/5), Integrationen
  - **Konto:** Lizenzen & Upgrades (Pro-Badge), Aussehen, Datenschutz
  - **System:** Aufträge, Entwickler (nur `showDeveloper`), Gefahrenzone (dezent rot)
  - **Fuß:** Profil-Pill (Avatar + Name + Mail), unten verankert.
  - Aktiv = `--nav-active-bg` + Akzent-Text + Inset-Ring. Hover = `--surface-2`.
- **Content:** Sticky-Header (Titel + Untertitel) + scrollbarer Panel-Bereich, der die
  jeweilige Sektion via Primitives rendert.
- Capability-Gating bleibt unverändert (`developer` nur im Dev-Modus; Finanzen-bezogene
  Gates greifen weiterhin, falls vorhanden).

## Sektionen (Re-Skin, Funktion bleibt)

Jede bestehende Sektion behält ihre Store-/Service-Anbindung; **nur die Darstellung**
wechselt auf das Kit. Konkrete Felder ermittelt der Implementierungsplan pro Datei.

| Sektion | Datei | Typ | Aurora-Umsetzung |
|---|---|---|---|
| Unternehmen | `WorkspaceSettings.tsx` | Formular | `SettingsPage` + `SettingCard` + `FieldRow`s |
| Module | `ModuleSettings.tsx` | Toggles | `SettingRow` + `IconTile` + `AuroraToggle` (lokales `Toggle` raus) |
| Integrationen | `IntegrationenSettings.tsx` | Verbindungen | `SettingCard`-Liste mit Status |
| **Lizenzen & Upgrades** | **`LizenzenSettings.tsx` (neu)** | Plan/Seats/Zahlung | siehe unten |
| Aussehen | `AussehensSettings.tsx` | Theme/Stil | `SettingsPage` + Auswahl-Karten |
| Datenschutz | `DatenschutzSettings.tsx` | Statischer Text | auf `SettingsPage`/`SettingCard` heben (Inhalt unverändert) |
| Aufträge | `AuftraegeSettings.tsx` | Konfiguration | `SettingsPage` + `FieldRow`s |
| Entwickler | `DeveloperSettings.tsx` | intern | leicht ans Kit angleichen |
| Gefahrenzone | `GefahrenzoneSettings.tsx` | Danger | `SettingsPage` + Danger-`SettingCard` (rote Akzente) |

## Neue Sektion „Lizenzen & Upgrades"

- `SettingsTab` um `'lizenzen'` erweitern (`ui.store.ts`) + `VALID_TABS` + Render-Switch
  + Sidebar-Eintrag (Gruppe „Konto", Pro-Badge), analog zur Datenschutz-Sektion.
- **`LizenzenSettings.tsx`** (neu) mit drei Blöcken (Platzhalter-Daten, klar als solche):
  1. **Plan** — `PlanCard` (Verlauf-Rand): aktueller Plan, Preis, „Upgraden"-CTA,
     Sitz-Meter (genutzt/gesamt).
  2. **Team-Sitze** — `SeatList`: Mitglieder als Avatar-/Tabellenzeilen. **Echte Daten
     wo billig:** Mitglieder-Anzahl aus dem vorhandenen `WorkspaceMembersGateway`/Store,
     falls verfügbar; sonst Platzhalter. „Einladen" verweist auf das bestehende
     `MembersSettings`/Einladungs-UI (kein neues Backend).
  3. **Zahlung** — `PaymentRow`: Karte/Methode + nächste Abrechnung als **Platzhalter**
     mit sichtbarem Hinweis „Abrechnung folgt mit dem SaaS-Plan".
- Keine Zahlungs-/Abo-Logik in diesem Spec.

## Theme-Integration

- Funktioniert in **Dark + Light** über die bestehenden Tokens; die additiven Aurora-Tokens
  haben Light-Werte (siehe oben). Im **`data-style="bw"`** fällt der Verlauf auf `--accent`
  (einfarbig) zurück — keine bunte Tönung.
- Kein Hardcoding von Farben in Komponenten: ausschließlich Tokens/Vars verwenden, damit
  Theme-Wechsel automatisch greift.

## Architektur / Dateistruktur

```
src/components/settings/
  ui/                      ← NEU: Aurora-Primitives-Kit
    SettingsPage.tsx
    SettingsSection.tsx
    SettingCard.tsx
    SettingRow.tsx
    AuroraToggle.tsx
    FieldRow.tsx
    IconTile.tsx
    Badge.tsx
    index.ts               ← Sammel-Export
  SettingsSidebar.tsx      ← Aurora-Nav (gruppiert, Profil-Pill)
  LizenzenSettings.tsx     ← NEU
  WorkspaceSettings.tsx    ← Re-Skin
  ModuleSettings.tsx       ← Re-Skin
  …                        ← restliche Sektionen Re-Skin
src/routes/SettingsRoute.tsx  ← Aurora-Layout (Sticky-Header + Content)
src/store/ui.store.ts         ← SettingsTab += 'lizenzen'
src/styles/globals.css        ← additive Aurora-Tokens
```

Jede Sektion bleibt eine fokussierte Datei mit einer Verantwortung; das Kit hält die
Wiederholung (Karte/Zeile/Toggle/Header) an einer Stelle.

## Tests

- Render-Tests für die Kern-Primitives (`SettingCard`, `SettingRow`, `AuroraToggle`,
  `SettingsPage`): rendert, zeigt übergebenen Inhalt, Toggle spiegelt `on`-Prop.
- `LizenzenSettings.test.tsx`: rendert Überschrift „Lizenzen & Upgrades" + die drei Blöcke
  (Plan/Sitze/Zahlung) sind vorhanden.
- Bestehende Settings-Tests müssen grün bleiben; `npm run typecheck` + `npm run test:run`
  am Abschluss-Gate sauber.
- Visuelle Abnahme im Tauri-Fenster: Dark + Light, alle Sektionen, Nav-Gruppen, Lizenzen.

## Risiken / Hinweise

- **Kein Big-Bang über Settings hinaus.** Diese Spec endet bei Settings; die App-weite
  Übernahme ist eine Folge-Entscheidung pro Route.
- Re-Skin darf **keine Funktion** brechen — Store-Anbindung und Handler unverändert lassen,
  nur Markup/Styles tauschen.
- `data-style="bw"` und Light müssen mitgetestet werden (kein dunkel-only Hardcoding).
- Lizenzen-Platzhalter klar als solche kennzeichnen, damit niemand „echte" Abrechnung erwartet.
