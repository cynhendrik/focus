# Phase 2 „Der Stapel" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der zentrale Freigabe-Stapel: eine `prepared_items`-Tabelle, in die deterministische Engines fertige Arbeit schreiben (Mahnungen mit Template-Text, Follow-ups, Rechnungsvorschläge, fällige Aufgaben), und ein umgebautes „Mein Tag", in dem der Nutzer jede Karte mit einem Klick freigibt, anpasst, snoozt oder verwirft — Phase 2 der Dach-Spec `docs/superpowers/specs/2026-07-02-vorbereiteter-schreibtisch-design.md` (§6).

**Architecture:** Rust/SQLite bekommt die Tabelle `prepared_items` (Migration 36) mit Dedupe über `UNIQUE(workspace_id, source_kind, source_id)`; ein Frontend-Gateway mit `shared()`-Switch (Muster `activities.gateway.ts`) schreibt lokal via Tauri-Commands bzw. direkt nach Supabase. Die Generierung ist eine pure TS-Funktion (`generateCardDrafts`), gespeist aus den bestehenden Quellen (`dueReminders`, CRM-Follow-ups, Suggestion-Invoices, fällige Todos), orchestriert von einem Preparation-Service (Start + Stunden-Tick + Reconcile aufgelöster Quellen). Mahn-/Begleit-/Follow-up-Texte kommen aus einer neuen Template-Lib (KORA nur noch als „Umformulieren"-Knopf). Die UI ersetzt die Heute-Queue in „Mein Tag" durch `StapelSection`/`StapelCard` mit den vier Aktionen Freigeben/Anpassen/Später/Verwerfen.

**Tech Stack:** Tauri 2 (Rust, rusqlite), React 18 + TypeScript + Zustand, Vitest, Supabase (Cloud-Zweig + SQL-Migration).

## Global Constraints

- **Sprache:** Alle UI-Texte und Templates auf Deutsch.
- **Kein KI-Call im Grundbetrieb:** Generierung, Templates, Scoring sind 100 % deterministisch. KORA (`generateCorraDraft`) wird NUR vom „Mit KORA umformulieren"-Knopf aufgerufen.
- **Kein neues Parallel-System:** Mahn-Erkennung nutzt `dueReminders` (bestehend), Freigabe nutzt `sendReminder`/`approveInvoiceSuggestion` (bestehend). `prepared_items` ist der EINE Vorbereitungs-Kanal; die Heute-Queue-Anzeige in „Mein Tag" wird ersetzt, nicht ergänzt.
- **Dedupe:** genau eine Karte pro Quelle via `UNIQUE(workspace_id, source_kind, source_id)`; Insert ist idempotent (INSERT OR IGNORE); verworfene Karten werden NIE automatisch wiederbelebt.
- **Tests:** Vitest colocated (`npx vitest run <pfad>`); Rust `cargo test` in `src-tauri/`. Vor jedem Commit: betroffene Tests grün + `npm run typecheck` (bzw. `cargo check`).
- **Arbeitsbranch:** `feature/phase2-stapel`, abgezweigt von `feature/phase1-vertrauen-praesenz` (HEAD `3fe1cfae`).
- **Statuswerte:** `pending | approved | snoozed | dismissed`. Kartentypen: `mahnung | followup | rechnungsentwurf | aufgabe`. `sourceKind`-Werte: `invoice_reminder | crm_follow_up | invoice_suggestion | todo`.
- **Supabase-Migration wird NICHT automatisch angewendet** — SQL-Datei ins Repo, Anwendung macht der Mensch (Management-API/PAT).
- **Bewusst NICHT in Phase 2** (Spec §11): die Kartentypen „Antwortentwurf" (Mail, KI-lazy) und „Termin-Vorbereitung" (Kalender) — sie kommen mit dem Mail- bzw. Kalender-Ausbau in Phase 5 und fügen sich als neue `type`-Werte + Generator-Regeln ein, ohne das Schema zu ändern.

---

### Task 0: Branch anlegen

- [ ] **Step 1:**

```bash
git checkout feature/phase1-vertrauen-praesenz && git checkout -b feature/phase2-stapel
```

Expected: `Switched to a new branch 'feature/phase2-stapel'`

---

### Task 1: Rust — Tabelle `prepared_items` + DB-Layer + Commands

**Files:**
- Modify: `src-tauri/src/db/schema.rs` (Tabelle + Indizes in `create_tables`)
- Modify: `src-tauri/src/db/migrations.rs` (CURRENT_VERSION 35→36, Case 36)
- Create: `src-tauri/src/db/prepared_item.rs`
- Modify: `src-tauri/src/db/mod.rs` (Modul registrieren — Muster der anderen Module übernehmen)
- Create: `src-tauri/src/commands/prepared_item.rs`
- Modify: `src-tauri/src/commands/mod.rs` (Modul registrieren)
- Modify: `src-tauri/src/main.rs` (Commands im `invoke_handler`)

**Interfaces:**
- Produces (Rust, alle `#[serde(rename_all = "camelCase")]`):
  - `PreparedItem { id, workspace_id, type_ (Spalte "type"), source_kind, source_id, assignee: Option<String>, payload: String, score: f64, status, snooze_until: Option<String>, rule_id, created_at, updated_at, approved_at: Option<String> }`
  - Commands: `cmd_get_active_prepared_items(workspace_id) -> Vec<PreparedItem>` (status pending|snoozed), `cmd_insert_prepared_item_ignore(payload: CreatePreparedItemPayload) -> bool` (true = neu eingefügt), `cmd_update_prepared_item_status(id, status, snooze_until: Option<String>, approved_at: Option<String>) -> PreparedItem`, `cmd_update_prepared_item_payload(id, payload: String) -> PreparedItem`, `cmd_set_prepared_item_assignee(id, assignee: Option<String>) -> PreparedItem`, `cmd_get_approved_prepared_items_since(workspace_id, since) -> Vec<PreparedItem>`

- [ ] **Step 1: Fehlschlagende Rust-Tests schreiben**

In `src-tauri/src/db/prepared_item.rs` ganz unten (Datei entsteht in Step 3 — Tests zuerst hineinschreiben, dann kompilierfähig machen):

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

    fn payload(source_id: &str) -> CreatePreparedItemPayload {
        CreatePreparedItemPayload {
            workspace_id: "ws1".into(),
            item_type: "mahnung".into(),
            source_kind: "invoice_reminder".into(),
            source_id: source_id.into(),
            assignee: None,
            payload: r#"{"title":"Test"}"#.into(),
            score: 1000.0,
            rule_id: "mahnung-l0".into(),
        }
    }

    #[test]
    fn insert_ignore_dedupes_on_source() {
        let conn = setup();
        assert!(insert_ignore(&conn, payload("inv1:0")).unwrap());
        assert!(!insert_ignore(&conn, payload("inv1:0")).unwrap()); // Duplikat → false
        assert_eq!(get_active(&conn, "ws1").unwrap().len(), 1);
    }

    #[test]
    fn dismissed_items_are_not_active_and_not_resurrected() {
        let conn = setup();
        insert_ignore(&conn, payload("inv1:0")).unwrap();
        let id: String = conn.query_row("SELECT id FROM prepared_items LIMIT 1", [], |r| r.get(0)).unwrap();
        update_status(&conn, &id, "dismissed", None, None).unwrap();
        assert_eq!(get_active(&conn, "ws1").unwrap().len(), 0);
        // Erneuter Insert derselben Quelle: ignoriert, Karte bleibt dismissed.
        assert!(!insert_ignore(&conn, payload("inv1:0")).unwrap());
        let status: String = conn.query_row("SELECT status FROM prepared_items WHERE id=?1", [&id], |r| r.get(0)).unwrap();
        assert_eq!(status, "dismissed");
    }

    #[test]
    fn approved_since_returns_only_approved_in_window() {
        let conn = setup();
        insert_ignore(&conn, payload("inv1:0")).unwrap();
        insert_ignore(&conn, payload("inv2:0")).unwrap();
        let id: String = conn.query_row("SELECT id FROM prepared_items WHERE source_id='inv1:0'", [], |r| r.get(0)).unwrap();
        update_status(&conn, &id, "approved", None, Some("2026-07-01T08:00:00Z".into())).unwrap();
        let hits = get_approved_since(&conn, "ws1", "2026-06-29T00:00:00Z").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].source_id, "inv1:0");
        assert!(get_approved_since(&conn, "ws1", "2026-07-02T00:00:00Z").unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Tests laufen lassen — müssen scheitern**

Run: `cd src-tauri && cargo test prepared_item`
Expected: Compile-Fehler (Modul existiert nicht).

- [ ] **Step 3: Schema + Migration**

`src-tauri/src/db/schema.rs`: in `create_tables` (in den `execute_batch`-Block, vor dem schließenden `"#)`) einfügen:

```sql
        CREATE TABLE IF NOT EXISTS prepared_items (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            type         TEXT NOT NULL,
            source_kind  TEXT NOT NULL,
            source_id    TEXT NOT NULL,
            assignee     TEXT,
            payload      TEXT NOT NULL DEFAULT '{}',
            score        REAL NOT NULL DEFAULT 0,
            status       TEXT NOT NULL DEFAULT 'pending',
            snooze_until TEXT,
            rule_id      TEXT NOT NULL DEFAULT '',
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            approved_at  TEXT,
            UNIQUE(workspace_id, source_kind, source_id)
        );
        CREATE INDEX IF NOT EXISTS idx_prepared_items_ws_status ON prepared_items(workspace_id, status, score);
```

`src-tauri/src/db/migrations.rs`: `CURRENT_VERSION` 35→36; vor `_ => Ok(())`:

```rust
        36 => {
            // prepared_items — der EINE Vorbereitungs-Kanal des Stapels (Spec §6).
            // create_tables legt die Tabelle bei Frischinstalls an; hier für Bestandsinstallationen.
            if !table_exists(conn, "prepared_items") {
                conn.execute_batch(r#"
                    CREATE TABLE prepared_items (
                        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, type TEXT NOT NULL,
                        source_kind TEXT NOT NULL, source_id TEXT NOT NULL, assignee TEXT,
                        payload TEXT NOT NULL DEFAULT '{}', score REAL NOT NULL DEFAULT 0,
                        status TEXT NOT NULL DEFAULT 'pending', snooze_until TEXT,
                        rule_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL, approved_at TEXT,
                        UNIQUE(workspace_id, source_kind, source_id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_prepared_items_ws_status ON prepared_items(workspace_id, status, score);
                "#)?;
            }
            Ok(())
        }
```

- [ ] **Step 4: DB-Layer `src-tauri/src/db/prepared_item.rs`**

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreparedItem {
    pub id: String,
    pub workspace_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub source_kind: String,
    pub source_id: String,
    pub assignee: Option<String>,
    pub payload: String,
    pub score: f64,
    pub status: String,
    pub snooze_until: Option<String>,
    pub rule_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub approved_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePreparedItemPayload {
    pub workspace_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub source_kind: String,
    pub source_id: String,
    pub assignee: Option<String>,
    pub payload: String,
    pub score: f64,
    pub rule_id: String,
}

const SELECT_COLS: &str = "id, workspace_id, type, source_kind, source_id, assignee, payload, score, status, snooze_until, rule_id, created_at, updated_at, approved_at";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<PreparedItem> {
    Ok(PreparedItem {
        id: r.get(0)?, workspace_id: r.get(1)?, item_type: r.get(2)?,
        source_kind: r.get(3)?, source_id: r.get(4)?, assignee: r.get(5)?,
        payload: r.get(6)?, score: r.get(7)?, status: r.get(8)?,
        snooze_until: r.get(9)?, rule_id: r.get(10)?, created_at: r.get(11)?,
        updated_at: r.get(12)?, approved_at: r.get(13)?,
    })
}

fn get_by_id(conn: &Connection, id: &str) -> Result<PreparedItem, AppError> {
    conn.query_row(&format!("SELECT {SELECT_COLS} FROM prepared_items WHERE id=?1"), [id], map_row)
        .map_err(AppError::from)
}

/// Idempotenter Insert — genau eine Karte pro Quelle. true = neu eingefügt.
/// Verworfene/erledigte Karten werden NIE wiederbelebt (INSERT OR IGNORE).
pub fn insert_ignore(conn: &Connection, p: CreatePreparedItemPayload) -> Result<bool, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "INSERT OR IGNORE INTO prepared_items
         (id, workspace_id, type, source_kind, source_id, assignee, payload, score, rule_id, status, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'pending',?10,?10)",
        rusqlite::params![id, p.workspace_id, p.item_type, p.source_kind, p.source_id, p.assignee, p.payload, p.score, p.rule_id, now],
    )?;
    Ok(n > 0)
}

pub fn get_active(conn: &Connection, workspace_id: &str) -> Result<Vec<PreparedItem>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM prepared_items
         WHERE workspace_id=?1 AND status IN ('pending','snoozed')
         ORDER BY score DESC, created_at ASC"
    ))?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn update_status(
    conn: &Connection, id: &str, status: &str,
    snooze_until: Option<String>, approved_at: Option<String>,
) -> Result<PreparedItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE prepared_items SET status=?2, snooze_until=?3, approved_at=?4, updated_at=?5 WHERE id=?1",
        rusqlite::params![id, status, snooze_until, approved_at, now],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("PreparedItem {id} not found"))); }
    get_by_id(conn, id)
}

pub fn update_payload(conn: &Connection, id: &str, payload: &str) -> Result<PreparedItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE prepared_items SET payload=?2, updated_at=?3 WHERE id=?1",
        rusqlite::params![id, payload, now],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("PreparedItem {id} not found"))); }
    get_by_id(conn, id)
}

pub fn set_assignee(conn: &Connection, id: &str, assignee: Option<String>) -> Result<PreparedItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE prepared_items SET assignee=?2, updated_at=?3 WHERE id=?1",
        rusqlite::params![id, assignee, now],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("PreparedItem {id} not found"))); }
    get_by_id(conn, id)
}

pub fn get_approved_since(conn: &Connection, workspace_id: &str, since: &str) -> Result<Vec<PreparedItem>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM prepared_items
         WHERE workspace_id=?1 AND status='approved' AND approved_at >= ?2
         ORDER BY approved_at DESC"
    ))?;
    let rows = stmt.query_map([workspace_id, since], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

(+ die Tests aus Step 1 ans Dateiende.)

In `src-tauri/src/db/mod.rs` das Modul registrieren (Muster der bestehenden Zeilen übernehmen): `pub mod prepared_item;`

- [ ] **Step 5: Commands `src-tauri/src/commands/prepared_item.rs`**

```rust
use tauri::State;
use crate::{AppError, db::{pool::DbPool, prepared_item::{PreparedItem, CreatePreparedItemPayload}}};

#[tauri::command]
pub fn cmd_get_active_prepared_items(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<PreparedItem>, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::get_active(&conn, &workspace_id)
}

#[tauri::command]
pub fn cmd_insert_prepared_item_ignore(db: State<'_, DbPool>, payload: CreatePreparedItemPayload) -> Result<bool, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::insert_ignore(&conn, payload)
}

#[tauri::command]
pub fn cmd_update_prepared_item_status(
    db: State<'_, DbPool>, id: String, status: String,
    snooze_until: Option<String>, approved_at: Option<String>,
) -> Result<PreparedItem, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::update_status(&conn, &id, &status, snooze_until, approved_at)
}

#[tauri::command]
pub fn cmd_update_prepared_item_payload(db: State<'_, DbPool>, id: String, payload: String) -> Result<PreparedItem, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::update_payload(&conn, &id, &payload)
}

#[tauri::command]
pub fn cmd_set_prepared_item_assignee(db: State<'_, DbPool>, id: String, assignee: Option<String>) -> Result<PreparedItem, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::set_assignee(&conn, &id, assignee)
}

#[tauri::command]
pub fn cmd_get_approved_prepared_items_since(db: State<'_, DbPool>, workspace_id: String, since: String) -> Result<Vec<PreparedItem>, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::get_approved_since(&conn, &workspace_id, &since)
}
```

`src-tauri/src/commands/mod.rs`: `pub mod prepared_item;` ergänzen. `src-tauri/src/main.rs`, im `invoke_handler` nach den `commands::notes::*`-Zeilen:

```rust
            commands::prepared_item::cmd_get_active_prepared_items,
            commands::prepared_item::cmd_insert_prepared_item_ignore,
            commands::prepared_item::cmd_update_prepared_item_status,
            commands::prepared_item::cmd_update_prepared_item_payload,
            commands::prepared_item::cmd_set_prepared_item_assignee,
            commands::prepared_item::cmd_get_approved_prepared_items_since,
```

- [ ] **Step 6: Tests + Check**

Run: `cd src-tauri && cargo test prepared_item && cargo check`
Expected: 3 neue Tests PASS, check clean.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/ src-tauri/src/commands/ src-tauri/src/main.rs
git commit -m "feat(stapel): prepared_items — Tabelle, Migration 36, DB-Layer, Commands"
```

---

### Task 2: Frontend-Typen, Gateway (shared-Switch) + Supabase-SQL

**Files:**
- Create: `src/types/prepared-item.types.ts`
- Create: `src/data/prepared-items.mapper.ts`
- Create: `src/data/prepared-items.mapper.test.ts`
- Create: `src/data/prepared-items.gateway.ts`
- Create: `supabase/migrations/00XX_prepared_items.sql` (XX = höchste vorhandene Nummer + 1 — mit `ls supabase/migrations/` prüfen)

**Interfaces:**
- Produces:

```ts
export type PreparedItemType = 'mahnung' | 'followup' | 'rechnungsentwurf' | 'aufgabe'
export type PreparedItemStatus = 'pending' | 'approved' | 'snoozed' | 'dismissed'
export type PreparedSourceKind = 'invoice_reminder' | 'crm_follow_up' | 'invoice_suggestion' | 'todo'
export interface PreparedItemPayload {
  title: string; why: string
  customerName?: string; invoiceNumber?: string; amount?: number; level?: number
  draftSubject?: string; draftBody?: string
}
export interface PreparedItem {
  id: string; workspaceId: string; type: PreparedItemType
  sourceKind: PreparedSourceKind; sourceId: string; assignee: string | null
  payload: PreparedItemPayload; score: number; status: PreparedItemStatus
  snoozeUntil: string | null; ruleId: string
  createdAt: string; updatedAt: string; approvedAt: string | null
}
export interface CreatePreparedItem {
  workspaceId: string; type: PreparedItemType; sourceKind: PreparedSourceKind
  sourceId: string; assignee?: string | null; payload: PreparedItemPayload
  score: number; ruleId: string
}
```

- `PreparedItemsGateway`: `listActive(workspaceId): Promise<PreparedItem[]>`, `insertIgnore(item: CreatePreparedItem): Promise<boolean>`, `updateStatus(id, status, opts?: { snoozeUntil?: string | null; approvedAt?: string | null }): Promise<PreparedItem>`, `updatePayload(id, payload: PreparedItemPayload): Promise<PreparedItem>`, `setAssignee(id, assignee: string | null): Promise<PreparedItem>`, `approvedSince(workspaceId, sinceIso): Promise<PreparedItem[]>`

- [ ] **Step 1: Fehlschlagenden Mapper-Test schreiben**

`src/data/prepared-items.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rawToPreparedItem, rowToPreparedItem, preparedItemToRow } from './prepared-items.mapper'

describe('prepared-items mapper', () => {
  it('parst das payload-JSON aus dem Tauri-Raw-Item', () => {
    const raw = {
      id: 'p1', workspaceId: 'ws', type: 'mahnung', sourceKind: 'invoice_reminder',
      sourceId: 'inv1:0', assignee: null, payload: '{"title":"T","why":"W","amount":100}',
      score: 1000, status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
      createdAt: 'a', updatedAt: 'b', approvedAt: null,
    }
    const item = rawToPreparedItem(raw as never)
    expect(item.payload.title).toBe('T')
    expect(item.payload.amount).toBe(100)
  })

  it('kaputtes payload-JSON faellt auf leeren Titel zurueck statt zu werfen', () => {
    const raw = { id: 'p1', workspaceId: 'ws', type: 'aufgabe', sourceKind: 'todo', sourceId: 't1',
      assignee: null, payload: '{broken', score: 0, status: 'pending', snoozeUntil: null,
      ruleId: 'r', createdAt: 'a', updatedAt: 'b', approvedAt: null }
    expect(rawToPreparedItem(raw as never).payload).toEqual({ title: '', why: '' })
  })

  it('Supabase-Row roundtrip (snake_case + jsonb)', () => {
    const row = {
      id: 'p1', workspace_id: 'ws', type: 'followup', source_kind: 'crm_follow_up',
      source_id: 'fu1', assignee: 'u1', payload: { title: 'T', why: 'W' },
      score: 800, status: 'pending', snooze_until: null, rule_id: 'followup-due',
      created_at: 'a', updated_at: 'b', approved_at: null,
    }
    const item = rowToPreparedItem(row as never)
    expect(item.workspaceId).toBe('ws')
    expect(item.payload.title).toBe('T')
    const back = preparedItemToRow(item)
    expect(back.source_kind).toBe('crm_follow_up')
    expect(back.payload).toEqual({ title: 'T', why: 'W' })
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/data/prepared-items.mapper.test.ts`
Expected: FAIL (Module fehlen).

- [ ] **Step 3: Typen + Mapper implementieren**

`src/types/prepared-item.types.ts`: exakt der Typ-Block aus **Interfaces** oben.

`src/data/prepared-items.mapper.ts`:

```ts
import type { PreparedItem, PreparedItemPayload } from '@/types/prepared-item.types'

function parsePayload(raw: unknown): PreparedItemPayload {
  if (raw && typeof raw === 'object') return raw as PreparedItemPayload
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object') return p as PreparedItemPayload
    } catch { /* kaputtes JSON → Fallback */ }
  }
  return { title: '', why: '' }
}

/** Tauri-Command-Ergebnis (camelCase, payload = JSON-String) → PreparedItem. */
export function rawToPreparedItem(raw: Omit<PreparedItem, 'payload'> & { payload: string }): PreparedItem {
  return { ...raw, payload: parsePayload(raw.payload) }
}

/** Supabase-Row (snake_case, payload = jsonb) → PreparedItem. */
export function rowToPreparedItem(row: Record<string, unknown>): PreparedItem {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    type: row.type as PreparedItem['type'],
    sourceKind: row.source_kind as PreparedItem['sourceKind'],
    sourceId: row.source_id as string,
    assignee: (row.assignee as string | null) ?? null,
    payload: parsePayload(row.payload),
    score: row.score as number,
    status: row.status as PreparedItem['status'],
    snoozeUntil: (row.snooze_until as string | null) ?? null,
    ruleId: (row.rule_id as string) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    approvedAt: (row.approved_at as string | null) ?? null,
  }
}

/** PreparedItem → Supabase-Row. */
export function preparedItemToRow(item: PreparedItem): Record<string, unknown> {
  return {
    id: item.id, workspace_id: item.workspaceId, type: item.type,
    source_kind: item.sourceKind, source_id: item.sourceId, assignee: item.assignee,
    payload: item.payload, score: item.score, status: item.status,
    snooze_until: item.snoozeUntil, rule_id: item.ruleId,
    created_at: item.createdAt, updated_at: item.updatedAt, approved_at: item.approvedAt,
  }
}
```

- [ ] **Step 4: Gateway implementieren**

`src/data/prepared-items.gateway.ts` (Muster: `src/data/activities.gateway.ts` — `shared()`-Switch, `fail(error)`-Helfer analog dort per `throw new Error(error.message)`):

```ts
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { rawToPreparedItem, rowToPreparedItem } from './prepared-items.mapper'
import type { CreatePreparedItem, PreparedItem, PreparedItemPayload, PreparedItemStatus } from '@/types/prepared-item.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}

function fail(error: { message: string }): never {
  throw new Error(error.message)
}

type RawItem = Omit<PreparedItem, 'payload'> & { payload: string }

export const PreparedItemsGateway = {
  async listActive(workspaceId: string): Promise<PreparedItem[]> {
    if (!shared()) {
      const rows = await invoke<RawItem[]>('cmd_get_active_prepared_items', { workspaceId })
      return rows.map(rawToPreparedItem)
    }
    const { data, error } = await supabase.from('prepared_items')
      .select('*').eq('workspace_id', workspaceId).in('status', ['pending', 'snoozed'])
      .order('score', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(rowToPreparedItem)
  },

  /** Idempotent: genau eine Karte pro Quelle; verworfene Karten werden nie wiederbelebt. */
  async insertIgnore(item: CreatePreparedItem): Promise<boolean> {
    if (!shared()) {
      return invoke<boolean>('cmd_insert_prepared_item_ignore', {
        payload: { ...item, assignee: item.assignee ?? null, payload: JSON.stringify(item.payload) },
      })
    }
    const now = new Date().toISOString()
    const { error } = await supabase.from('prepared_items').insert({
      id: crypto.randomUUID(), workspace_id: item.workspaceId, type: item.type,
      source_kind: item.sourceKind, source_id: item.sourceId, assignee: item.assignee ?? null,
      payload: item.payload, score: item.score, status: 'pending', rule_id: item.ruleId,
      created_at: now, updated_at: now,
    })
    if (error) {
      if (error.code === '23505') return false // UNIQUE-Verletzung = Duplikat, kein Fehler
      fail(error)
    }
    return true
  },

  async updateStatus(id: string, status: PreparedItemStatus, opts?: { snoozeUntil?: string | null; approvedAt?: string | null }): Promise<PreparedItem> {
    if (!shared()) {
      return rawToPreparedItem(await invoke<RawItem>('cmd_update_prepared_item_status', {
        id, status, snoozeUntil: opts?.snoozeUntil ?? null, approvedAt: opts?.approvedAt ?? null,
      }))
    }
    const { data, error } = await supabase.from('prepared_items')
      .update({ status, snooze_until: opts?.snoozeUntil ?? null, approved_at: opts?.approvedAt ?? null, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single()
    if (error) fail(error)
    return rowToPreparedItem(data)
  },

  async updatePayload(id: string, payload: PreparedItemPayload): Promise<PreparedItem> {
    if (!shared()) {
      return rawToPreparedItem(await invoke<RawItem>('cmd_update_prepared_item_payload', { id, payload: JSON.stringify(payload) }))
    }
    const { data, error } = await supabase.from('prepared_items')
      .update({ payload, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
    if (error) fail(error)
    return rowToPreparedItem(data)
  },

  async setAssignee(id: string, assignee: string | null): Promise<PreparedItem> {
    if (!shared()) {
      return rawToPreparedItem(await invoke<RawItem>('cmd_set_prepared_item_assignee', { id, assignee }))
    }
    const { data, error } = await supabase.from('prepared_items')
      .update({ assignee, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
    if (error) fail(error)
    return rowToPreparedItem(data)
  },

  async approvedSince(workspaceId: string, sinceIso: string): Promise<PreparedItem[]> {
    if (!shared()) {
      const rows = await invoke<RawItem[]>('cmd_get_approved_prepared_items_since', { workspaceId, since: sinceIso })
      return rows.map(rawToPreparedItem)
    }
    const { data, error } = await supabase.from('prepared_items')
      .select('*').eq('workspace_id', workspaceId).eq('status', 'approved').gte('approved_at', sinceIso)
      .order('approved_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(rowToPreparedItem)
  },
}
```

- [ ] **Step 5: Supabase-Migration schreiben (NICHT anwenden)**

Nummer prüfen: `ls supabase/migrations/` → nächste freie Nummer verwenden. Datei `supabase/migrations/00XX_prepared_items.sql`:

```sql
-- prepared_items: der Freigabe-Stapel (Spec 2026-07-02 §6). Cloud-Zweig für geteilte Workspaces.
create table if not exists public.prepared_items (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,
  source_kind text not null,
  source_id text not null,
  assignee uuid,
  payload jsonb not null default '{}'::jsonb,
  score double precision not null default 0,
  status text not null default 'pending',
  snooze_until timestamptz,
  rule_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (workspace_id, source_kind, source_id)
);

create index if not exists idx_prepared_items_ws_status on public.prepared_items(workspace_id, status, score);

alter table public.prepared_items enable row level security;

create policy "prepared_items_select" on public.prepared_items for select
  using (exists (select 1 from public.workspace_members m where m.workspace_id = prepared_items.workspace_id and m.user_id = auth.uid()));
create policy "prepared_items_insert" on public.prepared_items for insert
  with check (exists (select 1 from public.workspace_members m where m.workspace_id = prepared_items.workspace_id and m.user_id = auth.uid()));
create policy "prepared_items_update" on public.prepared_items for update
  using (exists (select 1 from public.workspace_members m where m.workspace_id = prepared_items.workspace_id and m.user_id = auth.uid()));
create policy "prepared_items_delete" on public.prepared_items for delete
  using (exists (select 1 from public.workspace_members m where m.workspace_id = prepared_items.workspace_id and m.user_id = auth.uid()));
```

(Vor dem Schreiben eine bestehende Migration wie `supabase/migrations/0020_*.sql` öffnen und den dortigen Policy-Stil übernehmen, falls er abweicht — z. B. ein vorhandenes `is_member()`-Helper-Prädikat verwenden statt des exists-Subselects.) **Nicht anwenden** — Hinweis im Commit-Text, der Mensch spielt sie via Management-API ein.

- [ ] **Step 6: Tests + Typecheck**

Run: `npx vitest run src/data/prepared-items.mapper.test.ts && npm run typecheck`
Expected: 3 Tests PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/types/prepared-item.types.ts src/data/prepared-items.mapper.ts src/data/prepared-items.mapper.test.ts src/data/prepared-items.gateway.ts supabase/migrations/
git commit -m "feat(stapel): Typen, Mapper, Gateway (lokal+Cloud) + Supabase-Migration (manuell anzuwenden)"
```

---

### Task 3: Template-Lib (Mahnung, Begleitmail, Follow-up)

**Files:**
- Create: `src/lib/templates/mahnung.ts`
- Create: `src/lib/templates/mahnung.test.ts`
- Create: `src/lib/templates/followup.ts`
- Create: `src/lib/templates/followup.test.ts`

**Interfaces:**
- Produces:
  - `mahnungSubject(i: MahnungInput): string`, `mahnungBody(i: MahnungInput): string` mit `MahnungInput { customerName: string; invoiceNumber: string; base: number; fee: number; total: number; daysOverdue: number; level: number; newDeadline: string }` (newDeadline = 'YYYY-MM-DD')
  - `begleitmailBody(i: { customerName: string; invoiceNumber: string; total: number; dueDate: string }): string`
  - `followupSubject(i: { title: string }): string`, `followupBody(i: { contactName: string; title: string; daysOverdue: number }): string`
  - `fmtEur(n: number): string` (de-DE, 2 Nachkommastellen, normales Leerzeichen vor €)

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`src/lib/templates/mahnung.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mahnungSubject, mahnungBody, begleitmailBody } from './mahnung'

const BASE = { customerName: 'Meyer GmbH', invoiceNumber: 'R-100', base: 1000, fee: 0, total: 1000, daysOverdue: 14, level: 0, newDeadline: '2026-07-16' }

describe('mahnungSubject', () => {
  it('nennt Stufe, Nummer und Betrag', () => {
    expect(mahnungSubject(BASE)).toBe('Zahlungserinnerung · Rechnung R-100 · zu zahlen 1.000,00 €')
    expect(mahnungSubject({ ...BASE, level: 2 })).toContain('2. Mahnung')
  })
})

describe('mahnungBody', () => {
  it('Stufe 0 ist freundlich und nennt Frist', () => {
    const b = mahnungBody(BASE)
    expect(b).toContain('Meyer GmbH')
    expect(b).toContain('R-100')
    expect(b).toContain('16.07.2026')
    expect(b).not.toContain('Mahngebühr')
  })
  it('mit Gebuehr wird die Aufschluesselung genannt', () => {
    const b = mahnungBody({ ...BASE, fee: 5, total: 1005, level: 1 })
    expect(b).toContain('1.000,00 €')
    expect(b).toContain('5,00 €')
    expect(b).toContain('1.005,00 €')
  })
  it('Stufe 2 kuendigt weitere Schritte an', () => {
    expect(mahnungBody({ ...BASE, level: 2 })).toContain('weitere Schritte')
  })
})

describe('begleitmailBody', () => {
  it('nennt Rechnung, Betrag und Zahlungsziel', () => {
    const b = begleitmailBody({ customerName: 'Meyer GmbH', invoiceNumber: 'R-100', total: 1190, dueDate: '2026-07-16' })
    expect(b).toContain('R-100')
    expect(b).toContain('1.190,00 €')
    expect(b).toContain('16.07.2026')
  })
})
```

`src/lib/templates/followup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { followupSubject, followupBody } from './followup'

describe('followup templates', () => {
  it('Betreff traegt das Thema', () => {
    expect(followupSubject({ title: 'Angebot Website' })).toBe('Kurze Rückfrage: Angebot Website')
  })
  it('Body nennt Kontakt und Thema; ueberfaellig wird erwaehnt', () => {
    const b = followupBody({ contactName: 'Frau Meyer', title: 'Angebot Website', daysOverdue: 5 })
    expect(b).toContain('Frau Meyer')
    expect(b).toContain('Angebot Website')
    const fresh = followupBody({ contactName: 'Frau Meyer', title: 'Angebot Website', daysOverdue: 0 })
    expect(fresh).not.toContain('Tagen')
  })
})
```

- [ ] **Step 2: Tests laufen lassen — müssen scheitern**

Run: `npx vitest run src/lib/templates/`
Expected: FAIL (Module fehlen).

- [ ] **Step 3: Implementieren**

`src/lib/templates/mahnung.ts`:

```ts
/**
 * Deterministische Mahn-/Begleittexte — ersetzen den KORA-Call im Mahnwesen.
 * Mahnungen SOLLEN standardisiert klingen: rechtlich sicherer, konsistent, kostenlos.
 * Individuell wird per „Mit KORA umformulieren"-Knopf (Karte → Anpassen).
 */
export interface MahnungInput {
  customerName: string
  invoiceNumber: string
  base: number
  fee: number
  total: number
  daysOverdue: number
  level: number        // 0=Zahlungserinnerung, 1=1. Mahnung, 2=2. Mahnung
  newDeadline: string  // 'YYYY-MM-DD'
}

const LEVEL_LABEL = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
export function levelLabel(level: number): string { return LEVEL_LABEL[level] ?? '2. Mahnung' }

export function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function mahnungSubject(i: MahnungInput): string {
  return `${levelLabel(i.level)} · Rechnung ${i.invoiceNumber} · zu zahlen ${fmtEur(i.total)}`
}

export function mahnungBody(i: MahnungInput): string {
  const anrede = `Sehr geehrte Damen und Herren,`
  const betrag = i.fee > 0
    ? `Rechnungsbetrag ${fmtEur(i.base)} + Mahngebühr ${fmtEur(i.fee)} = zu zahlen ${fmtEur(i.total)}.`
    : `Der offene Betrag beläuft sich auf ${fmtEur(i.total)}.`
  const frist = `Bitte gleichen Sie den Betrag bis zum ${fmtDate(i.newDeadline)} aus.`
  const gruss = `Mit freundlichen Grüßen`

  if (i.level === 0) {
    return `${anrede}\n\nsicher ist es Ihrer Aufmerksamkeit entgangen: Die Rechnung ${i.invoiceNumber} (${i.customerName}) ist seit ${i.daysOverdue} Tagen fällig. ${betrag}\n\n${frist} Sollte sich die Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.\n\n${gruss}`
  }
  if (i.level === 1) {
    return `${anrede}\n\ntrotz unserer Zahlungserinnerung ist die Rechnung ${i.invoiceNumber} weiterhin offen (${i.daysOverdue} Tage überfällig). ${betrag}\n\n${frist}\n\n${gruss}`
  }
  return `${anrede}\n\ndie Rechnung ${i.invoiceNumber} ist trotz Erinnerung und 1. Mahnung weiterhin offen (${i.daysOverdue} Tage überfällig). ${betrag}\n\n${frist} Sollte bis dahin kein Zahlungseingang erfolgen, behalten wir uns weitere Schritte vor.\n\n${gruss}`
}

export function begleitmailBody(i: { customerName: string; invoiceNumber: string; total: number; dueDate: string }): string {
  return `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die Rechnung ${i.invoiceNumber} über ${fmtEur(i.total)}. Zahlbar bis zum ${fmtDate(i.dueDate)}.\n\nBei Fragen melden Sie sich gern.\n\nMit freundlichen Grüßen`
}
```

`src/lib/templates/followup.ts`:

```ts
/** Deterministische Follow-up-Texte für den Standardfall — KORA nur auf Klick. */
export function followupSubject(i: { title: string }): string {
  return `Kurze Rückfrage: ${i.title}`
}

export function followupBody(i: { contactName: string; title: string; daysOverdue: number }): string {
  const seit = i.daysOverdue > 0 ? ` vor ${i.daysOverdue} Tagen` : ''
  return `Hallo ${i.contactName},\n\nich wollte kurz nachfassen zu „${i.title}"${seit ? ` — wir hatten${seit} zuletzt dazu gesprochen` : ''}. Gibt es dazu schon Neuigkeiten von Ihrer Seite?\n\nIch freue mich auf Ihre Rückmeldung.\n\nViele Grüße`
}
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/lib/templates/ && npm run typecheck`
Expected: alle PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/templates/
git commit -m "feat(stapel): Template-Lib fuer Mahnung/Begleitmail/Follow-up — deterministisch statt KI"
```

---

### Task 4: Mahnwesen auf Templates umstellen + Body-Override

**Files:**
- Modify: `src/services/dunning.service.ts` (prepareReminder: Template statt `generateCorraDraft`; neuer Parameter)
- Modify: `src/services/dunning.service.test.ts` (Template-Fälle)

**Interfaces:**
- Produces: `prepareReminder(invoice, level, opts?: { bodyOverride?: string })` und `sendReminder(invoice, level, opts?: { bodyOverride?: string })` — Signaturen sonst unverändert. `generateCorraDraft` wird aus diesem Modul komplett entfernt.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/services/dunning.service.test.ts` ergänzen (bestehende Mocks der Datei nutzen; der `@/lib/ai/corra`-Mock kann bleiben, darf aber nicht mehr aufgerufen werden):

```ts
describe('prepareReminder: Template statt KI', () => {
  it('nutzt den deterministischen Mahntext und ruft KORA nicht auf', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { generateCorraDraft } = await import('@/lib/ai/corra')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { FinanceGateway } = await import('@/data/finance.gateway')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer GmbH', email: 'info@meyer.de' }] } as never)
    vi.mocked(FinanceGateway.getInvoice).mockRejectedValueOnce(new Error('kein PDF im Test'))
    vi.mocked(generateCorraDraft).mockClear()

    const invoice = { id: 'inv1', accountId: 'acc1', number: 'R-100', dueDate: '2026-06-01', total: 1000, status: 'overdue' } as never
    await prepareReminder(invoice, 0)
    expect(vi.mocked(generateCorraDraft)).not.toHaveBeenCalled()
  })

  it('bodyOverride ersetzt den Template-Text', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    // Kein account → PDF-Block wird übersprungen, Vorbereitung gelingt ohne Gateway.
    useAccountsStore.setState({ accounts: [] } as never)
    const { ContactsGateway } = await import('@/data/contacts.gateway')
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValueOnce([{ email: 'x@y.de' }] as never)

    const invoice = { id: 'inv2', accountId: 'accX', number: 'R-200', dueDate: '2026-06-01', total: 500, status: 'overdue' } as never
    const result = await prepareReminder(invoice, 0, { bodyOverride: 'MEIN EIGENER TEXT' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.body).toBe('MEIN EIGENER TEXT')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/services/dunning.service.test.ts`
Expected: neue Fälle FAIL (KORA wird noch gerufen; kein opts-Parameter).

- [ ] **Step 3: Umstellen**

In `src/services/dunning.service.ts`:
1. Import `generateCorraDraft` entfernen; stattdessen `import { mahnungBody, mahnungSubject } from '@/lib/templates/mahnung'`.
2. Signaturen erweitern: `export async function prepareReminder(invoice: Invoice, level: number, opts?: { bodyOverride?: string })` und `export async function sendReminder(invoice: Invoice, level: number, opts?: { bodyOverride?: string })` (sendReminder reicht `opts` an prepareReminder durch: `const prep = await prepareReminder(invoice, level, opts)`).
3. Den `const body = await generateCorraDraft({...}).catch(...)`-Block ersetzen durch:

```ts
    const newDeadline = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const templateInput = {
      customerName, invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
      base: bd.base, fee: bd.fee, total: bd.total,
      daysOverdue: days, level, newDeadline,
    }
    const body = opts?.bodyOverride ?? mahnungBody(templateInput)
```

4. Die Betreffzeile im Rückgabeobjekt auf das Template umstellen: `subject: mahnungSubject(templateInput),` (ersetzt den bisherigen Template-String — Format ist identisch, nur zentralisiert). Der lokale `fmtEur`/`LEVEL_LABEL`-Code in dunning.service bleibt, wo er noch anderweitig genutzt wird (`levelLabel` für Todo-Titel/Dateinamen); ist `fmtEur` danach ungenutzt, entfernen (`npm run typecheck`/eslint zeigt es).

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/services/dunning.service.test.ts && npm run typecheck`
Expected: ALLE Fälle PASS (auch Bestand), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/dunning.service.ts src/services/dunning.service.test.ts
git commit -m "feat(stapel): Mahntexte aus Templates statt KORA; bodyOverride fuer Karten-Entwuerfe"
```

---

### Task 5: Generator — pure Karten-Erzeugung + Scoring + Reconcile

**Files:**
- Create: `src/lib/stapel/generate.ts`
- Create: `src/lib/stapel/generate.test.ts`

**Interfaces:**
- Consumes: `dueReminders`, `reminderBreakdown` aus `@/services/dunning.service` (pure); Templates aus Task 3; Typen aus Task 2.
- Produces:

```ts
export interface GenerateInput {
  workspaceId: string
  invoices: Invoice[]
  todos: Todo[]
  followUps: FollowUp[]
  accounts: { id: string; name: string }[]
  leads: { id: string; name: string }[]
  payments: Payment[]
  fees: number[]
  suppressedRuleIds: string[]
  todayIso: string
}
export function generateCardDrafts(input: GenerateInput): CreatePreparedItem[]
export function reconcileResolvedIds(active: PreparedItem[], input: GenerateInput): string[]
```

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`src/lib/stapel/generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateCardDrafts, reconcileResolvedIds } from './generate'
import type { GenerateInput } from './generate'
import type { PreparedItem } from '@/types/prepared-item.types'

const baseInput = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  workspaceId: 'ws1', invoices: [], todos: [], followUps: [],
  accounts: [{ id: 'acc1', name: 'Meyer GmbH' }], leads: [], payments: [],
  fees: [0, 5, 10], suppressedRuleIds: [], todayIso: '2026-07-02', ...over,
})

const overdueInvoice = {
  id: 'inv1', workspaceId: 'ws1', accountId: 'acc1', number: 'R-100',
  date: '2026-06-01', dueDate: '2026-06-15', status: 'overdue',
  total: 1190, subtotal: 1000, taxAmount: 190, taxMode: 'standard',
  bankInfo: '', isSuggestion: false, pendingSync: false, createdBy: 'u1',
  createdAt: '', updatedAt: '',
} as never

describe('generateCardDrafts', () => {
  it('ueberfaellige Rechnung → Mahnungs-Karte mit Template-Entwurf und Stufe im sourceId', () => {
    const cards = generateCardDrafts(baseInput({ invoices: [overdueInvoice] }))
    const m = cards.find(c => c.type === 'mahnung')
    expect(m).toBeDefined()
    expect(m!.sourceKind).toBe('invoice_reminder')
    expect(m!.sourceId).toBe('inv1:0')
    expect(m!.ruleId).toBe('mahnung-l0')
    expect(m!.payload.level).toBe(0)
    expect(m!.payload.draftBody).toContain('R-100')
    expect(m!.payload.why).toContain('Tage')
  })

  it('faelliges Follow-up → Karte; unterdrueckte ruleIds werden uebersprungen', () => {
    const fu = { id: 'fu1', customerId: 'acc1', title: 'Angebot nachfassen', dueDate: '2026-07-01', status: 'offen', priority: 'normal', createdAt: '' } as never
    expect(generateCardDrafts(baseInput({ followUps: [fu] })).some(c => c.type === 'followup')).toBe(true)
    expect(generateCardDrafts(baseInput({ followUps: [fu], suppressedRuleIds: ['followup-due'] })).some(c => c.type === 'followup')).toBe(false)
  })

  it('Suggestion-Rechnung → Rechnungsentwurf-Karte; normale Drafts NICHT', () => {
    const suggestion = { ...(overdueInvoice as object), id: 'inv2', status: 'draft', isSuggestion: true, dueDate: '2026-08-01' } as never
    const plainDraft = { ...(overdueInvoice as object), id: 'inv3', status: 'draft', isSuggestion: false, dueDate: '2026-08-01' } as never
    const cards = generateCardDrafts(baseInput({ invoices: [suggestion, plainDraft] }))
    expect(cards.filter(c => c.type === 'rechnungsentwurf').map(c => c.sourceId)).toEqual(['inv2'])
  })

  it('heute faelliges Todo → Aufgabe-Karte; Mahnungen scoren hoeher als Aufgaben', () => {
    const todo = { id: 't1', title: 'Anrufen', status: 'open', priority: 'p2', bucket: 'today', checklist: [], tags: [], createdAt: '', updatedAt: '' } as never
    const cards = generateCardDrafts(baseInput({ invoices: [overdueInvoice], todos: [todo] }))
    const m = cards.find(c => c.type === 'mahnung')!
    const a = cards.find(c => c.type === 'aufgabe')!
    expect(a.sourceId).toBe('t1')
    expect(m.score).toBeGreaterThan(a.score)
  })
})

describe('reconcileResolvedIds', () => {
  const card = (over: Partial<PreparedItem>): PreparedItem => ({
    id: 'p1', workspaceId: 'ws1', type: 'mahnung', sourceKind: 'invoice_reminder',
    sourceId: 'inv1:0', assignee: null, payload: { title: '', why: '' }, score: 0,
    status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
    createdAt: '', updatedAt: '', approvedAt: null, ...over,
  })

  it('bezahlte Rechnung loest die Mahnungs-Karte auf', () => {
    const paid = { ...(overdueInvoice as object), status: 'paid' } as never
    expect(reconcileResolvedIds([card({})], baseInput({ invoices: [paid] }))).toEqual(['p1'])
  })

  it('offene Quelle bleibt bestehen', () => {
    expect(reconcileResolvedIds([card({})], baseInput({ invoices: [overdueInvoice] }))).toEqual([])
  })

  it('erledigtes Follow-up und erledigtes Todo loesen ihre Karten auf', () => {
    const fuCard = card({ id: 'p2', type: 'followup', sourceKind: 'crm_follow_up', sourceId: 'fu1' })
    const todoCard = card({ id: 'p3', type: 'aufgabe', sourceKind: 'todo', sourceId: 't1' })
    const input = baseInput({
      followUps: [{ id: 'fu1', customerId: 'acc1', title: 'x', dueDate: '2026-07-01', status: 'erledigt', priority: 'normal', createdAt: '' } as never],
      todos: [{ id: 't1', title: 'x', status: 'done', priority: 'p2', bucket: 'done', checklist: [], tags: [], createdAt: '', updatedAt: '' } as never],
    })
    expect(reconcileResolvedIds([fuCard, todoCard], input).sort()).toEqual(['p2', 'p3'])
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/lib/stapel/generate.test.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

`src/lib/stapel/generate.ts`:

```ts
/**
 * Deterministische Karten-Generierung für den Stapel — pure Funktionen, kein Store,
 * kein KI-Call. Scoring: Geld > Beziehung > Rechnungsentwurf > Aufgabe (Spec §6).
 */
import type { Invoice, Payment } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { FollowUp } from '@/types/crm.types'
import type { CreatePreparedItem, PreparedItem } from '@/types/prepared-item.types'
import { dueReminders, reminderBreakdown } from '@/services/dunning.service'
import { mahnungBody, mahnungSubject, fmtEur, levelLabel } from '@/lib/templates/mahnung'
import { followupBody, followupSubject } from '@/lib/templates/followup'
import { isTodoForToday } from '@/lib/heute/due'

export interface GenerateInput {
  workspaceId: string
  invoices: Invoice[]
  todos: Todo[]
  followUps: FollowUp[]
  accounts: { id: string; name: string }[]
  leads: { id: string; name: string }[]
  payments: Payment[]
  fees: number[]
  suppressedRuleIds: string[]
  todayIso: string
}

function nameOf(input: GenerateInput, id: string): string {
  return input.leads.find(l => l.id === id)?.name
    ?? input.accounts.find(a => a.id === id)?.name ?? 'Kontakt'
}

function daysSince(dateIso: string, todayIso: string): number {
  const ms = new Date(todayIso + 'T12:00:00').getTime() - new Date(dateIso.slice(0, 10) + 'T12:00:00').getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export function generateCardDrafts(input: GenerateInput): CreatePreparedItem[] {
  const cards: CreatePreparedItem[] = []
  const suppressed = new Set(input.suppressedRuleIds)

  // 1) MAHNUNGEN — bestehende Erkennung (Stufen, Cooldowns) wiederverwenden.
  for (const r of dueReminders(input.invoices, input.todos, input.accounts, input.fees, input.payments)) {
    const ruleId = `mahnung-l${r.level}`
    if (suppressed.has(ruleId)) continue
    const bd = reminderBreakdown(r.invoice, input.payments, input.todos, r.level, input.fees)
    const newDeadline = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const t = {
      customerName: r.customerName,
      invoiceNumber: r.invoice.number ?? r.invoice.id.slice(0, 8),
      base: bd.base, fee: bd.fee, total: bd.total,
      daysOverdue: r.daysOverdue, level: r.level, newDeadline,
    }
    cards.push({
      workspaceId: input.workspaceId, type: 'mahnung',
      sourceKind: 'invoice_reminder', sourceId: `${r.invoice.id}:${r.level}`,
      ruleId,
      payload: {
        title: `${levelLabel(r.level)} an ${r.customerName} — ${fmtEur(bd.total)}`,
        why: `${levelLabel(r.level)}, weil Rechnung ${t.invoiceNumber} seit ${r.daysOverdue} Tagen ohne Zahlung ist.`,
        customerName: r.customerName, invoiceNumber: t.invoiceNumber,
        amount: bd.total, level: r.level,
        draftSubject: mahnungSubject(t), draftBody: mahnungBody(t),
      },
      // Geld-Band 1000+: Betrag und Alter treiben nach oben, gedeckelt gegen Ausreißer.
      score: 1000 + Math.min(r.daysOverdue, 60) * 2 + Math.min(bd.total / 100, 500),
    })
  }

  // 2) FOLLOW-UPS — fällige offene CRM-Follow-ups.
  if (!suppressed.has('followup-due')) {
    for (const f of input.followUps) {
      if (f.status !== 'offen' || !f.dueDate || f.dueDate.slice(0, 10) > input.todayIso) continue
      const contact = nameOf(input, f.customerId)
      const days = daysSince(f.dueDate, input.todayIso)
      cards.push({
        workspaceId: input.workspaceId, type: 'followup',
        sourceKind: 'crm_follow_up', sourceId: f.id, ruleId: 'followup-due',
        payload: {
          title: `Follow-up: ${contact}`,
          why: days > 0 ? `„${f.title}" ist seit ${days} Tagen fällig.` : `„${f.title}" ist heute fällig.`,
          customerName: contact,
          draftSubject: followupSubject({ title: f.title }),
          draftBody: followupBody({ contactName: contact, title: f.title, daysOverdue: days }),
        },
        score: 800 + Math.min(days, 60),
      })
    }
  }

  // 3) RECHNUNGSENTWÜRFE — Suggestions (Deals, Verträge ab Task 12). Normale Drafts NICHT.
  if (!suppressed.has('rechnung-vorschlag')) {
    for (const inv of input.invoices) {
      if (!inv.isSuggestion) continue
      const customer = nameOf(input, inv.accountId)
      cards.push({
        workspaceId: input.workspaceId, type: 'rechnungsentwurf',
        sourceKind: 'invoice_suggestion', sourceId: inv.id, ruleId: 'rechnung-vorschlag',
        payload: {
          title: `Rechnungsentwurf ${fmtEur(inv.total)} an ${customer}`,
          why: 'Automatisch vorbereitet — Freigeben vergibt die Rechnungsnummer.',
          customerName: customer, amount: inv.total,
        },
        score: 600 + Math.min(inv.total / 100, 200),
      })
    }
  }

  // 4) AUFGABEN — heute fällige offene Todos (ohne interne send_reminder-Protokolle).
  if (!suppressed.has('aufgabe-heute')) {
    const prio: Record<string, number> = { p1: 30, p2: 20, p3: 10, p4: 0 }
    for (const t of input.todos) {
      if (t.status === 'done' || t.actionType === 'send_reminder') continue
      if (!isTodoForToday(t, input.todayIso)) continue
      cards.push({
        workspaceId: input.workspaceId, type: 'aufgabe',
        sourceKind: 'todo', sourceId: t.id, ruleId: 'aufgabe-heute',
        assignee: t.assignee ?? null,
        payload: { title: t.title, why: `Heute fällig — Priorität ${t.priority.toUpperCase()}.` },
        score: 400 + (prio[t.priority] ?? 0),
      })
    }
  }

  return cards
}

/**
 * Aktive Karten, deren Quelle sich erledigt hat (Rechnung bezahlt, Follow-up erledigt …),
 * werden still geschlossen. Rückgabe: IDs, die auf 'approved' gesetzt werden können
 * (Erledigung außerhalb des Stapels zählt nicht als Verwerfen).
 */
export function reconcileResolvedIds(active: PreparedItem[], input: GenerateInput): string[] {
  const resolved: string[] = []
  for (const item of active) {
    if (item.sourceKind === 'invoice_reminder') {
      const invoiceId = item.sourceId.split(':')[0]
      const inv = input.invoices.find(i => i.id === invoiceId)
      if (!inv || inv.status === 'paid' || inv.status === 'cancelled') resolved.push(item.id)
      // Stufe weitergezählt (neue Karte existiert): alte Stufen-Karte schließen.
      else if (input.todos.some(t => t.sourceRef === invoiceId && t.actionType === 'send_reminder' && t.status === 'done'
        && (item.payload.level ?? 0) < input.todos.filter(x => x.sourceRef === invoiceId && x.actionType === 'send_reminder' && x.status === 'done').length)) {
        resolved.push(item.id)
      }
    } else if (item.sourceKind === 'crm_follow_up') {
      const fu = input.followUps.find(f => f.id === item.sourceId)
      if (!fu || fu.status === 'erledigt') resolved.push(item.id)
    } else if (item.sourceKind === 'invoice_suggestion') {
      const inv = input.invoices.find(i => i.id === item.sourceId)
      if (!inv || !inv.isSuggestion) resolved.push(item.id)
    } else if (item.sourceKind === 'todo') {
      const t = input.todos.find(x => x.id === item.sourceId)
      if (!t || t.status === 'done') resolved.push(item.id)
    }
  }
  return resolved
}
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/lib/stapel/generate.test.ts && npm run typecheck`
Expected: alle PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stapel/
git commit -m "feat(stapel): deterministische Karten-Generierung, Scoring und Reconcile (pure, getestet)"
```

---

### Task 6: Stapel-Store + Preparation-Service + Tick-Hook

**Files:**
- Create: `src/store/prepared-items.store.ts`
- Create: `src/store/prepared-items.store.test.ts`
- Create: `src/services/preparation.service.ts`
- Create: `src/hooks/usePreparationTick.ts`
- Modify: `src/App.tsx` (Hook mounten, unter `usePresenceBridge()`)

**Interfaces:**
- Consumes: Gateway (Task 2), Generator (Task 5), `useStapelSettingsStore` kommt erst in Task 10 — bis dahin `suppressedRuleIds: []` hart.
- Produces:
  - `usePreparedItemsStore`: `items: PreparedItem[]` (aktive), `loading: boolean`, `load(workspaceId)`, `applyStatus(id, status, opts?)` (optimistisch + Gateway), `applyPayload(id, payload)`, `applyAssignee(id, assignee)`, `weekApproved: PreparedItem[]`, `loadWeekApproved(workspaceId)`
  - `runPreparation(workspaceId): Promise<void>` (Service: generate → insertIgnore je Karte → reconcile → Store neu laden)

- [ ] **Step 1: Fehlschlagenden Store-Test schreiben**

`src/store/prepared-items.store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/prepared-items.gateway', () => ({
  PreparedItemsGateway: {
    listActive: vi.fn().mockResolvedValue([]),
    insertIgnore: vi.fn().mockResolvedValue(true),
    updateStatus: vi.fn(),
    updatePayload: vi.fn(),
    setAssignee: vi.fn(),
    approvedSince: vi.fn().mockResolvedValue([]),
  },
}))

import { usePreparedItemsStore } from './prepared-items.store'
import { PreparedItemsGateway } from '@/data/prepared-items.gateway'

const item = {
  id: 'p1', workspaceId: 'ws1', type: 'mahnung', sourceKind: 'invoice_reminder',
  sourceId: 'inv1:0', assignee: null, payload: { title: 'T', why: 'W' }, score: 1000,
  status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
  createdAt: '', updatedAt: '', approvedAt: null,
} as never

describe('usePreparedItemsStore', () => {
  beforeEach(() => {
    usePreparedItemsStore.setState({ items: [], loading: false, weekApproved: [] })
    vi.clearAllMocks()
  })

  it('load fuellt items', async () => {
    vi.mocked(PreparedItemsGateway.listActive).mockResolvedValueOnce([item])
    await usePreparedItemsStore.getState().load('ws1')
    expect(usePreparedItemsStore.getState().items).toHaveLength(1)
  })

  it('applyStatus entfernt die Karte optimistisch und ruft das Gateway', async () => {
    usePreparedItemsStore.setState({ items: [item] })
    vi.mocked(PreparedItemsGateway.updateStatus).mockResolvedValueOnce({ ...item, status: 'dismissed' })
    await usePreparedItemsStore.getState().applyStatus('p1', 'dismissed')
    expect(usePreparedItemsStore.getState().items).toHaveLength(0)
    expect(PreparedItemsGateway.updateStatus).toHaveBeenCalledWith('p1', 'dismissed', undefined)
  })

  it('Gateway-Fehler bei applyStatus stellt die Karte wieder her + Fehler-Toast', async () => {
    usePreparedItemsStore.setState({ items: [item] })
    vi.mocked(PreparedItemsGateway.updateStatus).mockRejectedValueOnce(new Error('offline'))
    await usePreparedItemsStore.getState().applyStatus('p1', 'dismissed')
    expect(usePreparedItemsStore.getState().items).toHaveLength(1)
    const { useToastStore } = await import('@/store/toast.store')
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/store/prepared-items.store.test.ts`
Expected: FAIL (Store fehlt).

- [ ] **Step 3: Store implementieren**

`src/store/prepared-items.store.ts`:

```ts
import { create } from 'zustand'
import { PreparedItemsGateway } from '@/data/prepared-items.gateway'
import { toastError } from '@/store/toast.store'
import { log } from '@/lib/logger'
import type { PreparedItem, PreparedItemPayload, PreparedItemStatus } from '@/types/prepared-item.types'

interface PreparedItemsState {
  items: PreparedItem[]
  weekApproved: PreparedItem[]
  loading: boolean
  load: (workspaceId: string) => Promise<void>
  loadWeekApproved: (workspaceId: string) => Promise<void>
  applyStatus: (id: string, status: PreparedItemStatus, opts?: { snoozeUntil?: string | null; approvedAt?: string | null }) => Promise<void>
  applyPayload: (id: string, payload: PreparedItemPayload) => Promise<void>
  applyAssignee: (id: string, assignee: string | null) => Promise<void>
}

function startOfWeekIso(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const usePreparedItemsStore = create<PreparedItemsState>()((set, get) => ({
  items: [],
  weekApproved: [],
  loading: false,

  load: async (workspaceId) => {
    set({ loading: true })
    try {
      const items = await PreparedItemsGateway.listActive(workspaceId)
      set({ items, loading: false })
    } catch (err) {
      log.error('prepared items load failed', { err })
      set({ loading: false })
    }
  },

  loadWeekApproved: async (workspaceId) => {
    try {
      set({ weekApproved: await PreparedItemsGateway.approvedSince(workspaceId, startOfWeekIso()) })
    } catch (err) {
      log.warn('weekApproved load failed', { err })
    }
  },

  // Optimistisch: Karte verschwindet sofort; bei Gateway-Fehler zurückrollen + Toast
  // (Vertrauens-Schicht: kein stilles Scheitern).
  applyStatus: async (id, status, opts) => {
    const prev = get().items
    set(s => ({ items: s.items.filter(i => i.id !== id) }))
    try {
      await PreparedItemsGateway.updateStatus(id, status, opts)
    } catch (err) {
      log.error('applyStatus failed', { id, status, err })
      set({ items: prev })
      toastError('Aktion konnte nicht gespeichert werden — Karte bleibt im Stapel.')
    }
  },

  applyPayload: async (id, payload) => {
    const prev = get().items
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, payload } : i) }))
    try {
      await PreparedItemsGateway.updatePayload(id, payload)
    } catch (err) {
      log.error('applyPayload failed', { id, err })
      set({ items: prev })
      toastError('Entwurf konnte nicht gespeichert werden.')
    }
  },

  applyAssignee: async (id, assignee) => {
    const prev = get().items
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, assignee } : i) }))
    try {
      await PreparedItemsGateway.setAssignee(id, assignee)
    } catch (err) {
      log.error('applyAssignee failed', { id, err })
      set({ items: prev })
      toastError('Übergabe konnte nicht gespeichert werden.')
    }
  },
}))
```

- [ ] **Step 4: Preparation-Service + Tick-Hook**

`src/services/preparation.service.ts`:

```ts
/**
 * Orchestriert die Vorbereitung: Quellen einsammeln → Karten generieren (pure) →
 * idempotent persistieren → aufgelöste Quellen schließen → Store aktualisieren.
 * Läuft beim Start und stündlich (usePreparationTick). 100 % deterministisch.
 */
import { PreparedItemsGateway } from '@/data/prepared-items.gateway'
import { generateCardDrafts, reconcileResolvedIds, type GenerateInput } from '@/lib/stapel/generate'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCompanyStore } from '@/store/company.store'
import { DEFAULT_DUNNING_FEES } from '@/services/dunning.service'
import { log } from '@/lib/logger'

let running = false

export async function runPreparation(workspaceId: string, suppressedRuleIds: string[] = []): Promise<void> {
  if (running) return
  running = true
  try {
    const input: GenerateInput = {
      workspaceId,
      invoices: useFinanceStore.getState().invoices,
      todos: useTodosStore.getState().allTodos,
      followUps: useCrmStore.getState().allFollowUps,
      accounts: useAccountsStore.getState().accounts.map(a => ({ id: a.id, name: a.name })),
      leads: useLeadsStore.getState().leads.map(l => ({ id: l.id, name: l.name })),
      payments: useFinanceStore.getState().payments,
      fees: useCompanyStore.getState().profile.dunningFees ?? DEFAULT_DUNNING_FEES,
      suppressedRuleIds,
      todayIso: new Date().toLocaleDateString('sv'),
    }

    for (const card of generateCardDrafts(input)) {
      await PreparedItemsGateway.insertIgnore(card)
    }

    const active = await PreparedItemsGateway.listActive(workspaceId)
    for (const id of reconcileResolvedIds(active, input)) {
      // Erledigung außerhalb des Stapels ist kein Verwerfen → approved ohne Versand.
      await PreparedItemsGateway.updateStatus(id, 'approved', { approvedAt: new Date().toISOString() })
    }

    await usePreparedItemsStore.getState().load(workspaceId)
  } catch (err) {
    log.warn('runPreparation failed', { err })
  } finally {
    running = false
  }
}
```

`src/hooks/usePreparationTick.ts`:

```ts
import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { runPreparation } from '@/services/preparation.service'

const TICK_MS = 60 * 60_000   // stündlich; zusätzlich beim Start + Workspace-Wechsel
const START_DELAY_MS = 15_000 // Stores erst hydrieren lassen (vgl. Briefing-Hydration-Guard)

export function usePreparationTick() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  useEffect(() => {
    if (!workspaceId) return
    const start = setTimeout(() => void runPreparation(workspaceId), START_DELAY_MS)
    const id = setInterval(() => void runPreparation(workspaceId), TICK_MS)
    return () => { clearTimeout(start); clearInterval(id) }
  }, [workspaceId])
}
```

`src/App.tsx`: Import + Mount direkt unter `usePresenceBridge()`:

```tsx
  usePreparationTick()
```

- [ ] **Step 5: Tests + Typecheck**

Run: `npx vitest run src/store/prepared-items.store.test.ts && npm run typecheck`
Expected: 3 Tests PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/store/prepared-items.store.ts src/store/prepared-items.store.test.ts src/services/preparation.service.ts src/hooks/usePreparationTick.ts src/App.tsx
git commit -m "feat(stapel): Store, Preparation-Service (generate+reconcile) und Stunden-Tick"
```

---

### Task 7: Freigabe-Aktionen pro Kartentyp

**Files:**
- Create: `src/services/stapel-actions.service.ts`
- Create: `src/services/stapel-actions.service.test.ts`

**Interfaces:**
- Consumes: `sendReminder(invoice, level, { bodyOverride })` (Task 4), `useFinanceStore.approveInvoiceSuggestion`, `useCrmStore.upsert`, `useTodosStore.upsert`, `MailService.sendEmail`, `ActivitiesGateway.create`.
- Produces: `approvePreparedItem(item: PreparedItem): Promise<{ ok: boolean; error?: string }>` — führt die typspezifische Aktion aus; der Aufrufer (Store/UI) setzt danach den Kartenstatus.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`src/services/stapel-actions.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/dunning.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/dunning.service')>()
  return { ...mod, sendReminder: vi.fn() }
})
vi.mock('@/services/mail.service', () => ({ MailService: { sendEmail: vi.fn() } }))
vi.mock('@/data/activities.gateway', () => ({ ActivitiesGateway: { create: vi.fn().mockResolvedValue({}) } }))

import { approvePreparedItem } from './stapel-actions.service'
import { sendReminder } from '@/services/dunning.service'
import { MailService } from '@/services/mail.service'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'

const base = {
  id: 'p1', workspaceId: 'ws1', assignee: null, score: 0, status: 'pending',
  snoozeUntil: null, ruleId: '', createdAt: '', updatedAt: '', approvedAt: null,
} as const

describe('approvePreparedItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mahnung: ruft sendReminder mit Karten-Entwurf als bodyOverride', async () => {
    useFinanceStore.setState({ invoices: [{ id: 'inv1', accountId: 'a', total: 100, dueDate: '2026-06-01', status: 'overdue' }] } as never)
    vi.mocked(sendReminder).mockResolvedValueOnce({ invoiceId: 'inv1', ok: true })
    const r = await approvePreparedItem({
      ...base, type: 'mahnung', sourceKind: 'invoice_reminder', sourceId: 'inv1:1',
      payload: { title: '', why: '', level: 1, draftBody: 'ENTWURF' },
    } as never)
    expect(r.ok).toBe(true)
    expect(sendReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv1' }), 1, { bodyOverride: 'ENTWURF' })
  })

  it('mahnung: fehlende Rechnung → verstaendlicher Fehler', async () => {
    useFinanceStore.setState({ invoices: [] } as never)
    const r = await approvePreparedItem({
      ...base, type: 'mahnung', sourceKind: 'invoice_reminder', sourceId: 'nix:0',
      payload: { title: '', why: '', level: 0 },
    } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Rechnung')
  })

  it('followup: sendet Mail an Kontakt und markiert das Follow-up erledigt', async () => {
    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer', email: 'info@meyer.de' }] } as never)
    const crmUpsert = vi.fn().mockResolvedValue(undefined)
    useCrmStore.setState({
      allFollowUps: [{ id: 'fu1', customerId: 'acc1', title: 'Nachfassen', dueDate: '2026-07-01', status: 'offen', priority: 'normal', createdAt: '' }],
      upsert: crmUpsert,
    } as never)
    const r = await approvePreparedItem({
      ...base, type: 'followup', sourceKind: 'crm_follow_up', sourceId: 'fu1',
      payload: { title: '', why: '', draftSubject: 'S', draftBody: 'B' },
    } as never)
    expect(r.ok).toBe(true)
    expect(MailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['info@meyer.de'], subject: 'S', bodyText: 'B' }))
    expect(crmUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'fu1', status: 'erledigt' }))
  })

  it('followup ohne E-Mail-Adresse → Fehler statt stiller Versand', async () => {
    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer', email: undefined }] } as never)
    useCrmStore.setState({
      allFollowUps: [{ id: 'fu1', customerId: 'acc1', title: 'x', dueDate: '2026-07-01', status: 'offen', priority: 'normal', createdAt: '' }],
    } as never)
    const r = await approvePreparedItem({
      ...base, type: 'followup', sourceKind: 'crm_follow_up', sourceId: 'fu1',
      payload: { title: '', why: '', draftSubject: 'S', draftBody: 'B' },
    } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('E-Mail')
  })

  it('aufgabe: hakt das Todo ab', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined)
    useTodosStore.setState({
      allTodos: [{ id: 't1', title: 'Anrufen', status: 'open', priority: 'p2', bucket: 'today', checklist: [], tags: [], createdAt: '', updatedAt: '' }],
      upsert,
    } as never)
    const r = await approvePreparedItem({
      ...base, type: 'aufgabe', sourceKind: 'todo', sourceId: 't1',
      payload: { title: 'Anrufen', why: '' },
    } as never)
    expect(r.ok).toBe(true)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', status: 'done', bucket: 'done' }))
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/services/stapel-actions.service.test.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

`src/services/stapel-actions.service.ts`:

```ts
/**
 * Freigabe-Aktionen des Stapels — pro Kartentyp genau eine Wirkung (Spec §6).
 * Wirft nie: Result-Objekt, verständliche deutsche Fehler.
 */
import type { PreparedItem } from '@/types/prepared-item.types'
import { sendReminder } from '@/services/dunning.service'
import { MailService } from '@/services/mail.service'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useAuthStore } from '@/store/auth.store'
import { log } from '@/lib/logger'

export interface ApproveResult { ok: boolean; error?: string }

export async function approvePreparedItem(item: PreparedItem): Promise<ApproveResult> {
  try {
    switch (item.type) {
      case 'mahnung': return await approveMahnung(item)
      case 'followup': return await approveFollowup(item)
      case 'rechnungsentwurf': return await approveRechnungsentwurf(item)
      case 'aufgabe': return await approveAufgabe(item)
      default: return { ok: false, error: 'Unbekannter Kartentyp.' }
    }
  } catch (err) {
    log.error('approvePreparedItem failed', { id: item.id, type: item.type, err })
    return { ok: false, error: 'Freigabe fehlgeschlagen — bitte erneut versuchen.' }
  }
}

async function approveMahnung(item: PreparedItem): Promise<ApproveResult> {
  const invoiceId = item.sourceId.split(':')[0]
  const invoice = useFinanceStore.getState().invoices.find(i => i.id === invoiceId)
  if (!invoice) return { ok: false, error: 'Rechnung nicht mehr vorhanden — Karte wird beim nächsten Abgleich geschlossen.' }
  const level = item.payload.level ?? 0
  const result = await sendReminder(invoice, level, item.payload.draftBody ? { bodyOverride: item.payload.draftBody } : undefined)
  if (!result.ok) return { ok: false, error: result.error ?? 'Versand fehlgeschlagen.' }
  return { ok: true }
}

async function approveFollowup(item: PreparedItem): Promise<ApproveResult> {
  const fu = useCrmStore.getState().allFollowUps.find(f => f.id === item.sourceId)
  if (!fu) return { ok: false, error: 'Follow-up nicht mehr vorhanden.' }
  const mailAccount = useMailStore.getState().accounts[0]
  if (!mailAccount) return { ok: false, error: 'Kein E-Mail-Konto konfiguriert.' }
  const lead = useLeadsStore.getState().leads.find(l => l.id === fu.customerId)
  const account = useAccountsStore.getState().accounts.find(a => a.id === fu.customerId)
  const email = (lead as { email?: string } | undefined)?.email ?? account?.email
  if (!email) return { ok: false, error: 'Keine E-Mail-Adresse für diesen Kontakt — bitte anpassen oder verwerfen.' }

  await MailService.sendEmail({
    accountId: mailAccount.id,
    to: [email],
    subject: item.payload.draftSubject ?? `Kurze Rückfrage: ${fu.title}`,
    bodyText: item.payload.draftBody ?? '',
  })
  await useCrmStore.getState().upsert({
    id: fu.id, customerId: fu.customerId, title: fu.title,
    dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority,
  })
  // Protokollbuch (Spec §10.4): nachlesbar am Kunden.
  try {
    await ActivitiesGateway.create({
      workspaceId: item.workspaceId,
      createdBy: useAuthStore.getState().user?.id ?? '',
      accountId: fu.customerId,
      type: 'note',
      title: `Follow-up versendet: ${fu.title}`,
      body: `Per E-Mail an ${email}.`,
    })
  } catch (protoErr) {
    log.warn('followup protocol activity failed', { id: item.id, protoErr })
  }
  return { ok: true }
}

async function approveRechnungsentwurf(item: PreparedItem): Promise<ApproveResult> {
  const inv = useFinanceStore.getState().invoices.find(i => i.id === item.sourceId)
  if (!inv || !inv.isSuggestion) return { ok: false, error: 'Rechnungsvorschlag nicht mehr vorhanden.' }
  await useFinanceStore.getState().approveInvoiceSuggestion(
    inv.id, useAuthStore.getState().user?.id ?? '', item.workspaceId,
  )
  return { ok: true }
}

async function approveAufgabe(item: PreparedItem): Promise<ApproveResult> {
  const t = useTodosStore.getState().allTodos.find(x => x.id === item.sourceId)
  if (!t) return { ok: false, error: 'Aufgabe nicht mehr vorhanden.' }
  await useTodosStore.getState().upsert({
    id: t.id, title: t.title, status: 'done', bucket: 'done',
  })
  return { ok: true }
}
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/services/stapel-actions.service.test.ts && npm run typecheck`
Expected: 5 Tests PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/stapel-actions.service.ts src/services/stapel-actions.service.test.ts
git commit -m "feat(stapel): Freigabe-Aktionen pro Kartentyp — Mahnung, Follow-up, Rechnungsentwurf, Aufgabe"
```

---

### Task 8: UI — StapelCard (Anatomie + 4 Aktionen + Anpassen-Editor + KORA-Knopf)

**Files:**
- Create: `src/components/stapel/StapelCard.tsx`
- Create: `src/components/stapel/StapelCard.test.tsx`

**Interfaces:**
- Consumes: `generateCorraDraft` (`@/lib/ai/corra`, nur im Umformulieren-Knopf), Typen aus Task 2.
- Produces:

```ts
interface StapelCardProps {
  item: PreparedItem
  focused: boolean            // große Fokus-Karte vs. kompakte Listenzeile
  onApprove: () => void       // Container führt approve aus (busy-Handling dort)
  onSaveDraft: (payload: PreparedItemPayload) => void
  onSnooze: (days: number) => void
  onDismiss: () => void
  busy?: boolean
}
```

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/components/stapel/StapelCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StapelCard } from './StapelCard'

vi.mock('@/lib/ai/corra', () => ({ generateCorraDraft: vi.fn().mockResolvedValue('KI-TEXT') }))

const item = {
  id: 'p1', workspaceId: 'ws1', type: 'mahnung', sourceKind: 'invoice_reminder',
  sourceId: 'inv1:0', assignee: null,
  payload: {
    title: 'Zahlungserinnerung an Meyer GmbH — 1.190,00 €',
    why: 'Zahlungserinnerung, weil Rechnung R-100 seit 14 Tagen ohne Zahlung ist.',
    draftSubject: 'Betreff', draftBody: 'Entwurfstext', amount: 1190, level: 0,
  },
  score: 1000, status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
  createdAt: '', updatedAt: '', approvedAt: null,
} as never

describe('StapelCard', () => {
  it('zeigt Titel, Begruendung und die vier Aktionen', () => {
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText(/Zahlungserinnerung an Meyer GmbH/)).toBeInTheDocument()
    expect(screen.getByText(/seit 14 Tagen ohne Zahlung/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Freigeben' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anpassen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Später' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeInTheDocument()
  })

  it('Freigeben ruft onApprove; busy deaktiviert den Knopf', () => {
    const onApprove = vi.fn()
    const { rerender } = render(<StapelCard item={item} focused onApprove={onApprove} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Freigeben' }))
    expect(onApprove).toHaveBeenCalledOnce()
    rerender(<StapelCard item={item} focused busy onApprove={onApprove} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Freigeben' })).toBeDisabled()
  })

  it('Anpassen oeffnet den Editor mit dem Entwurf; Speichern liefert das geaenderte Payload', () => {
    const onSaveDraft = vi.fn()
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={onSaveDraft} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Anpassen' }))
    const textarea = screen.getByLabelText('Entwurf')
    expect(textarea).toHaveValue('Entwurfstext')
    fireEvent.change(textarea, { target: { value: 'Neuer Text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf speichern' }))
    expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ draftBody: 'Neuer Text' }))
  })

  it('Spaeter zeigt die drei Fristen und liefert die Tage', () => {
    const onSnooze = vi.fn()
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={vi.fn()} onSnooze={onSnooze} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Später' }))
    fireEvent.click(screen.getByRole('button', { name: 'In 3 Tagen' }))
    expect(onSnooze).toHaveBeenCalledWith(3)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/components/stapel/StapelCard.test.tsx`
Expected: FAIL (Komponente fehlt).

- [ ] **Step 3: Implementieren**

`src/components/stapel/StapelCard.tsx`:

```tsx
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { generateCorraDraft } from '@/lib/ai/corra'
import type { PreparedItem, PreparedItemPayload } from '@/types/prepared-item.types'

interface StapelCardProps {
  item: PreparedItem
  focused: boolean
  onApprove: () => void
  onSaveDraft: (payload: PreparedItemPayload) => void
  onSnooze: (days: number) => void
  onDismiss: () => void
  busy?: boolean
}

const TYPE_LABEL: Record<PreparedItem['type'], string> = {
  mahnung: 'MAHNWESEN', followup: 'FOLLOW-UP', rechnungsentwurf: 'RECHNUNG', aufgabe: 'AUFGABE',
}

/** Karte des Stapels: Was habe ich vorbereitet · Warum · das Ergebnis — plus 4 Aktionen. */
export function StapelCard({ item, focused, onApprove, onSaveDraft, onSnooze, onDismiss, busy }: StapelCardProps) {
  const [editing, setEditing] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [draftSubject, setDraftSubject] = useState(item.payload.draftSubject ?? '')
  const [draftBody, setDraftBody] = useState(item.payload.draftBody ?? '')
  const [koraBusy, setKoraBusy] = useState(false)

  const hasDraft = item.payload.draftBody != null

  const rephrase = async () => {
    setKoraBusy(true)
    try {
      // Einziger KI-Einsatz im Stapel: bewusster Klick des Nutzers.
      const text = await generateCorraDraft(
        item.type === 'mahnung'
          ? { kind: 'reminder', customerName: item.payload.customerName ?? '', invoiceNumber: item.payload.invoiceNumber ?? '', amount: item.payload.amount ?? 0, dueDate: '', daysOverdue: 0, dunningLevel: item.payload.level ?? 0 }
          : { kind: 'followup', customerName: item.payload.customerName ?? '', topic: item.payload.title },
      )
      if (text) setDraftBody(text)
    } finally {
      setKoraBusy(false)
    }
  }

  const btn = (label: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={opts?.disabled}
      style={{
        padding: focused ? '9px 18px' : '5px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
        cursor: opts?.disabled ? 'default' : 'pointer', opacity: opts?.disabled ? 0.5 : 1,
        border: opts?.primary ? 'none' : '1px solid var(--border)',
        background: opts?.primary ? 'var(--accent)' : 'transparent',
        color: opts?.primary ? '#fff' : 'var(--fg-muted)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius)',
      padding: focused ? '24px 28px' : '12px 16px',
      display: 'flex', flexDirection: 'column', gap: focused ? 14 : 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          {TYPE_LABEL[item.type]}
        </span>
      </div>

      <div>
        <h3 style={{ fontSize: focused ? 22 : 14, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          {item.payload.title}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
          {item.payload.why}
        </p>
      </div>

      {focused && hasDraft && !editing && (
        <details>
          <summary style={{ fontSize: 12, color: 'var(--fg-muted)', cursor: 'pointer' }}>Entwurf ansehen</summary>
          <pre style={{
            whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, color: 'var(--fg-muted)',
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            padding: 12, margin: '8px 0 0 0', fontFamily: 'inherit',
          }}>
            {item.payload.draftSubject ? `Betreff: ${item.payload.draftSubject}\n\n` : ''}{item.payload.draftBody}
          </pre>
        </details>
      )}

      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {item.payload.draftSubject != null && (
            <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Betreff
              <input value={draftSubject} onChange={e => setDraftSubject(e.target.value)} />
            </label>
          )}
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Entwurf
            <textarea rows={8} value={draftBody} onChange={e => setDraftBody(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {btn('Entwurf speichern', () => {
              onSaveDraft({ ...item.payload, draftSubject: draftSubject || undefined, draftBody })
              setEditing(false)
            }, { primary: true })}
            {btn('Abbrechen', () => setEditing(false))}
            <button type="button" onClick={rephrase} disabled={koraBusy}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 12px', fontSize: 12, color: 'var(--fg-muted)', cursor: 'pointer', opacity: koraBusy ? 0.5 : 1 }}>
              <Sparkles size={14} /> {koraBusy ? 'KORA schreibt …' : 'Mit KORA umformulieren'}
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          {btn('Freigeben', onApprove, { primary: true, disabled: busy })}
          {hasDraft && btn('Anpassen', () => setEditing(true), { disabled: busy })}
          {btn('Später', () => setSnoozeOpen(o => !o), { disabled: busy })}
          {btn('Verwerfen', onDismiss, { disabled: busy })}
          {snoozeOpen && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 8, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: 'var(--card-shadow)',
            }}>
              {btn('Morgen', () => { setSnoozeOpen(false); onSnooze(1) })}
              {btn('In 3 Tagen', () => { setSnoozeOpen(false); onSnooze(3) })}
              {btn('Nächste Woche', () => { setSnoozeOpen(false); onSnooze(7) })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/components/stapel/StapelCard.test.tsx && npm run typecheck`
Expected: 4 Tests PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/stapel/
git commit -m "feat(stapel): StapelCard — Anatomie (Was/Warum/Entwurf) + Freigeben/Anpassen/Spaeter/Verwerfen + KORA-Knopf"
```

---

### Task 9: UI — StapelSection (Fokus + Liste + Deckel + Wochensumme) und Einbau in „Mein Tag"

**Files:**
- Create: `src/components/stapel/StapelSection.tsx`
- Create: `src/components/stapel/StapelSection.test.tsx`
- Modify: `src/routes/DashboardRoute.tsx` (Heute-Queue-Block durch `<StapelSection />` ersetzen)

**Interfaces:**
- Consumes: `usePreparedItemsStore`, `approvePreparedItem` (Task 7), `useWorkspaceStore`, `useAuthStore`, `runPreparation`.
- Produces: `<StapelSection />` ohne Props (liest alles aus Stores).

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/components/stapel/StapelSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/services/stapel-actions.service', () => ({ approvePreparedItem: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/services/preparation.service', () => ({ runPreparation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ai/corra', () => ({ generateCorraDraft: vi.fn() }))

import { StapelSection } from './StapelSection'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useWorkspaceStore } from '@/store/workspace.store'

const mk = (id: string, score: number, over: object = {}) => ({
  id, workspaceId: 'ws1', type: 'aufgabe', sourceKind: 'todo', sourceId: id,
  assignee: null, payload: { title: `Karte ${id}`, why: 'Grund' }, score,
  status: 'pending', snoozeUntil: null, ruleId: 'aufgabe-heute',
  createdAt: '', updatedAt: '', approvedAt: null, ...over,
}) as never

describe('StapelSection', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws1' } as never)
    usePreparedItemsStore.setState({ items: [], weekApproved: [], loading: false })
  })

  it('leerer Stapel zeigt Ruhe-Text und Wochensumme', () => {
    usePreparedItemsStore.setState({
      items: [],
      weekApproved: [mk('a', 0, { type: 'mahnung', payload: { title: '', why: '', amount: 1190 }, status: 'approved' })],
    } as never)
    render(<StapelSection />)
    expect(screen.getByText(/Alles erledigt/)).toBeInTheDocument()
    expect(screen.getByText(/1.190/)).toBeInTheDocument()
  })

  it('hoechster Score ist die Fokus-Karte; Deckel bei 7 sichtbaren + Rest-Hinweis', () => {
    const items = Array.from({ length: 10 }, (_, i) => mk(`k${i}`, 100 - i))
    usePreparedItemsStore.setState({ items } as never)
    render(<StapelSection />)
    expect(screen.getByRole('heading', { name: 'Karte k0' })).toBeInTheDocument()
    expect(screen.getByText('+ 3 weitere')).toBeInTheDocument()
  })

  it('gesnoozte Karten mit Frist in der Zukunft erscheinen nicht', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    usePreparedItemsStore.setState({ items: [mk('k1', 100, { status: 'snoozed', snoozeUntil: future })] } as never)
    render(<StapelSection />)
    expect(screen.getByText(/Alles erledigt/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/components/stapel/StapelSection.test.tsx`
Expected: FAIL (Komponente fehlt).

- [ ] **Step 3: StapelSection implementieren**

`src/components/stapel/StapelSection.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { StapelCard } from './StapelCard'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { approvePreparedItem } from '@/services/stapel-actions.service'
import { recordDismissal } from '@/lib/stapel/dismiss-learning'
import type { PreparedItem } from '@/types/prepared-item.types'

const VISIBLE_CAP = 7

function eur0(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/** Der Stapel — Herz von „Mein Tag": eine Fokus-Karte, kompakte Liste, Deckel bei 7. */
export function StapelSection() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const myId = useAuthStore(s => s.user?.id)
  const items = usePreparedItemsStore(s => s.items)
  const weekApproved = usePreparedItemsStore(s => s.weekApproved)
  const [busyId, setBusyId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const now = new Date().toISOString()
    return items
      .filter(i => i.status === 'pending' || (i.status === 'snoozed' && (i.snoozeUntil ?? '') <= now))
      .filter(i => !i.assignee || i.assignee === myId)
      .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt))
  }, [items, myId])

  const focusItem = visible[0]
  const rest = visible.slice(1, VISIBLE_CAP)
  const hidden = Math.max(0, visible.length - VISIBLE_CAP)

  const handleApprove = async (item: PreparedItem) => {
    setBusyId(item.id)
    try {
      const result = await approvePreparedItem(item)
      if (!result.ok) {
        useToastStore.getState().show({ message: result.error ?? 'Freigabe fehlgeschlagen.', variant: 'error', durationMs: 8000 })
        return
      }
      await usePreparedItemsStore.getState().applyStatus(item.id, 'approved', { approvedAt: new Date().toISOString() })
      useToastStore.getState().show({ message: `Freigegeben ✓ — ${item.payload.title}`, variant: 'success' })
      void usePreparedItemsStore.getState().loadWeekApproved(workspaceId)
    } finally {
      setBusyId(null)
    }
  }

  const handleSnooze = (item: PreparedItem, days: number) => {
    const until = new Date(Date.now() + days * 86_400_000).toISOString()
    void usePreparedItemsStore.getState().applyStatus(item.id, 'snoozed', { snoozeUntil: until })
  }

  const handleDismiss = (item: PreparedItem) => {
    recordDismissal(item.ruleId)
    void usePreparedItemsStore.getState().applyStatus(item.id, 'dismissed')
  }

  if (!focusItem) {
    const moneyMoved = weekApproved.reduce((sum, i) => sum + (i.payload.amount ?? 0), 0)
    return (
      <div style={{ padding: '28px 32px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Alles erledigt. Heute ist frei für Fokusarbeit.</h2>
        {weekApproved.length > 0 && (
          <p style={{ margin: '10px 0 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
            Diese Woche freigegeben: {weekApproved.length} {weekApproved.length === 1 ? 'Karte' : 'Karten'}
            {moneyMoved > 0 ? ` — ${eur0(moneyMoved)} in Bewegung gebracht.` : '.'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          FÜR DICH VORBEREITET
        </span>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{visible.length} {visible.length === 1 ? 'Karte' : 'Karten'}</span>
      </div>

      <StapelCard
        item={focusItem} focused busy={busyId === focusItem.id}
        onApprove={() => void handleApprove(focusItem)}
        onSaveDraft={(p) => void usePreparedItemsStore.getState().applyPayload(focusItem.id, p)}
        onSnooze={(d) => handleSnooze(focusItem, d)}
        onDismiss={() => handleDismiss(focusItem)}
      />

      {rest.map(item => (
        <StapelCard
          key={item.id} item={item} focused={false} busy={busyId === item.id}
          onApprove={() => void handleApprove(item)}
          onSaveDraft={(p) => void usePreparedItemsStore.getState().applyPayload(item.id, p)}
          onSnooze={(d) => handleSnooze(item, d)}
          onDismiss={() => handleDismiss(item)}
        />
      ))}

      {hidden > 0 && (
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '4px 2px' }}>+ {hidden} weitere</div>
      )}
    </div>
  )
}
```

**Hinweis:** `recordDismissal` kommt aus Task 10 — für diesen Task eine minimale Datei `src/lib/stapel/dismiss-learning.ts` anlegen, die Task 10 dann ausbaut:

```ts
/** Verwerfen-Zaehler — wird in Task 10 zum Regel-Lernen ausgebaut. */
export function recordDismissal(_ruleId: string): void { /* noop bis Task 10 */ }
```

- [ ] **Step 4: In DashboardRoute einbauen**

`src/routes/DashboardRoute.tsx`:
1. Import: `import { StapelSection } from '@/components/stapel/StapelSection'`.
2. Den Fokus-Block ersetzen: das JSX, das `<HeuteTile item={currentItem} … />` (und dessen „Alles Dringende erledigt."-Leerzustand) rendert, wird durch `<StapelSection />` ersetzt. Die zugehörigen, danach ungenutzten Teile entfernen: `useHeuteQueue()`-Aufruf, `queueItems`/`queueIndex`/`advance`/`completeItem`/`handleSkip`/`handleSnooze`-Callbacks und der `HeuteTile`-Import. **Nur** diese Queue-Teile — KPI-Kacheln, Tagesplan, Mails-Spalte, `koraLine`, Empty-State bleiben unangetastet.
3. `npm run typecheck` treibt die Aufräumliste: alles, was durch den Ausbau ungenutzt wird (z. B. `snoozeInvoice`-Import, `HeuteQueueItem`-Typ), entfernen — aber `dueToday`/`overdueInvoices`/`geldUnterwegs` bleiben (KPIs + koraLine nutzen sie).

- [ ] **Step 5: Tests + Typecheck**

Run: `npx vitest run src/components/stapel/ src/components/dashboard/DashboardEmptyState.test.tsx && npm run typecheck`
Expected: alle PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/stapel/ src/lib/stapel/dismiss-learning.ts src/routes/DashboardRoute.tsx
git commit -m "feat(stapel): StapelSection ersetzt Heute-Queue in 'Mein Tag' — Fokus-Karte, Deckel 7, Wochensumme"
```

---

### Task 10: Verwerfen-Lernen (Regel-Unterdrückung)

**Files:**
- Create: `src/store/stapel-settings.store.ts`
- Modify: `src/lib/stapel/dismiss-learning.ts` (Ausbau)
- Create: `src/lib/stapel/dismiss-learning.test.ts`
- Modify: `src/services/preparation.service.ts` (suppressedRuleIds aus dem Store)
- Modify: `src/components/stapel/StapelSection.tsx` (Hinweis nach 3. Verwerfen)

**Interfaces:**
- Produces:
  - `useStapelSettingsStore` (persist `cultera-stapel-settings`): `suppressedRuleIds: string[]`, `dismissCounts: Record<string, number>`, `suppressRule(ruleId)`, `bumpDismiss(ruleId): number` (neuer Zählerstand)
  - `RULE_LABEL: Record<string, string>` und `shouldOfferSuppression(count: number): boolean` (true bei count === 3)

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/lib/stapel/dismiss-learning.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { recordDismissal, shouldOfferSuppression, RULE_LABEL } from './dismiss-learning'
import { useStapelSettingsStore } from '@/store/stapel-settings.store'

describe('dismiss-learning', () => {
  beforeEach(() => useStapelSettingsStore.setState({ suppressedRuleIds: [], dismissCounts: {} }))

  it('zaehlt Verwerfen pro Regel und bietet beim 3. Mal die Abschaltung an', () => {
    expect(recordDismissal('followup-due')).toBe(1)
    expect(recordDismissal('followup-due')).toBe(2)
    const third = recordDismissal('followup-due')
    expect(third).toBe(3)
    expect(shouldOfferSuppression(third)).toBe(true)
    expect(shouldOfferSuppression(2)).toBe(false)
    expect(shouldOfferSuppression(4)).toBe(false) // nur genau beim 3. Mal fragen
  })

  it('suppressRule landet in suppressedRuleIds', () => {
    useStapelSettingsStore.getState().suppressRule('aufgabe-heute')
    expect(useStapelSettingsStore.getState().suppressedRuleIds).toContain('aufgabe-heute')
  })

  it('jede Regel hat ein deutsches Label', () => {
    for (const id of ['mahnung-l0', 'mahnung-l1', 'mahnung-l2', 'followup-due', 'rechnung-vorschlag', 'aufgabe-heute']) {
      expect(RULE_LABEL[id]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/lib/stapel/dismiss-learning.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/store/stapel-settings.store.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface StapelSettingsState {
  suppressedRuleIds: string[]
  dismissCounts: Record<string, number>
  suppressRule: (ruleId: string) => void
  bumpDismiss: (ruleId: string) => number
}

export const useStapelSettingsStore = create<StapelSettingsState>()(
  persist(
    (set, get) => ({
      suppressedRuleIds: [],
      dismissCounts: {},
      suppressRule: (ruleId) => set(s => ({
        suppressedRuleIds: [...new Set([...s.suppressedRuleIds, ruleId])],
      })),
      bumpDismiss: (ruleId) => {
        const next = (get().dismissCounts[ruleId] ?? 0) + 1
        set(s => ({ dismissCounts: { ...s.dismissCounts, [ruleId]: next } }))
        return next
      },
    }),
    { name: 'cultera-stapel-settings' },
  ),
)
```

`src/lib/stapel/dismiss-learning.ts` (ersetzt den Task-9-Platzhalter):

```ts
/**
 * Regel-Lernen per Code, nicht per KI: Wer dieselbe Kartenart dreimal verwirft,
 * bekommt genau einmal die Frage, ob sie künftig nicht mehr vorbereitet werden soll.
 */
import { useStapelSettingsStore } from '@/store/stapel-settings.store'

export const RULE_LABEL: Record<string, string> = {
  'mahnung-l0': 'Zahlungserinnerungen',
  'mahnung-l1': '1. Mahnungen',
  'mahnung-l2': '2. Mahnungen',
  'followup-due': 'Follow-up-Vorschläge',
  'rechnung-vorschlag': 'Rechnungsvorschläge',
  'aufgabe-heute': 'Heutige Aufgaben',
}

/** Erhöht den Zähler und gibt den neuen Stand zurück. */
export function recordDismissal(ruleId: string): number {
  return useStapelSettingsStore.getState().bumpDismiss(ruleId)
}

/** Genau beim 3. Verwerfen fragen — nicht davor, nicht danach erneut. */
export function shouldOfferSuppression(count: number): boolean {
  return count === 3
}
```

`src/services/preparation.service.ts`: Signatur ändern zu `export async function runPreparation(workspaceId: string): Promise<void>` und im Body statt des Parameters:

```ts
import { useStapelSettingsStore } from '@/store/stapel-settings.store'
// ...
      suppressedRuleIds: useStapelSettingsStore.getState().suppressedRuleIds,
```

(Aufrufer in `usePreparationTick` unverändert — der zweite Parameter entfällt.)

`src/components/stapel/StapelSection.tsx`, `handleDismiss` ersetzen:

```tsx
  const handleDismiss = (item: PreparedItem) => {
    const count = recordDismissal(item.ruleId)
    void usePreparedItemsStore.getState().applyStatus(item.id, 'dismissed')
    if (shouldOfferSuppression(count)) {
      useToastStore.getState().show({
        message: `Du hast ${RULE_LABEL[item.ruleId] ?? 'diese Karten'} dreimal verworfen — soll ich sie künftig nicht mehr vorbereiten?`,
        variant: 'info', durationMs: 10_000,
        action: { label: 'Nicht mehr vorbereiten', onClick: () => useStapelSettingsStore.getState().suppressRule(item.ruleId) },
      })
    }
  }
```

(Imports ergänzen: `shouldOfferSuppression`, `RULE_LABEL` aus `@/lib/stapel/dismiss-learning`; `useStapelSettingsStore` aus `@/store/stapel-settings.store`.)

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/lib/stapel/dismiss-learning.test.ts src/components/stapel/ && npm run typecheck`
Expected: alle PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/stapel-settings.store.ts src/lib/stapel/dismiss-learning.ts src/lib/stapel/dismiss-learning.test.ts src/services/preparation.service.ts src/components/stapel/StapelSection.tsx
git commit -m "feat(stapel): Verwerfen-Lernen — 3x verworfen = Regel-Abschaltung anbieten (Code, nicht KI)"
```

---

### Task 11: Team-Delegation („An … übergeben", nur geteilte Workspaces)

**Files:**
- Modify: `src/components/stapel/StapelCard.tsx` (Delegations-Menü)
- Modify: `src/components/stapel/StapelCard.test.tsx` (neuer Fall)
- Modify: `src/components/stapel/StapelSection.tsx` (Props durchreichen)

**Interfaces:**
- Consumes: `useMembersStore` (`members(): MemberProfile[]`, `nameOf(userId)`), `useWorkspaceStore.isActiveWorkspaceShared()`, `usePreparedItemsStore.applyAssignee`.
- Produces: `StapelCardProps` erweitert um `onDelegate?: (assignee: string | null) => void` und `delegatable?: { id: string; displayName: string }[]` (undefined = Menü ausblenden).

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/components/stapel/StapelCard.test.tsx` ergänzen:

```tsx
  it('Delegations-Menue zeigt Mitglieder und liefert die Auswahl', () => {
    const onDelegate = vi.fn()
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()}
      onDelegate={onDelegate} delegatable={[{ id: 'u2', displayName: 'Marie' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Übergeben' }))
    fireEvent.click(screen.getByRole('button', { name: 'An Marie übergeben' }))
    expect(onDelegate).toHaveBeenCalledWith('u2')
  })

  it('ohne delegatable gibt es keinen Uebergeben-Knopf', () => {
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Übergeben' })).toBeNull()
  })
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/components/stapel/StapelCard.test.tsx`
Expected: neue Fälle FAIL.

- [ ] **Step 3: Implementieren**

`StapelCard.tsx`: Props erweitern (`onDelegate?: (assignee: string | null) => void`, `delegatable?: { id: string; displayName: string }[]`), State `const [delegateOpen, setDelegateOpen] = useState(false)`, und in der Aktions-Zeile (nach „Später", vor „Verwerfen") einfügen:

```tsx
          {onDelegate && delegatable && delegatable.length > 0 && btn('Übergeben', () => setDelegateOpen(o => !o), { disabled: busy })}
```

und unter dem Snooze-Popover analog:

```tsx
          {delegateOpen && onDelegate && delegatable && (
            <div style={{
              position: 'absolute', top: '110%', left: 90, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 8, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: 'var(--card-shadow)',
            }}>
              {delegatable.map(m => (
                <button key={m.id} type="button" onClick={() => { setDelegateOpen(false); onDelegate(m.id) }}
                  style={{ background: 'none', border: 'none', padding: '6px 10px', fontSize: 13, textAlign: 'left', cursor: 'pointer', color: 'var(--fg)' }}>
                  An {m.displayName} übergeben
                </button>
              ))}
            </div>
          )}
```

`StapelSection.tsx`: Mitglieder laden und durchreichen —

```tsx
import { useMembersStore } from '@/store/members.store'
// im Komponentenkörper:
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const members = useMembersStore(s => s.members())
  const delegatable = isShared
    ? members.filter(m => m.id !== myId).map(m => ({ id: m.id, displayName: m.displayName }))
    : undefined
```

und an beide `<StapelCard>`-Instanzen: `delegatable={delegatable}` + `onDelegate={(a) => void usePreparedItemsStore.getState().applyAssignee(item.id, a)}` (beim Fokus-Item entsprechend `focusItem.id`). Nach Übergabe verschwindet die Karte aus der eigenen Sicht automatisch (der `visible`-Filter greift auf `assignee`).

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/components/stapel/ && npm run typecheck`
Expected: alle PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/stapel/
git commit -m "feat(stapel): Team-Delegation — Karte an Mitglied uebergeben (nur geteilte Workspaces)"
```

---

### Task 12: Verträge erzeugen Suggestions statt stiller Drafts

**Files:**
- Modify: `src/store/vertraege.store.ts` (`checkAndCreateDueInvoices`)
- Modify: `src/store/vertraege.store.test.ts` (Fall ergänzen/anpassen)

**Interfaces:**
- Consumes: `UpsertInvoicePayload.isSuggestion?: boolean` + `suggestedBy?: string` (existieren).
- Produces: Vertrags-Rechnungen tragen `isSuggestion: true, suggestedBy: 'vertrag'` → laufen damit automatisch in die Rechnungsentwurf-Karten (Task 5) UND in den bestehenden Suggestions-Badge der FinanceRoute.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/store/vertraege.store.test.ts` (bestehende Mock-Struktur der Datei verwenden — `FinanceService.createInvoice` ist dort bereits gemockt, sonst mocken):

```ts
  it('faelliger Vertrag erzeugt einen Rechnungs-VORSCHLAG (isSuggestion), keinen stillen Draft', async () => {
    // Bestehendes Setup der Datei für einen fälligen aktiven Vertrag verwenden.
    // Nach checkAndCreateDueInvoices:
    const { FinanceService } = await import('@/services/finance.service')
    expect(vi.mocked(FinanceService.createInvoice)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', isSuggestion: true, suggestedBy: 'vertrag' }),
    )
  })
```

(Die Datei hat Bestandstests für `checkAndCreateDueInvoices` — deren Arrange-Teil übernehmen; falls sie exakt auf das bisherige Payload asserten, diese Assertions um die zwei neuen Felder erweitern.)

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/store/vertraege.store.test.ts`
Expected: neuer Fall FAIL.

- [ ] **Step 3: Umstellen**

In `src/store/vertraege.store.ts`, im `FinanceService.createInvoice({...})`-Aufruf von `checkAndCreateDueInvoices` ergänzen:

```ts
          status: 'draft',
          isSuggestion: true,
          suggestedBy: 'vertrag',
```

(Kommentar dazu: `// Vertrags-Rechnungen laufen als Vorschlag in den Stapel — Freigeben vergibt die Nummer.`)

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/store/vertraege.store.test.ts && npm run typecheck`
Expected: alle PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/vertraege.store.ts src/store/vertraege.store.test.ts
git commit -m "feat(stapel): Vertrags-Rechnungen als Vorschlag (isSuggestion) — laufen in den Stapel"
```

---

### Task 13: Begleitmail auf Template + Tray/Badge auf Stapel-Zähler

**Files:**
- Modify: alle Aufrufer von `generateCorraDraft({ kind: 'invoice', … })` (finden via `grep -rn "kind: 'invoice'" src/`) — Begleitmail-Text durch `begleitmailBody(...)` ersetzen; KORA dort nur noch als expliziter Umformulieren-Weg, falls die Stelle einen hat
- Modify: `src/hooks/usePresenceBridge.ts` (Tray-Zähler = sichtbare Stapel-Karten)
- Modify: `src/hooks/usePresenceBridge.test.ts` falls vorhanden (sonst kein neuer Test — Logik ist Selektor-Verdrahtung)

- [ ] **Step 1: Begleitmail-Aufrufer finden und umstellen**

Run: `grep -rn "kind: 'invoice'" src/ --include='*.ts' --include='*.tsx'`
Für jede Fundstelle (erwartet: Rechnungs-Versand-Flow in FinanceRoute oder Mail-Composer): den `generateCorraDraft({ kind: 'invoice', … })`-Aufruf ersetzen durch

```ts
import { begleitmailBody } from '@/lib/templates/mahnung'
// ...
const body = begleitmailBody({ customerName, invoiceNumber: invoice.number ?? '', total: invoice.total, dueDate: invoice.dueDate })
```

Gibt es keine Fundstelle (Begleitmail-Flow existiert evtl. nur im Mahnwesen), diesen Schritt als „nichts zu tun" im Commit-Text dokumentieren.

- [ ] **Step 2: Tray-Zähler auf den Stapel umstellen**

`src/hooks/usePresenceBridge.ts`: Die drei Zähl-Selektoren (`overdueCount`, `todayTodos`, `unreadMails`) durch den Stapel ersetzen:

```ts
import { usePreparedItemsStore } from '@/store/prepared-items.store'
// ...
  const openCount = usePreparedItemsStore(s => {
    const now = new Date().toISOString()
    return s.items.filter(i => i.status === 'pending' || (i.status === 'snoozed' && (i.snoozeUntil ?? '') <= now)).length
  })

  useEffect(() => {
    void invoke('cmd_update_tray_status', { openCount }).catch(() => {})
  }, [openCount])
```

(Die alten Imports/Selektoren entfernen, sofern ungenutzt — `npm run typecheck` zeigt es. Der Close-to-Tray-Effekt bleibt unverändert.)

- [ ] **Step 3: Tests + Typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: kompletter Frontend-Suite grün, tsc clean.

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "feat(stapel): Begleitmail aus Template; Tray-Zaehler zeigt offene Stapel-Karten"
```

---

### Task 14: Aufräumen + Gesamtverifikation

**Files:**
- Möglich zu löschen (nur wenn nach Task 9 ohne Verwender — mit `grep -rn "<Name>" src/` prüfen): `src/components/heute/HeuteTile.tsx`, `src/components/heute/TileBodyTodo.tsx`, `src/components/heute/TileBodyMail.tsx`, `src/hooks/useHeuteQueue.ts`
- NICHT löschen: `src/lib/ai/heute-queue.ts` (Typ `CorraContextInput` und `staticHeuteQueue` werden von `corra-intelligence` genutzt — prüfen; nur löschen, wenn wirklich verwaist)

- [ ] **Step 1: Verwaiste Heute-Queue-Teile identifizieren**

Run: `grep -rln "HeuteTile\|useHeuteQueue\|TileBodyMail\|TileBodyTodo" src/ | grep -v test`
Jede Datei ohne verbleibende Verwender (außer sich selbst/Tests) löschen, zugehörige Tests mit. Dateien MIT Verwendern bleiben; im Commit-Text dokumentieren, was blieb und warum.

- [ ] **Step 2: Gesamtverifikation**

Run: `npx vitest run` → Expected: alle PASS (Bestand + neue; gelöschte Tests fallen weg).
Run: `npm run typecheck` → Expected: clean.
Run: `cd src-tauri && cargo test && cargo check` → Expected: PASS/clean.

- [ ] **Step 3: Manueller Smoke-Test (für den Menschen, im PR dokumentieren)**

`npm run tauri dev`: (a) „Mein Tag" zeigt den Stapel mit „FÜR DICH VORBEREITET"; (b) überfällige Test-Rechnung → Mahnungs-Karte mit aufklappbarem Entwurf; (c) Anpassen → Text ändern → Speichern → Freigeben → Mail geht mit geändertem Text + PDF raus, Karte verschwindet, Erfolgs-Toast; (d) Verwerfen 3× bei Aufgaben-Karten → Abschalt-Angebot; (e) Später → Karte weg, nach Frist wieder da; (f) leerer Stapel → Wochensumme; (g) geteilter Workspace: Karte an Mitglied übergeben → verschwindet aus eigener Sicht.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(stapel): verwaiste Heute-Queue-Teile entfernt; Gesamtverifikation gruen"
```
