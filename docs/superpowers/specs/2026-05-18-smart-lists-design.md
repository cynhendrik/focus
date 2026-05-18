# Smart Lists — Design Spec

**Datum:** 2026-05-18  
**Status:** Approved

---

## Ziel

Gespeicherte Filter-Kombinationen auf der Kundenliste. Der Nutzer kann vordefinierte Listen (Hot Leads, Inaktiv, etc.) sofort nutzen und eigene Segmente nach beliebigen Kriterien anlegen, bearbeiten und löschen.

## Architektur

Die Filterlogik läuft vollständig im Frontend auf dem bereits geladenen `customers`-Array. Nur die List-Definitionen (Name, Icon, Filter-JSON) werden in SQLite persistiert. Für das Kriterium "Letzter Kontakt" wird die vorhandene `lastActivity`-Map aus `useCrmStore` genutzt.

**Tech Stack:** Rust/SQLite (Datenhaltung), Tauri commands, Zustand store, React

---

## Datenmodell

### Neue SQLite-Tabelle: `smart_lists`

```sql
CREATE TABLE IF NOT EXISTS smart_lists (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    icon         TEXT NOT NULL DEFAULT '📋',
    filter       TEXT NOT NULL DEFAULT '{}',
    order_index  INTEGER NOT NULL DEFAULT 0,
    is_system    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_smart_lists_workspace
    ON smart_lists(workspace_id, order_index);
```

### Filter-JSON Schema (`SmartListFilter`)

```typescript
interface SmartListFilter {
  status?:       CustomerStatus[]   // 'lead' | 'aktiv' | 'inaktiv' | 'lost'
  priority?:     Priority[]         // 'low' | 'normal' | 'high'
  scoreMin?:     number             // leadScore >= scoreMin
  scoreMax?:     number             // leadScore <= scoreMax
  tags?:         string[]           // Kunde hat ALLE dieser Tags
  industry?:     string[]           // Branche ist einer dieser Werte
  inactiveDays?: number             // kein Kontakt seit >= N Tagen
}
```

Ein leeres Filter-Objekt `{}` zeigt alle Kunden (kein Filter aktiv).

### System-Listen (beim ersten Workspace-Load angelegt, `is_system = 1`)

| Name | Icon | Filter |
|------|------|--------|
| Hot Leads | 🔥 | `{ status: ['lead'], scoreMin: 50 }` |
| Brauchen Aufmerksamkeit | ⚠️ | `{ priority: ['high'] }` |
| Inaktiv | 💤 | `{ status: ['inaktiv'] }` |
| Lost | ☠️ | `{ status: ['lost'] }` |

System-Listen können umbenannt, aber nicht gelöscht werden.

---

## Frontend

### Neue Typen: `src/types/smart-list.types.ts`

```typescript
export interface SmartList {
  id: string
  workspaceId: string
  name: string
  icon: string
  filter: SmartListFilter
  orderIndex: number
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export interface SmartListFilter {
  status?: CustomerStatus[]
  priority?: Priority[]
  scoreMin?: number
  scoreMax?: number
  tags?: string[]
  industry?: string[]
  inactiveDays?: number
}

export interface UpsertSmartListPayload {
  id?: string
  workspaceId: string
  name: string
  icon: string
  filter: SmartListFilter
  orderIndex?: number
  isSystem?: boolean
}
```

### Service: `src/services/smart-list.service.ts`

```typescript
export const SmartListService = {
  getAll(workspaceId: string): Promise<SmartList[]>
  upsert(payload: UpsertSmartListPayload): Promise<SmartList>
  delete(id: string): Promise<void>
  seedSystemLists(workspaceId: string): Promise<void>  // idempotent
}
```

Alle Methoden rufen Tauri-Commands auf:  
`get_smart_lists`, `upsert_smart_list`, `delete_smart_list`, `seed_system_smart_lists`

### Store: `src/store/smart-lists.store.ts`

```typescript
interface SmartListsState {
  lists: SmartList[]
  activeListId: string | null  // null = alle Kunden (Overview)
  isLoading: boolean
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertSmartListPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
}
```

### Filter-Funktion: `src/lib/smart-list-filter.ts`

```typescript
export function applySmartListFilter(
  customers: Customer[],
  filter: SmartListFilter,
  lastActivity: Map<string, string | null>
): Customer[]
```

Pure Funktion, vollständig unit-testbar. Verknüpft alle aktiven Kriterien mit AND-Logik.

### UI-Komponenten

**`src/components/smart-lists/SmartListsSection.tsx`**  
Collapsible Sidebar-Block, Header "Smart Lists" mit `+`-Button und Toggle-Pfeil.  
Zeigt `SmartListItem` pro Liste + Trennlinie + "+ Neue Liste"-Button.

**`src/components/smart-lists/SmartListItem.tsx`**  
Einzelner Listeneintrag: Icon, Name, Badge (Anzahl Treffer), Hover-Actions (Edit-Stift, Löschen-X — bei System-Listen nur Edit).  
Verwendet `data-active={String(activeListId === list.id)}` für grüne Hervorhebung.

**`src/components/smart-lists/SmartListModal.tsx`**  
Modal für Create und Edit. Felder:
- Name (Text-Input)
- Icon (Emoji-Picker, 8 Optionen)
- Filter-Builder: Checkboxgruppen für Status, Priorität, Tags; Slider/Input für Score-Range; Dropdown für Industry; Input für Inaktivitäts-Tage

**Integration in `ClientsRoute.tsx`:**
- `SmartListsSection` zwischen "Overview Dashboard" tile und `clients-list`
- `filtered`-Array wird durch `applySmartListFilter` gefiltert wenn `activeListId !== null`
- Beim Klick auf Overview Dashboard: `setActive(null)` → alle Kunden sichtbar

---

## Backend (Rust)

### `src-tauri/src/db/smart_list.rs`

```rust
pub struct SmartList { id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at }
pub struct UpsertSmartListPayload { id, workspace_id, name, icon, filter, order_index, is_system }

pub fn get_smart_lists(conn, workspace_id) -> Result<Vec<SmartList>>
pub fn upsert_smart_list(conn, payload) -> Result<SmartList>
pub fn delete_smart_list(conn, id) -> Result<()>
pub fn seed_system_lists(conn, workspace_id) -> Result<()>  // INSERT OR IGNORE
```

### `src-tauri/src/commands/smart_list.rs`

```rust
#[tauri::command] pub fn get_smart_lists(db, workspace_id) -> Result<Vec<SmartList>>
#[tauri::command] pub fn upsert_smart_list(db, payload) -> Result<SmartList>
#[tauri::command] pub fn delete_smart_list(db, id) -> Result<()>
#[tauri::command] pub fn seed_system_smart_lists(db, workspace_id) -> Result<()>
```

### Schema-Migration

`smart_lists`-Tabelle wird in `db/schema.rs` hinzugefügt (bestehende DBs: Schema läuft durch `CREATE TABLE IF NOT EXISTS`, kein separater Migrations-Runner nötig).

### Registrierung in `main.rs`

Alle 4 Commands in `generate_handler![]` eintragen.

---

## Datenfluss

```
App.tsx (workspace geladen)
  → SmartListService.seedSystemLists(workspaceId)   // einmalig, idempotent
  → useSmartListsStore.load(workspaceId)

ClientsRoute
  → SmartListsSection (liest useSmartListsStore)
  → Klick auf Liste → setActive(id)
  → filtered = applySmartListFilter(customers, list.filter, lastActivity)
  → customer tiles zeigen gefilterte Liste
```

---

## Tests

- `applySmartListFilter` — Unit-Tests für alle 6 Kriterien einzeln + kombiniert
- `SmartListsSection` — rendert korrekte Anzahl Items, aktive Liste hervorgehoben
- `SmartListModal` — öffnet/schließt, Submit ruft upsert auf
- Rust: `seed_system_lists` ist idempotent (2x aufrufen = gleiche 4 Listen)
