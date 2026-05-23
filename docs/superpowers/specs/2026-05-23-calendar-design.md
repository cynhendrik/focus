# Kalender — Design Spec
**Datum:** 2026-05-23  
**Status:** Approved  
**Scope:** Phase 1 — lokale Events, 3 Ansichten, kein externer Sync

---

## 1. Ziel

Den statischen Kalender-Mockup durch einen vollständig funktionalen Kalender ersetzen: eigene Events anlegen/bearbeiten/löschen, drei schaltbare Ansichten (Tag/Woche/Monat), optionale Client-Verknüpfung. Fundament für späteren externen Kalender-Sync (Google/iCal) in Phase 2.

---

## 2. Datenmodell

### DB-Tabelle: `calendar_events`

```sql
CREATE TABLE IF NOT EXISTS calendar_events (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL DEFAULT '',
    created_by      TEXT NOT NULL DEFAULT '',
    account_id      TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    location        TEXT,
    start_at        TEXT NOT NULL,   -- ISO 8601: "2026-05-23T14:00:00"
    end_at          TEXT NOT NULL,   -- ISO 8601
    all_day         INTEGER NOT NULL DEFAULT 0,
    color           TEXT,            -- NULL | 'accent' | 'warn' | 'ok' | 'danger'
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace
    ON calendar_events(workspace_id, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_account
    ON calendar_events(account_id, start_at);
```

Migration: additive `CREATE TABLE IF NOT EXISTS` — keine bestehenden Daten betroffen.

### TypeScript-Typen (`src/types/calendar.types.ts`)

```typescript
export interface CalendarEvent {
  id: string
  workspaceId: string
  createdBy: string
  accountId?: string
  title: string
  description?: string
  location?: string
  startAt: string   // ISO 8601
  endAt: string     // ISO 8601
  allDay: boolean
  color?: 'accent' | 'warn' | 'ok' | 'danger'
  createdAt: string
  updatedAt: string
}

export interface UpsertCalendarEventPayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId?: string
  title: string
  description?: string
  location?: string
  startAt: string
  endAt: string
  allDay: boolean
  color?: string
}
```

---

## 3. Backend (Rust / Tauri)

### Neue Dateien

| Datei | Inhalt |
|---|---|
| `src-tauri/src/db/calendar.rs` | CRUD-Funktionen gegen SQLite |
| `src-tauri/src/commands/calendar.rs` | Tauri-Commands (öffentliche API) |

### DB-Modul (`db/calendar.rs`)

4 Funktionen:
- `get_events(conn, workspace_id, from, to) → Vec<CalendarEvent>`  
  Lädt alle Events deren `start_at` im Bereich `[from, to]` liegt.
- `upsert_event(conn, payload) → CalendarEvent`  
  INSERT OR REPLACE mit UUID-Generierung bei neuem Event.
- `delete_event(conn, id, workspace_id) → ()`  
  Löscht ein einzelnes Event (workspace_id als Sicherheitsprüfung).

### Tauri-Commands (`commands/calendar.rs`)

```rust
#[tauri::command]
pub async fn get_calendar_events(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    from: String,
    to: String,
) -> Result<Vec<CalendarEvent>, AppError>

#[tauri::command]
pub async fn upsert_calendar_event(
    state: tauri::State<'_, AppState>,
    payload: UpsertCalendarEventPayload,
) -> Result<CalendarEvent, AppError>

#[tauri::command]
pub async fn delete_calendar_event(
    state: tauri::State<'_, AppState>,
    id: String,
    workspace_id: String,
) -> Result<(), AppError>
```

Registrierung in `main.rs` unter `invoke_handler`.  
Export in `commands/mod.rs` als `pub mod calendar`.

---

## 4. Frontend

### Service (`src/services/calendar.service.ts`)

Dünner `invoke`-Wrapper über die 3 Commands. Kein Business-Logik.

### Store (`src/store/calendar.store.ts`)

```typescript
interface CalendarState {
  events: CalendarEvent[]
  view: 'day' | 'week' | 'month'
  currentDate: Date          // Anker-Datum für Navigation
  isLoading: boolean
  error: string | null

  load: (workspaceId: string) => Promise<void>   // lädt ±2 Monate um currentDate
  upsert: (payload: UpsertCalendarEventPayload) => Promise<void>
  remove: (id: string, workspaceId: string) => Promise<void>
  setView: (view: 'day' | 'week' | 'month') => void
  navigate: (dir: 'prev' | 'next' | 'today') => void
}
```

`navigate` bewegt `currentDate` je nach aktiver Ansicht:
- Tag: ±1 Tag
- Woche: ±7 Tage
- Monat: ±1 Monat

Nach `navigate` wird automatisch `load()` aufgerufen wenn der neue Zeitraum nicht gecacht ist.

### Route (`src/routes/CalendarRoute.tsx`)

Aufgeteilt in Unter-Komponenten (alle in derselben Datei solange < 600 Zeilen, sonst auslagern):

| Komponente | Aufgabe |
|---|---|
| `CalendarRoute` | Layout, State-Anbindung, View-Switch |
| `WeekView` | 7-Spalten-Stundenraster |
| `MonthView` | 6×7-Grid mit Event-Chips |
| `DayView` | Einzel-Spalten-Stundenraster |
| `EventForm` | Modal zum Erstellen/Bearbeiten |
| `EventChip` | Wiederverwendbare Event-Darstellung |

### Wochenansicht

- Grid: 60px Zeitspalte + 7 gleichbreite Tagesspalten
- Stunden: 08:00–19:00 (56px/h), Subgrid-Linie bei :30
- Events: `position: absolute`, `top = (startHour - 8) * 56 + (startMin / 60) * 56`, `height = Dauer in Minuten / 60 * 56`
- Überlappungen: Breite teilen, nebeneinander darstellen (max. 3 Ebenen)
- Heute-Spalte: leicht erhöhter Hintergrund
- Rote aktuelle-Zeit-Linie: `useEffect` mit `setInterval(60s)`

### Monatsansicht

- 6×7-Grid, erste Zelle = Montag der Woche in der der Monat beginnt
- Zellen außerhalb des aktuellen Monats: gedimmt
- Events als 22px-Chips, sortiert nach `start_at`
- Max. 3 Chips sichtbar, darunter „+N" Link → wechselt in Tagesansicht
- Klick auf Tageszahl → Tagesansicht

### Tagesansicht

- Wie Wochenansicht aber eine Spalte (volle Breite)
- Klick auf leere Stunden-Slot → EventForm vorausfüllen mit Datum + Stunde

### EventForm Modal

- Slideout von rechts (480px, `position: fixed`)
- Felder: Titel (Pflicht), Datum, Start/Ende-Uhrzeit, Ganztägig-Toggle, Client (Dropdown `accounts`), Ort, Beschreibung, Farbe (5 Presets)
- Ganztägig-Toggle blendet Uhrzeitfelder aus
- Validierung: Titel nicht leer, `end_at > start_at`
- Bearbeiten: Klick auf bestehendes Event öffnet Form vorausgefüllt
- Löschen-Button nur im Bearbeitungs-Modus (mit Bestätigung)

### Keyboard-Shortcuts

| Taste | Aktion |
|---|---|
| `←` / `→` | prev / next |
| `T` | Heute |
| `D` | Tagesansicht |
| `W` | Wochenansicht |
| `M` | Monatsansicht |
| `N` | Neues Event (heute) |
| `Escape` | Modal schließen |

---

## 5. Fehlerbehandlung

- Backend-Fehler → `error`-State im Store → Toast-artige Fehlermeldung in der Route
- Leerer Zustand (keine Events): freundliche Leerdarstellung pro Ansicht
- Ladezustand: Skeleton oder `isLoading`-Spinner

---

## 6. Was explizit OUT OF SCOPE ist (Phase 1)

- Wiederkehrende Events (recurrence)
- Externer Kalender-Sync (Google/iCal)
- Einladungen / Teilnehmer
- Erinnerungen / Notifications
- Drag & Drop zum Verschieben von Events

---

## 7. Dateistruktur (neu/geändert)

```
src-tauri/src/db/calendar.rs          NEU
src-tauri/src/commands/calendar.rs    NEU
src-tauri/src/commands/mod.rs         +calendar
src-tauri/src/db/mod.rs               +calendar
src-tauri/src/db/schema.rs            +calendar_events Tabelle
src-tauri/src/main.rs                 +calendar commands

src/types/calendar.types.ts           NEU
src/services/calendar.service.ts      NEU
src/store/calendar.store.ts           NEU
src/routes/CalendarRoute.tsx          ERSETZT (komplett neu)
```
