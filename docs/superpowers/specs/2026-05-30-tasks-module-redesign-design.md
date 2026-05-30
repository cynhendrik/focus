# Tasks-Modul Redesign — Liste · Board · Fokus

**Datum:** 2026-05-30
**Status:** Approved, ready for implementation plan
**Scope:** Komplettes Tasks-Modul (`/tasks` Route) — neue UX, erweiterte Datenstruktur, drei View-Modi (Liste / Board / Fokus), inline TipTap-Composer mit Prefix-Syntax, gemockte AI-Zusammenfassung.

## Ziel

Das beste Task-Modul für einen Solo/Small-Team-Workflow:

- **Liste** = zeitbasierter Daily-Driver (Heute / Morgen / Diese Woche / Später)
- **Board** = status-orientierter Kanban-Schnitt (Backlog / Heute / In Arbeit / Erledigt)
- **Fokus** = One-thing-at-a-time, Checklist + AI-Briefing + Erledigt-und-weiter
- **Composer** = ein TipTap-Eingabefeld mit Prefix-Syntax (`!`, `~30m`, `@10:00`, `#tag`, `+Kunde`), Live-Chip-Rendering, kein Modal

Tasks sind nicht mehr zwingend an einen Kunden gebunden.

---

## 1 — Datenmodell

`src/types/todo.types.ts` wird erweitert. Der existierende `Todo`-Type bleibt die einzige Quelle der Wahrheit. `FocusStore` + `focus.types.ts` werden gelöscht.

```ts
export type Priority = 'p1' | 'p2' | 'p3' | 'p4'
export type Bucket   = 'backlog' | 'today' | 'in_progress' | 'done'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Todo {
  id: string
  customerId?: string          // ⚠️ war required → jetzt optional
  title: string
  status: 'open' | 'in_progress' | 'done'
  priority: Priority           // war 'low'|'normal'|'high'
  bucket: Bucket               // NEU
  scheduledAt?: string         // ISO datetime, z.B. '2026-05-30T10:00:00'
  plannedMinutes?: number      // NEU — Zeitschätzung
  dueDate?: string             // existiert, bleibt
  notes?: string               // NEU — TipTap JSON (serialized)
  aiSummary?: string           // NEU — gemocked jetzt, später API
  checklist: ChecklistItem[]
  tags: string[]
  assignee?: string
  createdAt: string
  updatedAt: string
}
```

**Bucket vs. Status:**
- `status` = `done`/`open`/`in_progress` — primärer Workflow-Indikator
- `bucket` = explizit für Board-Spalten (Drag&Drop landet hier)
- Regel: `status='done'` ⇒ `bucket='done'`; `bucket='in_progress'` ⇒ `status='in_progress'`. Beim Tickets werden beide kohärent gesetzt.

**Priority-Migration:**
| alt | neu |
|---|---|
| `high`   | `p1` |
| `normal` | `p3` |
| `low`    | `p4` |

In der DB-Migration via SQL-`UPDATE`. UI verwendet ab sofort `p1`-`p4`.

---

## 2 — Routing & Komponenten

```
src/routes/TasksRoute.tsx                   ← kompletter Rewrite
src/components/tasks/
  ├─ TasksHeader.tsx                        Ring + Stats + Cy-Btn + Tab-Switcher
  ├─ TasksListView.tsx                      Tab 1
  ├─ TasksBoardView.tsx                     Tab 2 (DnD)
  ├─ TasksFocusView.tsx                     Tab 3 (One-Card)
  ├─ TaskComposer.tsx                       TipTap-Editor + Prefix-Parser
  ├─ TaskRow.tsx                            Liste-Zeile (klickbar → expand inline)
  ├─ TaskRowExpanded.tsx                    Inline-Expansion mit Edit-Controls
  ├─ TaskBoardCard.tsx                      Board-Card (kompakter)
  ├─ TaskFocusCard.tsx                      Fokus-Karte (groß, mit AI-Summary)
  ├─ CyPlanPanel.tsx                        Mock Slide-In für "Cy · Tag planen"
  └─ prefix-parser.ts                       Pure-Funktion: text → TaskDraft
src/hooks/
  └─ useFocusStack.ts                       Sortierter Today-Stack + Aktionen
```

**Tab-Persistenz:** `ui.store.ts` bekommt `tasksTab: 'list' | 'board' | 'focus'`, default `'list'`.

**Header ist über alle 3 Tabs identisch** (Ring, Stats, Cy-Btn, Tab-Switcher). Nur der Body wechselt.

`NewTaskModal` bleibt unangetastet — wird weiter im Kunden-Workflow-Pane verwendet, NICHT in `/tasks`.

---

## 3 — Liste-View

### Layout
- **Header** (sticky oben)
- **Composer** (TipTap, immer sichtbar oben)
- **Toolbar**: `Gruppieren: [Zeit] [Priorität]`, rechts: `X offen · Y erledigt`
- **Sektionen** (default by Zeit): Heute → Morgen → Diese Woche → Später → Erledigt (kollabiert)
- **Sortierung innerhalb Sektion**: scheduledAt asc, dann Priorität asc

### Row-Aufbau
```
▎ [☐]  Titel der Aufgabe                       [P1]  10:00  1/3  45m
       customer · #tag
```
- Linkstrich-Farbe = Priorität (P1 rot, P2 orange, P3 gelb, P4 grau)
- Klick auf Checkbox = status toggle
- Klick auf Row = inline-Expansion (drückt nachfolgende Rows weg)
- Expansion zeigt: Titel-Edit, Notes (TipTap mini), Teilschritte (Checklist), Meta-Editor (Priorität-Toggle, Date-Picker, Zeit-Input, Tags-Input)

### Composer
Einzelner TipTap-Editor mit Prefix-Syntax. Live-Chips beim Tippen. Enter = submit. Siehe Abschnitt 5.

---

## 4 — Board-View

Klassisches 4-Spalten-Kanban mit Drag&Drop.

| Spalte | Bedingung |
|---|---|
| Backlog | `bucket='backlog'` |
| Heute | `bucket='today'` |
| In Arbeit | `bucket='in_progress'` |
| Erledigt | `bucket='done'` (max. letzte 10 sichtbar, Rest kollabiert) |

**DnD-Lib:** `@dnd-kit/core` — falls noch nicht installiert: `npm i @dnd-kit/core @dnd-kit/sortable`. Akzeptabel und A11y-freundlich.

**Drop-Side-Effects:**
- Drop in `today` ⇒ falls `scheduledAt` leer: setze auf heute 09:00; `status='open'`
- Drop in `in_progress` ⇒ `status='in_progress'`
- Drop in `done` ⇒ `status='done'`, `completedAt=now`
- Drop in `backlog` ⇒ `scheduledAt=undefined`, `status='open'`

**Cards** (kompakt):
- Prio-Badge oben links, Uhrzeit oben rechts
- Titel (max 2 Zeilen, ellipsis)
- Mini-Progress-Bar wenn Checklist (X/Y · Zeit)
- Tag/Customer unten

---

## 5 — Composer & Prefix-Parser

### Tokens

| Token | Wirkung | Beispiele |
|---|---|---|
| `!!` | Priorität → `p1` | `!! Kunde anrufen` |
| `!` | Priorität → `p2` | `! Mail beantworten` |
| (kein) | Priorität → `p3` (default) | — |
| `~30m`, `~1h`, `~1.5h`, `~90m` | `plannedMinutes` | `~45m Brand Guidelines` |
| `@HH:MM` | `scheduledAt` (heute, falls kein Datum) | `@10:00` |
| `@morgen`, `@di`, `@mo`, `@2026-06-01` | `scheduledAt` | `@morgen` |
| `#tag` | tags[] (mehrfach erlaubt) | `#call #wichtig` |
| `+Kunde` | `customerId` via fuzzy-match | `+TechCorp` |
| Rest | `title` | — |

### Parser-Funktion (pure)

```ts
// prefix-parser.ts
export interface TaskDraft {
  title: string
  priority?: Priority
  plannedMinutes?: number
  scheduledAt?: string
  tags: string[]
  customerHint?: string
}

export function parseTaskText(input: string): TaskDraft
```

Pure-Funktion, ohne Side-Effects, voll unit-testbar.

### TipTap-Integration

- TipTap-Doc als Single-Line-Editor (Enter = submit, statt newline)
- Custom-Marks für `priority`, `time`, `date`, `tag`, `customer` → werden farbig als Chips gerendert
- Während Tippens debounced re-parse → setzt Marks auf erkannte Tokens

**Customer-Picker bei `+`:** Wenn `+` getippt wird, blendet ein kleines Dropdown ein mit gefilterten Customers. `↑↓` zum Navigieren, `Tab`/`Enter` zum Auswählen. Bei eindeutigem fuzzy-match auto-resolve.

---

## 6 — Fokus-View

### Layout (eine Karte, zentriert, max-width 768px)

```
Header (Ring, Stats, Tabs)
─────────────────────────
AUFGABE 1 VON 3                    ● ○ ○  Pagination

  ▎● Dringend  Heute · 10:00  ● Cy vorbereitet
  ▎
  ▎ Brand Guidelines
  ▎
  ▎ ┌─ Cy · Vorbereitet ─────────────────────┐
  ▎ │ Letzter Stand: ... heute: ...           │   ← aiSummary mocked
  ▎ └────────────────────────────────────────┘
  ▎
  ▎ TEILSCHRITTE · 1/3
  ▎  ✓ Letzten Stand sichten
  ▎  ○ Offene Punkte sammeln
  ▎  ○ Ergebnis an Kunde senden

[← zurück]  [✓ Erledigt · weiter]  [⏱ Morgen]  [Überspringen →]
```

### useFocusStack Hook

```ts
// hooks/useFocusStack.ts
interface FocusStackApi {
  stack: Todo[]              // sortierter Stack
  currentIndex: number
  current: Todo | undefined
  total: number
  completedToday: number
  prev(): void
  skip(): void               // index++
  complete(): Promise<void>  // status=done, springt weiter
  postpone(): Promise<void>  // scheduledAt += 1d, bucket=backlog, springt weiter
}

export function useFocusStack(): FocusStackApi
```

**Stack-Berechnung:**
1. Filter: `bucket==='today'` ODER `scheduledAt` ist heute
2. Filter: `status !== 'done'`
3. Sort: `priority asc` (p1 first), dann `scheduledAt asc`, dann `createdAt asc`

**Skip-Verhalten:** `Überspringen` rückt nur den Index vor. Wenn Index am Ende ist und noch offene Tasks da sind (sprich: vorherige wurden geskipped), springt der Index zurück auf 0 (Wrap-Around).

**Keyboard:**
- `Space` = Erledigt · weiter
- `←` = zurück
- `→` = Überspringen
- `M` = Morgen
- `Enter` auf Teilschritt = toggle done

**Leerer State:** „Tag geschafft 🙌 — Liste oder Board ansehen?"

---

## 7 — Cy · Tag planen (Mock)

Button im Header öffnet Slide-In Panel von rechts.

Mock-Inhalt:
- Header: "Cy hat deinen Tag geplant"
- Liste der heutigen Tasks in Cy-vorgeschlagener Reihenfolge (statisch sortiert nach P1>P2>P3 + Uhrzeit)
- Pro Task: 1-Satz-Mock-Begründung ("Dringend, weil Kunde wartet seit 3 Tagen")
- Footer-Button: "Plan übernehmen" (kein-op jetzt)

Volle API-Anbindung in späterem Spec (separate Iteration).

---

## 8 — Service / Store / Migration

### TodoService
- Existierende Methoden bleiben strukturell gleich (Tauri `invoke`)
- Payloads erweitert um neue Felder
- Neue Methode: `setBucket(id, bucket)`, `postpone(id)`, `complete(id)`
- SQL-Migration im Backend (Rust/Tauri):
  ```sql
  ALTER TABLE todos ADD COLUMN bucket TEXT NOT NULL DEFAULT 'backlog';
  ALTER TABLE todos ADD COLUMN scheduled_at TEXT;
  ALTER TABLE todos ADD COLUMN planned_minutes INTEGER;
  ALTER TABLE todos ADD COLUMN notes TEXT;
  ALTER TABLE todos ADD COLUMN ai_summary TEXT;
  -- customer_id NOT NULL → NULL  (Schema-Rebuild via temp table)
  UPDATE todos SET priority = 'p1' WHERE priority = 'high';
  UPDATE todos SET priority = 'p3' WHERE priority = 'normal';
  UPDATE todos SET priority = 'p4' WHERE priority = 'low';
  UPDATE todos SET bucket = 'done' WHERE status = 'done';
  UPDATE todos SET bucket = 'in_progress' WHERE status = 'in_progress';
  ```

### Sample-AI-Summaries

Für visuelle Demo werden 3-5 hardcoded `aiSummary`-Strings als Seed-Daten in einer kleinen Funktion `seedSampleAiSummaries()` mitgegeben, die einmalig (idempotent, via Flag in localStorage) bei App-Start läuft und auf existierende offene Todos angewendet wird (falls leer). Nicht in der DB-Migration — separater Boot-Hook.

### todos.store.ts
Neue Aktionen:
- `complete(id)`
- `postpone(id)` — +1 Tag, bucket=backlog
- `setBucket(id, bucket)`
- `setScheduledAt(id, iso)`
- `setPriority(id, priority)`
- `updateNotes(id, notes)` — debounced
- Computed selectors: `todayTasks()`, `byBucket(bucket)`, `groupedByTime()`

---

## 9 — Was gelöscht / verschoben wird

**Gelöscht:**
- `src/store/focus.store.ts`
- `src/types/focus.types.ts`
- `src/components/focus/FocusArea.tsx`
- `src/components/focus/Section.tsx`
- `src/components/focus/TaskCard.tsx`
- `src/components/focus/FocusMode.jsx`

**Bleibt unangetastet:**
- `src/components/focus/FocusAiPane.tsx` — anderer Use-Case (Chat-mit-Kunde im Workflow-Pane), nicht Teil dieses Specs
- `src/components/customer/NewTaskModal.tsx` — wird weiter im Kunden-Workflow-Pane verwendet

**Komplett ersetzt:**
- `src/routes/TasksRoute.tsx`

---

## 10 — Akzeptanzkriterien

- [ ] Tasks-Sidebar-Item führt zu neuem 3-Tab-Layout (Liste/Board/Fokus)
- [ ] Tab-Persistenz über Reload (via ui.store)
- [ ] Composer parst `!!`, `!`, `~Xm`, `@HH:MM`, `@morgen`, `#tag`, `+Kunde` live als Chips
- [ ] Enter im Composer erstellt Task mit korrekten Werten
- [ ] Liste zeigt Sektionen (Heute/Morgen/Diese Woche/Später) korrekt sortiert
- [ ] Klick auf Row in Liste = inline-Expansion (kein Modal)
- [ ] Checkbox-Toggle in Liste = status done, Task rutscht in Erledigt-Sektion
- [ ] Board: DnD zwischen 4 Spalten funktioniert, Side-Effects korrekt (scheduledAt, status)
- [ ] Fokus-View: Stack = heute, sortiert P1>P2>P3 + Uhrzeit
- [ ] Fokus: `Erledigt · weiter`, `Morgen`, `Überspringen`, `← zurück` funktional
- [ ] Fokus: Tastatur-Bindings (Space, ←/→, M)
- [ ] Cy-Panel öffnet Slide-In mit Mock-Inhalt
- [ ] AI-Summary erscheint im Fokus-Card oberhalb Teilschritte (3-5 Sample-Tasks mocked)
- [ ] Migration: existierende Todos werden korrekt umgeschrieben (`high`→`p1` etc.)
- [ ] `customerId` jetzt optional — Tasks ohne Kunde sind anlegbar
- [ ] Alte Focus-Komponenten + Stores entfernt, keine dead imports

---

## 11 — Out of Scope (spätere Iterationen)

- Echter Claude-API-Call für `Cy · Tag planen` (jetzt Mock)
- Echter Claude-API-Call für `aiSummary` pro Task
- Recurring Tasks
- Sub-Tasks (Hierarchie) — Teilschritte bleiben einfache Checklist
- Time-Tracking / Timer (explizit entschieden: weg)
- Calendar-Integration (Tasks ↔ Kalendereinträge)
- Multi-User-Assignment (assignee bleibt String-Feld, kein Picker)
