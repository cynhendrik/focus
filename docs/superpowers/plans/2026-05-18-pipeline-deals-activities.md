# Pipeline, Deals & Activities — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vollständiges Sales-CRM: globales Pipeline-Kanban-Board mit benutzerdefinierten Stages, mehrere Deals pro Kunde, manueller Aktivitäten-Log pro Kunde als zwei neue Customer-Tabs.

**Architecture:** Die SQLite-Tabellen `pipeline_stages`, `deals` und `activities` existieren bereits im Backend — inkl. Rust-DB-Modulen und registrierten Tauri-Commands. Deals und Activities referenzieren heute `account_id`; Migration v10 fügt `customer_id TEXT` hinzu, damit der Frontend-Code die `customers`-Tabelle nutzen kann. Das Frontend wird komplett neu gebaut: Typen → Services → Stores → Komponenten → Routes.

**Tech Stack:** Rust/rusqlite, Tauri v2, React 18, TypeScript, Zustand, `@dnd-kit/core` + `@dnd-kit/utilities`

---

## File Map

**Backend — Modifizieren:**
- `src-tauri/src/db/migrations.rs` — Migration v10: `customer_id` zu deals + activities
- `src-tauri/src/db/deal.rs` — `get_by_workspace`, `get_by_customer` ergänzen
- `src-tauri/src/db/activity.rs` — `get_by_customer` ergänzen, `customer_id` in Insert
- `src-tauri/src/commands/deal.rs` — 2 neue Commands
- `src-tauri/src/commands/activity.rs` — 1 neuer Command
- `src-tauri/src/commands/pipeline_stage.rs` — `cmd_seed_pipeline_stages` ergänzen
- `src-tauri/src/main.rs` — 4 neue Commands registrieren

**Frontend — Neu erstellen:**
- `src/types/pipeline.types.ts`
- `src/services/pipeline.service.ts`
- `src/services/deals.service.ts`
- `src/services/activities.service.ts`
- `src/store/pipeline.store.ts`
- `src/store/deals.store.ts`
- `src/store/deals.store.test.ts`
- `src/store/activities.store.ts`
- `src/components/pipeline/DealCard.tsx`
- `src/components/pipeline/DealModal.tsx`
- `src/components/pipeline/StagesManager.tsx`
- `src/components/pipeline/PipelineBoard.tsx`
- `src/components/pipeline/ActivityModal.tsx`
- `src/routes/PipelineRoute.tsx`
- `src/components/customer/tabs/SalesPane.tsx`
- `src/components/customer/tabs/ActivitiesPane.tsx`

**Frontend — Modifizieren:**
- `src/store/ui.store.ts` — `AppView` + `CustomerTab` erweitern
- `src/components/layout/NavSidebar.tsx` — Pipeline-Eintrag + Kbd P
- `src/App.tsx` — seed/load stages, load all deals, PipelineRoute rendern
- `src/routes/CustomerRoute.tsx` — Sales + Activities Tabs registrieren

---

## Task 1: Migration v10 + Backend-Erweiterungen

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/db/deal.rs`
- Modify: `src-tauri/src/db/activity.rs`

### Kontext

`deals` und `activities` verweisen auf `account_id`. Wir fügen `customer_id TEXT` hinzu (nullable, kein FK), damit der Frontend-Code `customers.id` direkt nutzen kann. `get_by_workspace` brauchen wir fürs Pipeline-Board (alle Deals des Workspace). `get_by_customer` für Sales- und Activities-Tab.

- [ ] **Step 1: Migration v10 schreiben**

In `src-tauri/src/db/migrations.rs`:
- `CURRENT_VERSION` von `9` auf `10` setzen
- Case `10` in `apply()` hinzufügen:

```rust
const CURRENT_VERSION: u32 = 10;
```

```rust
10 => {
    if !column_exists(conn, "deals", "customer_id") {
        conn.execute_batch("ALTER TABLE deals ADD COLUMN customer_id TEXT")?;
    }
    if !column_exists(conn, "activities", "customer_id") {
        conn.execute_batch("ALTER TABLE activities ADD COLUMN customer_id TEXT")?;
    }
    Ok(())
}
```

- [ ] **Step 2: `cargo test` ausführen — Migration soll laufen**

```
cd src-tauri && cargo test db::migrations
```

Expected: alle bestehenden Tests grün.

- [ ] **Step 3: `get_by_workspace` und `get_by_customer` in `deal.rs` ergänzen**

Füge nach der bestehenden `get_by_account`-Funktion ein:

```rust
pub fn get_by_workspace(conn: &Connection, workspace_id: &str) -> Result<Vec<Deal>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, contact_id, title, stage,
                value, currency, probability, expected_close, owner, created_at, updated_at
         FROM deals WHERE workspace_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([workspace_id], |r| Ok(Deal {
        id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
        account_id: r.get(3)?, contact_id: r.get(4)?, title: r.get(5)?,
        stage: r.get(6)?, value: r.get(7)?,
        currency: r.get::<_, Option<String>>(8)?.unwrap_or_else(|| "EUR".into()),
        probability: r.get(9)?, expected_close: r.get(10)?,
        owner: r.get(11)?, created_at: r.get(12)?, updated_at: r.get(13)?,
    }))?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Deal>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, contact_id, title, stage,
                value, currency, probability, expected_close, owner, created_at, updated_at
         FROM deals WHERE customer_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([customer_id], |r| Ok(Deal {
        id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
        account_id: r.get(3)?, contact_id: r.get(4)?, title: r.get(5)?,
        stage: r.get(6)?, value: r.get(7)?,
        currency: r.get::<_, Option<String>>(8)?.unwrap_or_else(|| "EUR".into()),
        probability: r.get(9)?, expected_close: r.get(10)?,
        owner: r.get(11)?, created_at: r.get(12)?, updated_at: r.get(13)?,
    }))?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

- [ ] **Step 4: `customer_id` in `deal.rs::upsert` schreiben und lesen**

`UpsertDealPayload` um `customer_id` erweitern:
```rust
pub struct UpsertDealPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub customer_id: Option<String>,   // NEU
    pub contact_id: Option<String>,
    pub title: String,
    pub stage: Option<String>,
    pub value: Option<f64>,
    pub currency: Option<String>,
    pub probability: Option<i64>,
    pub expected_close: Option<String>,
    pub owner: Option<String>,
}
```

`upsert`-Funktion: INSERT und ON CONFLICT erweitern:
```rust
conn.execute(
    "INSERT INTO deals (id, workspace_id, created_by, account_id, customer_id, contact_id, title,
                        stage, value, currency, probability, expected_close, owner,
                        pending_sync, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,1,?14,?14)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, stage=excluded.stage, value=excluded.value,
       currency=excluded.currency, probability=excluded.probability,
       expected_close=excluded.expected_close, owner=excluded.owner,
       contact_id=excluded.contact_id, customer_id=excluded.customer_id,
       pending_sync=1, updated_at=excluded.updated_at",
    rusqlite::params![
        id, payload.workspace_id, payload.created_by, payload.account_id,
        payload.customer_id, payload.contact_id,
        payload.title, payload.stage.unwrap_or_else(|| "prospect".into()),
        payload.value, payload.currency.unwrap_or_else(|| "EUR".into()),
        payload.probability, payload.expected_close, payload.owner, now,
    ],
)?;
```

- [ ] **Step 5: `get_by_customer` in `activity.rs` ergänzen**

Füge in `src-tauri/src/db/activity.rs` nach `get_by_account` ein:

```rust
pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Activity>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, contact_id, deal_id, type,
                title, body, payload, status, due_at, assignee, outcome, created_at, updated_at
         FROM activities WHERE customer_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([customer_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

Und `CreateActivityPayload` um optionales `customer_id` ergänzen:
```rust
pub struct CreateActivityPayload {
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub customer_id: Option<String>,   // NEU
    pub contact_id: Option<String>,
    pub deal_id: Option<String>,
    // ... rest unverändert
}
```

Und im `insert`-Statement `customer_id` mitspeichern:
```rust
conn.execute(
    "INSERT INTO activities
     (id, workspace_id, created_by, account_id, customer_id, contact_id, deal_id, type,
      title, body, payload, status, due_at, assignee, outcome, pending_sync, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,1,?16,?16)",
    rusqlite::params![
        id, payload.workspace_id, payload.created_by, payload.account_id,
        payload.customer_id, payload.contact_id, payload.deal_id, payload.activity_type,
        payload.title, payload.body,
        payload.payload.unwrap_or_else(|| "{}".into()),
        payload.status.unwrap_or_else(|| "open".into()),
        payload.due_at, payload.assignee, payload.outcome, now,
    ],
)?;
```

- [ ] **Step 6: Rust-Tests für neue Funktionen**

In `src-tauri/src/db/deal.rs` → `#[cfg(test)]` ergänzen:

```rust
#[test]
fn get_by_customer_returns_deals_with_customer_id() {
    let conn = setup();
    let acc_id = seed_account(&conn);
    upsert(&conn, UpsertDealPayload {
        id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
        account_id: acc_id.clone(), customer_id: Some("cust-1".into()),
        contact_id: None, title: "D1".into(),
        stage: None, value: None, currency: None, probability: None,
        expected_close: None, owner: None,
    }).unwrap();
    upsert(&conn, UpsertDealPayload {
        id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
        account_id: acc_id.clone(), customer_id: Some("cust-2".into()),
        contact_id: None, title: "D2".into(),
        stage: None, value: None, currency: None, probability: None,
        expected_close: None, owner: None,
    }).unwrap();
    let cust1_deals = get_by_customer(&conn, "cust-1").unwrap();
    assert_eq!(cust1_deals.len(), 1);
    assert_eq!(cust1_deals[0].title, "D1");
}

#[test]
fn get_by_workspace_returns_all_deals() {
    let conn = setup();
    let acc_id = seed_account(&conn);
    for i in 0..3 {
        upsert(&conn, UpsertDealPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: acc_id.clone(), customer_id: None,
            contact_id: None, title: format!("D{i}"),
            stage: None, value: None, currency: None, probability: None,
            expected_close: None, owner: None,
        }).unwrap();
    }
    assert_eq!(get_by_workspace(&conn, "ws-1").unwrap().len(), 3);
    assert_eq!(get_by_workspace(&conn, "ws-2").unwrap().len(), 0);
}
```

- [ ] **Step 7: `cargo test` — alle DB-Tests grün**

```
cd src-tauri && cargo test db::deal db::activity db::migrations
```

Expected: alle Tests grün.

- [ ] **Step 8: Commit**

```
git add src-tauri/src/db/migrations.rs src-tauri/src/db/deal.rs src-tauri/src/db/activity.rs
git commit -m "feat(pipeline): migration v10 + customer_id bridge + new DB query fns"
```

---

## Task 2: Neue Tauri-Commands + Registrierung

**Files:**
- Modify: `src-tauri/src/commands/deal.rs`
- Modify: `src-tauri/src/commands/activity.rs`
- Modify: `src-tauri/src/commands/pipeline_stage.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: 2 neue Commands in `commands/deal.rs` ergänzen**

```rust
#[tauri::command]
pub fn get_deals_by_workspace(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<Deal>, AppError> {
    db::deal::get_by_workspace(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn get_deals_by_customer(
    db: State<'_, DbPool>,
    customer_id: String,
) -> Result<Vec<Deal>, AppError> {
    db::deal::get_by_customer(&db.conn(), &customer_id)
}
```

- [ ] **Step 2: `get_activities_by_customer` in `commands/activity.rs` ergänzen**

```rust
#[tauri::command]
pub fn get_activities_by_customer(
    db: State<'_, DbPool>,
    customer_id: String,
) -> Result<Vec<Activity>, AppError> {
    db::activity::get_by_customer(&db.conn(), &customer_id)
}
```

- [ ] **Step 3: `cmd_seed_pipeline_stages` in `commands/pipeline_stage.rs` ergänzen**

```rust
#[tauri::command]
pub fn cmd_seed_pipeline_stages(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<(), AppError> {
    db::pipeline_stage::seed_defaults(&db.conn(), &workspace_id)
}
```

- [ ] **Step 4: 4 neue Commands in `main.rs` registrieren**

In `.invoke_handler(tauri::generate_handler![` ergänzen:

```rust
commands::deal::get_deals_by_workspace,
commands::deal::get_deals_by_customer,
commands::activity::get_activities_by_customer,
commands::pipeline_stage::cmd_seed_pipeline_stages,
```

- [ ] **Step 5: `cargo build` — kompiliert fehlerfrei**

```
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished dev` ohne Errors.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/commands/deal.rs src-tauri/src/commands/activity.rs src-tauri/src/commands/pipeline_stage.rs src-tauri/src/main.rs
git commit -m "feat(pipeline): neue Tauri-Commands registriert"
```

---

## Task 3: TypeScript-Typen + Services

**Files:**
- Create: `src/types/pipeline.types.ts`
- Create: `src/services/pipeline.service.ts`
- Create: `src/services/deals.service.ts`
- Create: `src/services/activities.service.ts`

### Kontext

Die Rust-Structs nutzen `camelCase`-Serialisierung. `deal.stage` ist ein Text-Name (z.B. `"lead"`, `"qualified"`), NICHT eine ID. `activity.type` wird in Rust als `activity_type` gespeichert und mit `#[serde(rename = "type")]` serialisiert → im JSON kommt `"type"` an.

- [ ] **Step 1: `src/types/pipeline.types.ts` erstellen**

```typescript
import type { CustomerStatus, Priority } from './customer.types'

export interface PipelineStage {
  id: string
  workspaceId: string
  name: string
  label: string
  orderIndex: number
  color: string
  isWon: boolean
  isLost: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertPipelineStagePayload {
  id?: string
  workspaceId: string
  name: string
  label: string
  orderIndex?: number
  color?: string
  isWon?: boolean
  isLost?: boolean
}

export interface Deal {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  contactId?: string
  title: string
  stage: string
  value?: number
  currency: string
  probability?: number
  expectedClose?: string
  owner?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertDealPayload {
  id?: string
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  title: string
  stage?: string
  value?: number
  probability?: number
  expectedClose?: string
}

export type ActivityType = 'call' | 'meeting' | 'email' | 'note'

export interface Activity {
  id: string
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  type: string
  title?: string
  body?: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateActivityPayload {
  workspaceId: string
  createdBy: string
  accountId: string
  customerId?: string
  type: ActivityType
  title?: string
  body?: string
  durationMinutes?: number
}
```

- [ ] **Step 2: `src/services/pipeline.service.ts` erstellen**

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { PipelineStage, UpsertPipelineStagePayload } from '@/types/pipeline.types'

export const PipelineService = {
  getAll(workspaceId: string): Promise<PipelineStage[]> {
    return invoke('cmd_get_pipeline_stages', { workspaceId })
  },
  upsert(payload: UpsertPipelineStagePayload): Promise<PipelineStage> {
    return invoke('cmd_upsert_pipeline_stage', { payload })
  },
  delete(id: string, workspaceId: string): Promise<void> {
    return invoke('cmd_delete_pipeline_stage', { id, workspaceId })
  },
  reorder(workspaceId: string, orderedIds: string[]): Promise<void> {
    return invoke('cmd_reorder_pipeline_stages', { workspaceId, orderedIds })
  },
  seed(workspaceId: string): Promise<void> {
    return invoke('cmd_seed_pipeline_stages', { workspaceId })
  },
}
```

- [ ] **Step 3: `src/services/deals.service.ts` erstellen**

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'

export const DealsService = {
  getByWorkspace(workspaceId: string): Promise<Deal[]> {
    return invoke('get_deals_by_workspace', { workspaceId })
  },
  getByCustomer(customerId: string): Promise<Deal[]> {
    return invoke('get_deals_by_customer', { customerId })
  },
  upsert(payload: UpsertDealPayload): Promise<Deal> {
    return invoke('upsert_deal', { payload })
  },
  updateStage(id: string, stage: string): Promise<Deal> {
    return invoke('update_deal_stage', { id, stage })
  },
  delete(id: string): Promise<void> {
    return invoke('delete_deal', { id })
  },
}
```

- [ ] **Step 4: `src/services/activities.service.ts` erstellen**

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { Activity, CreateActivityPayload } from '@/types/pipeline.types'

export const ActivitiesService = {
  getByCustomer(customerId: string): Promise<Activity[]> {
    return invoke('get_activities_by_customer', { customerId })
  },
  create(payload: CreateActivityPayload): Promise<Activity> {
    return invoke('create_activity', { payload: { ...payload, type: payload.type } })
  },
  delete(id: string): Promise<void> {
    return invoke('delete_activity', { id })
  },
}
```

- [ ] **Step 5: TypeScript kompiliert ohne Fehler**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: keine Fehler.

- [ ] **Step 6: Commit**

```
git add src/types/pipeline.types.ts src/services/pipeline.service.ts src/services/deals.service.ts src/services/activities.service.ts
git commit -m "feat(pipeline): TypeScript-Typen und Services"
```

---

## Task 4: Zustand Stores + Tests

**Files:**
- Create: `src/store/pipeline.store.ts`
- Create: `src/store/deals.store.ts`
- Create: `src/store/deals.store.test.ts`
- Create: `src/store/activities.store.ts`

### Kontext

Pattern aus `src/store/smart-lists.store.ts` übernehmen: `error: AppError | null`, `isAppError`, `formatError`, `log.error`. `moveToStage` nutzt optimistisches Update: Deal sofort im Store aktualisieren, bei Fehler zurücksetzen.

- [ ] **Step 1: Test schreiben (TDD)**

`src/store/deals.store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDealsStore } from './deals.store'

vi.mock('@/services/deals.service', () => ({
  DealsService: {
    getByWorkspace: vi.fn().mockResolvedValue([]),
    getByCustomer: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    updateStage: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('useDealsStore', () => {
  beforeEach(() => {
    useDealsStore.setState({ deals: [], customerDeals: [], isLoading: false, error: null })
  })

  it('moveToStage optimistically updates deal in store', async () => {
    const { DealsService } = await import('@/services/deals.service')
    const deal = {
      id: 'd1', workspaceId: 'ws', createdBy: 'u1', accountId: 'a1',
      title: 'Test', stage: 'lead', currency: 'EUR', createdAt: '', updatedAt: '',
    }
    useDealsStore.setState({ deals: [deal] })
    const updatedDeal = { ...deal, stage: 'qualified' }
    vi.mocked(DealsService.updateStage).mockResolvedValueOnce(updatedDeal)

    await useDealsStore.getState().moveToStage('d1', 'qualified')

    expect(useDealsStore.getState().deals.find(d => d.id === 'd1')?.stage).toBe('qualified')
  })

  it('moveToStage reverts on error', async () => {
    const { DealsService } = await import('@/services/deals.service')
    const deal = {
      id: 'd1', workspaceId: 'ws', createdBy: 'u1', accountId: 'a1',
      title: 'Test', stage: 'lead', currency: 'EUR', createdAt: '', updatedAt: '',
    }
    useDealsStore.setState({ deals: [deal] })
    vi.mocked(DealsService.updateStage).mockRejectedValueOnce(new Error('network'))

    try { await useDealsStore.getState().moveToStage('d1', 'qualified') } catch {}

    expect(useDealsStore.getState().deals.find(d => d.id === 'd1')?.stage).toBe('lead')
  })
})
```

- [ ] **Step 2: Test ausführen — schlägt fehl (Modul fehlt)**

```
npx vitest run src/store/deals.store.test.ts
```

Expected: FAIL mit "Cannot find module './deals.store'".

- [ ] **Step 3: `src/store/pipeline.store.ts` erstellen**

```typescript
import { create } from 'zustand'
import { PipelineService } from '@/services/pipeline.service'
import { log } from '@/lib/logger'
import type { PipelineStage, UpsertPipelineStagePayload } from '@/types/pipeline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface PipelineState {
  stages: PipelineStage[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsertStage: (payload: UpsertPipelineStagePayload) => Promise<void>
  removeStage: (id: string, workspaceId: string) => Promise<void>
  reorder: (workspaceId: string, orderedIds: string[]) => Promise<void>
}

export const usePipelineStore = create<PipelineState>()((set, get) => ({
  stages: [],
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const stages = await PipelineService.getAll(workspaceId)
      set({ stages, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load pipeline stages', { error })
    }
  },

  upsertStage: async (payload) => {
    set({ error: null })
    try {
      const stage = await PipelineService.upsert(payload)
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
      await PipelineService.delete(id, workspaceId)
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
      await PipelineService.reorder(workspaceId, orderedIds)
    } catch (err) {
      set({ stages: prev })
      throw err
    }
  },
}))
```

- [ ] **Step 4: `src/store/deals.store.ts` erstellen**

```typescript
import { create } from 'zustand'
import { DealsService } from '@/services/deals.service'
import { log } from '@/lib/logger'
import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface DealsState {
  deals: Deal[]
  customerDeals: Deal[]
  isLoading: boolean
  error: AppError | null
  loadAll: (workspaceId: string) => Promise<void>
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertDealPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  moveToStage: (dealId: string, stage: string) => Promise<void>
}

export const useDealsStore = create<DealsState>()((set, get) => ({
  deals: [],
  customerDeals: [],
  isLoading: false,
  error: null,

  loadAll: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const deals = await DealsService.getByWorkspace(workspaceId)
      set({ deals, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load deals', { error })
    }
  },

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const customerDeals = await DealsService.getByCustomer(customerId)
      set({ customerDeals, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load customer deals', { error })
    }
  },

  upsert: async (payload) => {
    set({ error: null })
    try {
      const deal = await DealsService.upsert(payload)
      set(s => {
        const exists = s.deals.some(d => d.id === deal.id)
        const updatedDeals = exists
          ? s.deals.map(d => d.id === deal.id ? deal : d)
          : [deal, ...s.deals]
        const existsInCustomer = s.customerDeals.some(d => d.id === deal.id)
        const updatedCustomerDeals = existsInCustomer
          ? s.customerDeals.map(d => d.id === deal.id ? deal : d)
          : deal.customerId ? [deal, ...s.customerDeals] : s.customerDeals
        return { deals: updatedDeals, customerDeals: updatedCustomerDeals }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await DealsService.delete(id)
      set(s => ({
        deals: s.deals.filter(d => d.id !== id),
        customerDeals: s.customerDeals.filter(d => d.id !== id),
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  moveToStage: async (dealId, stage) => {
    const prev = get().deals.find(d => d.id === dealId)?.stage
    set(s => ({
      deals: s.deals.map(d => d.id === dealId ? { ...d, stage } : d),
      customerDeals: s.customerDeals.map(d => d.id === dealId ? { ...d, stage } : d),
    }))
    try {
      const updated = await DealsService.updateStage(dealId, stage)
      set(s => ({
        deals: s.deals.map(d => d.id === dealId ? updated : d),
        customerDeals: s.customerDeals.map(d => d.id === dealId ? updated : d),
      }))
    } catch (err) {
      if (prev !== undefined) {
        set(s => ({
          deals: s.deals.map(d => d.id === dealId ? { ...d, stage: prev } : d),
          customerDeals: s.customerDeals.map(d => d.id === dealId ? { ...d, stage: prev } : d),
        }))
      }
      throw err
    }
  },
}))
```

- [ ] **Step 5: `src/store/activities.store.ts` erstellen**

```typescript
import { create } from 'zustand'
import { ActivitiesService } from '@/services/activities.service'
import { useCrmStore } from '@/store/crm.store'
import { log } from '@/lib/logger'
import type { Activity, CreateActivityPayload } from '@/types/pipeline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface ActivitiesState {
  activities: Activity[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  create: (payload: CreateActivityPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useActivitiesStore = create<ActivitiesState>()((set) => ({
  activities: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const activities = await ActivitiesService.getByCustomer(customerId)
      set({ activities, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load activities', { error })
    }
  },

  create: async (payload) => {
    set({ error: null })
    try {
      const activity = await ActivitiesService.create(payload)
      set(s => ({ activities: [activity, ...s.activities] }))
      const workspaceId = payload.workspaceId
      useCrmStore.getState().loadLastActivity(workspaceId)
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await ActivitiesService.delete(id)
      set(s => ({ activities: s.activities.filter(a => a.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
```

- [ ] **Step 6: Tests ausführen — grün**

```
npx vitest run src/store/deals.store.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```
git add src/store/pipeline.store.ts src/store/deals.store.ts src/store/deals.store.test.ts src/store/activities.store.ts
git commit -m "feat(pipeline): Zustand Stores + moveToStage-Tests"
```

---

## Task 5: UI Store + Nav + App.tsx

**Files:**
- Modify: `src/store/ui.store.ts`
- Modify: `src/components/layout/NavSidebar.tsx`
- Modify: `src/App.tsx`

### Kontext

`AppView` und `CustomerTab` in `ui.store.ts` sind Union Types, die erweitert werden müssen. In `NavSidebar.tsx` nutzen wir `TrendingUp` aus lucide-react. In `App.tsx` werden beim Workspace-Load Pipeline-Stages geseedet und geladen, und alle Deals geladen.

- [ ] **Step 1: `ui.store.ts` — AppView und CustomerTab erweitern**

In `src/store/ui.store.ts`:

```typescript
export type CustomerTab = 'dashboard' | 'workflow' | 'kommunikation' | 'dateien' | 'historie' | 'sales' | 'activities'
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'pipeline' | 'invoices' | 'tasks' | 'kpis' | 'insights'
  | 'calendar'  | 'mail'     | 'crm'      | 'settings'
```

- [ ] **Step 2: `NavSidebar.tsx` — Pipeline-Eintrag hinzufügen**

Import ergänzen:
```typescript
import {
  LayoutDashboard, Users, FileText, CheckSquare,
  Calendar, Mail, Settings, Bell, TrendingUp,
} from 'lucide-react'
```

Nach dem Clients-Eintrag einfügen:
```tsx
<SidebarNavItem icon={TrendingUp} label="Pipeline" active={appView === 'pipeline'} onClick={() => setAppView('pipeline')} kbd="P" />
```

- [ ] **Step 3: `App.tsx` — Pipeline seed/load + PipelineRoute import**

Import ergänzen:
```typescript
import { PipelineService } from '@/services/pipeline.service'
import { usePipelineStore } from '@/store/pipeline.store'
import { useDealsStore } from '@/store/deals.store'
import { PipelineRoute } from '@/routes/PipelineRoute'
```

Im Workspace-`useEffect` (wo `SmartListService.seedSystemLists` aufgerufen wird) ergänzen:
```typescript
PipelineService.seed(activeWorkspaceId).catch(() => {}).then(() =>
  loadPipelineStages(activeWorkspaceId)
)
loadAllDeals(activeWorkspaceId)
```

Am Anfang der `App`-Komponente:
```typescript
const loadPipelineStages = usePipelineStore(s => s.load)
const loadAllDeals = useDealsStore(s => s.loadAll)
```

Im Routing-Block (`appView` switch/ternary), `PipelineRoute` ergänzen:
```tsx
{appView === 'pipeline' && <PipelineRoute />}
```

- [ ] **Step 4: Prüfen — TypeScript kompiliert**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: keine neuen Fehler (PipelineRoute existiert noch nicht → Fehler erwartet, der in Task 8 behoben wird).

- [ ] **Step 5: Commit**

```
git add src/store/ui.store.ts src/components/layout/NavSidebar.tsx src/App.tsx
git commit -m "feat(pipeline): AppView/CustomerTab erweitert + Nav-Eintrag + App-Init"
```

---

## Task 6: DealCard + DealModal

**Files:**
- Create: `src/components/pipeline/DealCard.tsx`
- Create: `src/components/pipeline/DealModal.tsx`

### Kontext

`DealCard` wird sowohl im PipelineBoard als auch im SalesPane verwendet. `DealModal` ist für Create und Edit (in beiden Views). Beide nutzen das `Deal`-Typ aus `pipeline.types.ts`. Stage-Farbe aus `usePipelineStore.stages` via `stages.find(s => s.name === deal.stage)`.

- [ ] **Step 1: `src/components/pipeline/DealCard.tsx` erstellen**

```tsx
import { usePipelineStore } from '@/store/pipeline.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { Deal } from '@/types/pipeline.types'
import { Calendar } from 'lucide-react'

interface Props {
  deal: Deal
  onEdit: (deal: Deal) => void
  isDragging?: boolean
}

export function DealCard({ deal, onEdit, isDragging }: Props) {
  const stages = usePipelineStore(s => s.stages)
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView = useUiStore(s => s.setAppView)

  const stage = stages.find(s => s.name === deal.stage)
  const customer = customers.find(c => c.id === deal.customerId)

  const handleCustomerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (customer) {
      setSelected(customer.id)
      setAppView('clients')
    }
  }

  return (
    <div
      className="task-card"
      data-dragging={isDragging ? 'true' : undefined}
      onClick={() => onEdit(deal)}
      style={{ cursor: 'pointer', marginBottom: 6 }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
        {deal.title}
      </p>
      {customer && (
        <button
          onClick={handleCustomerClick}
          style={{
            fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)',
            background: 'var(--accent-soft)', borderRadius: 99, padding: '2px 8px',
            cursor: 'pointer', marginBottom: 8, display: 'inline-block',
          }}
        >
          {customer.name}
        </button>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
          {deal.value != null ? `${deal.value.toLocaleString('de-DE')} €` : '—'}
        </span>
        {deal.probability != null && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)' }}>
            {deal.probability}%
          </span>
        )}
      </div>
      {deal.expectedClose && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Calendar size={10} style={{ color: 'var(--fg-dim)' }} />
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {new Date(deal.expectedClose).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `src/components/pipeline/DealModal.tsx` erstellen**

```tsx
import { useState, useEffect } from 'react'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'

interface Props {
  initial?: Deal
  presetCustomerId?: string
  presetStage?: string
  onClose: () => void
}

export function DealModal({ initial, presetCustomerId, presetStage, onClose }: Props) {
  const upsert = useDealsStore(s => s.upsert)
  const stages = usePipelineStore(s => s.stages)
  const customers = useCustomersStore(s => s.customers)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [customerId, setCustomerId] = useState(initial?.customerId ?? presetCustomerId ?? '')
  const [stage, setStage] = useState(initial?.stage ?? presetStage ?? stages[0]?.name ?? '')
  const [value, setValue] = useState(initial?.value?.toString() ?? '')
  const [probability, setProbability] = useState(initial?.probability?.toString() ?? '')
  const [expectedClose, setExpectedClose] = useState(initial?.expectedClose ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (stages.length > 0 && !stage) setStage(stages[0].name)
  }, [stages])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    const payload: UpsertDealPayload = {
      id: initial?.id,
      workspaceId,
      createdBy: user?.email ?? 'user',
      accountId: customerId || workspaceId,
      customerId: customerId || undefined,
      title: title.trim(),
      stage,
      value: value ? parseFloat(value) : undefined,
      probability: probability ? parseInt(probability) : undefined,
      expectedClose: expectedClose || undefined,
    }
    try {
      await upsert(payload)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const activeStages = stages.filter(s => !s.isWon && !s.isLost)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
          {initial ? 'Deal bearbeiten' : 'Neuer Deal'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Titel</label>
            <input
              className="mock-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Website Relaunch"
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Kunde</label>
            <select className="mock-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">— Kein Kunde —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Stage</label>
            <select className="mock-input" value={stage} onChange={e => setStage(e.target.value)}>
              {stages.map(s => (
                <option key={s.id} value={s.name}>{s.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Wert (€)</label>
              <input className="mock-input" type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="0" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Wahrscheinlichkeit (%)</label>
              <input className="mock-input" type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Expected Close</label>
            <input className="mock-input" type="date" value={expectedClose} onChange={e => setExpectedClose(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }}>Abbrechen</button>
          <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript kompiliert**

```
npx tsc --noEmit 2>&1 | grep "pipeline" | head -10
```

Expected: keine Fehler in den neuen Dateien.

- [ ] **Step 4: Commit**

```
git add src/components/pipeline/DealCard.tsx src/components/pipeline/DealModal.tsx
git commit -m "feat(pipeline): DealCard + DealModal"
```

---

## Task 7: StagesManager

**Files:**
- Create: `src/components/pipeline/StagesManager.tsx`

### Kontext

Inline-Overlay über dem Pipeline-Board. Nutzt `@dnd-kit/sortable` für Reorder. Löschen ist nur möglich wenn keine Deals in dieser Stage — Fehler kommt als `AppError` aus dem Store, wird inline angezeigt.

- [ ] **Step 1: `@dnd-kit` installieren**

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: Package in package.json, kein Fehler.

- [ ] **Step 2: `src/components/pipeline/StagesManager.tsx` erstellen**

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
import { usePipelineStore } from '@/store/pipeline.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { PipelineStage } from '@/types/pipeline.types'
import { GripVertical, Trash2, Plus, X } from 'lucide-react'

const PRESET_COLORS = ['#6B7280','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#10B981','#06B6D4','#F97316']

function SortableStageRow({ stage, onDelete, onUpdate }: {
  stage: PipelineStage
  onDelete: (id: string) => void
  onUpdate: (id: string, label: string, color: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const [label, setLabel] = useState(stage.label)
  const [color, setColor] = useState(stage.color)

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
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          fontSize: 12, fontWeight: 600, color: 'var(--fg)',
        }}
      />
      {!stage.isWon && !stage.isLost && (
        <button onClick={() => onDelete(stage.id)} style={{ color: 'var(--fg-dim)', cursor: 'pointer', flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

interface Props { workspaceId: string; onClose: () => void }

export function StagesManager({ workspaceId, onClose }: Props) {
  const { stages, upsertStage, removeStage, reorder } = usePipelineStore()
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
    await upsertStage({ id, workspaceId, name: stage.name, label, color, isWon: stage.isWon, isLost: stage.isLost })
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      await removeStage(id, workspaceId)
    } catch (err: any) {
      setError(err?.message ?? 'Stage konnte nicht gelöscht werden')
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
    <div
      style={{
        position: 'absolute', top: 48, right: 16, width: 340,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 16, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Stages verwalten</span>
        <button onClick={onClose} style={{ color: 'var(--fg-dim)', cursor: 'pointer' }}><X size={14} /></button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 8, padding: '6px 10px', background: 'rgba(220,53,69,0.1)', borderRadius: 6 }}>
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

- [ ] **Step 3: TypeScript kompiliert**

```
npx tsc --noEmit 2>&1 | grep "StagesManager" | head -5
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```
git add src/components/pipeline/StagesManager.tsx
git commit -m "feat(pipeline): StagesManager mit dnd-kit Sortierung"
```

---

## Task 8: PipelineBoard + PipelineRoute

**Files:**
- Create: `src/components/pipeline/PipelineBoard.tsx`
- Create: `src/routes/PipelineRoute.tsx`

### Kontext

`PipelineBoard` nutzt `@dnd-kit/core` für Drag-and-drop zwischen Spalten. `DragEndEvent` gibt `active.id` (dealId) und `over.id` (stage.name als Column-ID). Spalten für Won/Lost sind separate Bereiche rechts. `PipelineRoute` rendert Board, Header mit Gesamtwert, "+ Neuer Deal" und "Stages"-Button.

- [ ] **Step 1: `src/components/pipeline/PipelineBoard.tsx` erstellen**

```tsx
import { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { usePipelineStore } from '@/store/pipeline.store'
import { useDealsStore } from '@/store/deals.store'
import { DealCard } from './DealCard'
import type { Deal, PipelineStage } from '@/types/pipeline.types'

function DroppableColumn({ stage, deals, onEdit }: {
  stage: PipelineStage & { displayName: string; colorDot: string }
  deals: Deal[]
  onEdit: (deal: Deal) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.name })
  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0)

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 190, maxWidth: 240,
        background: isOver ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderRight: '1px solid var(--border)',
        padding: '14px 12px', transition: 'background 150ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.colorDot, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>
            {stage.displayName}
          </span>
        </div>
        {totalValue > 0 && (
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)' }}>
            {totalValue.toLocaleString('de-DE')} €
          </span>
        )}
      </div>
      <div>
        {deals.map(deal => (
          <DraggableDealCard key={deal.id} deal={deal} onEdit={onEdit} />
        ))}
        {deals.length === 0 && (
          <div style={{ border: '1.5px dashed rgba(255,255,255,0.08)', borderRadius: 9, padding: 16, textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Keine Deals</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableDealCard({ deal, onEdit }: { deal: Deal; onEdit: (d: Deal) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <DealCard deal={deal} onEdit={onEdit} isDragging={isDragging} />
    </div>
  )
}

interface Props {
  onEditDeal: (deal: Deal) => void
}

export function PipelineBoard({ onEditDeal }: Props) {
  const stages = usePipelineStore(s => s.stages)
  const deals = useDealsStore(s => s.deals)
  const moveToStage = useDealsStore(s => s.moveToStage)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const openStages = stages.filter(s => !s.isWon && !s.isLost)
  const wonStage = stages.find(s => s.isWon)
  const lostStage = stages.find(s => s.isLost)

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDeal(deals.find(d => d.id === e.active.id) ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDeal(null)
    if (!e.over) return
    const newStage = String(e.over.id)
    const deal = deals.find(d => d.id === e.active.id)
    if (deal && deal.stage !== newStage) {
      moveToStage(deal.id, newStage)
    }
  }

  const dealsForStage = (stageName: string) =>
    deals.filter(d => d.stage === stageName)

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', overflow: 'auto', flex: 1, minHeight: 0 }}>
        {openStages.map(stage => (
          <DroppableColumn
            key={stage.id}
            stage={{ ...stage, displayName: stage.label, colorDot: stage.color }}
            deals={dealsForStage(stage.name)}
            onEdit={onEditDeal}
          />
        ))}
        {wonStage && (
          <DroppableColumn
            key={wonStage.id}
            stage={{ ...wonStage, displayName: wonStage.label, colorDot: '#22C55E' }}
            deals={dealsForStage(wonStage.name)}
            onEdit={onEditDeal}
          />
        )}
        {lostStage && (
          <DroppableColumn
            key={lostStage.id}
            stage={{ ...lostStage, displayName: lostStage.label, colorDot: 'var(--fg-dim)' }}
            deals={dealsForStage(lostStage.name)}
            onEdit={onEditDeal}
          />
        )}
      </div>
      <DragOverlay>
        {activeDeal ? <DealCard deal={activeDeal} onEdit={() => {}} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
```

- [ ] **Step 2: `src/routes/PipelineRoute.tsx` erstellen**

```tsx
import { useState } from 'react'
import { TrendingUp, Settings2 } from 'lucide-react'
import { useDealsStore } from '@/store/deals.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { PipelineBoard } from '@/components/pipeline/PipelineBoard'
import { DealModal } from '@/components/pipeline/DealModal'
import { StagesManager } from '@/components/pipeline/StagesManager'
import type { Deal } from '@/types/pipeline.types'

export function PipelineRoute() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const deals = useDealsStore(s => s.deals)
  const [editDeal, setEditDeal] = useState<Deal | null | 'new'>(null)
  const [showStages, setShowStages] = useState(false)

  const openDealsValue = deals
    .filter(d => d.stage !== 'won' && d.stage !== 'lost')
    .reduce((s, d) => s + (d.value ?? 0), 0)

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
      <div className="greeting" style={{ padding: '24px 24px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="greeting-title">Pipeline<em>.</em></h1>
            <div className="greeting-sub">
              <span>
                Offen: <strong style={{ fontFamily: 'var(--font-mono)' }}>
                  {openDealsValue.toLocaleString('de-DE')} €
                </strong>
              </span>
              <span>{deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length} Deals</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <button
              onClick={() => setShowStages(v => !v)}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
            >
              <Settings2 size={13} />
              Stages
            </button>
            <button
              onClick={() => setEditDeal('new')}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px' }}
            >
              + Neuer Deal
            </button>
            {showStages && (
              <StagesManager workspaceId={workspaceId} onClose={() => setShowStages(false)} />
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderTop: '1px solid var(--border)' }}>
        <PipelineBoard onEditDeal={deal => setEditDeal(deal)} />
      </div>

      {editDeal !== null && (
        <DealModal
          initial={editDeal === 'new' ? undefined : editDeal}
          onClose={() => setEditDeal(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript kompiliert ohne Fehler**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```
git add src/components/pipeline/PipelineBoard.tsx src/routes/PipelineRoute.tsx
git commit -m "feat(pipeline): PipelineBoard + PipelineRoute mit Drag-and-Drop"
```

---

## Task 9: SalesPane (Customer Tab)

**Files:**
- Create: `src/components/customer/tabs/SalesPane.tsx`
- Modify: `src/routes/CustomerRoute.tsx`

### Kontext

Neuer Tab "Sales" im CustomerRoute. Lädt Deals für den aktiven Kunden via `useDealsStore.loadForCustomer`. Zeigt offene Deals (mit Stage-Badge) und abgeschlossene separat. Klick öffnet `DealModal`. "+Neuer Deal" setzt `presetCustomerId`.

- [ ] **Step 1: Tab-Icons und TABS-Array in `CustomerRoute.tsx` erweitern**

In `src/routes/CustomerRoute.tsx`:

`TABS`-Array um zwei Einträge erweitern:
```tsx
const TABS: { id: CustomerTab; label: string }[] = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'workflow',      label: 'Workflow / Tasks' },
  { id: 'kommunikation', label: 'Kommunikation' },
  { id: 'dateien',       label: 'Dateien' },
  { id: 'historie',      label: 'Historie' },
  { id: 'sales',         label: 'Sales' },
  { id: 'activities',    label: 'Activities' },
]
```

`TabIcon`-Paths ergänzen:
```tsx
const paths: Record<CustomerTab, string[]> = {
  dashboard:     ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  workflow:      ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
  kommunikation: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  dateien:       ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
  historie:      ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  sales:         ['M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  activities:    ['M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M13 2v7h7'],
}
```

Import ergänzen:
```tsx
import { SalesPane } from '@/components/customer/tabs/SalesPane'
import { ActivitiesPane } from '@/components/customer/tabs/ActivitiesPane'
```

Im Render-Block (nach dem `HistoriePane`-Check) ergänzen:
```tsx
{activeTab === 'sales'      && <SalesPane      customerId={customerId} />}
{activeTab === 'activities' && <ActivitiesPane customerId={customerId} />}
```

- [ ] **Step 2: `src/components/customer/tabs/SalesPane.tsx` erstellen**

```tsx
import { useEffect, useState } from 'react'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { DealModal } from '@/components/pipeline/DealModal'
import type { Deal } from '@/types/pipeline.types'
import { CheckCircle2, Circle } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('de-DE') + ' €'
}

interface Props { customerId: string }

export function SalesPane({ customerId }: Props) {
  const { customerDeals, loadForCustomer, remove } = useDealsStore()
  const stages = usePipelineStore(s => s.stages)
  const [editDeal, setEditDeal] = useState<Deal | 'new' | null>(null)

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const openDeals = customerDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
  const closedDeals = customerDeals.filter(d => d.stage === 'won' || d.stage === 'lost')

  const stageBadge = (stageName: string) => {
    const stage = stages.find(s => s.name === stageName)
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
        background: `${stage?.color ?? '#6B7280'}22`,
        color: stage?.color ?? '#6B7280',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: stage?.color ?? '#6B7280', display: 'inline-block' }} />
        {stage?.label ?? stageName}
      </span>
    )
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Deals ({customerDeals.length})</span>
        <button
          onClick={() => setEditDeal('new')}
          className="btn-primary"
          style={{ fontSize: 11, padding: '5px 12px' }}
        >
          + Neuer Deal
        </button>
      </div>

      {openDeals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {openDeals.map(deal => (
            <div
              key={deal.id}
              onClick={() => setEditDeal(deal)}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{deal.title}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {stageBadge(deal.stage)}
                  {deal.value != null && (
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                      {fmt(deal.value)}
                    </span>
                  )}
                  {deal.probability != null && (
                    <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{deal.probability}%</span>
                  )}
                </div>
              </div>
              <Circle size={14} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {closedDeals.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-dim)', marginBottom: 6 }}>
            Abgeschlossen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closedDeals.map(deal => (
              <div
                key={deal.id}
                onClick={() => setEditDeal(deal)}
                style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', opacity: 0.6,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{deal.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {stageBadge(deal.stage)}
                    {deal.value != null && (
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                        {fmt(deal.value)}
                      </span>
                    )}
                  </div>
                </div>
                <CheckCircle2 size={14} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </>
      )}

      {customerDeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-dim)', fontSize: 12 }}>
          Noch keine Deals. Erstelle den ersten Deal für diesen Kunden.
        </div>
      )}

      {editDeal !== null && (
        <DealModal
          initial={editDeal === 'new' ? undefined : editDeal}
          presetCustomerId={customerId}
          onClose={() => setEditDeal(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript kompiliert ohne Fehler**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: keine Fehler.

- [ ] **Step 4: Vitest läuft grün**

```
npx vitest run
```

Expected: alle Tests grün.

- [ ] **Step 5: Commit**

```
git add src/components/customer/tabs/SalesPane.tsx src/routes/CustomerRoute.tsx
git commit -m "feat(pipeline): SalesPane Customer-Tab + Tab-Erweiterung"
```

---

## Task 10: ActivityModal + ActivitiesPane

**Files:**
- Create: `src/components/pipeline/ActivityModal.tsx`
- Create: `src/components/customer/tabs/ActivitiesPane.tsx`

### Kontext

`ActivitiesPane` zeigt chronologisch alle Activities für einen Kunden. Nach Erstellen einer Activity ruft der Store `loadLastActivity` auf → Smart Lists "Inaktiv" bleibt aktuell. Icons: `Phone` (Anruf), `Users` (Meeting), `Mail` (E-Mail), `FileText` (Notiz) — alles aus lucide-react, keine Emojis.

- [ ] **Step 1: `src/components/pipeline/ActivityModal.tsx` erstellen**

```tsx
import { useState } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { ActivityType } from '@/types/pipeline.types'
import { Phone, Users, Mail, FileText } from 'lucide-react'

const TYPES: { id: ActivityType; label: string; Icon: typeof Phone }[] = [
  { id: 'call',    label: 'Anruf',   Icon: Phone },
  { id: 'meeting', label: 'Meeting', Icon: Users },
  { id: 'email',   label: 'E-Mail',  Icon: Mail },
  { id: 'note',    label: 'Notiz',   Icon: FileText },
]

interface Props {
  customerId: string
  presetType?: ActivityType
  onClose: () => void
}

export function ActivityModal({ customerId, presetType, onClose }: Props) {
  const create = useActivitiesStore(s => s.create)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)

  const [type, setType] = useState<ActivityType>(presetType ?? 'call')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [duration, setDuration] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await create({
        workspaceId,
        createdBy: user?.email ?? 'user',
        accountId: customerId,
        customerId,
        type,
        title: TYPES.find(t => t.id === type)?.label,
        body: body.trim() || undefined,
        durationMinutes: (type === 'call' || type === 'meeting') && duration
          ? parseInt(duration)
          : undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 380, maxWidth: '90vw' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Aktivität erfassen</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {TYPES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setType(id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '8px 6px', borderRadius: 10, border: '1.5px solid',
                borderColor: type === id ? 'var(--accent)' : 'var(--border)',
                background: type === id ? 'var(--accent-soft)' : 'transparent',
                cursor: 'pointer', fontSize: 10, fontWeight: 600,
                color: type === id ? 'var(--accent-ink)' : 'var(--fg-muted)',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Datum</label>
            <input className="mock-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {(type === 'call' || type === 'meeting') && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Dauer (Minuten)</label>
              <input className="mock-input" type="number" min="1" value={duration} onChange={e => setDuration(e.target.value)} placeholder="z.B. 30" />
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Notiz</label>
            <textarea
              className="mock-input"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Was wurde besprochen?"
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }}>Abbrechen</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `src/components/customer/tabs/ActivitiesPane.tsx` erstellen**

```tsx
import { useEffect, useState } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { ActivityModal } from '@/components/pipeline/ActivityModal'
import type { Activity, ActivityType } from '@/types/pipeline.types'
import { Phone, Users, Mail, FileText, Trash2 } from 'lucide-react'

const TYPE_ICONS: Record<string, typeof Phone> = {
  call:    Phone,
  meeting: Users,
  email:   Mail,
  note:    FileText,
}

const TYPE_LABELS: Record<string, string> = {
  call:    'Anruf',
  meeting: 'Meeting',
  email:   'E-Mail',
  note:    'Notiz',
}

function formatActivityDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Gestern'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props { customerId: string }

export function ActivitiesPane({ customerId }: Props) {
  const { activities, loadForCustomer, remove } = useActivitiesStore()
  const [modal, setModal] = useState<ActivityType | null>(null)

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const QUICK_TYPES: { id: ActivityType; Icon: typeof Phone; label: string }[] = [
    { id: 'call',    Icon: Phone,     label: 'Anruf' },
    { id: 'meeting', Icon: Users,     label: 'Meeting' },
    { id: 'email',   Icon: Mail,      label: 'E-Mail' },
    { id: 'note',    Icon: FileText,  label: 'Notiz' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {QUICK_TYPES.map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setModal(id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 8px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              color: 'var(--fg-muted)',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {activities.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-dim)', fontSize: 12 }}>
          Noch keine Aktivitäten erfasst.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {activities.map(activity => {
          const Icon = TYPE_ICONS[activity.type] ?? FileText
          return (
            <div
              key={activity.id}
              className="group"
              style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} style={{ color: 'var(--fg-muted)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {TYPE_LABELS[activity.type] ?? activity.type}
                    {activity.body?.includes('Min.') && (
                      <span style={{ fontWeight: 400, color: 'var(--fg-muted)' }}> · {activity.body}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 8 }}>
                    {formatActivityDate(activity.createdAt)}
                  </span>
                </div>
                {activity.body && (
                  <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.5 }}>
                    {activity.body}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(activity.id)}
                className="task-delete"
                style={{
                  width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'var(--fg-dim)', cursor: 'pointer',
                  opacity: 0, transition: 'opacity 150ms', background: 'transparent', flexShrink: 0,
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {modal && (
        <ActivityModal
          customerId={customerId}
          presetType={modal}
          onClose={() => setModal(null)}
        />
      )}

      <style>{`.group:hover .task-delete { opacity: 1 !important; }`}</style>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript kompiliert ohne Fehler**

```
npx tsc --noEmit 2>&1 | head -20
```

Expected: keine Fehler.

- [ ] **Step 4: Alle Tests grün**

```
npx vitest run
```

Expected: alle Tests grün (inkl. deals.store.test.ts).

- [ ] **Step 5: Commit**

```
git add src/components/pipeline/ActivityModal.tsx src/components/customer/tabs/ActivitiesPane.tsx
git commit -m "feat(pipeline): ActivityModal + ActivitiesPane — Sales-CRM komplett"
```

---

## Self-Review — Spec Coverage Check

| Spec-Anforderung | Task |
|---|---|
| `pipeline_stages` mit `is_won`/`is_lost` | ✅ Bereits in Schema — Task 1 nutzt bestehende Tabelle |
| `deals` mit `customer_id` | ✅ Task 1 (Migration v10) |
| `activities` mit `customer_id` | ✅ Task 1 (Migration v10) |
| `seed_pipeline_stages` idempotent | ✅ Task 2 (`cmd_seed_pipeline_stages` wrapping bestehende `seed_defaults`) |
| `get_deals_by_workspace` für Board | ✅ Task 1+2 |
| `get_deals_by_customer` für SalesPane | ✅ Task 1+2 |
| TypeScript-Typen | ✅ Task 3 |
| Services (3) | ✅ Task 3 |
| Stores (3) mit Error-Handling | ✅ Task 4 |
| `moveToStage` optimistisch + revert | ✅ Task 4 (mit Test) |
| Activities → `loadLastActivity` trigger | ✅ Task 4 (`activities.store.ts`) |
| `AppView 'pipeline'` + Kbd P | ✅ Task 5 |
| Pipeline-Board Kanban mit Drag-and-Drop | ✅ Tasks 8 |
| Won/Lost als separate Spalten | ✅ Task 8 |
| StagesManager inline (kein Modal) | ✅ Task 7 |
| Stages löschen blockiert wenn Deals drin | ✅ Task 2 (Backend) + Task 7 (Error UI) |
| DealCard mit SVG-Icons, kein Emoji | ✅ Task 6 (Lucide Calendar-Icon) |
| DealModal für Create + Edit | ✅ Task 6 |
| SalesPane: offene + abgeschlossene Deals | ✅ Task 9 |
| ActivitiesPane: 4 Quick-Buttons (Lucide) | ✅ Task 10 |
| ActivityModal mit Typ-Auswahl | ✅ Task 10 |
| Dauer-Feld nur für call/meeting | ✅ Task 10 |
