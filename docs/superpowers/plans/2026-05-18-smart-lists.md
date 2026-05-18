# Smart Lists — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gespeicherte Kundensegment-Filter (Smart Lists) in der Clients-Sidebar — vordefinierte System-Listen + eigene anlegen, bearbeiten, löschen.

**Architecture:** Filter-Logik läuft vollständig im Frontend auf dem bereits geladenen `customers`-Array. List-Definitionen (Name, Icon, Filter-JSON) werden in SQLite persistiert. Für "kein Kontakt seit N Tagen" wird die `lastActivity`-Map aus `useCrmStore` genutzt.

**Tech Stack:** Rust/SQLite (rusqlite, uuid, chrono), Tauri commands, Zustand, React 18, TypeScript, Vitest

---

## File Map

**Neu erstellen:**
- `src/types/smart-list.types.ts` — SmartList, SmartListFilter, UpsertSmartListPayload
- `src/lib/smart-list-filter.ts` — pure applySmartListFilter Funktion
- `src/lib/smart-list-filter.test.ts` — Vitest Unit-Tests
- `src/services/smart-list.service.ts` — Tauri invoke Wrapper
- `src/store/smart-lists.store.ts` — Zustand Store
- `src/components/smart-lists/SmartListsSection.tsx` — Sidebar-Block
- `src/components/smart-lists/SmartListItem.tsx` — Einzelner Listeneintrag
- `src/components/smart-lists/SmartListModal.tsx` — Create/Edit Modal
- `src-tauri/src/db/smart_list.rs` — SQLite DB-Layer
- `src-tauri/src/commands/smart_list.rs` — Tauri Commands

**Modifizieren:**
- `src-tauri/src/db/schema.rs` — smart_lists Tabelle hinzufügen
- `src-tauri/src/db/mod.rs` — `pub mod smart_list;`
- `src-tauri/src/commands/mod.rs` — `pub mod smart_list;`
- `src-tauri/src/main.rs` — 4 Commands in generate_handler![] registrieren
- `src/App.tsx` — seedSystemLists + load beim Workspace-Init aufrufen
- `src/routes/ClientsRoute.tsx` — SmartListsSection einbinden + Filter anwenden

---

## Task 1: Typen + Filter-Funktion (TDD)

**Files:**
- Create: `src/types/smart-list.types.ts`
- Create: `src/lib/smart-list-filter.ts`
- Create: `src/lib/smart-list-filter.test.ts`

- [ ] **Step 1: Typen anlegen**

Erstelle `src/types/smart-list.types.ts`:

```typescript
import type { CustomerStatus, Priority } from './customer.types'

export interface SmartListFilter {
  status?:       CustomerStatus[]
  priority?:     Priority[]
  scoreMin?:     number
  scoreMax?:     number
  tags?:         string[]
  industry?:     string[]
  inactiveDays?: number
}

export interface SmartList {
  id:          string
  workspaceId: string
  name:        string
  icon:        string
  filter:      SmartListFilter
  orderIndex:  number
  isSystem:    boolean
  createdAt:   string
  updatedAt:   string
}

export interface UpsertSmartListPayload {
  id?:          string
  workspaceId:  string
  name:         string
  icon:         string
  filter:       SmartListFilter
  orderIndex?:  number
  isSystem?:    boolean
}
```

- [ ] **Step 2: Failing Tests schreiben**

Erstelle `src/lib/smart-list-filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applySmartListFilter } from './smart-list-filter'
import type { Customer } from '@/types/customer.types'

const base: Customer = {
  id: '1', name: 'Test', status: 'aktiv', priority: 'normal',
  tags: [], leadScore: 50, goals: [], isPrivate: false,
  workspaceId: 'ws1', socialLinks: '{}',
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
}

describe('applySmartListFilter', () => {
  it('returns all customers for empty filter', () => {
    expect(applySmartListFilter([base], {}, new Map())).toHaveLength(1)
  })

  it('filters by status', () => {
    const lead: Customer = { ...base, id: '2', status: 'lead' }
    const result = applySmartListFilter([base, lead], { status: ['lead'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by priority', () => {
    const high: Customer = { ...base, id: '2', priority: 'high' }
    const result = applySmartListFilter([base, high], { priority: ['high'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by scoreMin', () => {
    const low: Customer = { ...base, id: '2', leadScore: 30 }
    const result = applySmartListFilter([base, low], { scoreMin: 50 }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filters by scoreMax', () => {
    const high: Customer = { ...base, id: '2', leadScore: 90 }
    const result = applySmartListFilter([base, high], { scoreMax: 60 }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filters by tags — all listed tags must match', () => {
    const tagged: Customer = { ...base, id: '2', tags: ['webinar', 'newsletter'] }
    const result = applySmartListFilter([base, tagged], { tags: ['webinar'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by industry', () => {
    const tech: Customer = { ...base, id: '2', industry: 'SaaS' }
    const result = applySmartListFilter([base, tech], { industry: ['SaaS'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('treats no activity as inactive (inactiveDays)', () => {
    const noActivity = new Map<string, string | null>([['1', null]])
    const result = applySmartListFilter([base], { inactiveDays: 14 }, noActivity)
    expect(result).toHaveLength(1)
  })

  it('excludes customer with recent activity from inactiveDays filter', () => {
    const recent = new Map<string, string | null>([['1', new Date().toISOString()]])
    const result = applySmartListFilter([base], { inactiveDays: 14 }, recent)
    expect(result).toHaveLength(0)
  })

  it('combines multiple criteria with AND logic', () => {
    const match: Customer  = { ...base, id: '2', status: 'lead', leadScore: 80 }
    const noMatch: Customer = { ...base, id: '3', status: 'lead', leadScore: 30 }
    const result = applySmartListFilter([base, match, noMatch], { status: ['lead'], scoreMin: 50 }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })
})
```

- [ ] **Step 3: Tests ausführen — müssen FAIL**

```powershell
npm run test:run -- src/lib/smart-list-filter.test.ts
```

Erwartung: FAIL mit "Cannot find module './smart-list-filter'"

- [ ] **Step 4: Filter-Funktion implementieren**

Erstelle `src/lib/smart-list-filter.ts`:

```typescript
import type { Customer } from '@/types/customer.types'
import type { SmartListFilter } from '@/types/smart-list.types'

export function applySmartListFilter(
  customers: Customer[],
  filter: SmartListFilter,
  lastActivity: Map<string, string | null>,
): Customer[] {
  return customers.filter(c => {
    if (filter.status?.length && !filter.status.includes(c.status)) return false
    if (filter.priority?.length && !filter.priority.includes(c.priority)) return false
    if (filter.scoreMin != null && c.leadScore < filter.scoreMin) return false
    if (filter.scoreMax != null && c.leadScore > filter.scoreMax) return false
    if (filter.tags?.length && !filter.tags.every(t => c.tags.includes(t))) return false
    if (filter.industry?.length && (!c.industry || !filter.industry.includes(c.industry))) return false
    if (filter.inactiveDays != null) {
      const last = lastActivity.get(c.id) ?? null
      const days = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
        : 9999
      if (days < filter.inactiveDays) return false
    }
    return true
  })
}
```

- [ ] **Step 5: Tests ausführen — müssen PASS**

```powershell
npm run test:run -- src/lib/smart-list-filter.test.ts
```

Erwartung: 10 tests passed

- [ ] **Step 6: Commit**

```powershell
git add src/types/smart-list.types.ts src/lib/smart-list-filter.ts src/lib/smart-list-filter.test.ts
git commit -m "feat(smart-lists): SmartListFilter Typen + applySmartListFilter (TDD)"
```

---

## Task 2: Rust Backend

**Files:**
- Create: `src-tauri/src/db/smart_list.rs`
- Create: `src-tauri/src/commands/smart_list.rs`
- Modify: `src-tauri/src/db/schema.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: smart_lists Tabelle in schema.rs einfügen**

In `src-tauri/src/db/schema.rs`, suche die Stelle direkt vor dem schließenden `"#)?;` (nach dem `app_state`-Block) und füge ein:

```rust
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

- [ ] **Step 2: DB-Layer erstellen**

Erstelle `src-tauri/src/db/smart_list.rs`:

```rust
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SmartList {
    pub id:          String,
    pub workspace_id: String,
    pub name:        String,
    pub icon:        String,
    pub filter:      String,
    pub order_index: i64,
    pub is_system:   bool,
    pub created_at:  String,
    pub updated_at:  String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSmartListPayload {
    pub id:          Option<String>,
    pub workspace_id: String,
    pub name:        String,
    pub icon:        String,
    pub filter:      String,
    pub order_index: Option<i64>,
    pub is_system:   Option<bool>,
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<SmartList> {
    Ok(SmartList {
        id:          row.get(0)?,
        workspace_id: row.get(1)?,
        name:        row.get(2)?,
        icon:        row.get(3)?,
        filter:      row.get(4)?,
        order_index: row.get(5)?,
        is_system:   row.get::<_, i64>(6)? != 0,
        created_at:  row.get(7)?,
        updated_at:  row.get(8)?,
    })
}

pub fn get_smart_lists(conn: &Connection, workspace_id: &str) -> Result<Vec<SmartList>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at
         FROM smart_lists WHERE workspace_id = ?1 ORDER BY order_index ASC"
    )?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert_smart_list(conn: &Connection, payload: &UpsertSmartListPayload) -> Result<SmartList, AppError> {
    let now = Utc::now().to_rfc3339();
    let id = payload.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let order_index = payload.order_index.unwrap_or(0);
    let is_system = payload.is_system.unwrap_or(false) as i64;
    conn.execute(
        "INSERT INTO smart_lists (id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, icon = excluded.icon,
           filter = excluded.filter, order_index = excluded.order_index,
           updated_at = excluded.updated_at",
        params![id, payload.workspace_id, payload.name, payload.icon,
                payload.filter, order_index, is_system, now, now],
    )?;
    let list = conn.query_row(
        "SELECT id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at
         FROM smart_lists WHERE id = ?1",
        [&id], map_row,
    )?;
    Ok(list)
}

pub fn delete_smart_list(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM smart_lists WHERE id = ?1 AND is_system = 0", [id])?;
    Ok(())
}

pub fn seed_system_lists(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let lists: &[(&str, &str, &str, &str, i64)] = &[
        ("hot-leads",  "🔥", "Hot Leads",               r#"{"status":["lead"],"scoreMin":50}"#,  0),
        ("needs-attn", "⚠️", "Brauchen Aufmerksamkeit", r#"{"priority":["high"]}"#,              1),
        ("inaktiv",    "💤", "Inaktiv",                  r#"{"status":["inaktiv"]}"#,             2),
        ("lost",       "☠️", "Lost",                     r#"{"status":["lost"]}"#,               3),
    ];
    for (suffix, icon, name, filter, order_index) in lists {
        let id = format!("{}-{}", workspace_id, suffix);
        conn.execute(
            "INSERT OR IGNORE INTO smart_lists
             (id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)",
            params![id, workspace_id, name, icon, filter, order_index, now, now],
        )?;
    }
    Ok(())
}
```

- [ ] **Step 3: Tauri Commands erstellen**

Erstelle `src-tauri/src/commands/smart_list.rs`:

```rust
use tauri::State;
use crate::db::pool::DbPool;
use crate::db::smart_list::{SmartList, UpsertSmartListPayload};
use crate::AppError;

#[tauri::command]
pub fn get_smart_lists(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<SmartList>, AppError> {
    crate::db::smart_list::get_smart_lists(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn upsert_smart_list(
    db: State<'_, DbPool>,
    payload: UpsertSmartListPayload,
) -> Result<SmartList, AppError> {
    crate::db::smart_list::upsert_smart_list(&db.conn(), &payload)
}

#[tauri::command]
pub fn delete_smart_list(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    crate::db::smart_list::delete_smart_list(&db.conn(), &id)
}

#[tauri::command]
pub fn seed_system_smart_lists(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<(), AppError> {
    crate::db::smart_list::seed_system_lists(&db.conn(), &workspace_id)
}
```

- [ ] **Step 4: Module registrieren**

In `src-tauri/src/db/mod.rs` am Ende anfügen:
```rust
pub mod smart_list;
```

In `src-tauri/src/commands/mod.rs` am Ende anfügen:
```rust
pub mod smart_list;
```

- [ ] **Step 5: Commands in main.rs registrieren**

In `src-tauri/src/main.rs` in `generate_handler![...]` nach dem letzten vorhandenen Eintrag (vor `]`) einfügen:

```rust
commands::smart_list::get_smart_lists,
commands::smart_list::upsert_smart_list,
commands::smart_list::delete_smart_list,
commands::smart_list::seed_system_smart_lists,
```

- [ ] **Step 6: Cargo check**

```powershell
cd src-tauri && cargo check 2>&1
```

Erwartung: keine Errors (Warnings OK)

- [ ] **Step 7: Commit**

```powershell
cd ..
git add src-tauri/src/db/smart_list.rs src-tauri/src/commands/smart_list.rs `
        src-tauri/src/db/schema.rs src-tauri/src/db/mod.rs `
        src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(smart-lists): Rust Backend — smart_lists DB + Commands"
```

---

## Task 3: TypeScript Service + Store

**Files:**
- Create: `src/services/smart-list.service.ts`
- Create: `src/store/smart-lists.store.ts`

- [ ] **Step 1: Service erstellen**

Erstelle `src/services/smart-list.service.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { SmartList, SmartListFilter, UpsertSmartListPayload } from '@/types/smart-list.types'

interface RawSmartList extends Omit<SmartList, 'filter'> {
  filter: string
}

function parse(raw: RawSmartList): SmartList {
  let filter: SmartListFilter = {}
  try { filter = JSON.parse(raw.filter) } catch {}
  return { ...raw, filter }
}

export const SmartListService = {
  async getAll(workspaceId: string): Promise<SmartList[]> {
    const raws = await invoke<RawSmartList[]>('get_smart_lists', { workspaceId })
    return raws.map(parse)
  },

  async upsert(payload: UpsertSmartListPayload): Promise<SmartList> {
    const raw = await invoke<RawSmartList>('upsert_smart_list', {
      payload: { ...payload, filter: JSON.stringify(payload.filter) },
    })
    return parse(raw)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_smart_list', { id })
  },

  seedSystemLists(workspaceId: string): Promise<void> {
    return invoke<void>('seed_system_smart_lists', { workspaceId })
  },
}
```

- [ ] **Step 2: Store erstellen**

Erstelle `src/store/smart-lists.store.ts`:

```typescript
import { create } from 'zustand'
import { SmartListService } from '@/services/smart-list.service'
import type { SmartList, UpsertSmartListPayload } from '@/types/smart-list.types'

interface SmartListsState {
  lists:        SmartList[]
  activeListId: string | null
  isLoading:    boolean
  load:   (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertSmartListPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
}

export const useSmartListsStore = create<SmartListsState>()((set) => ({
  lists:        [],
  activeListId: null,
  isLoading:    false,

  load: async (workspaceId) => {
    set({ isLoading: true })
    try {
      const lists = await SmartListService.getAll(workspaceId)
      set({ lists, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const list = await SmartListService.upsert(payload)
    set(s => {
      const idx = s.lists.findIndex(l => l.id === list.id)
      return {
        lists: idx >= 0
          ? s.lists.map(l => l.id === list.id ? list : l)
          : [...s.lists, list],
      }
    })
  },

  remove: async (id) => {
    await SmartListService.delete(id)
    set(s => ({ lists: s.lists.filter(l => l.id !== id) }))
  },

  setActive: (id) => set({ activeListId: id }),
}))
```

- [ ] **Step 3: Typecheck**

```powershell
npm run typecheck 2>&1
```

Erwartung: keine Errors

- [ ] **Step 4: Commit**

```powershell
git add src/services/smart-list.service.ts src/store/smart-lists.store.ts
git commit -m "feat(smart-lists): SmartListService + useSmartListsStore"
```

---

## Task 4: UI-Komponenten

**Files:**
- Create: `src/components/smart-lists/SmartListItem.tsx`
- Create: `src/components/smart-lists/SmartListsSection.tsx`
- Create: `src/components/smart-lists/SmartListModal.tsx`

- [ ] **Step 1: SmartListItem erstellen**

Erstelle `src/components/smart-lists/SmartListItem.tsx`:

```tsx
import { useMemo } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { applySmartListFilter } from '@/lib/smart-list-filter'
import type { SmartList } from '@/types/smart-list.types'

export function SmartListItem({ list, active, onClick, onEdit, onDelete }: {
  list:     SmartList
  active:   boolean
  onClick:  () => void
  onEdit:   () => void
  onDelete?: () => void
}) {
  const customers    = useCustomersStore(s => s.customers)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const activityMap  = useMemo(
    () => new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt])),
    [lastActivity],
  )
  const count = useMemo(
    () => applySmartListFilter(customers, list.filter, activityMap).length,
    [customers, list.filter, activityMap],
  )

  return (
    <div
      className="nav-item smart-list-item"
      data-active={String(active)}
      onClick={onClick}
      style={{ paddingLeft: 16, gap: 7 }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{list.icon}</span>
      <span style={{ flex: 1, fontSize: 12.5 }}>{list.name}</span>
      <span style={{
        fontSize: 10.5, fontWeight: 600, minWidth: 16, textAlign: 'right',
        color: active ? 'var(--accent-ink)' : 'var(--fg-dim)',
      }}>{count}</span>
      <div className="smart-list-actions" onClick={e => e.stopPropagation()}>
        <button
          onClick={onEdit}
          title="Bearbeiten"
          style={{ fontSize: 11, color: 'var(--fg-muted)', background: 'none', padding: '0 3px' }}
        >✎</button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Löschen"
            style={{ fontSize: 11, color: 'var(--fg-muted)', background: 'none', padding: '0 3px' }}
          >✕</button>
        )}
      </div>
    </div>
  )
}
```

Füge folgende CSS-Regeln in `src/styles/globals.css` ein (nach den bestehenden `.nav-item` Regeln):

```css
.smart-list-item .smart-list-actions { display: flex; gap: 0; opacity: 0; transition: opacity 150ms; }
.smart-list-item:hover .smart-list-actions { opacity: 1; }
.smart-list-item[data-active="true"] .smart-list-actions { opacity: 1; }
```

- [ ] **Step 2: SmartListsSection erstellen**

Erstelle `src/components/smart-lists/SmartListsSection.tsx`:

```tsx
import { useState } from 'react'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { SmartListItem } from './SmartListItem'
import { SmartListModal } from './SmartListModal'
import type { SmartList } from '@/types/smart-list.types'

export function SmartListsSection() {
  const lists        = useSmartListsStore(s => s.lists)
  const activeListId = useSmartListsStore(s => s.activeListId)
  const setActive    = useSmartListsStore(s => s.setActive)
  const remove       = useSmartListsStore(s => s.remove)
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing]     = useState<SmartList | 'new' | null>(null)

  if (lists.length === 0) return null

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 12px 3px', cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: 'var(--fg-dim)', textTransform: 'uppercase',
        }}>Smart Lists</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={e => { e.stopPropagation(); setEditing('new') }}
            title="Neue Liste"
            style={{ fontSize: 15, lineHeight: 1, color: 'var(--fg-muted)', background: 'none', padding: 0 }}
          >+</button>
          <span style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginBottom: 6 }}>
          {lists.map(list => (
            <SmartListItem
              key={list.id}
              list={list}
              active={activeListId === list.id}
              onClick={() => setActive(list.id)}
              onEdit={() => setEditing(list)}
              onDelete={list.isSystem ? undefined : () => remove(list.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SmartListModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: SmartListModal erstellen**

Erstelle `src/components/smart-lists/SmartListModal.tsx`:

```tsx
import { useState } from 'react'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { useWorkspaceStore }  from '@/store/workspace.store'
import type { SmartList, SmartListFilter } from '@/types/smart-list.types'
import type { CustomerStatus, Priority } from '@/types/customer.types'

const ICONS   = ['📋', '🔥', '⚠️', '💤', '☠️', '⭐', '🎯', '📈']

const STATUS_OPTS: { value: CustomerStatus; label: string }[] = [
  { value: 'lead',    label: 'Lead'    },
  { value: 'aktiv',  label: 'Aktiv'   },
  { value: 'inaktiv',label: 'Inaktiv' },
  { value: 'lost',   label: 'Lost'    },
]

const PRIO_OPTS: { value: Priority; label: string }[] = [
  { value: 'low',    label: 'Low'    },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'High'   },
]

function toggle<T>(arr: T[] | undefined, val: T): T[] | undefined {
  const cur = arr ?? []
  const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val]
  return next.length ? next : undefined
}

export function SmartListModal({ initial, onClose }: {
  initial: SmartList | null
  onClose: () => void
}) {
  const upsert      = useSmartListsStore(s => s.upsert)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [name,   setName]   = useState(initial?.name ?? '')
  const [icon,   setIcon]   = useState(initial?.icon ?? '📋')
  const [filter, setFilter] = useState<SmartListFilter>(initial?.filter ?? {})
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    await upsert({
      id:         initial?.id,
      workspaceId,
      name:       name.trim(),
      icon,
      filter,
      orderIndex: initial?.orderIndex,
      isSystem:   initial?.isSystem,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: 400, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {initial ? 'Liste bearbeiten' : 'Neue Smart List'}
        </h3>

        {/* Name */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Heiße Leads"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        {/* Icon */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Icon</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ICONS.map(ic => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                style={{
                  width: 34, height: 34, borderRadius: 8, fontSize: 16,
                  border: `1.5px solid ${icon === ic ? 'var(--accent)' : 'var(--border)'}`,
                  background: icon === ic ? 'var(--accent-soft)' : 'transparent',
                  cursor: 'pointer',
                }}
              >{ic}</button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Status</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {STATUS_OPTS.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filter.status?.includes(opt.value) ?? false}
                  onChange={() => setFilter(f => ({ ...f, status: toggle(f.status, opt.value) }))}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Priorität */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Priorität</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {PRIO_OPTS.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filter.priority?.includes(opt.value) ?? false}
                  onChange={() => setFilter(f => ({ ...f, priority: toggle(f.priority, opt.value) }))}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Lead Score */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Lead Score</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span>Min</span>
            <input
              type="number" min={0} max={100}
              value={filter.scoreMin ?? ''}
              onChange={e => setFilter(f => ({ ...f, scoreMin: e.target.value ? Number(e.target.value) : undefined }))}
              style={{ width: 64, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 12 }}
            />
            <span>Max</span>
            <input
              type="number" min={0} max={100}
              value={filter.scoreMax ?? ''}
              onChange={e => setFilter(f => ({ ...f, scoreMax: e.target.value ? Number(e.target.value) : undefined }))}
              style={{ width: 64, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 12 }}
            />
          </div>
        </div>

        {/* Kein Kontakt seit */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>
            Kein Kontakt seit (Tage)
          </label>
          <input
            type="number" min={1}
            value={filter.inactiveDays ?? ''}
            onChange={e => setFilter(f => ({ ...f, inactiveDays: e.target.value ? Number(e.target.value) : undefined }))}
            placeholder="z.B. 14"
            style={{ width: 88, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 12 }}
          />
        </div>

        {/* Aktionen */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 13 }}>Abbrechen</button>
          <button
            onClick={handleSave}
            className="btn-primary"
            disabled={saving || !name.trim()}
            style={{ fontSize: 13 }}
          >{saving ? 'Speichert…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```powershell
npm run typecheck 2>&1
```

Erwartung: keine Errors

- [ ] **Step 5: Commit**

```powershell
git add src/components/smart-lists/ src/styles/globals.css
git commit -m "feat(smart-lists): SmartListItem + SmartListsSection + SmartListModal"
```

---

## Task 5: Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/routes/ClientsRoute.tsx`

- [ ] **Step 1: App.tsx — seed + load beim Workspace-Init**

In `src/App.tsx`:

1. Imports hinzufügen (nach den bestehenden Store-Imports):
```typescript
import { useSmartListsStore } from '@/store/smart-lists.store'
import { SmartListService }   from '@/services/smart-list.service'
```

2. Im Komponenten-Body hinzufügen (nach `const initCustomers`-Zeile):
```typescript
const loadSmartLists = useSmartListsStore(s => s.load)
```

3. Den bestehenden `useEffect` für `activeWorkspaceId` ersetzen:
```typescript
useEffect(() => {
  if (activeWorkspaceId) {
    init()
    initCustomers()
    SmartListService.seedSystemLists(activeWorkspaceId).then(() =>
      loadSmartLists(activeWorkspaceId)
    )
  }
}, [activeWorkspaceId, init, initCustomers, loadSmartLists])
```

- [ ] **Step 2: ClientsRoute.tsx — SmartListsSection + Filter einbinden**

In `src/routes/ClientsRoute.tsx`:

1. Imports hinzufügen:
```typescript
import { useMemo } from 'react'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { useCrmStore }         from '@/store/crm.store'
import { applySmartListFilter } from '@/lib/smart-list-filter'
import { SmartListsSection }    from '@/components/smart-lists/SmartListsSection'
```

2. Im `ClientsRoute`-Komponenten-Body nach den bestehenden Store-Hooks hinzufügen:
```typescript
const activeListId = useSmartListsStore(s => s.activeListId)
const smartLists   = useSmartListsStore(s => s.lists)
const setActive    = useSmartListsStore(s => s.setActive)
const lastActivity = useCrmStore(s => s.lastActivity)
const activityMap  = useMemo(
  () => new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt])),
  [lastActivity],
)
const activeList = useMemo(
  () => activeListId ? smartLists.find(l => l.id === activeListId) ?? null : null,
  [activeListId, smartLists],
)
```

3. Die bestehende `filtered`-Berechnung ersetzen:
```typescript
const filtered = useMemo(() => {
  let result = activeList
    ? applySmartListFilter(customers, activeList.filter, activityMap)
    : customers
  if (search) {
    const q = search.toLowerCase()
    result = result.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q)
    )
  }
  return result
}, [customers, activeList, activityMap, search])
```

4. Den "Overview Dashboard"-Tile-onClick erweitern, damit Smart List deaktiviert wird:
```typescript
onClick={() => { setSelected(null); setActive(null) }}
```

5. `<SmartListsSection />` im JSX einfügen — nach dem `client-tile-overview`-Div und vor `<div className="clients-list">`:
```tsx
<SmartListsSection />
```

- [ ] **Step 3: Typecheck**

```powershell
npm run typecheck 2>&1
```

Erwartung: keine Errors

- [ ] **Step 4: Tests**

```powershell
npm run test:run 2>&1 | Select-Object -Last 10
```

Erwartung: alle Tests grün

- [ ] **Step 5: Cargo check**

```powershell
cd src-tauri && cargo check 2>&1 | Select-Object -Last 5
```

Erwartung: keine Errors

- [ ] **Step 6: Commit**

```powershell
cd ..
git add src/App.tsx src/routes/ClientsRoute.tsx
git commit -m "feat(smart-lists): Integration — App.tsx seed/load + ClientsRoute Filter + SmartListsSection"
```
