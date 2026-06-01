# Lead-Stages-System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead-Stages konfigurierbar machen (wie Pipeline-Stages) mit zwei festen Terminal-Stages `Qualifiziert` (→ Deal) und `Disqualifiziert` (→ Re-Engage), jeweils mit Confirmation-Modal beim Drag.

**Architecture:** Neue DB-Tabelle `lead_stages` (Migration v19), Rust-Commands analog `pipeline_stage.rs`, Frontend-Store + `LeadStagesManager`-Komponente (copy of StagesManager-Pattern), `LeadsRoute` verwendet dynamische Columns aus Store. `QualifyModal` und `DisqualifyModal` erscheinen beim Drag in Terminal-Stages.

**Tech Stack:** Rust/SQLite (rusqlite, uuid, chrono), React + TypeScript, Zustand, @dnd-kit/sortable, Tauri invoke

---

## File Map

| Datei | Aktion |
|---|---|
| `src-tauri/src/db/lead_stage.rs` | NEU — DB-Schicht analog pipeline_stage.rs |
| `src-tauri/src/db/mod.rs` | MODIFY — `pub mod lead_stage;` hinzufügen |
| `src-tauri/src/db/migrations.rs` | MODIFY — Migration v19 hinzufügen |
| `src-tauri/src/commands/lead_stage.rs` | NEU — Tauri-Commands |
| `src-tauri/src/commands/mod.rs` | MODIFY — `pub mod lead_stage;` hinzufügen |
| `src-tauri/src/main.rs` | MODIFY — 5 neue Commands registrieren |
| `src/types/lead.types.ts` | MODIFY — `LeadStage`-Type + `BulkUpdateLeadsPayload` updaten |
| `src/services/lead-stages.service.ts` | NEU — invoke-Wrapper |
| `src/store/lead-stages.store.ts` | NEU — Zustand-Store analog pipeline.store.ts |
| `src/components/leads/LeadStagesManager.tsx` | NEU — Dropdown-Popover analog StagesManager.tsx |
| `src/components/leads/QualifyModal.tsx` | NEU — Confirmation-Card für Qualifiziert-Drop |
| `src/components/leads/DisqualifyModal.tsx` | NEU — Re-Engage-Date-Card für Disqualifiziert-Drop |
| `src/routes/LeadsRoute.tsx` | MODIFY — dynamische Columns + Modal-Trigger |
| `src/App.tsx` | MODIFY — `LeadStagesService.seed` beim Start |

---

## Task 1: DB-Schicht `lead_stage.rs` + Migration v19

**Files:**
- Create: `src-tauri/src/db/lead_stage.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Schritt 1: Test schreiben**

Ans Ende von `src-tauri/src/db/lead_stage.rs` (die Datei wird in Schritt 2 erstellt, Test kommt ans Ende des `#[cfg(test)]`-Blocks):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn seed_creates_5_default_stages() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 5);
        assert!(stages.iter().any(|s| s.name == "qualifiziert" && s.is_qualified));
        assert!(stages.iter().any(|s| s.name == "disqualifiziert" && s.is_disqualified));
    }

    #[test]
    fn seed_is_idempotent() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 5);
    }

    #[test]
    fn delete_blocks_terminal_stages() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        let qual = stages.iter().find(|s| s.is_qualified).unwrap();
        let result = delete(&conn, &qual.id, "ws-1");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_custom_stage() {
        let conn = setup();
        let stage = upsert(&conn, UpsertLeadStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "temp".into(), label: "Temp".into(),
            order_index: Some(99), color: Some("#FF0000".into()),
            is_qualified: None, is_disqualified: None,
        }).unwrap();
        delete(&conn, &stage.id, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert!(stages.iter().all(|s| s.id != stage.id));
    }

    #[test]
    fn upsert_creates_and_updates() {
        let conn = setup();
        let created = upsert(&conn, UpsertLeadStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "custom".into(), label: "Old".into(),
            order_index: Some(10), color: None,
            is_qualified: None, is_disqualified: None,
        }).unwrap();
        assert_eq!(created.label, "Old");
        let updated = upsert(&conn, UpsertLeadStagePayload {
            id: Some(created.id.clone()), workspace_id: "ws-1".into(),
            name: "custom".into(), label: "New".into(),
            order_index: Some(10), color: None,
            is_qualified: None, is_disqualified: None,
        }).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.label, "New");
    }

    #[test]
    fn reorder_updates_order_index() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        let reversed: Vec<String> = stages.iter().rev().map(|s| s.id.clone()).collect();
        reorder(&conn, "ws-1", &reversed).unwrap();
        let reordered = get_all(&conn, "ws-1").unwrap();
        assert_eq!(reordered[0].id, stages.last().unwrap().id);
    }
}
```

- [ ] **Schritt 2: `src-tauri/src/db/lead_stage.rs` erstellen**

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeadStage {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: i32,
    pub color: String,
    pub is_qualified: bool,
    pub is_disqualified: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertLeadStagePayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: Option<i32>,
    pub color: Option<String>,
    pub is_qualified: Option<bool>,
    pub is_disqualified: Option<bool>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<LeadStage> {
    Ok(LeadStage {
        id:               r.get(0)?,
        workspace_id:     r.get(1)?,
        name:             r.get(2)?,
        label:            r.get(3)?,
        order_index:      r.get(4)?,
        color:            r.get(5)?,
        is_qualified:     r.get::<_, i32>(6)? != 0,
        is_disqualified:  r.get::<_, i32>(7)? != 0,
        created_at:       r.get(8)?,
    })
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<LeadStage>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at
         FROM lead_stages WHERE workspace_id = ?1 ORDER BY order_index ASC"
    )?;
    let rows = stmt.query_map([workspace_id], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, payload: UpsertLeadStagePayload) -> Result<LeadStage, AppError> {
    if let Some(ref existing_id) = payload.id {
        let result = conn.query_row(
            "SELECT workspace_id FROM lead_stages WHERE id = ?1",
            [existing_id],
            |r| r.get::<_, String>(0),
        );
        match result {
            Ok(ws_id) if ws_id != payload.workspace_id =>
                return Err(AppError::Validation("stage does not belong to workspace".into())),
            Ok(_) => {}
            Err(rusqlite::Error::QueryReturnedNoRows) => {}
            Err(e) => return Err(AppError::Db(e.to_string())),
        }
    }
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO lead_stages
         (id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, label=excluded.label,
           order_index=excluded.order_index, color=excluded.color",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.label,
            payload.order_index.unwrap_or(0),
            payload.color.unwrap_or_else(|| "#6B7280".to_string()),
            payload.is_qualified.unwrap_or(false) as i32,
            payload.is_disqualified.unwrap_or(false) as i32,
            now,
        ],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at
         FROM lead_stages WHERE id = ?1",
        [&id], map_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    let row = conn.query_row(
        "SELECT is_qualified, is_disqualified FROM lead_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
        |r| Ok((r.get::<_, i32>(0)?, r.get::<_, i32>(1)?)),
    ).map_err(|_| AppError::NotFound(format!("Stage {id} not found")))?;
    if row.0 != 0 || row.1 != 0 {
        return Err(AppError::Validation("Terminal-Stages können nicht gelöscht werden".into()));
    }
    conn.execute(
        "DELETE FROM lead_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    Ok(())
}

pub fn reorder(conn: &Connection, workspace_id: &str, ordered_ids: &[String]) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction().map_err(|e| AppError::Db(e.to_string()))?;
    for (index, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE lead_stages SET order_index = ?1 WHERE id = ?2 AND workspace_id = ?3",
            rusqlite::params![index as i32, id, workspace_id],
        ).map_err(|e| AppError::Db(e.to_string()))?;
    }
    tx.commit().map_err(|e| AppError::Db(e.to_string()))?;
    Ok(())
}

pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM lead_stages WHERE workspace_id = ?1",
        [workspace_id], |r| r.get(0),
    ).map_err(|e| AppError::Db(e.to_string()))?;
    if count > 0 { return Ok(()); }

    let tx = conn.unchecked_transaction().map_err(|e| AppError::Db(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    // (name, label, color, is_qualified, is_disqualified)
    let defaults: &[(&str, &str, &str, bool, bool)] = &[
        ("neu",             "Neu",             "#60a5fa", false, false),
        ("kontaktiert",     "Kontaktiert",     "#fbbf24", false, false),
        ("warm",            "Warm",            "#4ade80", false, false),
        ("qualifiziert",    "Qualifiziert",    "#D0FC69", true,  false),
        ("disqualifiziert", "Disqualifiziert", "#6B7280", false, true),
    ];
    for (idx, (name, label, color, is_qual, is_disqual)) in defaults.iter().enumerate() {
        tx.execute(
            "INSERT INTO lead_stages
             (id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                workspace_id, name, label, idx as i32,
                color, *is_qual as i32, *is_disqual as i32, now,
            ],
        ).map_err(|e| AppError::Db(e.to_string()))?;
    }
    tx.commit().map_err(|e| AppError::Db(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    // (Test-Code von Schritt 1 hier einfügen)
}
```

- [ ] **Schritt 3: Migration v19 in `src-tauri/src/db/migrations.rs` hinzufügen**

Den `_ => Ok(()),`-Arm suchen (am Ende der `apply`-Funktion) und ersetzen:

```rust
        18 => {
            // ... (bestehender Code bleibt)
        }
        19 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS lead_stages (
                    id               TEXT PRIMARY KEY,
                    workspace_id     TEXT NOT NULL,
                    name             TEXT NOT NULL,
                    label            TEXT NOT NULL,
                    color            TEXT NOT NULL DEFAULT '#6B7280',
                    order_index      INTEGER NOT NULL DEFAULT 0,
                    is_qualified     INTEGER NOT NULL DEFAULT 0,
                    is_disqualified  INTEGER NOT NULL DEFAULT 0,
                    created_at       TEXT NOT NULL,
                    UNIQUE(workspace_id, name)
                );
                UPDATE accounts SET lead_status = 'neu'             WHERE lead_status = 'new';
                UPDATE accounts SET lead_status = 'kontaktiert'     WHERE lead_status = 'attempted';
                UPDATE accounts SET lead_status = 'qualifiziert'    WHERE lead_status = 'call_booked';
                UPDATE accounts SET lead_status = 'disqualifiziert' WHERE lead_status = 'lost_reengage';
            "#)?;
            Ok(())
        }
        _ => Ok(()),
```

- [ ] **Schritt 4: `src-tauri/src/db/mod.rs` — `pub mod lead_stage;` hinzufügen**

Die Zeile direkt nach `pub mod pipeline_stage;` einfügen:
```rust
pub mod lead_stage;
```

- [ ] **Schritt 5: Test ausführen**

```bash
cd src-tauri && cargo test db::lead_stage -- --nocapture
```

Erwartet: 6 Tests `PASSED`

- [ ] **Schritt 6: Commit**

```bash
git add src-tauri/src/db/lead_stage.rs src-tauri/src/db/mod.rs src-tauri/src/db/migrations.rs
git commit -m "feat(db): lead_stages table + migration v19 + seed defaults"
```

---

## Task 2: Rust Commands

**Files:**
- Create: `src-tauri/src/commands/lead_stage.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Schritt 1: `src-tauri/src/commands/lead_stage.rs` erstellen**

```rust
use tauri::State;
use crate::{AppError, db::{self, lead_stage::{LeadStage, UpsertLeadStagePayload}}, db::pool::DbPool};

#[tauri::command]
pub fn cmd_get_lead_stages(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<LeadStage>, AppError> {
    db::lead_stage::get_all(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_upsert_lead_stage(db: State<'_, DbPool>, payload: UpsertLeadStagePayload) -> Result<LeadStage, AppError> {
    db::lead_stage::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn cmd_delete_lead_stage(db: State<'_, DbPool>, id: String, workspace_id: String) -> Result<(), AppError> {
    db::lead_stage::delete(&db.conn(), &id, &workspace_id)
}

#[tauri::command]
pub fn cmd_reorder_lead_stages(db: State<'_, DbPool>, workspace_id: String, ordered_ids: Vec<String>) -> Result<(), AppError> {
    db::lead_stage::reorder(&db.conn(), &workspace_id, &ordered_ids)
}

#[tauri::command]
pub fn cmd_seed_lead_stages(db: State<'_, DbPool>, workspace_id: String) -> Result<(), AppError> {
    db::lead_stage::seed_defaults(&db.conn(), &workspace_id)
}
```

- [ ] **Schritt 2: `src-tauri/src/commands/mod.rs` — `pub mod lead_stage;` hinzufügen**

Direkt nach `pub mod pipeline_stage;`:
```rust
pub mod lead_stage;
```

- [ ] **Schritt 3: `src-tauri/src/main.rs` — Commands registrieren**

Im `invoke_handler!`-Block, direkt nach den `pipeline_stage`-Commands (ca. Zeile 149-173):

```rust
            commands::lead_stage::cmd_get_lead_stages,
            commands::lead_stage::cmd_upsert_lead_stage,
            commands::lead_stage::cmd_delete_lead_stage,
            commands::lead_stage::cmd_reorder_lead_stages,
            commands::lead_stage::cmd_seed_lead_stages,
```

- [ ] **Schritt 4: Kompilieren prüfen**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Erwartet: `Compiling focus ... Finished`

- [ ] **Schritt 5: Commit**

```bash
git add src-tauri/src/commands/lead_stage.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(commands): lead_stage Tauri commands registriert"
```

---

## Task 3: Frontend Types + Service + Store

**Files:**
- Modify: `src/types/lead.types.ts`
- Create: `src/services/lead-stages.service.ts`
- Create: `src/store/lead-stages.store.ts`

- [ ] **Schritt 1: `src/types/lead.types.ts` — `LeadStage` hinzufügen + `BulkUpdateLeadsPayload` updaten**

Am Anfang der Datei, vor `PipelineStage`:

```ts
export interface LeadStage {
  id: string
  workspaceId: string
  name: string
  label: string
  orderIndex: number
  color: string
  isQualified: boolean
  isDisqualified: boolean
  createdAt: string
}

export interface UpsertLeadStagePayload {
  id?: string
  workspaceId: string
  name: string
  label: string
  orderIndex?: number
  color?: string
  isQualified?: boolean
  isDisqualified?: boolean
}
```

`BulkUpdateLeadsPayload` updaten — `status` von `LeadStatus` auf `string` ändern (Lead-Stage-Name ist jetzt frei):

```ts
export interface BulkUpdateLeadsPayload {
  ids: string[]
  status: string          // war: LeadStatus
  reEngageDate?: string
}
```

- [ ] **Schritt 2: `src/services/lead-stages.service.ts` erstellen**

```ts
import { invoke } from '@tauri-apps/api/core'
import type { LeadStage, UpsertLeadStagePayload } from '@/types/lead.types'

export const LeadStagesService = {
  getAll(workspaceId: string): Promise<LeadStage[]> {
    return invoke('cmd_get_lead_stages', { workspaceId })
  },
  upsert(payload: UpsertLeadStagePayload): Promise<LeadStage> {
    return invoke('cmd_upsert_lead_stage', { payload })
  },
  delete(id: string, workspaceId: string): Promise<void> {
    return invoke('cmd_delete_lead_stage', { id, workspaceId })
  },
  reorder(workspaceId: string, orderedIds: string[]): Promise<void> {
    return invoke('cmd_reorder_lead_stages', { workspaceId, orderedIds })
  },
  seed(workspaceId: string): Promise<void> {
    return invoke('cmd_seed_lead_stages', { workspaceId })
  },
}
```

- [ ] **Schritt 3: `src/store/lead-stages.store.ts` erstellen**

```ts
import { create } from 'zustand'
import { LeadStagesService } from '@/services/lead-stages.service'
import { log } from '@/lib/logger'
import type { LeadStage, UpsertLeadStagePayload } from '@/types/lead.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface LeadStagesState {
  stages: LeadStage[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsertStage: (payload: UpsertLeadStagePayload) => Promise<void>
  removeStage: (id: string, workspaceId: string) => Promise<void>
  reorder: (workspaceId: string, orderedIds: string[]) => Promise<void>
  qualifiedStage: () => LeadStage | undefined
  disqualifiedStage: () => LeadStage | undefined
  boardStages: () => LeadStage[]
}

export const useLeadStagesStore = create<LeadStagesState>()((set, get) => ({
  stages: [],
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const stages = await LeadStagesService.getAll(workspaceId)
      set({ stages, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load lead stages', { error })
    }
  },

  upsertStage: async (payload) => {
    set({ error: null })
    try {
      const stage = await LeadStagesService.upsert(payload)
      set(s => {
        const exists = s.stages.some(st => st.id === stage.id)
        const updated = exists
          ? s.stages.map(st => st.id === stage.id ? stage : st)
          : [...s.stages, stage]
        return { stages: updated.sort((a, b) => a.orderIndex - b.orderIndex) }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeStage: async (id, workspaceId) => {
    set({ error: null })
    try {
      await LeadStagesService.delete(id, workspaceId)
      set(s => ({ stages: s.stages.filter(st => st.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  reorder: async (workspaceId, orderedIds) => {
    const prev = get().stages
    set(s => ({
      stages: orderedIds
        .map((id, idx) => {
          const st = s.stages.find(x => x.id === id)!
          return { ...st, orderIndex: idx }
        })
        .filter(Boolean),
    }))
    try {
      await LeadStagesService.reorder(workspaceId, orderedIds)
    } catch (err) {
      set({ stages: prev }); throw err
    }
  },

  qualifiedStage: () => get().stages.find(s => s.isQualified),
  disqualifiedStage: () => get().stages.find(s => s.isDisqualified),
  boardStages: () => get().stages,
}))
```

- [ ] **Schritt 4: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -10
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 5: Commit**

```bash
git add src/types/lead.types.ts src/services/lead-stages.service.ts src/store/lead-stages.store.ts
git commit -m "feat(frontend): LeadStage types, service, Zustand store"
```

---

## Task 4: `LeadStagesManager` Komponente

**Files:**
- Create: `src/components/leads/LeadStagesManager.tsx`

- [ ] **Schritt 1: `src/components/leads/LeadStagesManager.tsx` erstellen**

```tsx
import { useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import type { LeadStage, UpsertLeadStagePayload } from '@/types/lead.types'
import { GripVertical, Trash2, Plus, X, Lock } from 'lucide-react'

const PRESET_COLORS = ['#6B7280','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#10B981','#06B6D4','#D0FC69']

function SortableStageRow({ stage, onDelete, onUpdate }: {
  stage: LeadStage
  onDelete: (id: string) => void
  onUpdate: (id: string, label: string, color: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const [label, setLabel] = useState(stage.label)
  const [color, setColor] = useState(stage.color)
  const isLocked = stage.isQualified || stage.isDisqualified

  const handleBlur = () => {
    if (label !== stage.label || color !== stage.color) onUpdate(stage.id, label, color)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 0', borderBottom: '1px solid var(--border)',
      }}
    >
      <div {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--fg-dim)', flexShrink: 0 }}>
        <GripVertical size={14} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); onUpdate(stage.id, label, c) }}
            style={{
              width: 12, height: 12, borderRadius: '50%', background: c, cursor: 'pointer',
              border: color === c ? '2px solid var(--fg)' : '2px solid transparent',
            }}
          />
        ))}
      </div>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        onBlur={handleBlur}
        disabled={isLocked}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          fontSize: 12, fontWeight: 600, color: 'var(--fg)',
          opacity: isLocked ? 0.6 : 1,
        }}
      />
      {isLocked
        ? <Lock size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
        : <button onClick={() => onDelete(stage.id)} style={{ color: 'var(--fg-dim)', cursor: 'pointer', flexShrink: 0 }}>
            <Trash2 size={13} />
          </button>
      }
    </div>
  )
}

interface Props { workspaceId: string; onClose: () => void }

export function LeadStagesManager({ workspaceId, onClose }: Props) {
  const stages      = useLeadStagesStore(s => s.stages)
  const upsertStage = useLeadStagesStore(s => s.upsertStage)
  const removeStage = useLeadStagesStore(s => s.removeStage)
  const reorder     = useLeadStagesStore(s => s.reorder)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = stages.findIndex(s => s.id === active.id)
    const newIndex = stages.findIndex(s => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex)
    reorder(workspaceId, reordered.map(s => s.id))
  }

  const handleUpdate = async (id: string, label: string, color: string) => {
    const stage = stages.find(s => s.id === id)!
    await upsertStage({
      id, workspaceId, name: stage.name, label, color,
      isQualified: stage.isQualified, isDisqualified: stage.isDisqualified,
    } as UpsertLeadStagePayload)
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      await removeStage(id, workspaceId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Stage konnte nicht gelöscht werden')
    }
  }

  const handleAdd = async () => {
    if (!newLabel.trim()) return
    const name = newLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    await upsertStage({
      workspaceId, name, label: newLabel.trim(),
      color: PRESET_COLORS[stages.length % PRESET_COLORS.length],
      orderIndex: stages.length,
    })
    setNewLabel('')
  }

  return (
    <div style={{
      position: 'absolute', top: 48, right: 0, width: 380,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 16, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Lead-Stages verwalten</span>
        <button onClick={onClose} style={{ color: 'var(--fg-dim)', cursor: 'pointer' }}><X size={14} /></button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
          {error}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {stages.map(stage => (
            <SortableStageRow key={stage.id} stage={stage} onDelete={handleDelete} onUpdate={handleUpdate} />
          ))}
        </SortableContext>
      </DndContext>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          className="mock-input"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="+ Neue Stage"
          style={{ flex: 1, fontSize: 12 }}
        />
        <button onClick={handleAdd} className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -10
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 3: Commit**

```bash
git add src/components/leads/LeadStagesManager.tsx
git commit -m "feat(leads): LeadStagesManager Dropdown-Popover"
```

---

## Task 5: `QualifyModal` + `DisqualifyModal`

**Files:**
- Create: `src/components/leads/QualifyModal.tsx`
- Create: `src/components/leads/DisqualifyModal.tsx`

- [ ] **Schritt 1: `src/components/leads/QualifyModal.tsx` erstellen**

```tsx
import { useState } from 'react'
import type { Lead } from '@/types/lead.types'

interface Props {
  lead: Lead
  onConfirm: (appointmentDate?: string) => Promise<void>
  onCancel: () => void
}

export function QualifyModal({ lead, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(date || undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D0FC69', flexShrink: 0 }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Termin buchen</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 20px' }}>{lead.name}</p>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
            Termin am <span style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            className="mock-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={saving}>Zurück</button>
          <button className="btn-primary" onClick={handleConfirm} disabled={saving}
            style={{ background: '#D0FC69', color: '#000' }}
          >
            {saving ? 'Wird erstellt…' : 'In Pipeline →'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: `src/components/leads/DisqualifyModal.tsx` erstellen**

```tsx
import { useState } from 'react'
import type { Lead } from '@/types/lead.types'

interface Props {
  lead: Lead
  onConfirm: (reEngageDate: string) => Promise<void>
  onCancel: () => void
}

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function DisqualifyModal({ lead, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState(todayPlus(90))
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!date) return
    setSaving(true)
    try {
      await onConfirm(date)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6B7280', flexShrink: 0 }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Wann re-engagen?</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 20px' }}>{lead.name}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[30, 60, 90].map(days => (
            <button
              key={days}
              onClick={() => setDate(todayPlus(days))}
              className="btn-ghost"
              style={{
                flex: 1, fontSize: 12, padding: '6px 0',
                background: date === todayPlus(days) ? 'var(--accent-soft)' : undefined,
                color: date === todayPlus(days) ? 'var(--accent)' : undefined,
                fontWeight: date === todayPlus(days) ? 700 : undefined,
              }}
            >
              {days} Tage
            </button>
          ))}
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
            Datum
          </label>
          <input
            className="mock-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={saving}>Zurück</button>
          <button className="btn-primary" onClick={handleConfirm} disabled={!date || saving}>
            {saving ? 'Wird gespeichert…' : 'Disqualifizieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -10
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 4: Commit**

```bash
git add src/components/leads/QualifyModal.tsx src/components/leads/DisqualifyModal.tsx
git commit -m "feat(leads): QualifyModal + DisqualifyModal Confirmation-Cards"
```

---

## Task 6: App.tsx + LeadsRoute Refactor

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/routes/LeadsRoute.tsx`

- [ ] **Schritt 1: `src/App.tsx` — Seed + Load für Lead-Stages hinzufügen**

Import hinzufügen (oben, wo andere Services importiert werden):
```ts
import { LeadStagesService } from '@/services/lead-stages.service'
import { useLeadStagesStore } from '@/store/lead-stages.store'
```

Im `useEffect`-Block wo `PipelineService.seed` aufgerufen wird (ca. Zeile 152), direkt danach hinzufügen:
```ts
      LeadStagesService.seed(activeWorkspaceId).catch(() => {}).then(() =>
        useLeadStagesStore.getState().load(activeWorkspaceId)
      )
```

- [ ] **Schritt 2: `src/routes/LeadsRoute.tsx` — dynamische Columns + Modal-Trigger**

Zunächst `LeadColumn` Type-Annotation fixen (da `COLUMNS` gelöscht wird). Die Signatur von `LeadColumn` ändern:

```tsx
// alt:
function LeadColumn({ col, leads, selected, onToggle, onContext, onWarm }: {
  col: typeof COLUMNS[number]
// neu:
type ColDef = { id: string; label: string; hoverBg: string; dot: string }

function LeadColumn({ col, leads, selected, onToggle, onContext, onWarm }: {
  col: ColDef
```

Ebenfalls in `ContextMenu` die Re-Engage-Items anpassen (status `'lost_reengage'` → `'disqualifiziert'`):

```tsx
// alt:
      <CtxItem
        label="Re-Engage (90 Tage)"
        onClick={() => act(() =>
          bulkUpdate({ ids: [menu.lead.id], status: 'lost_reengage', reEngageDate: todayPlus(90) }, workspaceId)
        )}
      />
      <CtxItem
        label="Lost (6 Monate)"
        color="var(--fg-dim)"
        onClick={() => act(() =>
          bulkUpdate({ ids: [menu.lead.id], status: 'lost_reengage', reEngageDate: todayPlus(180) }, workspaceId)
        )}
      />
// neu:
      <CtxItem
        label="Re-Engage (90 Tage)"
        onClick={() => act(() =>
          bulkUpdate({ ids: [menu.lead.id], status: 'disqualifiziert', reEngageDate: todayPlus(90) }, workspaceId)
        )}
      />
      <CtxItem
        label="Lost (6 Monate)"
        color="var(--fg-dim)"
        onClick={() => act(() =>
          bulkUpdate({ ids: [menu.lead.id], status: 'disqualifiziert', reEngageDate: todayPlus(180) }, workspaceId)
        )}
      />
```

Die gesamte `PhasenBoard`-Funktion ersetzen. Dazu den Anfang der Datei um neue Imports ergänzen:

```ts
import { useLeadStagesStore } from '@/store/lead-stages.store'
import type { LeadStage } from '@/types/lead.types'
import { LeadStagesManager } from '@/components/leads/LeadStagesManager'
import { QualifyModal } from '@/components/leads/QualifyModal'
import { DisqualifyModal } from '@/components/leads/DisqualifyModal'
```

Den `type ColumnId = LeadStatus | 'call_booked'` und das hardcoded `const COLUMNS`-Array **löschen**.

Die `PhasenBoard`-Funktion wie folgt ersetzen:

```tsx
function PhasenBoard({ workspaceId, onShowCreate }: { workspaceId: string; onShowCreate: () => void }) {
  const allLeads      = useLeadsStore(s => s.leads)
  const bulkUpdate    = useLeadsStore(s => s.bulkUpdate)
  const deleteLead    = useLeadsStore(s => s.deleteLead)
  const convertToDeal = useLeadsStore(s => s.convertToDeal)
  const userId        = useAuthStore(s => s.user?.id ?? '')
  const setAppView    = useUiStore(s => s.setAppView)
  const showToast     = useToastStore(s => s.show)
  const stages        = useLeadStagesStore(s => s.stages)

  const [activeLead, setActiveLead]             = useState<Lead | null>(null)
  const [selected, setSelected]                 = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu]                   = useState<CtxMenu | null>(null)
  const [followUpLeads, setFollowUpLeads]        = useState<Lead[] | null>(null)
  const [pendingQualify, setPendingQualify]      = useState<Lead | null>(null)
  const [pendingDisqualify, setPendingDisqualify] = useState<Lead | null>(null)
  const [showStages, setShowStages]             = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const boardLeads = useMemo(
    () => allLeads.filter(l => l.reEngageDate == null),
    [allLeads],
  )

  const reEngageLeads = useMemo(
    () => allLeads.filter(l => l.reEngageDate != null),
    [allLeads],
  )

  const leadsForStage = (stageName: string) =>
    boardLeads.filter(l => l.leadStatus === stageName)

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const handleDragStart = (e: DragStartEvent) => {
    setActiveLead(boardLeads.find(l => l.id === e.active.id) ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveLead(null)
    if (!e.over) return
    const targetStageName = e.over.id as string
    const lead = boardLeads.find(l => l.id === e.active.id)
    if (!lead) return

    const targetStage = stages.find(s => s.name === targetStageName)
    if (!targetStage) return

    if (targetStage.isQualified) {
      setPendingQualify(lead)
      return
    }
    if (targetStage.isDisqualified) {
      setPendingDisqualify(lead)
      return
    }
    if (lead.leadStatus !== targetStageName) {
      bulkUpdate({ ids: [lead.id], status: targetStageName }, workspaceId)
    }
  }

  const handleQualifyConfirm = async (appointmentDate?: string) => {
    if (!pendingQualify) return
    try {
      await convertToDeal(pendingQualify.id, workspaceId, userId)
      showToast({
        message: `Deal angelegt — ${pendingQualify.name}`,
        action: { label: '→ Pipeline öffnen', onClick: () => setAppView('pipeline') },
      })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Konvertierung fehlgeschlagen', variant: 'error' })
    } finally {
      setPendingQualify(null)
    }
  }

  const handleDisqualifyConfirm = async (reEngageDate: string) => {
    if (!pendingDisqualify) return
    try {
      await bulkUpdate({ ids: [pendingDisqualify.id], status: 'disqualifiziert', reEngageDate }, workspaceId)
    } finally {
      setPendingDisqualify(null)
    }
  }

  const handleContext = (e: React.MouseEvent, lead: Lead) => {
    setCtxMenu({ lead, x: e.clientX, y: e.clientY })
  }

  const handleWarm = (id: string) => {
    const warmStage = stages.find(s => s.name === 'warm')
    if (warmStage) bulkUpdate({ ids: [id], status: 'warm' }, workspaceId)
  }

  const selectedLeads = boardLeads.filter(l => selected.has(l.id))

  async function deleteSelected() {
    await Promise.all(selectedLeads.map(l => deleteLead(l.id, workspaceId)))
    clearSelection()
  }

  return (
    <>
      {/* Action bar */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minHeight: 50,
        position: 'relative',
      }}>
        {selected.size > 0 ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>
              {selected.size} ausgewählt
            </span>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setFollowUpLeads(selectedLeads)}>
              Follow-Up erstellen
            </button>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: '#f87171' }}
              onClick={deleteSelected}>
              Löschen
            </button>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--fg-dim)' }}
              onClick={clearSelection}>
              Auswahl aufheben
            </button>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
            Karte anklicken zum Auswählen · Ziehen zum Verschieben · Rechtsklick für Aktionen
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="btn-ghost"
          style={{ fontSize: 11, padding: '5px 10px' }}
          onClick={() => setShowStages(v => !v)}
        >
          Stages
        </button>
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onShowCreate}>
          + Lead
        </button>
        {showStages && (
          <LeadStagesManager workspaceId={workspaceId} onClose={() => setShowStages(false)} />
        )}
      </div>

      {/* Board + Sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
            {stages.map(stage => (
              <LeadColumn
                key={stage.id}
                col={{ id: stage.name, label: stage.label, hoverBg: `${stage.color}1A`, dot: stage.color }}
                leads={leadsForStage(stage.name)}
                selected={selected}
                onToggle={toggleSelect}
                onContext={handleContext}
                onWarm={handleWarm}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? <LeadCard lead={activeLead} onContext={() => {}} isDragging /> : null}
          </DragOverlay>
        </DndContext>

        <ReEngageSidebar leads={reEngageLeads} />
      </div>

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          workspaceId={workspaceId}
          onClose={() => setCtxMenu(null)}
          onFollowUp={leads => { setCtxMenu(null); setFollowUpLeads(leads) }}
        />
      )}
      {followUpLeads && (
        <FollowUpModal leads={followUpLeads} workspaceId={workspaceId} onClose={() => setFollowUpLeads(null)} />
      )}
      {pendingQualify && (
        <QualifyModal lead={pendingQualify} onConfirm={handleQualifyConfirm} onCancel={() => setPendingQualify(null)} />
      )}
      {pendingDisqualify && (
        <DisqualifyModal lead={pendingDisqualify} onConfirm={handleDisqualifyConfirm} onCancel={() => setPendingDisqualify(null)} />
      )}
    </>
  )
}
```

Den `LeadColumn`-Typ im bestehenden `LeadColumn`-Komponent anpassen — das `col`-Prop ist jetzt `{ id: string; label: string; hoverBg: string; dot: string }` — das war bereits so, keine Änderung nötig.

- [ ] **Schritt 3: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -20
```

Erwartet: keine Fehler

- [ ] **Schritt 4: App starten + manuell testen**

```bash
npm run tauri dev
```

Checkliste:
- [ ] Lead-Board zeigt 5 Default-Stages (Neu / Kontaktiert / Warm / Qualifiziert / Disqualifiziert)
- [ ] "Stages"-Button öffnet Dropdown, Custom-Stage anlegen möglich, Qualifiziert/Disqualifiziert haben Schloss
- [ ] Lead in Qualifiziert ziehen → QualifyModal erscheint, "Zurück" schließt ohne Änderung
- [ ] "In Pipeline →" → Toast erscheint, Lead weg vom Board
- [ ] Lead in Disqualifiziert ziehen → DisqualifyModal erscheint, 30/60/90-Buttons füllen Datum
- [ ] "Disqualifizieren" → Lead wandert in Re-Engage-Sidebar

- [ ] **Schritt 5: Commit**

```bash
git add src/App.tsx src/routes/LeadsRoute.tsx
git commit -m "feat(leads): dynamische Stages + QualifyModal + DisqualifyModal im LeadsRoute"
```
