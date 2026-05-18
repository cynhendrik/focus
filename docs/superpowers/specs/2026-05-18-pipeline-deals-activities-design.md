# Pipeline, Deals & Activities — Design Spec

**Datum:** 2026-05-18  
**Status:** Approved

---

## Ziel

Vollständiges Sales-CRM auf Basis der bestehenden Kunden-Infrastruktur: ein globales Pipeline-Board (Kanban) mit benutzerdefinierten Stages, mehrere Deals pro Kunde, und ein manueller Aktivitäten-Log pro Kunde. Zwei neue Tabs im Kundenprofil (Sales, Activities), ein neuer Nav-Eintrag (Pipeline).

## Architektur

Drei neue SQLite-Tabellen. Filterlogik und Kanban-State laufen im Frontend. Drag-and-drop via `@dnd-kit/core`. Stages sind workspace-spezifisch und vollständig benutzerdefinierbar — kein Hardcoding. Activities updaten `lastActivity` im CRM-Store, damit Smart Lists ("Inaktiv") auch manuelle Kontakte berücksichtigt.

**Tech Stack:** Rust/SQLite, Tauri commands, Zustand, React, `@dnd-kit/core`

**Buildorder:** Phase 1 — Pipeline-Infrastruktur (Stages + Deals + Board). Phase 2 — Customer-Tabs (Sales + Activities).

---

## Datenmodell

### `pipeline_stages`

```sql
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#6366f1',
    order_index  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace
    ON pipeline_stages(workspace_id, order_index);
```

Default-Stages (idempotent via `INSERT OR IGNORE`):

| Name | Color |
|------|-------|
| Lead | `#6495ED` |
| Qualifiziert | `#FFA500` |
| Angebot | `#9370DB` |
| Verhandlung | `#FFD700` |

### `deals`

```sql
CREATE TABLE IF NOT EXISTS deals (
    id                   TEXT PRIMARY KEY,
    workspace_id         TEXT NOT NULL,
    customer_id          TEXT NOT NULL,
    stage_id             TEXT NOT NULL,
    title                TEXT NOT NULL,
    value                REAL NOT NULL DEFAULT 0,
    probability          INTEGER NOT NULL DEFAULT 0,
    expected_close_date  TEXT,
    notes                TEXT,
    status               TEXT NOT NULL DEFAULT 'open',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deals_workspace    ON deals(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_customer     ON deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage        ON deals(stage_id);
```

`status`: `'open' | 'won' | 'lost'`

### `activities`

```sql
CREATE TABLE IF NOT EXISTS activities (
    id               TEXT PRIMARY KEY,
    workspace_id     TEXT NOT NULL,
    customer_id      TEXT NOT NULL,
    type             TEXT NOT NULL,
    date             TEXT NOT NULL,
    duration_minutes INTEGER,
    notes            TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_customer
    ON activities(customer_id, date DESC);
```

`type`: `'call' | 'meeting' | 'email' | 'note'`

---

## Frontend

### Typen: `src/types/pipeline.types.ts`

```typescript
export interface PipelineStage {
  id: string
  workspaceId: string
  name: string
  color: string
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export type DealStatus = 'open' | 'won' | 'lost'

export interface Deal {
  id: string
  workspaceId: string
  customerId: string
  stageId: string
  title: string
  value: number
  probability: number
  expectedCloseDate?: string
  notes?: string
  status: DealStatus
  createdAt: string
  updatedAt: string
}

export type ActivityType = 'call' | 'meeting' | 'email' | 'note'

export interface Activity {
  id: string
  workspaceId: string
  customerId: string
  type: ActivityType
  date: string
  durationMinutes?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertPipelineStagePayload {
  id?: string
  workspaceId: string
  name: string
  color: string
  orderIndex?: number
}

export interface UpsertDealPayload {
  id?: string
  workspaceId: string
  customerId: string
  stageId: string
  title: string
  value: number
  probability: number
  expectedCloseDate?: string
  notes?: string
  status?: DealStatus
}

export interface UpsertActivityPayload {
  id?: string
  workspaceId: string
  customerId: string
  type: ActivityType
  date: string
  durationMinutes?: number
  notes?: string
}
```

### Services

**`src/services/pipeline.service.ts`**
```typescript
export const PipelineService = {
  getStages(workspaceId: string): Promise<PipelineStage[]>
  upsertStage(payload: UpsertPipelineStagePayload): Promise<PipelineStage>
  deleteStage(id: string): Promise<void>
  seedStages(workspaceId: string): Promise<void>  // idempotent
}
```

**`src/services/deals.service.ts`**
```typescript
export const DealsService = {
  getAll(workspaceId: string): Promise<Deal[]>
  getByCustomer(customerId: string): Promise<Deal[]>
  upsert(payload: UpsertDealPayload): Promise<Deal>
  delete(id: string): Promise<void>
}
```

**`src/services/activities.service.ts`**
```typescript
export const ActivitiesService = {
  getByCustomer(customerId: string): Promise<Activity[]>
  upsert(payload: UpsertActivityPayload): Promise<Activity>
  delete(id: string): Promise<void>
}
```

Alle Methoden rufen Tauri-Commands auf.

### Stores

**`src/store/pipeline.store.ts`**
```typescript
interface PipelineState {
  stages: PipelineStage[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsertStage: (payload: UpsertPipelineStagePayload) => Promise<void>
  removeStage: (id: string) => Promise<void>
}
```

**`src/store/deals.store.ts`**
```typescript
interface DealsState {
  deals: Deal[]                          // alle Deals des Workspace
  customerDeals: Deal[]                  // Deals des aktiven Kunden
  isLoading: boolean
  error: AppError | null
  loadAll: (workspaceId: string) => Promise<void>
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertDealPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  moveToStage: (dealId: string, stageId: string) => Promise<void>
}
```

`moveToStage` — optimistisches Update im Store (sofort sichtbar), dann `upsert` mit neuer `stageId`. Bei Fehler: Deal auf ursprüngliche `stageId` zurücksetzen.

**`src/store/activities.store.ts`**
```typescript
interface ActivitiesState {
  activities: Activity[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertActivityPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}
```

Nach jedem `upsert` in `ActivitiesStore`: `useCrmStore.getState().loadLastActivity(workspaceId)` aufrufen, damit Smart Lists "Inaktiv" aktuell bleibt.

### UI-Komponenten

#### Pipeline Board — `src/routes/PipelineRoute.tsx`

Neuer Nav-Eintrag zwischen "Clients" und "Finanzen", Kbd: `P`, Icon: `TrendingUp` (Lucide).

Layout: Vollbreite Kanban-Spalten, horizontal scrollbar wenn nötig.

**Header:**
- Titel "Pipeline."
- Gesamtwert aller offenen Deals (Mono-Font)
- "Stages"-Button → öffnet `StagesManager` inline (Overlay über dem Board, kein Modal)
- "+ Neuer Deal"-Button → öffnet `DealModal`

**`src/components/pipeline/PipelineBoard.tsx`**  
Rendert Spalten aus `usePipelineStore.stages` + eine fixe "Gewonnen"-Spalte (zeigt won-Deals) + "Verloren"-Spalte (zeigt lost-Deals). DndContext-Wrapper aus `@dnd-kit/core`.

**`src/components/pipeline/DealCard.tsx`**  
- Titel (font-weight 600)
- Kundenname (fg-muted, klickbar → öffnet Kundenprofil)
- Wert (Mono-Font, font-weight 700)
- Wahrscheinlichkeit (fg-dim, rechts)
- Optional: Expected Close Date (klein, unten, mit Kalender-Icon)
- Klick auf Karte → `DealModal` im Edit-Mode
- `data-dragging` Attribut für CSS-Styling während Drag

**`src/components/pipeline/DealModal.tsx`**  
Felder: Titel, Kunde (Dropdown aus customers), Stage (Dropdown), Wert, Wahrscheinlichkeit (0–100), Expected Close Date, Notizen, Status (open/won/lost).

**`src/components/pipeline/StagesManager.tsx`**  
Inline-Overlay, kein separater Modal. Liste der Stages mit:
- Farbpunkt (klickbar → Color-Picker mit 8 Preset-Farben)
- Name (inline editierbar)
- Drag-Handle zum Sortieren (ebenfalls `@dnd-kit/core`)
- Löschen-Button (nur wenn keine offenen Deals in dieser Stage)
- "+ Stage hinzufügen" unten

#### Sales-Tab — `src/components/customer/tabs/SalesPane.tsx`

Neuer Tab-Eintrag: `{ id: 'sales', label: 'Sales' }` in `TABS`-Array in `CustomerRoute.tsx`.

- Header: "Deals (N)" + "+ Neuer Deal"-Button
- Liste offener Deals: Titel, Stage-Badge (farbiger Dot + Name), Wert, Wahrscheinlichkeit
- Abgeschlossene Deals (won/lost) darunter, visuell getrennt, gedimmt
- Klick auf Deal → `DealModal` im Edit-Mode (gleiche Komponente wie im Board)

#### Activities-Tab — `src/components/customer/tabs/ActivitiesPane.tsx`

Neuer Tab-Eintrag: `{ id: 'activities', label: 'Activities' }` in `TABS`-Array.

- 4 Quick-Add-Buttons nebeneinander: Anruf (Phone-Icon), Meeting (Users-Icon), E-Mail (Mail-Icon), Notiz (FileText-Icon)
- Klick öffnet `ActivityModal` mit vorausgewähltem Typ
- Chronologische Liste (neueste oben): Icon-Box (30×30, border, SVG), Typ + Dauer, Datum (Mono), Notiz
- Hover: Löschen-Button (X, rechts)

**`src/components/pipeline/ActivityModal.tsx`**  
Felder: Typ (Segmented Control: 4 Optionen mit Icons), Datum (Date-Input), Dauer in Minuten (nur bei call/meeting), Notiz (Textarea).

---

## Backend (Rust)

### `src-tauri/src/db/pipeline.rs`

```rust
pub struct PipelineStage { id, workspace_id, name, color, order_index, created_at, updated_at }
pub struct UpsertPipelineStagePayload { id, workspace_id, name, color, order_index }

pub fn get_pipeline_stages(conn, workspace_id) -> Result<Vec<PipelineStage>>
pub fn upsert_pipeline_stage(conn, payload) -> Result<PipelineStage>
pub fn delete_pipeline_stage(conn, id) -> Result<()>  // AppError::Conflict wenn offene Deals in dieser Stage existieren
pub fn seed_pipeline_stages(conn, workspace_id) -> Result<()>  // INSERT OR IGNORE
```

### `src-tauri/src/db/deals.rs`

```rust
pub struct Deal { id, workspace_id, customer_id, stage_id, title, value, probability,
                  expected_close_date, notes, status, created_at, updated_at }
pub struct UpsertDealPayload { id, workspace_id, customer_id, stage_id, title, value,
                               probability, expected_close_date, notes, status }

pub fn get_deals(conn, workspace_id) -> Result<Vec<Deal>>
pub fn get_deals_by_customer(conn, customer_id) -> Result<Vec<Deal>>
pub fn upsert_deal(conn, payload) -> Result<Deal>
pub fn delete_deal(conn, id) -> Result<()>
```

### `src-tauri/src/db/activities.rs`

```rust
pub struct Activity { id, workspace_id, customer_id, type_, date, duration_minutes,
                      notes, created_at, updated_at }
pub struct UpsertActivityPayload { id, workspace_id, customer_id, type_, date,
                                   duration_minutes, notes }

pub fn get_activities_by_customer(conn, customer_id) -> Result<Vec<Activity>>
pub fn upsert_activity(conn, payload) -> Result<Activity>
pub fn delete_activity(conn, id) -> Result<()>
```

`type` ist ein Rust-Keyword → Feldname `type_`, serialisiert als `"type"` via `#[serde(rename = "type")]`.

### `src-tauri/src/commands/pipeline.rs`

```rust
#[tauri::command] pub fn get_pipeline_stages(db, workspace_id) -> Result<Vec<PipelineStage>>
#[tauri::command] pub fn upsert_pipeline_stage(db, payload) -> Result<PipelineStage>
#[tauri::command] pub fn delete_pipeline_stage(db, id) -> Result<()>
#[tauri::command] pub fn seed_pipeline_stages(db, workspace_id) -> Result<()>
```

### `src-tauri/src/commands/deals.rs`

```rust
#[tauri::command] pub fn get_deals(db, workspace_id) -> Result<Vec<Deal>>
#[tauri::command] pub fn get_deals_by_customer(db, customer_id) -> Result<Vec<Deal>>
#[tauri::command] pub fn upsert_deal(db, payload) -> Result<Deal>
#[tauri::command] pub fn delete_deal(db, id) -> Result<()>
```

### `src-tauri/src/commands/activities.rs`

```rust
#[tauri::command] pub fn get_activities_by_customer(db, customer_id) -> Result<Vec<Activity>>
#[tauri::command] pub fn upsert_activity(db, payload) -> Result<Activity>
#[tauri::command] pub fn delete_activity(db, id) -> Result<()>
```

### Schema-Migration

Migration **v10** in `src-tauri/src/db/migrations.rs` — alle 3 Tabellen via `CREATE TABLE IF NOT EXISTS`.

### Registrierung in `main.rs`

11 neue Commands in `generate_handler![]` eintragen.

---

## Datenfluss

```
App.tsx (workspace geladen)
  → PipelineService.seedStages(workspaceId)   // idempotent
  → usePipelineStore.load(workspaceId)
  → useDealsStore.loadAll(workspaceId)

PipelineRoute
  → Board rendert Spalten aus usePipelineStore.stages
  → Deal-Karten aus useDealsStore.deals (gefiltert nach stage_id)
  → Drag-End → useDealsStore.moveToStage(dealId, newStageId)

CustomerRoute (Sales-Tab aktiv)
  → useDealsStore.loadForCustomer(customerId)
  → SalesPane zeigt customerDeals

CustomerRoute (Activities-Tab aktiv)
  → useActivitiesStore.loadForCustomer(customerId)
  → Nach upsert: useCrmStore.loadLastActivity(workspaceId)
```

---

## Navigation

`NavSidebar.tsx` — neuer Eintrag zwischen Clients und Finanzen:

```tsx
<SidebarNavItem icon={TrendingUp} label="Pipeline" active={appView === 'pipeline'} onClick={() => setAppView('pipeline')} kbd="P" />
```

`ui.store.ts` — `AppView` um `'pipeline'` erweitern.

`App.tsx` — `case 'pipeline': return <PipelineRoute />`

---

## CustomerRoute — Tab-Erweiterung

`ui.store.ts` — `CustomerTab` um `'sales'` und `'activities'` erweitern.

`CustomerRoute.tsx` — zwei neue Einträge in `TABS`:
```tsx
{ id: 'sales',      label: 'Sales' },
{ id: 'activities', label: 'Activities' },
```

SVG-Pfade für die neuen Tab-Icons in `TabIcon`.

---

## Tests

- `deals.store.ts` — `moveToStage` optimistisches Update, dann Revert bei Fehler
- `pipeline.rs` — `delete_pipeline_stage` schlägt fehl wenn offene Deals existieren
- `activities.rs` — upsert gibt korrektes Activity-Objekt zurück
- `seed_pipeline_stages` — idempotent (2× aufrufen = gleiche 4 Stages)
- `PipelineBoard` — rendert korrekte Anzahl Spalten aus Store
