# Projekt-Modul-Ausbau — Etappe 2: Detail-Kopf + Tabs + Cockpit

## Kontext

Etappe 1 (Datenmodell + Timeline-Übersicht) ist gemergt (PR #5). `Project` hat jetzt Retainer-Felder (`retainerMonthly`, `retainerHours`, `retainerMonths`), `ProjectPhase` hat Zeitraum + Gate (`startDate`, `endDate`, `gateName`, `gateState`, `gateDate`, `gateApprovedBy`, `progressPercent`). Die Übersicht ist eine Wochen-Timeline; das Projekt-Detail (`ProjectDetailRoute.tsx`) ist aber noch eine einzige Scroll-Seite ohne Tabs: Kopf → Phasen-Stepper → "+Phase"-Formular → 3-Spalten-Grid (Moodboard-Platzhalter, Notizen, Aufgaben).

Diese Etappe (2 von 6) führt eine Tab-Navigation im Detail ein und baut den ersten echten Cockpit-Tab — die "Was ist gerade wichtig?"-Übersicht für ein einzelnes Projekt.

## Ziel dieser Etappe

- Tab-Navigation im Projekt-Detail: **nur** die zwei Tabs, die jetzt echten Inhalt haben — **Cockpit** und **Phasen**. Moodboard/Team/Rechnungen-Tabs kommen erst als Tab dazu, wenn ihre jeweilige Etappe (5/4/6) tatsächlich gebaut wird — keine leeren Tabs.
- Detail-Kopf um die jetzt vorhandenen Retainer-Daten erweitern.
- Cockpit-Tab: "Nächster Zug", Phasen-Rail, Ampel, Signale — **nur mit Daten, die es wirklich gibt**. Kein Burn-Chart, keine Geld-Kennzahlen (Verrechnet/Offen) — beides braucht Zeiterfassung bzw. Rechnungs-Kopplung, die erst in späteren Etappen kommen. Kein hartcodierter "Kora sagt..."-Text — das wäre eine fingierte KI-Ausgabe.
- Phasen-Tab: bestehender Stepper + "+Phase"-Formular + die bestehenden Notizen-/Aufgaben-Spalten (unverändert in ihrer Funktion, nur hierher umgezogen). Die inerte Moodboard-Platzhalter-Karte entfällt, bis Etappe 5 einen echten Moodboard-Tab liefert.

**Explizit nicht Teil dieser Etappe:** Moodboard/Team/Rechnungen-Tabs, Gate-Freigabe-Workflow (Buttons zum Setzen von `pending`/`approved` — kommt in Etappe 3), Burn-Chart, Geld-Kennzahlen, echte Budget-/Stimmungs-Berechnung.

## Ehrlichkeits-Prinzip für die Ampel

`projectHealthBudget()` und `projectHealthStimmung()` geben in Etappe 1 fix `'ok'` zurück (grüner Punkt) — im Kontext einer Übersichts-Timeline unauffällig, im Cockpit als explizite Ampel-Aussage aber irreführend ("Budget im Rahmen", obwohl schlicht nichts gemessen wird). Etappe 2 führt einen vierten `HealthLevel`-Wert `'unknown'` ein; `projectHealthBudget`/`projectHealthStimmung` geben diesen zurück. Die Ampel-Kachel zeigt für `'unknown'` einen neutralen grauen Punkt mit Text "noch nicht erfasst", nicht Grün.

## Datenmodell / Logik-Änderungen

**`src/lib/projects/signals.ts` (bestehende Datei, erweitern):**
- `HealthLevel` wird `'ok' | 'warn' | 'bad' | 'unknown'`.
- `projectHealthBudget()`, `projectHealthStimmung()`: Rückgabewert `'ok'` → `'unknown'`.
- Neuer, aus `ProjectsTimeline.tsx` verschobener Export `GATE_COLOR: Record<ProjectPhase['gateState'], string>` (wird jetzt von zwei Komponenten gebraucht — kein Duplikat).
- Neue Funktion `nextMove(phases: ProjectPhase[], today: Date): NextMove`:
  - Filtert Phasen mit `gateState === 'pending'`, sortiert nach `gateDate` (fehlendes Datum zuletzt, überfällige zuerst).
  - Gibt es eine: `{ kind: 'gate_pending', tone: 'bad'|'warn', title, why, phaseId }` — `tone` ist `'bad'` wenn überfällig (gleiche `daysUntil`-Logik wie `projectHealthZeit`), sonst `'warn'`.
  - Gibt es keine: `{ kind: 'ruhe', tone: 'ok', title: 'Nichts brennt. Nächster Meilenstein läuft planmäßig.', why: 'Kein offenes Gate wartet auf Freigabe.', phaseId: null }`.

**`src/components/projects/ProjectsTimeline.tsx` (bestehende Datei, anpassen):**
- Lokale `GATE_COLOR`-Konstante entfernen, stattdessen aus `@/lib/projects/signals` importieren.
- `HEALTH_COLOR`-Record um `unknown: 'var(--fg-dim)'` ergänzen (TS erzwingt das ohnehin, da `HealthLevel` jetzt 4 Werte hat).

## UI

### Tab-Infrastruktur (neu)

**`src/store/ui.store.ts` (bestehende Datei, erweitern):** neuer Typ `ProjectTab = 'cockpit' | 'phasen'`, neuer State `activeProjectTab: ProjectTab` (Default `'cockpit'`), neuer Setter `setActiveProjectTab`. 1:1 nach dem Muster von `CustomerTab`/`activeCustomerTab`/`setActiveCustomerTab` in derselben Datei.

**`src/components/shared/TabBar.tsx` (neu):** generische, wiederverwendbare Tab-Leiste, extrahiert aus dem bisherigen Inline-Pattern in `CustomerRoute.tsx:392-446` (Hover-Zustand, aktive Unterstreichung, optionale Badge-Pille pro Tab). Props: `{ tabs: { id: string; label: string; icon: LucideIcon; count?: number }[]; activeId: string; onChange: (id: string) => void }`. `CustomerRoute.tsx` wird in dieser Etappe **nicht** auf die neue Komponente umgestellt — das ist ein eigenständiges, ungefragtes Refactoring und bleibt außen vor.

### Detail-Kopf (`src/routes/ProjectDetailRoute.tsx`, anpassen)

Bestehende Struktur (Zurück-Link, Kundenname als Kicker, `<h1>`-Titel, Pausieren/Fortsetzen + Phase-abschließen-Buttons) bleibt. Neue Unterzeile zwischen Kicker und Buttons:

```
Retainer {retainerMonthly.toLocaleString('de-DE')} € / Monat · {retainerHours} Std. inkl. · seit {createdAt formatiert TT.MM.JJJJ}
```

`retainerMonths` fließt hier **nicht** ein (kein belastbares "läuft noch X Monate"-Statement ohne Enddatum-Feld auf Project — würde falsche Präzision vortäuschen).

### Cockpit-Tab (neu: `src/components/projects/ProjectCockpit.tsx`)

Vier Kacheln, von oben nach unten:

1. **Nächster Zug** — aus `nextMove(phases, today)`. Titel + Begründung (`why`), bei `kind==='gate_pending'` ein CTA-Button "Zur Phase" der auf den Phasen-Tab wechselt (`setActiveProjectTab('phasen')`), bei `kind==='ruhe'` kein CTA.
2. **Phasen & Freigaben** — horizontale Segment-Rail, ein Segment pro Phase: Fortschrittsbalken (`phase.progressPercent`), Phasenname, Gate-Name mit Farbpunkt aus `GATE_COLOR[phase.gateState]`. Kopfzeile: "X von Y Phasen abgeschlossen" — X = Anzahl Phasen mit `orderIndex` kleiner als der `orderIndex` der aktuellen Phase (`project.currentPhaseId`), **dieselbe Ableitung wie im bestehenden `Stepper`** (nicht `progressPercent`-basiert, da eine Phase per Fortschritts-Regler auf 100 stehen kann ohne offiziell "abgeschlossen"/weitergerückt zu sein, und umgekehrt).
3. **Ampel** — drei Spalten Zeit/Budget/Stimmung. Zeit aus `projectHealthZeit(phases, today)` (echte Berechnung). Budget/Stimmung: `'unknown'` → grauer Punkt, Text "noch nicht erfasst".
4. **Signale** — Liste aus `projectSignals(phases, today)` (Etappe-1-Funktion, unverändert — aktuell nur Gate-Signale). Klick auf einen Eintrag wechselt auf den Phasen-Tab.

Kein Kennzahlen-Streifen, kein Burn-Chart, kein "Kora"-Hinweistext.

### Phasen-Tab (`src/routes/ProjectDetailRoute.tsx`, umgebaut)

Enthält (in dieser Reihenfolge) das, was heute auf der Hauptseite steht:
- Bestehender `Stepper` (inkl. Fortschritts-Regler an der aktiven Phase, aus Etappe 1).
- Bestehendes `NewPhaseForm` (Name/Start/Ende/Gate-Name, aus Etappe 1).
- Bestehende Notizen-Spalte (`NewNoteForm` + Liste) und Aufgaben-Spalte (`NewTaskForm` + `tasksInCurrentPhase`-Liste) — **unverändert in ihrer Funktion**, nur aus dem bisherigen 3-Spalten-Grid heraus- und in den Phasen-Tab hineinverschoben (2-Spalten-Layout, da die dritte Spalte — der Moodboard-Platzhalter — entfällt).

Die Moodboard-Platzhalter-Karte (aktuell `ProjectDetailRoute.tsx` Zeilen ~ um die 3-Spalten-Grid-Definition) wird ersatzlos entfernt.

## Testing

- `src/lib/projects/signals.test.ts` (bestehend, erweitern): Tests für `nextMove` (überfällig → `bad`, bald fällig → `warn`, kein Gate → `ruhe`/`ok`, Sortierung bei mehreren pending Gates), aktualisierte Erwartungen für `projectHealthBudget`/`projectHealthStimmung` (`'unknown'` statt `'ok'`).
- `src/components/projects/ProjectsTimeline.test.tsx` (bestehend): ggf. Anpassung, falls Health-Ampel-Farben dort getestet werden (aktuell nicht der Fall — nur Titel/Klick-Verhalten, unkritisch).
- Neue `src/components/shared/TabBar.test.tsx`: Rendering aller Tabs, aktiver Zustand, Badge-Anzeige, `onChange`-Aufruf bei Klick.
- Neue `src/components/projects/ProjectCockpit.test.tsx`: Nächster-Zug-Karte für beide `nextMove`-Zustände, Phasen-Rail-Kopfzeile, Ampel zeigt `unknown` neutral statt grün, Signale-Liste + Klick wechselt Tab.
- Kein Test für `ProjectDetailRoute.tsx` selbst nötig (bestehende Konvention: keine Route-Level-Tests in diesem Repo) — stattdessen manuelle Prüfschritte im Implementierungsplan.

## Offene Punkte für spätere Etappen (bewusst hier nur vermerkt)

- Gate-Freigabe-Workflow (Buttons "Freigabe eintragen"/"Erinnern", Deliverables-Liste) — Etappe 3.
- Team-Avatar-Stack im Kopf, Team-Tab — Etappe 4.
- Moodboard-Tab — Etappe 5.
- Rechnungen-Tab, Geld-Kennzahlen im Cockpit, Burn-Chart — Etappe 6 (Burn-Chart zusätzlich abhängig von einer noch nicht geplanten Zeiterfassung).
