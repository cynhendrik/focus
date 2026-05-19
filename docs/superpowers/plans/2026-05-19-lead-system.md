# Lead System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead-Modul mit Webhook-Eingang (Zoom + Generic), drei Tabs (New In / Lead Phases / Re-Engage), Bulk-Actions und One-Click Lead→Client Conversion.

**Architecture:** Leads teilen sich die `accounts` Tabelle mit Clients — getrennt durch `account_type = 'lead'`. Migration v11 fügt 8 neue Spalten hinzu. Webhook-Daten fließen über Supabase `pending_leads` (Cloud-Puffer) → TypeScript-Sync → lokales SQLite. Fünf neue Rust-Commands, ein neuer Zustand-Store, eine neue Route.

**Tech Stack:** Rust (rusqlite), Tauri v2, TypeScript, React, Zustand, Supabase JS SDK, Supabase Edge Functions (Deno)

---

## Datei-Map

**Erstellen:**
- `src-tauri/src/db/lead.rs` — Lead-Struct, DB-Funktionen, Tests
- `src-tauri/src/commands/lead.rs` — 5 Tauri Commands
- `src/types/lead.types.ts` — Lead, LeadStatus, UpsertLeadPayload, BulkLeadAction
- `src/services/leads.service.ts` — invoke()-Wrapper + Supabase-Sync
- `src/store/leads.store.ts` — Zustand Store
- `src/routes/LeadsRoute.tsx` — 3-Tab UI
- `supabase/functions/lead-intake/index.ts` — Edge Function (Deno, separates Deploy)

**Modifizieren:**
- `src-tauri/src/db/migrations.rs` — v11: 8 neue Spalten auf accounts
- `src-tauri/src/commands/mod.rs` — `pub mod lead` hinzufügen
- `src-tauri/src/main.rs` — 5 Commands registrieren
- `src/store/ui.store.ts` — `'leads'` zu AppView hinzufügen
- `src/components/layout/NavSidebar.tsx` — Leads-Eintrag über Pipeline
- `src/App.tsx` — LeadsRoute, case 'leads', Sync beim Start

---

## Task 1: Migration v11 — accounts Tabelle erweitern

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Schritt 1: Test schreiben**

In `src-tauri/src/db/migrations.rs` am Ende des `#[cfg(test)]`-Blocks:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        run(&conn).unwrap();
        conn
    }

    #[test]
    fn v11_adds_lead_columns_to_accounts() {
        let conn = setup();
        assert!(column_exists(&conn, "accounts", "account_type"));
        assert!(column_exists(&conn, "accounts", "lead_status"));
        assert!(column_exists(&conn, "accounts", "lead_source"));
        assert!(column_exists(&conn, "accounts", "lead_source_detail"));
        assert!(column_exists(&conn, "accounts", "email"));
        assert!(column_exists(&conn, "accounts", "engagement_score"));
        assert!(column_exists(&conn, "accounts", "re_engage_date"));
        assert!(column_exists(&conn, "accounts", "converted_at"));
    }

    #[test]
    fn v11_existing_accounts_default_to_client() {
        let conn = setup();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test AG',?1,?1)",
            [&now],
        ).unwrap();
        let account_type: String = conn
            .query_row("SELECT account_type FROM accounts WHERE id='a1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(account_type, "client");
    }
}
```

- [ ] **Schritt 2: Test laufen lassen — muss FEHLSCHLAGEN**

```powershell
cd src-tauri
cargo test -p cynera-focus db::migrations::tests::v11 -- --nocapture 2>&1 | Select-String -Pattern "FAILED|error|passed"
```

Erwartet: `FAILED` (CURRENT_VERSION noch 10, columns fehlen)

- [ ] **Schritt 3: Migration implementieren**

In `src-tauri/src/db/migrations.rs`:

```rust
// Oben: CURRENT_VERSION auf 11 setzen
const CURRENT_VERSION: u32 = 11;
```

Im `apply()`-Match neuen Arm hinzufügen:

```rust
11 => {
    if !column_exists(conn, "accounts", "account_type") {
        conn.execute_batch(
            "ALTER TABLE accounts ADD COLUMN account_type TEXT NOT NULL DEFAULT 'client';
             ALTER TABLE accounts ADD COLUMN lead_status TEXT;
             ALTER TABLE accounts ADD COLUMN lead_source TEXT;
             ALTER TABLE accounts ADD COLUMN lead_source_detail TEXT;
             ALTER TABLE accounts ADD COLUMN email TEXT;
             ALTER TABLE accounts ADD COLUMN engagement_score INTEGER DEFAULT 0;
             ALTER TABLE accounts ADD COLUMN re_engage_date TEXT;
             ALTER TABLE accounts ADD COLUMN converted_at TEXT;"
        )?;
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_accounts_type
             ON accounts(workspace_id, account_type);"
        )?;
    }
    Ok(())
}
```

- [ ] **Schritt 4: Tests laufen lassen — müssen BESTEHEN**

```powershell
cargo test -p cynera-focus db::migrations::tests::v11 -- --nocapture
```

Erwartet: `2 passed`

- [ ] **Schritt 5: Gesamte Test-Suite grün**

```powershell
cargo test -p cynera-focus 2>&1 | Select-String -Pattern "test result"
```

Erwartet: `test result: ok`

- [ ] **Schritt 6: Commit**

```powershell
git add src-tauri/src/db/migrations.rs
git commit -m "feat(leads): migration v11 — lead columns on accounts"
```

---

## Task 2: Rust DB Layer — `src-tauri/src/db/lead.rs`

**Files:**
- Create: `src-tauri/src/db/lead.rs`

- [ ] **Schritt 1: Datei erstellen mit Struct + Tests (failing)**

`src-tauri/src/db/lead.rs`:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Lead {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub email: Option<String>,
    pub account_type: String,
    pub lead_status: String,
    pub lead_source: String,
    pub lead_source_detail: Option<String>,
    pub engagement_score: i64,
    pub re_engage_date: Option<String>,
    pub converted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertLeadPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub name: String,
    pub email: Option<String>,
    pub lead_status: Option<String>,
    pub lead_source: String,
    pub lead_source_detail: Option<String>,
    pub re_engage_date: Option<String>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Lead> {
    Ok(Lead {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        name: r.get(2)?,
        email: r.get(3)?,
        account_type: r.get(4)?,
        lead_status: r.get(5)?,
        lead_source: r.get(6)?,
        lead_source_detail: r.get(7)?,
        engagement_score: r.get(8)?,
        re_engage_date: r.get(9)?,
        converted_at: r.get(10)?,
        created_at: r.get(11)?,
        updated_at: r.get(12)?,
    })
}

const SELECT: &str =
    "SELECT id, workspace_id, name, email, account_type, lead_status, lead_source,
            lead_source_detail, engagement_score, re_engage_date, converted_at,
            created_at, updated_at
     FROM accounts";

pub fn get_leads(conn: &Connection, workspace_id: &str) -> Result<Vec<Lead>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE workspace_id=?1 AND account_type='lead' ORDER BY created_at DESC"
    ))?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert_lead(conn: &Connection, payload: UpsertLeadPayload) -> Result<Lead, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.lead_status.unwrap_or_else(|| "new".into());
    conn.execute(
        "INSERT INTO accounts
           (id, workspace_id, name, email, account_type, lead_status, lead_source,
            lead_source_detail, engagement_score, re_engage_date, created_at, updated_at)
         VALUES (?1,?2,?3,?4,'lead',?5,?6,?7,0,?8,?9,?9)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, email=excluded.email,
           lead_status=excluded.lead_status, lead_source=excluded.lead_source,
           lead_source_detail=excluded.lead_source_detail,
           re_engage_date=excluded.re_engage_date, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.email,
            status, payload.lead_source, payload.lead_source_detail,
            payload.re_engage_date, now,
        ],
    )?;
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [&id], map_row)
        .map_err(AppError::from)
}

pub fn bulk_update_lead_status(
    conn: &Connection,
    ids: &[String],
    status: &str,
    re_engage_date: Option<&str>,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    for id in ids {
        conn.execute(
            "UPDATE accounts SET lead_status=?1, re_engage_date=COALESCE(?2, re_engage_date),
             updated_at=?3 WHERE id=?4 AND account_type='lead'",
            rusqlite::params![status, re_engage_date, now, id],
        )?;
    }
    Ok(())
}

pub fn convert_lead_to_client(conn: &Connection, id: &str) -> Result<Lead, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE accounts SET account_type='client', lead_status=NULL, converted_at=?1,
         updated_at=?1 WHERE id=?2 AND account_type='lead'",
        rusqlite::params![now, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("Lead {id} not found")));
    }
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [id], map_row)
        .map_err(AppError::from)
}

pub fn insert_synced_leads(conn: &Connection, leads: Vec<UpsertLeadPayload>) -> Result<usize, AppError> {
    let mut count = 0usize;
    for lead in leads {
        upsert_lead(conn, lead)?;
        count += 1;
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn lead_payload(ws: &str) -> UpsertLeadPayload {
        UpsertLeadPayload {
            id: None,
            workspace_id: ws.into(),
            name: "Max Mustermann".into(),
            email: Some("max@example.com".into()),
            lead_status: None,
            lead_source: "zoom".into(),
            lead_source_detail: Some("Marketing Webinar".into()),
            re_engage_date: None,
        }
    }

    #[test]
    fn upsert_creates_lead_with_new_status() {
        let conn = setup();
        let lead = upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        assert_eq!(lead.lead_status, "new");
        assert_eq!(lead.account_type, "lead");
        assert_eq!(lead.lead_source, "zoom");
    }

    #[test]
    fn get_leads_returns_only_leads() {
        let conn = setup();
        // Insert a lead
        upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        // Insert a client directly
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, name, account_type, created_at, updated_at)
             VALUES ('client-1','ws-1','Client AG','client',?1,?1)",
            [&now],
        ).unwrap();
        let leads = get_leads(&conn, "ws-1").unwrap();
        assert_eq!(leads.len(), 1);
        assert_eq!(leads[0].account_type, "lead");
    }

    #[test]
    fn bulk_update_changes_status_for_all_ids() {
        let conn = setup();
        let l1 = upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        let l2 = upsert_lead(&conn, UpsertLeadPayload {
            name: "Anna".into(), email: None, ..lead_payload("ws-1")
        }).unwrap();
        bulk_update_lead_status(&conn, &[l1.id.clone(), l2.id.clone()], "attempted", None).unwrap();
        let leads = get_leads(&conn, "ws-1").unwrap();
        assert!(leads.iter().all(|l| l.lead_status == "attempted"));
    }

    #[test]
    fn convert_lead_to_client_changes_account_type() {
        let conn = setup();
        let lead = upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        let converted = convert_lead_to_client(&conn, &lead.id).unwrap();
        assert_eq!(converted.account_type, "client");
        assert!(converted.converted_at.is_some());
        // Should no longer appear in get_leads
        assert!(get_leads(&conn, "ws-1").unwrap().is_empty());
    }

    #[test]
    fn convert_nonexistent_lead_returns_not_found() {
        let conn = setup();
        let result = convert_lead_to_client(&conn, "nonexistent");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn insert_synced_leads_returns_correct_count() {
        let conn = setup();
        let count = insert_synced_leads(&conn, vec![
            lead_payload("ws-1"),
            UpsertLeadPayload { name: "Anna".into(), email: None, ..lead_payload("ws-1") },
        ]).unwrap();
        assert_eq!(count, 2);
        assert_eq!(get_leads(&conn, "ws-1").unwrap().len(), 2);
    }
}
```

- [ ] **Schritt 2: Modul in `src-tauri/src/db/mod.rs` registrieren**

In `src-tauri/src/db/mod.rs` hinzufügen:

```rust
pub mod lead;
```

- [ ] **Schritt 3: Tests laufen lassen**

```powershell
cargo test -p cynera-focus db::lead -- --nocapture
```

Erwartet: `5 passed`

- [ ] **Schritt 4: Commit**

```powershell
git add src-tauri/src/db/lead.rs src-tauri/src/db/mod.rs
git commit -m "feat(leads): Rust DB layer — Lead struct + CRUD + tests"
```

---

## Task 3: Rust Commands — Registrierung

**Files:**
- Create: `src-tauri/src/commands/lead.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Schritt 1: `src-tauri/src/commands/lead.rs` erstellen**

```rust
use tauri::State;
use crate::{AppError, db, db::pool::DbPool};
use crate::db::lead::{Lead, UpsertLeadPayload};

#[tauri::command]
pub fn get_leads(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<Lead>, AppError> {
    db::lead::get_leads(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn upsert_lead(db: State<'_, DbPool>, payload: UpsertLeadPayload) -> Result<Lead, AppError> {
    db::lead::upsert_lead(&db.conn(), payload)
}

#[tauri::command]
pub fn bulk_update_leads(
    db: State<'_, DbPool>,
    ids: Vec<String>,
    status: String,
    re_engage_date: Option<String>,
) -> Result<(), AppError> {
    db::lead::bulk_update_lead_status(&db.conn(), &ids, &status, re_engage_date.as_deref())
}

#[tauri::command]
pub fn convert_lead_to_client(db: State<'_, DbPool>, id: String) -> Result<Lead, AppError> {
    db::lead::convert_lead_to_client(&db.conn(), &id)
}

#[tauri::command]
pub fn insert_synced_leads(
    db: State<'_, DbPool>,
    leads: Vec<UpsertLeadPayload>,
) -> Result<usize, AppError> {
    db::lead::insert_synced_leads(&db.conn(), leads)
}
```

- [ ] **Schritt 2: Modul in `src-tauri/src/commands/mod.rs` hinzufügen**

```rust
pub mod lead;   // ← neu hinzufügen
```

- [ ] **Schritt 3: Commands in `src-tauri/src/main.rs` registrieren**

Im `invoke_handler![]`-Block nach den `smart_list`-Commands einfügen:

```rust
commands::lead::get_leads,
commands::lead::upsert_lead,
commands::lead::bulk_update_leads,
commands::lead::convert_lead_to_client,
commands::lead::insert_synced_leads,
```

- [ ] **Schritt 4: Build prüfen**

```powershell
cargo build -p cynera-focus 2>&1 | Select-String -Pattern "error"
```

Erwartet: keine Zeilen (kein Fehler)

- [ ] **Schritt 5: Commit**

```powershell
git add src-tauri/src/commands/lead.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(leads): Tauri Commands + main.rs Registrierung"
```

---

## Task 4: TypeScript Types + Service

**Files:**
- Create: `src/types/lead.types.ts`
- Create: `src/services/leads.service.ts`

- [ ] **Schritt 1: `src/types/lead.types.ts` erstellen**

```typescript
export type LeadStatus = 'new' | 'attempted' | 'warm' | 'lost_reengage'
export type LeadSource = 'zoom' | 'generic' | 'manual'

export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string | null
  accountType: 'lead'
  leadStatus: LeadStatus
  leadSource: LeadSource
  leadSourceDetail: string | null
  engagementScore: number
  reEngageDate: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertLeadPayload {
  id?: string
  workspaceId: string
  name: string
  email?: string
  leadStatus?: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  reEngageDate?: string
}

export interface BulkUpdateLeadsPayload {
  ids: string[]
  status: LeadStatus
  reEngageDate?: string
}

export interface PendingLead {
  id: string
  workspaceId: string
  email: string
  name: string | null
  source: 'zoom' | 'generic'
  sourceDetail: string | null
  payload: Record<string, unknown>
  synced: boolean
  createdAt: string
}
```

- [ ] **Schritt 2: `src/services/leads.service.ts` erstellen**

```typescript
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload, PendingLead } from '@/types/lead.types'

function normalizePendingLead(row: PendingLead): UpsertLeadPayload {
  return {
    workspaceId: row.workspaceId,
    name: row.name ?? row.email,
    email: row.email,
    leadSource: row.source,
    leadSourceDetail: row.sourceDetail ?? undefined,
    leadStatus: 'new',
  }
}

export const LeadsService = {
  getAll(workspaceId: string): Promise<Lead[]> {
    return invoke('get_leads', { workspaceId })
  },

  upsert(payload: UpsertLeadPayload): Promise<Lead> {
    return invoke('upsert_lead', { payload })
  },

  bulkUpdate(payload: BulkUpdateLeadsPayload): Promise<void> {
    return invoke('bulk_update_leads', {
      ids: payload.ids,
      status: payload.status,
      reEngageDate: payload.reEngageDate ?? null,
    })
  },

  convertToClient(id: string): Promise<Lead> {
    return invoke('convert_lead_to_client', { id })
  },

  async syncPending(workspaceId: string): Promise<number> {
    const { data, error } = await supabase
      .from('pending_leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('synced', false)
    if (error || !data?.length) return 0
    const leads = data.map(normalizePendingLead)
    const count: number = await invoke('insert_synced_leads', { leads })
    const ids = data.map((r: PendingLead) => r.id)
    await supabase.from('pending_leads').update({ synced: true }).in('id', ids)
    return count
  },
}
```

- [ ] **Schritt 3: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "error"
```

Erwartet: keine Zeilen

- [ ] **Schritt 4: Commit**

```powershell
git add src/types/lead.types.ts src/services/leads.service.ts
git commit -m "feat(leads): TypeScript types + LeadsService"
```

---

## Task 5: Zustand Store

**Files:**
- Create: `src/store/leads.store.ts`

- [ ] **Schritt 1: `src/store/leads.store.ts` erstellen**

```typescript
import { create } from 'zustand'
import { LeadsService } from '@/services/leads.service'
import { log } from '@/lib/logger'
import type { Lead, UpsertLeadPayload, BulkUpdateLeadsPayload } from '@/types/lead.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface LeadsState {
  leads: Lead[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertLeadPayload) => Promise<void>
  bulkUpdate: (payload: BulkUpdateLeadsPayload) => Promise<void>
  convertToClient: (id: string) => Promise<void>
  syncPending: (workspaceId: string) => Promise<void>
  // Selectors
  newLeads: () => Lead[]
  attemptedLeads: () => Lead[]
  warmLeads: () => Lead[]
  lostLeads: () => Lead[]
  reEngageLeads: () => Lead[]
}

export const useLeadsStore = create<LeadsState>()((set, get) => ({
  leads: [],
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const leads = await LeadsService.getAll(workspaceId)
      set({ leads, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load leads', { error })
    }
  },

  upsert: async (payload) => {
    set({ error: null })
    try {
      const lead = await LeadsService.upsert(payload)
      set(s => {
        const exists = s.leads.some(l => l.id === lead.id)
        return {
          leads: exists
            ? s.leads.map(l => l.id === lead.id ? lead : l)
            : [lead, ...s.leads],
        }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upsert lead', { error })
    }
  },

  bulkUpdate: async (payload) => {
    set({ error: null })
    try {
      await LeadsService.bulkUpdate(payload)
      // Reload to get fresh state from DB
      const current = get().leads
      const workspaceId = current[0]?.workspaceId
      if (workspaceId) await get().load(workspaceId)
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to bulk update leads', { error })
    }
  },

  convertToClient: async (id) => {
    set({ error: null })
    try {
      await LeadsService.convertToClient(id)
      set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to convert lead to client', { error })
    }
  },

  syncPending: async (workspaceId) => {
    try {
      const count = await LeadsService.syncPending(workspaceId)
      if (count > 0) await get().load(workspaceId)
    } catch (err) {
      log.error('Sync pending leads failed', { err })
    }
  },

  newLeads: () => get().leads.filter(l => l.leadStatus === 'new'),
  attemptedLeads: () => get().leads.filter(l => l.leadStatus === 'attempted'),
  warmLeads: () => get().leads.filter(l => l.leadStatus === 'warm'),
  lostLeads: () => get().leads.filter(l => l.leadStatus === 'lost_reengage'),
  reEngageLeads: () => get().leads.filter(l => l.reEngageDate != null),
}))
```

- [ ] **Schritt 2: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "error"
```

Erwartet: keine Zeilen

- [ ] **Schritt 3: Commit**

```powershell
git add src/store/leads.store.ts
git commit -m "feat(leads): Zustand Store — load, bulkUpdate, convertToClient, syncPending"
```

---

## Task 6: AppView + NavSidebar + App.tsx Wiring

**Files:**
- Modify: `src/store/ui.store.ts`
- Modify: `src/components/layout/NavSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Schritt 1: `'leads'` zu AppView hinzufügen**

In `src/store/ui.store.ts`, Zeile 8 — `AppView` Union erweitern:

```typescript
export type AppView =
  | 'dashboard' | 'profile'   | 'workstation'
  | 'clients'   | 'pipeline'  | 'invoices'  | 'tasks'    | 'kpis' | 'insights'
  | 'calendar'  | 'mail'      | 'crm'       | 'settings' | 'followups'
  | 'smartlists'| 'chat'      | 'leads'
```

- [ ] **Schritt 2: Leads-Eintrag in NavSidebar hinzufügen**

In `src/components/layout/NavSidebar.tsx`:

Import ergänzen (Zeile 9 — bestehende Lucide-Imports):
```typescript
import {
  Monitor, Home, CheckSquare, Users, CreditCard,
  TrendingUp, ListFilter, Bell, Target,
  Calendar, Mail, MessageCircle, Settings,
  ChevronRight,
} from 'lucide-react'
```

Store-Import ergänzen:
```typescript
import { useLeadsStore } from '@/store/leads.store'
```

In der `NavSidebar()`-Funktion nach `followupCount`:
```typescript
const newLeadsCount = useLeadsStore(s => s.newLeads().length)
```

Im Sales-Block — `Leads`-Eintrag VOR Pipeline einfügen:
```tsx
{expanded.sales && (
  <>
    <SidebarNavItem icon={Target}     label="Leads"       active={appView === 'leads'}      onClick={() => setAppView('leads')}      kbd="N" badge={newLeadsCount || undefined} />
    <SidebarNavItem icon={TrendingUp}  label="Pipeline"    active={appView === 'pipeline'}   onClick={() => setAppView('pipeline')}   kbd="P" badge={openDealCount || undefined} />
    <SidebarNavItem icon={ListFilter}  label="Smart Lists" active={appView === 'smartlists'} onClick={() => setAppView('smartlists')} kbd="L" />
    <SidebarNavItem icon={Bell}        label="Follow-Ups"  active={appView === 'followups'}  onClick={() => setAppView('followups')}  kbd="U" badge={followupCount || undefined} />
  </>
)}
```

- [ ] **Schritt 3: App.tsx — Import + case + Sync**

In `src/App.tsx`:

Import hinzufügen (nach ChatRoute):
```typescript
import { LeadsRoute } from '@/routes/LeadsRoute'
import { useLeadsStore } from '@/store/leads.store'
import { LeadsService } from '@/services/leads.service'
```

Im Funktionskörper nach `loadAllTodos`:
```typescript
const syncLeads    = useLeadsStore(s => s.syncPending)
const loadLeads    = useLeadsStore(s => s.load)
```

Im workspace-useEffect — am Ende des `if (activeWorkspaceId)`-Blocks:
```typescript
syncLeads(activeWorkspaceId)
loadLeads(activeWorkspaceId)
```

Dependencies-Array des Effects um `syncLeads, loadLeads` erweitern.

Im `renderMain()`-Switch-Block:
```typescript
case 'leads':      return <LeadsRoute />
```

- [ ] **Schritt 4: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "error"
```

Erwartet: keine Zeilen (außer möglicher Fehler wegen noch fehlender `LeadsRoute` — dieser verschwindet nach Task 7)

- [ ] **Schritt 5: Commit**

```powershell
git add src/store/ui.store.ts src/components/layout/NavSidebar.tsx src/App.tsx
git commit -m "feat(leads): AppView + NavSidebar + App.tsx Wiring"
```

---

## Task 7: LeadsRoute — Tab "New In"

**Files:**
- Create: `src/routes/LeadsRoute.tsx`

- [ ] **Schritt 1: `src/routes/LeadsRoute.tsx` erstellen**

```tsx
import { useState, useMemo } from 'react'
import { useLeadsStore } from '@/store/leads.store'
import { useUiStore } from '@/store/ui.store'
import type { Lead, LeadStatus, BulkUpdateLeadsPayload } from '@/types/lead.types'

type Tab = 'new_in' | 'lead_phases' | 'reengage'

const SOURCE_LABEL: Record<string, string> = {
  zoom: 'Zoom Webinar',
  generic: 'Web',
  manual: 'Manuell',
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  attempted: 'Attempted',
  warm: 'Warm Lead',
  lost_reengage: 'Lost',
}

function LeadSourceBadge({ source, detail }: { source: string; detail?: string | null }) {
  const label = detail ?? SOURCE_LABEL[source] ?? source
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 10,
      background: source === 'zoom' ? '#2d1f3d' : '#0f2d1a',
      color: source === 'zoom' ? '#a78bfa' : '#4ade80',
    }}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const colors: Record<LeadStatus, { bg: string; fg: string }> = {
    new: { bg: '#1e3a5f', fg: '#60a5fa' },
    attempted: { bg: '#2d2000', fg: '#fbbf24' },
    warm: { bg: '#0f2d1a', fg: '#4ade80' },
    lost_reengage: { bg: '#2d0f0f', fg: '#f87171' },
  }
  const c = colors[status]
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg }}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function NewInTab() {
  const newLeads = useLeadsStore(s => s.newLeads())
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = selected.size === newLeads.length && newLeads.length > 0
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(newLeads.map(l => l.id)))
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const applyBulk = (status: LeadStatus, reEngageDate?: string) => {
    const ids = Array.from(selected)
    if (!ids.length) return
    bulkUpdate({ ids, status, reEngageDate })
    setSelected(new Set())
  }

  const dayOffset = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: 'var(--primary)', width: 14, height: 14 }} />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          {selected.size > 0 ? `${selected.size} ausgewählt` : 'Alle'}
        </span>
        <div style={{ flex: 1 }} />
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => applyBulk('attempted')}>Follow-Up erstellen</button>
            <button className="btn-ghost" style={{ fontSize: 11, color: 'var(--success)' }} onClick={() => applyBulk('warm')}>Warm Lead</button>
            <button className="btn-ghost" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => applyBulk('lost_reengage', dayOffset(90))}>Lost</button>
            <button className="btn-ghost" style={{ fontSize: 11, color: '#fbbf24' }} onClick={() => applyBulk('lost_reengage', dayOffset(90))}>Re-Engage</button>
          </div>
        )}
        <button className="btn-primary" style={{ fontSize: 11 }}>+ Lead</button>
      </div>

      {/* List */}
      {newLeads.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
          Keine neuen Leads — Webhooks konfigurieren unter Settings → Integrationen
        </div>
      ) : (
        newLeads.map(lead => (
          <div key={lead.id} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 130px 80px 80px 100px',
            alignItems: 'center', padding: '10px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <input
              type="checkbox"
              checked={selected.has(lead.id)}
              onChange={() => toggle(lead.id)}
              style={{ accentColor: 'var(--primary)', width: 13, height: 13 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{lead.name}</div>
              {lead.email && <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{lead.email}</div>}
            </div>
            <LeadSourceBadge source={lead.leadSource} detail={lead.leadSourceDetail} />
            <div style={{ fontSize: 11, color: '#fbbf24', textAlign: 'center' }}>Score: {lead.engagementScore}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
              {new Date(lead.createdAt).toLocaleDateString('de-DE')}
            </div>
            <StatusBadge status={lead.leadStatus} />
          </div>
        ))
      )}
    </div>
  )
}

function LeadPhasesTab() {
  const attempted = useLeadsStore(s => s.attemptedLeads())
  const warm = useLeadsStore(s => s.warmLeads())
  const lost = useLeadsStore(s => s.lostLeads())
  const convertToClient = useLeadsStore(s => s.convertToClient)

  function Group({ label, color, leads, showConvert }: {
    label: string; color: string; leads: Lead[]; showConvert?: boolean
  }) {
    if (!leads.length) return null
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color, marginBottom: 8, padding: '0 20px' }}>
          {label} <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}>{leads.length}</span>
        </div>
        {leads.map(lead => (
          <div key={lead.id} style={{
            display: 'flex', alignItems: 'center', padding: '9px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{lead.name}</span>
              {lead.leadSourceDetail && (
                <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 8 }}>· {lead.leadSourceDetail}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginRight: 12 }}>
              {new Date(lead.updatedAt).toLocaleDateString('de-DE')}
            </div>
            {showConvert && (
              <button
                className="btn-ghost"
                style={{ fontSize: 11, color: 'var(--success)' }}
                onClick={() => convertToClient(lead.id)}
              >
                Zu Kunde machen
              </button>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <Group label="ATTEMPTED" color="#fbbf24" leads={attempted} />
      <Group label="WARM LEADS" color="#4ade80" leads={warm} showConvert />
      <Group label="LOST / RE-ENGAGE" color="#f87171" leads={lost} />
    </div>
  )
}

function ReEngageTab() {
  const reEngageLeads = useLeadsStore(s => s.reEngageLeads())
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)

  const dayOffset = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  return (
    <div style={{ paddingTop: 12 }}>
      {reEngageLeads.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
          Keine Re-Engage-Leads
        </div>
      ) : (
        reEngageLeads.map(lead => (
          <div key={lead.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 200px',
            alignItems: 'center', padding: '10px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{lead.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                {SOURCE_LABEL[lead.leadSource] ?? lead.leadSource} · Score: {lead.engagementScore}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#f87171' }}>
              {lead.reEngageDate
                ? new Date(lead.reEngageDate).toLocaleDateString('de-DE')
                : '—'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn-ghost"
                style={{ fontSize: 11 }}
                onClick={() => bulkUpdate({ ids: [lead.id], status: 'attempted' })}
              >
                Follow-Up jetzt
              </button>
              <button
                className="btn-ghost"
                style={{ fontSize: 11, color: 'var(--fg-dim)' }}
                onClick={() => bulkUpdate({ ids: [lead.id], status: 'lost_reengage', reEngageDate: dayOffset(90) })}
              >
                +90 Tage
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function LeadsRoute() {
  const [tab, setTab] = useState<Tab>('new_in')
  const leads = useLeadsStore(s => s.leads)
  const newCount = useLeadsStore(s => s.newLeads().length)
  const isLoading = useLeadsStore(s => s.isLoading)

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'new_in', label: 'New In', count: newCount },
    { id: 'lead_phases', label: 'Lead Phases' },
    { id: 'reengage', label: 'Re-Engage' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Leads.</h1>
          <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>{leads.length} gesamt</span>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', fontSize: 13, border: 'none', background: 'none',
                cursor: 'pointer', color: tab === t.id ? 'var(--fg)' : 'var(--fg-dim)',
                fontWeight: tab === t.id ? 700 : 400,
                borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              {t.label}
              {t.count ? (
                <span style={{
                  marginLeft: 6, background: '#2d1f3d', color: '#a78bfa',
                  fontSize: 10, padding: '1px 6px', borderRadius: 8,
                }}>
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            {tab === 'new_in' && <NewInTab />}
            {tab === 'lead_phases' && <LeadPhasesTab />}
            {tab === 'reengage' && <ReEngageTab />}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "error"
```

Erwartet: keine Zeilen

- [ ] **Schritt 3: App im Browser prüfen**

```powershell
npm run tauri dev
```

- Nav zeigt "Leads" über Pipeline
- Kbd `N` navigiert zu Leads
- Alle drei Tabs klickbar
- New In: leere Liste wenn keine Leads vorhanden ("Keine neuen Leads")

- [ ] **Schritt 4: Commit**

```powershell
git add src/routes/LeadsRoute.tsx
git commit -m "feat(leads): LeadsRoute — New In + Lead Phases + Re-Engage Tabs"
```

---

## Task 8: Supabase Edge Function

**Files:**
- Create: `supabase/functions/lead-intake/index.ts`

> Diese Funktion wird separat via `supabase functions deploy lead-intake` deployed — nicht Teil des Tauri-Builds.

- [ ] **Schritt 1: Verzeichnis anlegen + Funktion erstellen**

```powershell
New-Item -ItemType Directory -Force supabase/functions/lead-intake
```

`supabase/functions/lead-intake/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface NormalizedLead {
  email: string
  name: string | null
  source: 'zoom' | 'generic'
  source_detail: string | null
}

function parseZoom(body: Record<string, unknown>): NormalizedLead | null {
  try {
    const obj = (body as any).payload?.object
    const reg = obj?.registrant
    if (!reg?.email) return null
    return {
      email: reg.email,
      name: [reg.first_name, reg.last_name].filter(Boolean).join(' ') || null,
      source: 'zoom',
      source_detail: obj?.topic ?? null,
    }
  } catch {
    return null
  }
}

function parseGeneric(body: Record<string, unknown>): NormalizedLead | null {
  const email = body.email as string | undefined
  if (!email) return null
  return {
    email,
    name: (body.name as string | null) ?? null,
    source: 'generic',
    source_detail: (body.source_detail as string | null) ?? null,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspace_id')
  const secret = url.searchParams.get('secret')
  const source = url.searchParams.get('source') ?? 'generic'

  if (!workspaceId || !secret) {
    return new Response('Missing workspace_id or secret', { status: 400 })
  }

  const expectedSecret = Deno.env.get('LEAD_WEBHOOK_SECRET')
  if (secret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const lead = source === 'zoom' ? parseZoom(body) : parseGeneric(body)
  if (!lead) {
    return new Response('Could not parse lead — missing email field', { status: 422 })
  }

  const { error } = await supabase.from('pending_leads').insert({
    workspace_id: workspaceId,
    email: lead.email,
    name: lead.name,
    source: lead.source,
    source_detail: lead.source_detail,
    payload: body,
    synced: false,
  })

  if (error) {
    console.error('Insert error:', error)
    return new Response('Database error', { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Schritt 2: `pending_leads` Tabelle in Supabase erstellen**

Im Supabase Dashboard → SQL Editor ausführen:

```sql
CREATE TABLE IF NOT EXISTS pending_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT,
  source        TEXT NOT NULL,
  source_detail TEXT,
  payload       JSONB,
  synced        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_leads_sync
  ON pending_leads(workspace_id, synced);
```

- [ ] **Schritt 3: Edge Function deployen**

```powershell
npx supabase functions deploy lead-intake --project-ref YOUR_PROJECT_REF
```

Geheimnis setzen:
```powershell
npx supabase secrets set LEAD_WEBHOOK_SECRET=cynera_$(New-Guid).ToString().Replace('-','') --project-ref YOUR_PROJECT_REF
```

- [ ] **Schritt 4: Funktion mit curl testen**

```powershell
$URL = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/lead-intake?workspace_id=dev&secret=DEIN_SECRET&source=generic"
curl -X POST $URL -H "Content-Type: application/json" -d '{"email":"test@example.com","name":"Test User"}'
```

Erwartet: `{"ok":true}`

In Supabase Dashboard → Table Editor → `pending_leads` → Zeile sichtbar mit `synced=false`.

- [ ] **Schritt 5: Commit**

```powershell
git add supabase/
git commit -m "feat(leads): Supabase Edge Function lead-intake (Zoom + Generic Parser)"
```

---

## Task 9: Settings — Webhook URLs

**Files:**
- Modify: `src/routes/SettingsRoute.tsx`

- [ ] **Schritt 1: Webhook-URLs-Sektion in SettingsRoute hinzufügen**

In `src/routes/SettingsRoute.tsx` einen neuen Abschnitt "Leads & Integrationen" hinzufügen. Die URLs werden aus den Umgebungsvariablen + der Workspace-ID zusammengesetzt:

```tsx
import { useWorkspaceStore } from '@/store/workspace.store'

// Im Settings-Render:
function LeadIntegrationsSection() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const baseUrl = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/lead-intake'
  const secret = import.meta.env.VITE_LEAD_WEBHOOK_SECRET ?? 'NICHT_KONFIGURIERT'

  const zoomUrl = `${baseUrl}?workspace_id=${workspaceId}&secret=${secret}&source=zoom`
  const genericUrl = `${baseUrl}?workspace_id=${workspaceId}&secret=${secret}&source=generic`

  const copy = (text: string) => navigator.clipboard.writeText(text)

  return (
    <div className="settings-section">
      <h3>Leads & Integrationen</h3>
      <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 16 }}>
        Trage diese URLs in deine externen Tools ein. Leads landen automatisch im "New In"-Tab.
      </p>
      {[
        { label: 'Zoom Webinar URL', url: zoomUrl },
        { label: 'Generic URL (Wix, WordPress, Zapier)', url: genericUrl },
      ].map(({ label, url }) => (
        <div key={label} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{label}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '7px 10px', fontSize: 10,
              fontFamily: 'var(--font-mono)', color: 'var(--primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {url}
            </div>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => copy(url)}>
              Kopieren
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

> `VITE_LEAD_WEBHOOK_SECRET` muss in `.env` gesetzt sein (gleicher Wert wie der Supabase Secret).

- [ ] **Schritt 2: Umgebungsvariable dokumentieren**

In `.env.example` (oder `.env` lokal):
```
VITE_LEAD_WEBHOOK_SECRET=dein_secret_hier
```

- [ ] **Schritt 3: Visuell prüfen**

App starten → Settings → "Leads & Integrationen" sichtbar → "Kopieren"-Button kopiert URL in Clipboard.

- [ ] **Schritt 4: Commit**

```powershell
git add src/routes/SettingsRoute.tsx
git commit -m "feat(leads): Settings — Webhook URLs mit Kopieren-Button"
```

---

## Self-Review Checklist

| Spec-Anforderung | Task |
|-----------------|------|
| accounts + lead-Spalten (account_type, lead_status, lead_source, email, engagement_score, re_engage_date, converted_at) | Task 1 |
| Supabase pending_leads Tabelle | Task 8 |
| TypeScript-Typen (Lead, LeadStatus, UpsertLeadPayload, BulkUpdateLeadsPayload) | Task 4 |
| Rust DB: get_leads, upsert_lead, bulk_update_lead_status, convert_lead_to_client, insert_synced_leads | Task 2 |
| Tauri Commands + main.rs Registrierung | Task 3 |
| Zustand Store mit load, upsert, bulkUpdate, convertToClient, syncPending | Task 5 |
| NavSidebar: Leads über Pipeline, Badge für New-Count, Kbd N | Task 6 |
| AppView + App.tsx Wiring + Sync beim Start | Task 6 |
| LeadsRoute: Tab New In mit Checkbox + Bulk-Actions | Task 7 |
| LeadsRoute: Tab Lead Phases nach Status gruppiert | Task 7 |
| LeadsRoute: Tab Re-Engage mit Datum + Aktionen | Task 7 |
| Edge Function: Zoom-Parser + Generic-Parser | Task 8 |
| Settings: Webhook-URLs anzeigen + kopieren | Task 9 |
| Lead→Client Conversion | Task 2 (DB) + Task 7 (UI Button) |
