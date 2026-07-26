# Projekt-Modul-Ausbau — Etappe 1: Datenmodell + Timeline-Übersicht

## Kontext

Das bestehende Projekt-Feature (`ProjectsOverviewRoute.tsx`, `ProjectDetailRoute.tsx`, `projects.store.ts`, `db/project.rs`, `db/project_phase.rs`) ist ein sehr schlanker MVP (~950 Zeilen gesamt, gemergt 2026-07-06 als "Projektplaner-Kern"): 3-Buckets-Übersicht (Aktiv/Pausiert/Abgeschlossen), Ein-Seiten-Detail ohne Tabs, `Project` ohne Budget/Zeitraum/Team, `ProjectPhase` nur mit `name`/`orderIndex` — kein Gate-Workflow, keine Termine.

Ein externer Design-Prototyp (Vanilla-React, `C:\Users\hendr\Desktop\design\*.jsx`) zeigt ein deutlich reicheres Zielbild: Portfolio-Wochen-Timeline, Projekt-Detail mit 5 Tabs (Cockpit/Phasen/Moodboard/Team/Rechnungen), Gate-Freigabe-Workflow, freies Moodboard-Canvas mit Kunden-Reaktionen, Team-Kapazitätsplanung, Rechnungs-Editor mit Live-PDF-Vorschau, gekoppelt an dieselbe Zeitachse. Ergänzende Screenshots (`C:\Users\hendr\Desktop\design_handoff_projekte\screenshots\*.png`) zeigen dasselbe Konzept im echten App-Rahmen (Sidebar, KORA) — als reine Layout-/Struktur-Referenz; Farben (Navy/Blau, "Cynera"-Branding) sind veraltet und werden **nicht** übernommen, stattdessen die aktuellen Live-Tokens (Sunset/Koralle `#F2754F`, Cultera-Branding).

Das ist kein Redesign, sondern eine erhebliche Erweiterung. Sie wird in 6 unabhängige Etappen zerlegt:

1. **Datenmodell + Timeline-Übersicht** *(diese Spec)*
2. Detail-Kopf + Tabs + Cockpit
3. Phasen-Tab mit Gates (voller Freigabe-Workflow + Deliverables)
4. Team & Kapazität
5. Moodboard (freies Canvas; Kunden-Freigabe-Link separat/später)
6. Rechnungen im Projekt-Kontext (Projekt↔Invoice-Kopplung, PDF-Vorschau)

Jede Etappe bekommt ihre eigene Spec. Diese Spec deckt **nur Etappe 1** ab.

## Ziel dieser Etappe

Das Fundament legen, auf dem alle folgenden Etappen aufbauen:
- Projekt und Phase bekommen die Datenfelder, die eine Zeitachse und einen Retainer abbilden.
- Die Übersicht wird von 3 statischen Buckets zu einer rollierenden Wochen-Timeline mit Phasen-Balken und Gate-Markierungen.
- Eine erste, ehrliche Signal-/Ampel-Logik entsteht — nur mit dem, was jetzt schon an Daten existiert (keine Fake-Werte für Budget/Stimmung).

**Explizit nicht Teil dieser Etappe:** Tab-Navigation im Detail, Cockpit-Ansicht, Gate-Freigabe-Buttons/Deliverables, Moodboard, Team-Kapazität, Rechnungs-Kopplung, Rechnungs-Geldmarkierungen auf der Timeline. Diese folgen in Etappen 2–6.

## Geschäftsmodell-Annahme

Alle Projekte laufen als **Retainer** (laufende monatliche Betreuung mit inkludierten Stunden) — kein Festpreis-Modell. Das vereinfacht das Datenmodell erheblich (kein Auftragsvolumen-Tracking über mehrere Projekttypen hinweg).

## Datenmodell

### `projects` — additive Migration

| Spalte | Typ | Default | Bedeutung |
|---|---|---|---|
| `retainer_monthly` | REAL | `0` | Monatsbetrag in Euro |
| `retainer_hours` | INTEGER | `0` | Inkludierte Stunden pro Monat |
| `retainer_months` | INTEGER | `NULL` | Geplante Laufzeit in Monaten; `NULL` = unbefristet laufend |

Geld wird als `f64`/Euro gespeichert (nicht Cent), konsistent mit der bestehenden `Invoice`-Konvention (`subtotal`, `total` etc. sind `f64`).

### `project_phases` — additive Migration

| Spalte | Typ | Default | Bedeutung |
|---|---|---|---|
| `start_date` | TEXT (ISO-Datum) | — (Pflicht) | Backfill für Altdaten: `created_at`-Datum der Phase |
| `end_date` | TEXT (ISO-Datum) | — (Pflicht) | Backfill: `start_date + 14 Tage` |
| `gate_name` | TEXT | `'Freigabe'` | Name des Freigabe-Meilensteins |
| `gate_state` | TEXT | `'open'` | `'open' \| 'pending' \| 'approved'` (CHECK-Constraint) |
| `gate_date` | TEXT (ISO-Datum), NULL | `NULL` | Fälligkeitsdatum des Gates |
| `gate_approved_by` | TEXT, NULL | `NULL` | Freitext, wer freigegeben hat |
| `progress_percent` | INTEGER | `0` | 0–100, manuell gepflegt (CHECK-Constraint) |

Kein Team-/Kapazitätsfeld in dieser Etappe — die Timeline-Übersicht zeigt keine Team-Avatare (nur Kunden-Kürzel). Der bestehende Ansatz, Phasen-Status (`done`/`active`/`open`) aus `Project.currentPhaseId` + `orderIndex` abzuleiten statt zu speichern, bleibt unverändert.

### Rust & TypeScript

- `src-tauri/src/db/project.rs`, `src-tauri/src/db/project_phase.rs`: Structs, Create/Update-Funktionen um neue Felder erweitern.
- `src-tauri/src/commands/project.rs`, `project_phase.rs`: Payloads entsprechend erweitern.
- `src/types/project.types.ts`: `Project` und `ProjectPhase` um obige Felder erweitern.
- `src/data/projects.mapper.ts`, `projects.gateway.ts`, `services/projects.service.ts`: Mapping/Transport anpassen.

Kein Cloud-Schema nötig — Projekte sind aktuell lokal-only (kein Supabase-Pendant gefunden).

## Abgeleitete Signale (client-seitig, nicht gespeichert)

Neues Modul, z.B. `src/lib/projects/signals.ts`:

- **`projectHealthZeit(project)`**: `'bad'` wenn ein Gate überfällig ist (`gate_date < heute` und `gate_state === 'pending'`), `'warn'` wenn ein Gate in ≤ 5 Tagen fällig ist, sonst `'ok'`.
- **`projectHealthBudget(project)`**: fix `'ok'` (neutral) in dieser Etappe. Echte Berechnung aus Rechnungsstatus folgt in Etappe 6.
- **`projectHealthStimmung(project)`**: fix `'ok'` (neutral) in dieser Etappe. Echte Berechnung aus Moodboard-Reaktionen folgt in Etappe 5.
- **`projectSignals(project)`**: liefert aktuell nur Einträge vom Typ "Gate wartet" (für Filter "Brauchen dich" und die "Diese Woche wird entschieden"-Liste). Struktur so gebaut, dass Etappe 6 einfach weitere Signal-Typen (Rechnung überfällig/Entwurf bereit) ergänzen kann, ohne Aufrufer anzufassen.
- **`rollingWeeks(today, weeksBack = 4, weeksForward = 10)`**: liefert ein dynamisches Wochen-Array, keine hartkodierte KW-Range wie im Prototyp.

## UI

### Übersicht (`ProjectsOverviewRoute.tsx` — Umbau)

- Kopfzeile: Anzahl laufender Projekte, Retainer-Summe/Monat (Summe über alle `status=active`-Projekte), "X brauchen dich" (aus `projectSignals`).
- Filter-Chips: **Alle** / **Brauchen dich** / **Gate offen**.
- Wochen-Timeline: Zeilen = Projekte (nur `status=active`), Spalten = rollierendes Wochenfenster. Pro Zeile: Kunden-Kürzel-Avatar, Projektname, Health-Dots (Zeit/Budget/Stimmung), Phasen-Balken (Position aus `start_date`/`end_date`, Füllung aus `progress_percent`), Gate-Diamanten (Farbe nach `gate_state`) an `end_date` der jeweiligen Phase.
- "Diese Woche wird entschieden"-Liste darunter: vorerst nur Gate-Einträge aus `projectSignals`.
- Klick auf eine Zeile → bestehende `ProjectDetailRoute` (unverändert in dieser Etappe).
- **Nur `status=active`-Projekte** auf der Timeline. Pausierte/abgeschlossene Projekte über einen einfachen Archiv-Link/-Tab, der die bisherige schlichte Listendarstellung weiterverwenden kann (kein neuer Aufwand für diese Ansicht).

### Formulare

- `NewProjectModal.tsx`: neue Felder Retainer-Betrag/Monat, inkludierte Stunden, optionale Laufzeit (Monate, leer = unbefristet).
- Bestehender "+ Phase"-Flow in `ProjectDetailRoute.tsx`: erweitert um Start-/Enddatum (Pflicht) und Gate-Name (Pflicht, Default "Freigabe"). Ohne diese Felder kann die Timeline keinen sinnvollen Balken/Diamanten zeichnen.
- Bestehender Phasen-Stepper in `ProjectDetailRoute.tsx`: einfaches Eingabefeld/Slider für `progress_percent` an der aktiven Phase, damit der Timeline-Füllbalken nicht dauerhaft bei 0 % steht. Kein volles Deliverables-UI (das kommt in Etappe 3) — nur der rohe Prozentwert.

### Design-Tokens

Aktuelle Live-Tokens verwenden (Aurora/Sunset, `--accent: #F2754F`, oklch-Basis aus `src/styles/globals.css`), nicht die Kobalt-/Navy-Farben aus Prototyp/Screenshots.

## Migration & Rollout

Additive SQLite-Migration (nächste freie Nummer nach der bestehenden Migrationskette), mit Backfill-Defaults für Bestandsdaten wie oben beschrieben. Keine Breaking Changes an bestehenden Feldern/Spalten. Kein Cloud-Migrationsschritt nötig.

## Testing

- Rust-Unit-Tests (`db/project.rs`, `db/project_phase.rs`): neue Felder in Create/Update, Migrations-Backfill-Verhalten (bestehende Zeilen bekommen korrekte Defaults).
- Frontend-Unit-Tests: `projectSignals`/Health-Funktionen (Grenzfälle: Gate genau heute fällig, Gate ohne Datum, keine Phasen), `rollingWeeks` (Monatswechsel, Jahreswechsel).
- Komponenten-Test: Timeline-Übersicht (Filter-Zustände, leere Liste, Positionierung von Balken/Diamanten bei Phase außerhalb des sichtbaren Fensters).

## Offene Punkte für spätere Etappen (bewusst hier nur vermerkt, nicht gelöst)

- Team-Zuweisung (Lead + Mitglieder) — kommt mit Etappe 4, da in Etappe 1 nicht UI-relevant.
- Budget-/Stimmungs-Ampel-Berechnung — kommt mit Etappen 5/6.
- Ob Projekte künftig Cloud-synced werden sollen (aktuell lokal-only) — nicht Teil dieser Etappe, ggf. eigene Spec falls gewünscht.
