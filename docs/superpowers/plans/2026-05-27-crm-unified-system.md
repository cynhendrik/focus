# CRM Unified System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Einheitliches CRM-System: Lead-Pipeline-Stages, automatische Follow-up-Sequenzen, Activity-Richtung (email_in/email_out), keine Redundanz.

**Architecture:** `accounts` bleibt die Single Source of Truth für Lead und Client. Neues `pipeline_stage`-Feld ersetzt `lead_status` als Stage-Maschinenfeld. `follow_up_queue` Tabelle speichert automatische Follow-up-Sequenzen. `activities` bekommt `direction` + `email_id`.

**Tech Stack:** Rust/rusqlite (migrations.rs CURRENT_VERSION=14→15), TypeScript/React, Zustand, Tauri v2 invoke

---

## Task 1: DB Migration v15 (Rust schema + migrations)

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/db/schema.rs`

### What to do

In `migrations.rs`: Increment `CURRENT_VERSION` to 15. Add `v15` match arm in `apply()`:

```rust
15 => {
    // 1. accounts neue Felder
    for col in [
        ("pipeline_stage", "TEXT NOT NULL DEFAULT 'inbox'"),
        ("company_name", "TEXT"),
        ("linkedin_url", "TEXT"),
        ("last_activity_at", "TEXT"),
        ("next_follow_up_at", "TEXT"),
    ] {
        if !column_exists(conn, "accounts", col.0) {
            conn.execute_batch(&format!(
                "ALTER TABLE accounts ADD COLUMN {} {};",
                col.0, col.1
            ))?;
        }
    }
    // 2. pipeline_stage aus lead_status befüllen
    conn.execute_batch(r#"
        UPDATE accounts SET pipeline_stage = CASE lead_status
            WHEN 'new'           THEN 'inbox'
            WHEN 'attempted'     THEN 'waiting_reply'
            WHEN 'warm'          THEN 'replied'
            WHEN 'lost_reengage' THEN 'inbox'
            ELSE 'inbox'
        END WHERE account_type = 'lead' AND pipeline_stage = 'inbox';
    "#)?;
    // 3. Unique-Guard gegen Lead-Duplikate per E-Mail
    conn.execute_batch(r#"
        CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_lead_email
            ON accounts(workspace_id, LOWER(email))
            WHERE account_type = 'lead' AND email IS NOT NULL;
    "#)?;
    // 4. activities: direction + email_id
    for col in [("direction", "TEXT"), ("email_id", "TEXT")] {
        if !column_exists(conn, "activities", col.0) {
            conn.execute_batch(&format!(
                "ALTER TABLE activities ADD COLUMN {} {};",
                col.0, col.1
            ))?;
        }
    }
    // legacy: alle alten 'email'-Activities bekommen direction='in'
    conn.execute_batch(r#"
        UPDATE activities SET direction = 'in'
            WHERE type = 'email' AND direction IS NULL;
    "#)?;
    // 5. emails: direction + activity_id
    for col in [
        ("direction", "TEXT NOT NULL DEFAULT 'in'"),
        ("activity_id", "TEXT"),
    ] {
        if !column_exists(conn, "emails", col.0) {
            conn.execute_batch(&format!(
                "ALTER TABLE emails ADD COLUMN {} {};",
                col.0, col.1
            ))?;
        }
    }
    // 6. follow_up_queue neue Tabelle
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS follow_up_queue (
            id                  TEXT PRIMARY KEY,
            workspace_id        TEXT NOT NULL,
            lead_id             TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            trigger_activity_id TEXT,
            sequence_index      INTEGER NOT NULL DEFAULT 1,
            send_at             TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending',
            template_key        TEXT NOT NULL DEFAULT 'value',
            draft_subject       TEXT,
            draft_body          TEXT,
            sent_activity_id    TEXT,
            sent_at             TEXT,
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_followup_queue_lead
            ON follow_up_queue(lead_id, status, send_at);
        CREATE INDEX IF NOT EXISTS idx_followup_queue_workspace
            ON follow_up_queue(workspace_id, status, send_at);
    "#)?;
    Ok(())
}
```

In `schema.rs`: Add the same new columns to the `accounts` CREATE TABLE, add `direction TEXT` and `email_id TEXT` to `activities` CREATE TABLE, add `direction TEXT NOT NULL DEFAULT 'in'` and `activity_id TEXT` to `emails` CREATE TABLE, and add the full `follow_up_queue` CREATE TABLE at the bottom.

Also add to schema.rs tests: verify `follow_up_queue` table exists after create_tables.

### Tests to add in migrations.rs

```rust
#[test]
fn migration_v15_adds_pipeline_stage_and_follow_up_queue() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    assert!(column_exists(&conn, "accounts", "pipeline_stage"));
    assert!(column_exists(&conn, "accounts", "company_name"));
    assert!(column_exists(&conn, "accounts", "linkedin_url"));
    assert!(column_exists(&conn, "accounts", "last_activity_at"));
    assert!(column_exists(&conn, "accounts", "next_follow_up_at"));
    assert!(column_exists(&conn, "activities", "direction"));
    assert!(column_exists(&conn, "activities", "email_id"));
    assert!(column_exists(&conn, "emails", "direction"));
    assert!(column_exists(&conn, "emails", "activity_id"));
    assert!(table_exists_helper(&conn, "follow_up_queue"));
}

#[test]
fn migration_v15_migrates_lead_status_to_pipeline_stage() {
    let conn = in_memory_db();
    let now = "2026-01-01T00:00:00Z";
    // Insert account with lead fields (post-v11)
    run(&conn).unwrap();
    conn.execute(
        "INSERT INTO accounts (id, workspace_id, created_by, name, account_type, lead_status, created_at, updated_at)
         VALUES ('l1','ws-1','','Test Lead','lead','warm',?1,?1)",
        [now],
    ).unwrap();
    // Re-run migration on an account that already has lead_status set but pipeline_stage=inbox
    conn.execute_batch(
        "UPDATE accounts SET pipeline_stage = CASE lead_status
            WHEN 'new'           THEN 'inbox'
            WHEN 'attempted'     THEN 'waiting_reply'
            WHEN 'warm'          THEN 'replied'
            WHEN 'lost_reengage' THEN 'inbox'
            ELSE 'inbox'
        END WHERE account_type = 'lead' AND pipeline_stage = 'inbox';"
    ).unwrap();
    let stage: String = conn.query_row(
        "SELECT pipeline_stage FROM accounts WHERE id='l1'", [], |r| r.get(0),
    ).unwrap();
    assert_eq!(stage, "replied");
}
```

Run: `cargo test -p cynera-focus-lib db::migrations -- --nocapture`
Expected: all tests pass

Commit: `feat(db): Migration v15 — pipeline_stage, follow_up_queue, activity.direction`

---

## Task 2: Rust DB Layer — lead.rs, activity.rs, follow_up_queue.rs, db/mod.rs

**Files:**
- Modify: `src-tauri/src/db/lead.rs`
- Modify: `src-tauri/src/db/activity.rs`
- Create: `src-tauri/src/db/follow_up_queue.rs`
- Modify: `src-tauri/src/db/mod.rs`

### lead.rs changes

Add fields to `Lead` struct:
```rust
pub pipeline_stage: String,
pub company_name: Option<String>,
pub linkedin_url: Option<String>,
pub last_activity_at: Option<String>,
pub next_follow_up_at: Option<String>,
```

Update `SELECT` const to include new columns. Update `map_row` to read them.

Update `upsert_lead` to accept and store `pipeline_stage` (default `'inbox'`), `company_name`, `linkedin_url`.

Add new functions:
```rust
pub fn update_pipeline_stage(conn: &Connection, id: &str, stage: &str) -> Result<Lead, AppError>
pub fn update_last_activity(conn: &Connection, id: &str, at: &str) -> Result<(), AppError>
pub fn update_next_follow_up(conn: &Connection, id: &str, at: Option<&str>) -> Result<(), AppError>
```

Add to `UpsertLeadPayload`:
```rust
pub pipeline_stage: Option<String>,
pub company_name: Option<String>,
pub linkedin_url: Option<String>,
```

### activity.rs changes

Add fields to `Activity` struct:
```rust
pub direction: Option<String>,
pub email_id: Option<String>,
```

Update SELECT query to include `direction, email_id`. Update `map_row` to read them (positions shift: add direction at position 16, email_id at 17; created_at→18, updated_at→19).

Update `CreateActivityPayload` to include:
```rust
pub direction: Option<String>,
pub email_id: Option<String>,
```

Update `insert()` to store direction and email_id.

### follow_up_queue.rs (NEW file)

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FollowUpQueueItem {
    pub id: String,
    pub workspace_id: String,
    pub lead_id: String,
    pub trigger_activity_id: Option<String>,
    pub sequence_index: i64,
    pub send_at: String,
    pub status: String,        // pending | sent | cancelled | skipped
    pub template_key: String,  // value | social_proof | question | urgency
    pub draft_subject: Option<String>,
    pub draft_body: Option<String>,
    pub sent_activity_id: Option<String>,
    pub sent_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFollowUpItemPayload {
    pub workspace_id: String,
    pub lead_id: String,
    pub trigger_activity_id: Option<String>,
    pub sequence_index: i64,
    pub send_at: String,       // ISO date string
    pub template_key: String,
    pub draft_subject: Option<String>,
    pub draft_body: Option<String>,
}

// Functions:
pub fn create_item(conn: &Connection, payload: CreateFollowUpItemPayload) -> Result<FollowUpQueueItem, AppError>
pub fn cancel_for_lead(conn: &Connection, lead_id: &str) -> Result<usize, AppError>   // sets pending→cancelled
pub fn get_due(conn: &Connection, workspace_id: &str) -> Result<Vec<FollowUpQueueItem>, AppError>  // send_at <= now, status=pending
pub fn get_for_lead(conn: &Connection, lead_id: &str) -> Result<Vec<FollowUpQueueItem>, AppError>
pub fn mark_sent(conn: &Connection, id: &str, sent_activity_id: &str) -> Result<FollowUpQueueItem, AppError>
pub fn mark_skipped(conn: &Connection, id: &str) -> Result<FollowUpQueueItem, AppError>
pub fn update_draft(conn: &Connection, id: &str, subject: Option<&str>, body: Option<&str>) -> Result<FollowUpQueueItem, AppError>
pub fn create_sequence(
    conn: &Connection,
    workspace_id: &str,
    lead_id: &str,
    trigger_activity_id: &str,
    lead_name: &str,
    company_name: Option<&str>,
) -> Result<Vec<FollowUpQueueItem>, AppError>
// create_sequence: creates 4 items with send_at = now+2d, +5d, +10d, +21d
// template_keys: ["value", "social_proof", "question", "urgency"]
// generates draft_subject and draft_body for each using lead_name + company_name
```

### db/mod.rs

Add: `pub mod follow_up_queue;`

### Tests

In `follow_up_queue.rs`:
```rust
#[test]
fn create_sequence_creates_4_items()
#[test]  
fn cancel_for_lead_cancels_pending()
#[test]
fn get_due_returns_overdue_pending()
#[test]
fn mark_sent_updates_status()
```

Run: `cargo test -p cynera-focus-lib db::follow_up_queue -- --nocapture`
Expected: all pass

Commit: `feat(db): Lead pipeline_stage fields, Activity direction, FollowUpQueue DB layer`

---

## Task 3: Rust Commands — follow_up.rs, lead.rs update, mod.rs, main.rs

**Files:**
- Create: `src-tauri/src/commands/follow_up.rs`
- Modify: `src-tauri/src/commands/lead.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

### commands/follow_up.rs (NEW)

```rust
use tauri::State;
use crate::{AppError, db, db::pool::DbPool};
use crate::db::follow_up_queue::{FollowUpQueueItem, CreateFollowUpItemPayload};

#[tauri::command]
pub fn cmd_get_due_follow_ups(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<FollowUpQueueItem>, AppError>

#[tauri::command]
pub fn cmd_get_follow_ups_for_lead(db: State<'_, DbPool>, lead_id: String) -> Result<Vec<FollowUpQueueItem>, AppError>

#[tauri::command]
pub fn cmd_create_follow_up_sequence(
    db: State<'_, DbPool>,
    workspace_id: String,
    lead_id: String,
    trigger_activity_id: String,
    lead_name: String,
    company_name: Option<String>,
) -> Result<Vec<FollowUpQueueItem>, AppError>

#[tauri::command]
pub fn cmd_cancel_follow_ups_for_lead(db: State<'_, DbPool>, lead_id: String) -> Result<usize, AppError>

#[tauri::command]
pub fn cmd_mark_follow_up_sent(
    db: State<'_, DbPool>,
    id: String,
    sent_activity_id: String,
) -> Result<FollowUpQueueItem, AppError>

#[tauri::command]
pub fn cmd_mark_follow_up_skipped(db: State<'_, DbPool>, id: String) -> Result<FollowUpQueueItem, AppError>

#[tauri::command]
pub fn cmd_update_follow_up_draft(
    db: State<'_, DbPool>,
    id: String,
    subject: Option<String>,
    body: Option<String>,
) -> Result<FollowUpQueueItem, AppError>
```

### commands/lead.rs update

Add new command:
```rust
#[tauri::command]
pub fn update_lead_stage(
    db: State<'_, DbPool>,
    id: String,
    stage: String,
) -> Result<Lead, AppError> {
    db::lead::update_pipeline_stage(&db.conn(), &id, &stage)
}
```

### commands/mod.rs

Add: `pub mod follow_up;`

### main.rs

In the `invoke_handler` list, after `commands::lead::insert_synced_leads,` add:
```rust
commands::lead::update_lead_stage,
commands::follow_up::cmd_get_due_follow_ups,
commands::follow_up::cmd_get_follow_ups_for_lead,
commands::follow_up::cmd_create_follow_up_sequence,
commands::follow_up::cmd_cancel_follow_ups_for_lead,
commands::follow_up::cmd_mark_follow_up_sent,
commands::follow_up::cmd_mark_follow_up_skipped,
commands::follow_up::cmd_update_follow_up_draft,
```

Run: `cargo build 2>&1` — must compile with 0 errors.

Commit: `feat(commands): follow_up commands + update_lead_stage`

---

## Task 4: TypeScript Types + Services

**Files:**
- Modify: `src/types/lead.types.ts`
- Modify: `src/types/activity.types.ts`
- Create: `src/types/follow-up-queue.types.ts`
- Modify: `src/services/leads.service.ts`
- Create: `src/services/follow-up-queue.service.ts`

### lead.types.ts

```typescript
export type PipelineStage =
  | 'inbox' | 'waiting_reply' | 'replied' | 'call_booked' | 'won' | 'lost'

// Keep LeadStatus for backward compat (legacy field)
export type LeadStatus = 'new' | 'attempted' | 'warm' | 'lost_reengage'
export type LeadSource = 'zoom' | 'generic' | 'manual' | 'inbox' | 'linkedin' | 'website' | 'event'

export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string | null
  accountType: 'lead'
  // New canonical stage field
  pipelineStage: PipelineStage
  // Legacy (still on DB, kept for compat)
  leadStatus: LeadStatus
  leadSource: LeadSource
  leadSourceDetail: string | null
  companyName: string | null      // NEW
  linkedinUrl: string | null      // NEW
  lastActivityAt: string | null   // NEW
  nextFollowUpAt: string | null   // NEW
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
  pipelineStage?: PipelineStage   // NEW
  leadStatus?: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  companyName?: string             // NEW
  linkedinUrl?: string             // NEW
  reEngageDate?: string
}

export interface BulkUpdateLeadsPayload {
  ids: string[]
  status: LeadStatus
  reEngageDate?: string
}

export interface PendingLead {
  id: string
  workspace_id: string
  email: string
  name: string | null
  source: 'zoom' | 'generic'
  source_detail: string | null
  payload: Record<string, unknown>
  synced: boolean
  created_at: string
}
```

### activity.types.ts

Add `direction` and `emailId` to `Activity` and `CreateActivityPayload`:
```typescript
export type ActivityDirection = 'in' | 'out'

export interface Activity extends TimestampedEntity {
  // ... existing fields ...
  direction?: ActivityDirection    // NEW: 'in' | 'out' | undefined
  emailId?: string                 // NEW
}

export interface CreateActivityPayload {
  // ... existing fields ...
  direction?: ActivityDirection    // NEW
  emailId?: string                 // NEW
}
```

Also update `ActivityType` to include `'email_out' | 'email_in'`:
```typescript
export type ActivityType =
  | 'note' | 'task' | 'call' | 'meeting'
  | 'email' | 'email_out' | 'email_in'  // 'email' kept for legacy
  | 'file' | 'time_entry' | 'stage_change' | 'dm' | 'system_event'
```

### follow-up-queue.types.ts (NEW)

```typescript
export type FollowUpStatus = 'pending' | 'sent' | 'cancelled' | 'skipped'
export type FollowUpTemplateKey = 'value' | 'social_proof' | 'question' | 'urgency'

export interface FollowUpQueueItem {
  id: string
  workspaceId: string
  leadId: string
  triggerActivityId: string | null
  sequenceIndex: number
  sendAt: string
  status: FollowUpStatus
  templateKey: FollowUpTemplateKey
  draftSubject: string | null
  draftBody: string | null
  sentActivityId: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateFollowUpSequencePayload {
  workspaceId: string
  leadId: string
  triggerActivityId: string
  leadName: string
  companyName?: string
}
```

### leads.service.ts

Add:
```typescript
updateStage(id: string, stage: PipelineStage): Promise<Lead> {
  return invoke('update_lead_stage', { id, stage })
},
```

### follow-up-queue.service.ts (NEW)

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { FollowUpQueueItem, CreateFollowUpSequencePayload } from '@/types/follow-up-queue.types'

export const FollowUpQueueService = {
  getDue(workspaceId: string): Promise<FollowUpQueueItem[]> {
    return invoke('cmd_get_due_follow_ups', { workspaceId })
  },
  getForLead(leadId: string): Promise<FollowUpQueueItem[]> {
    return invoke('cmd_get_follow_ups_for_lead', { leadId })
  },
  createSequence(p: CreateFollowUpSequencePayload): Promise<FollowUpQueueItem[]> {
    return invoke('cmd_create_follow_up_sequence', {
      workspaceId: p.workspaceId,
      leadId: p.leadId,
      triggerActivityId: p.triggerActivityId,
      leadName: p.leadName,
      companyName: p.companyName ?? null,
    })
  },
  cancelForLead(leadId: string): Promise<number> {
    return invoke('cmd_cancel_follow_ups_for_lead', { leadId })
  },
  markSent(id: string, sentActivityId: string): Promise<FollowUpQueueItem> {
    return invoke('cmd_mark_follow_up_sent', { id, sentActivityId })
  },
  markSkipped(id: string): Promise<FollowUpQueueItem> {
    return invoke('cmd_mark_follow_up_skipped', { id })
  },
  updateDraft(id: string, subject: string | null, body: string | null): Promise<FollowUpQueueItem> {
    return invoke('cmd_update_follow_up_draft', { id, subject, body })
  },
}
```

Run: `npx tsc --noEmit` — 0 errors

Commit: `feat(types+services): Lead pipeline_stage, Activity direction, FollowUpQueue types`

---

## Task 5: Zustand Stores — leads.store.ts, follow-up-queue.store.ts

**Files:**
- Modify: `src/store/leads.store.ts`
- Create: `src/store/follow-up-queue.store.ts`

### leads.store.ts update

1. Replace `leadStatus`-based selectors with `pipelineStage`-based:
   - `newLeads()` → `leads.filter(l => l.pipelineStage === 'inbox')`
   - `attemptedLeads()` → `leads.filter(l => l.pipelineStage === 'waiting_reply')`
   - `warmLeads()` → `leads.filter(l => l.pipelineStage === 'replied')`
   - `lostLeads()` → `leads.filter(l => l.pipelineStage === 'lost')`
   - `reEngageLeads()` → keep as is (based on reEngageDate)

2. Add `updateStage` action:
```typescript
updateStage: async (id: string, stage: PipelineStage) => {
  try {
    const lead = await LeadsService.updateStage(id, stage)
    set(s => ({ leads: s.leads.map(l => l.id === id ? lead : l) }))
  } catch (err) {
    const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
    set({ error }); throw err
  }
},
```

3. Add `updateStage: (id: string, stage: PipelineStage) => Promise<void>` to interface.

4. Import `PipelineStage` from lead.types.

### follow-up-queue.store.ts (NEW)

```typescript
import { create } from 'zustand'
import { FollowUpQueueService } from '@/services/follow-up-queue.service'
import { log } from '@/lib/logger'
import type { FollowUpQueueItem, CreateFollowUpSequencePayload } from '@/types/follow-up-queue.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface FollowUpQueueState {
  items: FollowUpQueueItem[]
  isLoading: boolean
  error: AppError | null
  loadDue: (workspaceId: string) => Promise<void>
  loadForLead: (leadId: string) => Promise<void>
  createSequence: (payload: CreateFollowUpSequencePayload) => Promise<FollowUpQueueItem[]>
  cancelForLead: (leadId: string) => Promise<void>
  markSent: (id: string, sentActivityId: string) => Promise<void>
  markSkipped: (id: string) => Promise<void>
  updateDraft: (id: string, subject: string | null, body: string | null) => Promise<void>
  pendingItems: () => FollowUpQueueItem[]
  dueToday: () => FollowUpQueueItem[]
}

export const useFollowUpQueueStore = create<FollowUpQueueState>()((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  loadDue: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const items = await FollowUpQueueService.getDue(workspaceId)
      set({ items, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load due follow-ups', { error })
    }
  },

  loadForLead: async (leadId) => {
    set({ isLoading: true, error: null })
    try {
      const items = await FollowUpQueueService.getForLead(leadId)
      set({ items, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  createSequence: async (payload) => {
    try {
      const newItems = await FollowUpQueueService.createSequence(payload)
      set(s => ({ items: [...s.items, ...newItems] }))
      return newItems
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  cancelForLead: async (leadId) => {
    try {
      await FollowUpQueueService.cancelForLead(leadId)
      set(s => ({
        items: s.items.map(i =>
          i.leadId === leadId && i.status === 'pending'
            ? { ...i, status: 'cancelled' as const }
            : i
        ),
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  markSent: async (id, sentActivityId) => {
    try {
      const updated = await FollowUpQueueService.markSent(id, sentActivityId)
      set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  markSkipped: async (id) => {
    try {
      const updated = await FollowUpQueueService.markSkipped(id)
      set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  updateDraft: async (id, subject, body) => {
    try {
      const updated = await FollowUpQueueService.updateDraft(id, subject, body)
      set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  pendingItems: () => get().items.filter(i => i.status === 'pending'),
  dueToday: () => {
    const now = new Date().toISOString()
    return get().items.filter(i => i.status === 'pending' && i.sendAt <= now)
  },
}))
```

Run: `npx tsc --noEmit` — 0 errors

Commit: `feat(stores): leads pipelineStage selectors + follow-up-queue store`

---

## Task 6: Follow-ups Dashboard UI Update

**Files:**
- Modify: `src/routes/FollowupsDashboardRoute.tsx`

### What to change

The route currently shows manual follow-ups from `useActivitiesStore().followups` (type='followup' Activities). It needs to also show automated follow-up queue items from `useFollowUpQueueStore`.

**Design:** Two sections in the existing page:
1. **Automatische Follow-ups** (top, from follow_up_queue, status=pending, send_at<=now) — shown as `AutoFollowUpRow`
2. **Manuelle Follow-ups** (existing section, unchanged) — existing `FollowupRow` component

**AutoFollowUpRow component:**
- Shows lead name + company (fetched via `useLeadsStore`)
- Shows sequence badge: "Follow-up 1/4", "Follow-up 2/4" etc.
- Shows template type chip (Mehrwert / Social Proof / Frage / Dringlichkeit)
- Shows draft text preview (first 80 chars of draft_body)
- Shows days-since-last-contact badge
- Actions: "Bearbeiten & Senden" (opens draft editor), "Überspringen"

**DraftEditorModal component:**
- Shows editable `draft_subject` input
- Shows editable `draft_body` textarea
- Buttons: "Senden" (markSent + create email activity via useActivitiesStore), "Abbrechen"
- On send: calls `createActivity({ type: 'email_out', direction: 'out', ... })` then `markSent(id, activity.id)`

**Load on mount:** `loadDue(workspaceId)` from follow-up-queue store

**Badge count in header:** Total = `openFollowups.length + dueFollowUpQueueItems.length`

**Preserve existing functionality** — don't break manual follow-ups.

Run: `npx tsc --noEmit` — 0 errors

Commit: `feat(followups): AutoFollowUp section with draft editor in FollowupsDashboard`
