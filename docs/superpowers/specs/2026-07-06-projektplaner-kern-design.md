# Projektplaner-Kern

## Kontext

Memory `projektplanner-feature`: User-Wunsch (2026-06-28) — ein Projektplaner, der Projekt anlegen → Phasen definieren → im Projekt arbeiten → abschließen ermöglicht und Mails/Rechnungen/Ideen/Aufgaben pro Projekt bündelt. In der Cultera-Marken-Architektur ist „Cultera Projekte" bereits als eigene, spätere App vorgesehen ([[cultera-naming-architecture]]).

**Diese Spec baut NUR den Kern innerhalb von Cultera OS:** Projekt-Entität, freie Phasenliste, Verknüpfung mit Aufgaben, plus die visuelle Übersicht/Detail-Ansicht. Mail-/Rechnungs-/Notiz-Verknüpfung, sowie die freie Drag&Drop-Leinwand (Miro/Figma-artig) sind bewusst nicht Teil dieser Spec (siehe „Nicht im Scope").

## Vorlaufende Recherche (2026-07-06, code-verifiziert)

- Kein Nachfolgezustand nach Deal-Won existiert — ein Projekt ist eine komplett neue, unabhängige Entität, kein Anhängsel an bestehende Deals.
- Exaktes Vorbild-Muster: `Invoice.dealId` (`src/types/finance.types.ts:10`) ist ein optionales Zweitfeld neben dem Pflicht-`accountId` — `Todo.projectId`/`Todo.projectPhaseId` folgen demselben Muster.
- `Todo` (`src/types/todo.types.ts:13-35`) hat aktuell nur `customerId?` als Kunden-Verknüpfung, keine Projekt-/Deal-Zugehörigkeit. `TodoBucket` ist ein festes Enum (`backlog|today|in_progress|done`).
- `todos`-Tabelle: Basis-Schema in `src-tauri/src/db/schema.rs:162-171`, seither per `ALTER TABLE`-Migrationen erweitert (z.B. `checklist`, `tags`, `assignee` — `migrations.rs:94-96`). Neue Spalten `project_id`/`project_phase_id` folgen demselben additiven Muster.
- `CustomerTab` (`src/store/ui.store.ts:11-17`) ist ein festes Union-Type mit 5 Tabs (tasks/notizen/dokumente/kommunikation/verlauf/finanzen) — ein neuer `'projekte'`-Wert wird ergänzt. **Korrektur gegenüber der ursprünglichen Kunden-Tab-Idee:** Nutzer-Feedback (2026-07-06) will eine **kundenübergreifende Übersicht** sehen, kein rein in den Kunden-Tab verstecktes Feature — siehe UI-Design unten. Der Kunden-Tab-Ansatz wurde verworfen.
- Bestehendes Datei-/Ordner-System (`workspace_ablage.rs`, `folder.rs`) existiert bereits — relevant für ein späteres Moodboard-Bild-Upload (nicht Teil dieser Spec, aber die Infrastruktur ist vorhanden, falls später gebraucht).
- `deal.types.ts` ist toter Code (nirgends importiert, `pipeline.types.ts` ist die aktive Deal-Definition) — separater Cleanup-Kandidat, nicht Teil dieser Spec.

## UI-Design (validiert über Mockup-Iteration + 4-Konzepte-Richter-Panel)

Drei Mockup-Runden mit dem Nutzer, zuletzt ein Workflow mit 4 unabhängigen Design-Agenten (Fokus: Auf-einen-Blick-Klarheit / Wärme / Informationsdichte / visuelles Storytelling) + 3 Richter (UX-Klarheit, Design-Handwerk, technische Machbarkeit). Ergebnis: „Auf-einen-Blick-Klarheit" gewann UX-Klarheit (9/10) und Machbarkeit (9/10) deutlich; „Wärme" gewann nur das Handwerks-Kriterium (8.5/10). Finale Synthese: Klarheits-Konzept als Struktur-Basis + Wärme-Elemente als Ergänzung (nie als Ersatz der Status-Klarheit). Vom Nutzer freigegeben.

**Screen 1 — „Alle Projekte" (kundenübergreifende Übersicht, NEUER Top-Level-Nav-Eintrag „Projekte"):**
- Persönliche Begrüßungszeile + KPI-Chips (X überfällig / Y aktiv / Z pausiert).
- Projekte gruppiert nach Dringlichkeit in drei feste Buckets: „Braucht Aufmerksamkeit" (hat überfällige Aufgaben) → „Aktiv" → „Pausiert". Keine alphabetische/chronologische Sortierung.
- Jede Projekt-Zeile: Kunde, Projektname, 4-Segment-Phasen-Balken (erledigt=grün gefüllt, aktuell=Koralle-Verlauf mit Puls-Animation, geplant=gestrichelter Umriss, pausiert=gedämpft), Status-Chip rechts (⚠ überfällig / ● im Zeitplan / ✓ fast fertig / ⏸ pausiert) + Fälligkeitsdatum, plus eine sekundäre, freundliche Ein-Satz-Zeile darunter (z.B. „🏁 Letzter Schritt vor dem Abschluss").
- Eine Farb-Legende oberhalb der Liste erklärt den Segment-Code einmalig.
- Klick auf eine Zeile öffnet Screen 2.

**Screen 2 — Projekt-Detail:**
- Breadcrumb zurück zu „Alle Projekte", Kopfzeile mit Kunde+Titel, Buttons „Aufgabe hinzufügen" / „Phase abschließen".
- Horizontaler Stepper: ein Knoten pro Phase (erledigt=grün mit Häkchen, aktuell=größer+Koralle-Verlauf+Puls-Animation+optionalem Überfällig-Flag, geplant=neutral), durchgezogene Fortschrittslinie, Datums-/Statustext je Knoten.
- Darunter drei Panels nebeneinander: **Moodboard** (Bilder-Grid, „+"-Kachel zum Hinzufügen), **Notizen & Konzeption** (Textnotizen mit Autor/Datum, „+ Notiz"), **Aufgaben** (Liste gefiltert auf die aktuelle Phase, Checkbox, überfällig hervorgehoben).

Referenz-Mockup (Cultera-OS-Design-Tokens, nicht Teil des Produktivcodes): siehe Session-Artifact vom 2026-07-06 (finale Synthese-Version), archiviert als Grundlage für die Implementierungs-Plan-Phase.

## Datenmodell

**Neue Tabelle `projects`:**
```
id            TEXT PRIMARY KEY
workspace_id  TEXT NOT NULL
account_id    TEXT NOT NULL REFERENCES accounts(id)  -- Pflicht: ein Projekt gehört zu genau einem Kunden
title             TEXT NOT NULL
description       TEXT
status            TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'completed'
current_phase_id  TEXT REFERENCES project_phases(id)  -- Zeiger auf die aktuelle Phase; NULL erst wenn noch keine Phase existiert
created_at        TEXT NOT NULL
updated_at        TEXT NOT NULL
completed_at      TEXT
```
`current_phase_id` ist der einzige Ort, an dem "wo steht das Projekt" festgehalten wird — Phasen mit kleinerem `order_index` als die aktuelle gelten als erledigt, mit größerem als geplant. Analog zum bestehenden `accounts.primary_deal_id`-Zeiger-Muster. Beim Anlegen des Projekts wird `current_phase_id` auf die erste Phase (kleinster `order_index`) gesetzt, sobald mindestens eine Phase existiert.

**Neue Tabelle `project_phases`:**
```
id            TEXT PRIMARY KEY
project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
name          TEXT NOT NULL
order_index   INTEGER NOT NULL
created_at    TEXT NOT NULL
```
Freie Liste pro Projekt (Nutzer benennt/ordnet eigene Phasen beim Anlegen), analog zu den bestehenden konfigurierbaren `pipeline_stages`/`lead_stages` — nur pro Projekt statt pro Workspace.

**`todos`-Tabelle:** zwei neue nullable Spalten `project_id` (FK `projects`) und `project_phase_id` (FK `project_phases`) — additive Migration, analog zum bestehenden `ALTER TABLE todos ADD COLUMN ...`-Muster (`migrations.rs:94-96`). Bestehende Todos bleiben unberührt.

**Notizen-Panel — bewusste Entscheidung gegen ein 4. Notiz-System:** Diese App hat laut Recherche bereits mindestens 3 getrennte Notiz-Ablagen (`note_entries`, `activities` Typ `note`, plus verstreute `notes`-Freitextfelder auf Todo/Deal/Contact/etc.). Eine neue eigene `project_notes`-Tabelle würde diese Fragmentierung verschärfen. Stattdessen: `activities`-Tabelle bekommt eine neue nullable Spalte `project_id` (FK `projects`, analog zu ihren bestehenden `account_id?`/`contact_id?`/`deal_id?`-Spalten, `src/types/activity.types.ts:20-22`). Das Notizen-Panel im Projekt-Detail ist eine gefilterte Ansicht: `activities WHERE project_id = ? AND type = 'note'`. Neue Notizen werden ganz normal als `type: 'note'`-Activity mit gesetztem `project_id` angelegt — kein neuer Code-Pfad, nur ein zusätzlicher Filter auf dem bestehenden Notiz-Aktivitäts-Typ.

**Cloud-Pendant:** entsprechende Supabase-Tabellen `projects`/`project_phases` + Spalten auf `todos`/`activities`, mit RLS analog zu bestehenden workspace-gescopten Tabellen (Muster aus `accounts`/`deals` übernehmen).

## Lifecycle

- „Phase abschließen" (im Detail-Header) setzt `current_phase_id` auf die Phase mit dem nächsthöheren `order_index`. Gibt es keine weitere Phase (aktuelle Phase hat den höchsten `order_index`), setzt derselbe Klick stattdessen `status='completed'` + `completed_at` (kein separater „Projekt abschließen"-Button nötig).
- Abgeschlossene Projekte werden schreibgeschützt (keine neuen Aufgaben/Phasen-Änderungen), bleiben aber sichtbar/durchsuchbar (verschwinden aus den drei aktiven Buckets der Übersicht, ggf. eigener „Abgeschlossen"-Filter — Detail dazu in der Planungsphase).
- Kein Kaskadieren auf verknüpfte Aufgaben — offene Todos bleiben offen, das Abschließen eines Projekts ändert nichts automatisch an ihnen.

## Nicht im Scope (bewusst)

- **Freie Drag&Drop-Leinwand** (Miro/Figma-artig) — das ist die Vision für die spätere, eigenständige App „Cultera Projekte" (siehe [[cultera-naming-architecture]]), die per API mit Cultera OS sprechen wird. Bewusst NICHT in Cultera OS reingebaut, um das spätere Herauslösen nicht zu erschweren.
- Mail-/Rechnungs-/Notiz-Verknüpfung zu Projekten (`Invoice.projectId`, `EmailHeader.projectId` etc.) — eigene, spätere Specs nach demselben `dealId`-Muster.
- Kunden-Freigabe + Kommentare + Benachrichtigungen — eigene, spätere Spec (externe Zugriffsrechte, Security-Architektur).
- Konsolidierung der Notiz-/Follow-up-Fragmentierung als Ganzes — unabhängiges Thema. Diese Spec verschärft es bewusst nicht weiter (siehe Datenmodell: Notizen-Panel nutzt die bestehende `activities`/`note`-Ablage, keine neue Tabelle).
- Aufräumen des toten `deal.types.ts` — separater Cleanup-Kandidat.

## Akzeptanzkriterien

- Neuer Top-Level-Nav-Eintrag „Projekte" zeigt alle laufenden Projekte kundenübergreifend, gruppiert nach Dringlichkeit.
- Projekt anlegen erzeugt eine `projects`-Zeile + beliebig viele `project_phases` in Reihenfolge.
- Aufgaben können einem Projekt + einer Phase zugeordnet werden (optional, additiv — bestehende Todos ohne Projekt funktionieren unverändert).
- Detail-Ansicht zeigt Stepper (aktuelle Phase hervorgehoben), Moodboard-Panel, Notizen-Panel, gefilterte Aufgabenliste.
- „Phase abschließen" rückt vor bzw. schließt das Projekt bei der letzten Phase ab; abgeschlossene Projekte sind schreibgeschützt, aber sichtbar.
- `npx vitest run` und `npx tsc --noEmit` bleiben grün; neue Rust-Tests für die Migrationen + CRUD-Commands.
