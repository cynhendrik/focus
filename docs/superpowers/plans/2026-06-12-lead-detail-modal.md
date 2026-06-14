# Lead Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Left-click on a lead card opens a detail modal showing contact info (email + phone) and allowing the user to add/view activities; phone field is added to the Lead data model end-to-end.

**Architecture:** Add `phone` column to the `accounts` SQLite table via a Rust migration (v26), thread it through the Rust `Lead` struct and TypeScript types, add it to `CreateLeadModal`, then build `LeadDetailModal` as a self-contained React component that loads activities from `useActivitiesStore` and renders contact info + activity creation form + activity history. Left-click on `LeadCard` opens the modal; right-click keeps the existing context menu. Selection moves to a small checkbox visible on card hover.

**Tech Stack:** Rust (rusqlite, serde), React 18, Zustand (`useActivitiesStore`, `useLeadsStore`), Tauri invoke, TypeScript, inline CSS styles (no Tailwind/CSS modules)

---

### Task 1: Add phone column — Rust migration + struct + SQL

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/db/lead.rs`

**Context:** Leads are stored in the `accounts` table. The current migration version is 25. `lead.rs` has a `map_row` function that reads columns by positional index — adding `phone` after `email` (currently index 3) shifts all later indices by 1. The `SELECT` constant and `upsert_lead` SQL must both be updated consistently.

- [ ] **Step 1: Write a failing Rust test for phone**

Add this test to the `#[cfg(test)] mod tests` block at the bottom of `src-tauri/src/db/lead.rs`:

```rust
#[test]
fn upsert_lead_stores_and_returns_phone() {
    let conn = setup();
    let lead = upsert_lead(&conn, UpsertLeadPayload {
        phone: Some("+49 123 456789".into()),
        ..lead_payload("ws-1")
    }).unwrap();
    assert_eq!(lead.phone.as_deref(), Some("+49 123 456789"));

    // update clears phone when None
    let updated = upsert_lead(&conn, UpsertLeadPayload {
        id: Some(lead.id.clone()),
        phone: None,
        ..lead_payload("ws-1")
    }).unwrap();
    assert_eq!(updated.phone, None);
}
```

- [ ] **Step 2: Run test to confirm it fails**

```powershell
cd src-tauri
cargo test upsert_lead_stores_and_returns_phone -- --nocapture 2>&1
```

Expected: compile error — `phone` field missing from `UpsertLeadPayload`.

- [ ] **Step 3: Add migration v26**

In `src-tauri/src/db/migrations.rs`:

Change line 4:
```rust
const CURRENT_VERSION: u32 = 25;
```
to:
```rust
const CURRENT_VERSION: u32 = 26;
```

Add a new match arm inside `fn apply(conn: &Connection, version: u32)` after the `25 => { ... }` arm:

```rust
26 => {
    if table_exists(conn, "accounts") && !column_exists(conn, "accounts", "phone") {
        conn.execute_batch("ALTER TABLE accounts ADD COLUMN phone TEXT;")?;
    }
    Ok(())
}
```

- [ ] **Step 4: Update Rust Lead struct, payload, map_row, and SQL**

Replace the entire content of `src-tauri/src/db/lead.rs` up to (but not including) `pub fn get_leads`) with:

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
    pub phone: Option<String>,
    pub account_type: String,
    pub lead_status: String,
    pub lead_source: String,
    pub lead_source_detail: Option<String>,
    pub engagement_score: i64,
    pub re_engage_date: Option<String>,
    pub converted_at: Option<String>,
    pub pipeline_stage: String,
    pub company_name: Option<String>,
    pub linkedin_url: Option<String>,
    pub last_activity_at: Option<String>,
    pub next_follow_up_at: Option<String>,
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
    pub phone: Option<String>,
    pub lead_status: Option<String>,
    pub lead_source: String,
    pub lead_source_detail: Option<String>,
    pub re_engage_date: Option<String>,
    pub pipeline_stage: Option<String>,
    pub company_name: Option<String>,
    pub linkedin_url: Option<String>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Lead> {
    Ok(Lead {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        name: r.get(2)?,
        email: r.get(3)?,
        phone: r.get(4)?,
        account_type: r.get(5)?,
        lead_status: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
        lead_source: r.get::<_, Option<String>>(7)?.unwrap_or_default(),
        lead_source_detail: r.get(8)?,
        engagement_score: r.get::<_, Option<i64>>(9)?.unwrap_or(0),
        re_engage_date: r.get(10)?,
        converted_at: r.get(11)?,
        pipeline_stage: r.get::<_, Option<String>>(12)?.unwrap_or_else(|| "inbox".into()),
        company_name: r.get(13)?,
        linkedin_url: r.get(14)?,
        last_activity_at: r.get(15)?,
        next_follow_up_at: r.get(16)?,
        created_at: r.get(17)?,
        updated_at: r.get(18)?,
    })
}

const SELECT: &str =
    "SELECT id, workspace_id, name, email, phone, account_type, lead_status, lead_source,
            lead_source_detail, engagement_score, re_engage_date, converted_at,
            pipeline_stage, company_name, linkedin_url, last_activity_at, next_follow_up_at,
            created_at, updated_at
     FROM accounts";
```

Then update `upsert_lead` — replace the `conn.execute(...)` call inside `pub fn upsert_lead`:

```rust
pub fn upsert_lead(conn: &Connection, payload: UpsertLeadPayload) -> Result<Lead, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.lead_status.unwrap_or_else(|| "neu".into());
    let stage = payload.pipeline_stage.unwrap_or_else(|| "inbox".into());
    conn.execute(
        "INSERT INTO accounts
           (id, workspace_id, created_by, name, email, phone, account_type, lead_status, lead_source,
            lead_source_detail, engagement_score, re_engage_date, pipeline_stage, company_name,
            linkedin_url, created_at, updated_at)
         VALUES (?1,?2,'',?3,?4,?5,'lead',?6,?7,?8,0,?9,?10,?11,?12,?13,?13)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, email=excluded.email, phone=excluded.phone,
           lead_status=excluded.lead_status, lead_source=excluded.lead_source,
           lead_source_detail=excluded.lead_source_detail,
           re_engage_date=excluded.re_engage_date,
           pipeline_stage=excluded.pipeline_stage,
           company_name=excluded.company_name,
           linkedin_url=excluded.linkedin_url,
           updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.email, payload.phone,
            status, payload.lead_source, payload.lead_source_detail,
            payload.re_engage_date, stage, payload.company_name, payload.linkedin_url, now,
        ],
    )?;
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [&id], map_row)
        .map_err(AppError::from)
}
```

Also update the existing test helper `lead_payload` to include `phone: None`:

```rust
fn lead_payload(ws: &str) -> UpsertLeadPayload {
    UpsertLeadPayload {
        id: None,
        workspace_id: ws.into(),
        name: "Max Mustermann".into(),
        email: Some("max@example.com".into()),
        phone: None,
        lead_status: None,
        lead_source: "zoom".into(),
        lead_source_detail: Some("Marketing Webinar".into()),
        re_engage_date: None,
        pipeline_stage: None,
        company_name: None,
        linkedin_url: None,
    }
}
```

- [ ] **Step 5: Run all lead tests**

```powershell
cd src-tauri
cargo test lead -- --nocapture 2>&1
```

Expected: all tests pass including `upsert_lead_stores_and_returns_phone`.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/db/migrations.rs src-tauri/src/db/lead.rs
git commit -m "feat(leads): add phone field — migration v26 + Rust struct"
```

---

### Task 2: Update TypeScript Lead type + add phone to CreateLeadModal

**Files:**
- Modify: `src/types/lead.types.ts`
- Modify: `src/routes/LeadsRoute.tsx` (CreateLeadModal section only, lines 778–870)

**Context:** The TypeScript `Lead` interface mirrors the Rust struct. `UpsertLeadPayload` is sent via `invoke('upsert_lead', { payload })` — the Rust side now accepts `phone`, so we just need the TS side to pass it. `CreateLeadModal` is a component inside `LeadsRoute.tsx` around line 778. No service changes needed — `LeadsService.upsert(payload)` already passes the whole payload object.

- [ ] **Step 1: Update `src/types/lead.types.ts`**

Add `phone?: string | null` to the `Lead` interface after `email`:

```typescript
export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string | null
  phone: string | null        // ← add this line
  accountType: 'lead'
  pipelineStage: PipelineStage
  leadStatus: LeadStatus
  leadSource: LeadSource
  leadSourceDetail: string | null
  companyName: string | null
  linkedinUrl: string | null
  lastActivityAt: string | null
  nextFollowUpAt: string | null
  engagementScore: number
  reEngageDate: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
}
```

Add `phone?: string` to `UpsertLeadPayload` after `email`:

```typescript
export interface UpsertLeadPayload {
  id?: string
  workspaceId: string
  name: string
  email?: string
  phone?: string              // ← add this line
  pipelineStage?: PipelineStage
  leadStatus?: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  companyName?: string
  linkedinUrl?: string
  reEngageDate?: string
}
```

- [ ] **Step 2: Add phone input to `CreateLeadModal` in `src/routes/LeadsRoute.tsx`**

Add `phone` state (after the `email` state at line ~783):

```typescript
const [phone, setPhone] = useState('')
```

Add phone to the `payload` object inside `handleSave` (after `email`):

```typescript
const payload: UpsertLeadPayload = {
  workspaceId,
  name: name.trim(),
  email: email.trim() || undefined,
  phone: phone.trim() || undefined,
  leadSource: source,
  leadSourceDetail: sourceDetail.trim() || undefined,
  leadStatus: 'neu',
}
```

Add the phone input field in the JSX, between the E-Mail and Quelle fields:

```tsx
<div>
  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>Telefon</label>
  <input
    className="mock-input"
    type="tel"
    value={phone}
    onChange={e => setPhone(e.target.value)}
    placeholder="+49 123 456789"
  />
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
cd C:\Users\hendr\Documents\focusdesktop\cyneradev
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/types/lead.types.ts src/routes/LeadsRoute.tsx
git commit -m "feat(leads): add phone to TS Lead type + CreateLeadModal"
```

---

### Task 3: Create LeadDetailModal component

**Files:**
- Create: `src/components/leads/LeadDetailModal.tsx`

**Context:**
- Activities are loaded via `useActivitiesStore(s => s.loadForCustomer)` and `useActivitiesStore(s => s.activities)`. Call `loadForCustomer(lead.id)` on mount.
- Create activities via `useActivitiesStore(s => s.create)` with payload `{ workspaceId, createdBy: user.id, accountId: lead.id, type, title, dueAt?, status: 'open', payload: '{}' }`.
- Auth: `useAuthStore(s => s.user)`.
- Workspace: passed as prop.
- Activity types to support: `'call'` (Anruf), `'note'` (Notiz), `'email'` (E-Mail), `'task'` (Aufgabe).
- Format dates with `new Date(iso).toLocaleDateString('de-DE')` + time `toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })`.
- Style: same modal overlay pattern as `FollowUpModal` in `LeadsRoute.tsx` — fixed overlay, dark backdrop, surface card, `var(--border)`, `var(--fg-dim)`, `btn-primary`, `btn-ghost`, `mock-input`.
- The modal is 480px wide. It must NOT import from `LeadsRoute.tsx` (that file has no exports except `LeadsRoute`).
- Phone link: `<a href="tel:+49123456789">` opens phone app. Email link: `<a href="mailto:max@example.com">`.

- [ ] **Step 1: Create `src/components/leads/LeadDetailModal.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
import type { Lead } from '@/types/lead.types'
import type { ActivityType } from '@/types/activity.types'

interface Props {
  lead: Lead
  workspaceId: string
  onClose: () => void
}

const ACTIVITY_TYPES: { type: ActivityType; label: string }[] = [
  { type: 'call',  label: 'Anruf'   },
  { type: 'email', label: 'E-Mail'  },
  { type: 'note',  label: 'Notiz'   },
  { type: 'task',  label: 'Aufgabe' },
]

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const typeIcon: Record<string, string> = {
  call: '📞', email: '✉️', note: '📝', task: '📋',
  email_out: '✉️', email_in: '✉️', meeting: '📅', followup: '🔔',
}

export function LeadDetailModal({ lead, workspaceId, onClose }: Props) {
  const user           = useAuthStore(s => s.user)
  const activities     = useActivitiesStore(s => s.activities)
  const loadActivities = useActivitiesStore(s => s.loadForCustomer)
  const createActivity = useActivitiesStore(s => s.create)

  const [actType, setActType]   = useState<ActivityType>('call')
  const [title, setTitle]       = useState('')
  const [dueAt, setDueAt]       = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    loadActivities(lead.id)
  }, [lead.id, loadActivities])

  useEffect(() => {
    const hide = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', hide)
    return () => document.removeEventListener('keydown', hide)
  }, [onClose])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await createActivity({
        workspaceId,
        createdBy: user?.id ?? '',
        accountId: lead.id,
        type: actType,
        title: title.trim(),
        dueAt: dueAt || undefined,
        status: 'open',
        payload: '{}',
      })
      setTitle('')
      setDueAt('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 0,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{lead.name}</div>
              {lead.companyName && (
                <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{lead.companyName}</div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--fg-dim)', fontSize: 18, lineHeight: 1, padding: '2px 6px',
              }}
            >
              ×
            </button>
          </div>

          {/* Contact info */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                  background: 'var(--accent-soft)', padding: '5px 10px',
                  borderRadius: 99, fontWeight: 500,
                }}
              >
                ✉️ {lead.email}
              </a>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                  background: 'var(--accent-soft)', padding: '5px 10px',
                  borderRadius: 99, fontWeight: 500,
                }}
              >
                📞 {lead.phone}
              </a>
            )}
            {!lead.email && !lead.phone && (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine Kontaktdaten hinterlegt</span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Add activity */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-dim)', marginBottom: 12 }}>
              Aktivität hinzufügen
            </div>

            {/* Type picker */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {ACTIVITY_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setActType(type)}
                  style={{
                    padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid',
                    background: actType === type ? 'var(--accent)' : 'transparent',
                    color: actType === type ? 'var(--accent-ink)' : 'var(--fg-muted)',
                    borderColor: actType === type ? 'var(--accent)' : 'var(--border)',
                    transition: 'all 120ms',
                  }}
                >
                  {typeIcon[type]} {label}
                </button>
              ))}
            </div>

            <input
              className="mock-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Kurze Beschreibung…"
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSave()}
              style={{ marginBottom: 10 }}
            />

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                className="mock-input"
                type="date"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                style={{ flex: 1 }}
                title="Fälligkeitsdatum (optional)"
              />
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={!title.trim() || saving}
                style={{ flexShrink: 0 }}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>

          {/* Activity history */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-dim)', marginBottom: 12 }}>
              Aktivitäten
            </div>
            {activities.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '12px 0' }}>
                Noch keine Aktivitäten
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activities.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{typeIcon[a.type] ?? '•'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                        {a.title ?? a.type}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                        {fmtDateTime(a.createdAt)}
                        {a.dueAt && ` · Fällig: ${new Date(a.dueAt).toLocaleDateString('de-DE')}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                      background: a.status === 'done' ? 'rgba(74,222,128,0.15)' : 'var(--surface-3)',
                      color: a.status === 'done' ? '#4ade80' : 'var(--fg-dim)',
                      flexShrink: 0,
                    }}>
                      {a.status === 'done' ? 'Erledigt' : a.status === 'cancelled' ? 'Storniert' : 'Offen'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/components/leads/LeadDetailModal.tsx
git commit -m "feat(leads): LeadDetailModal — contact info + activity creation + history"
```

---

### Task 4: Wire up LeadDetailModal in LeadsRoute — left-click + phone field

**Files:**
- Modify: `src/routes/LeadsRoute.tsx`

**Context:** Currently left-click on `LeadCard` calls `onToggle()` (selection). We change this so left-click opens the `LeadDetailModal`. Multi-select (for bulk Follow-up / Delete) moves to a hover checkbox: a small `□` in the top-right of the card that toggles selection without opening the modal. The existing context menu (right-click) stays unchanged. We also add `phone` to the action bar hint text.

Specifically:
- `LeadCard` gets a new `onOpen: (lead: Lead) => void` prop. The main `div onClick` calls `onOpen(lead)` instead of `onToggle()`.
- A checkbox overlay appears in the top-right corner (16×16 px, visible always but subtle, turns filled+blue when selected). Clicking it calls `onToggle()` with `e.stopPropagation()`.
- `DraggableLeadCard` passes through the new `onOpen` prop.
- `LeadColumn` passes through `onOpen`.
- `PhasenBoard` gets state `detailLead: Lead | null` and renders `<LeadDetailModal>` when set.
- Import `LeadDetailModal` at the top of `LeadsRoute.tsx`.

- [ ] **Step 1: Update imports in `src/routes/LeadsRoute.tsx`**

Add import after the existing component imports (around line 14):

```typescript
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'
```

- [ ] **Step 2: Update `LeadCard` component (lines 283–360)**

Replace the `LeadCard` function signature and its main `div onClick`:

New signature (add `onOpen` prop):
```typescript
function LeadCard({ lead, selected, onToggle, onContext, onOpen, onWarm, isDragging }: {
  lead: Lead
  selected?: boolean
  onToggle?: () => void
  onOpen?: (lead: Lead) => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onWarm?: () => void
  isDragging?: boolean
})
```

Replace the main div `onClick`:
```tsx
<div
  className="task-card"
  data-dragging={isDragging ? 'true' : undefined}
  onClick={e => { e.stopPropagation(); onOpen?.(lead) }}
  onContextMenu={e => { e.preventDefault(); onContext(e, lead) }}
  style={{
    marginBottom: 6, cursor: 'pointer', userSelect: 'none',
    outline: selected ? '2px solid var(--accent)' : undefined,
    outlineOffset: selected ? 1 : undefined,
  }}
>
```

Replace the `{selected && ...}` check block with a checkbox that always appears in the top-right corner:

```tsx
{/* Replace the old selected check with: */}
<div
  onClick={e => { e.stopPropagation(); onToggle?.() }}
  title="Auswählen"
  style={{
    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
    border: selected ? 'none' : '1.5px solid var(--border-strong)',
    background: selected ? 'var(--accent)' : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', opacity: selected ? 1 : 0.4,
    transition: 'opacity 120ms',
  }}
  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
  onMouseLeave={e => (e.currentTarget.style.opacity = selected ? '1' : '0.4')}
>
  {selected && (
    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
      <path d="M1 3L3 5L7 1" stroke="var(--accent-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )}
</div>
```

- [ ] **Step 3: Update `DraggableLeadCard` to pass through `onOpen`**

Add `onOpen` to props and forward it:

```typescript
function DraggableLeadCard({ lead, selected, onToggle, onContext, onOpen, onWarm }: {
  lead: Lead
  selected: boolean
  onToggle: () => void
  onOpen: (lead: Lead) => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onWarm?: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <LeadCard lead={lead} selected={selected} onToggle={onToggle} onContext={onContext} onOpen={onOpen} onWarm={onWarm} isDragging={isDragging} />
    </div>
  )
}
```

- [ ] **Step 4: Update `LeadColumn` to pass through `onOpen`**

Add `onOpen` to `LeadColumn` props and pass it to `DraggableLeadCard`:

```typescript
function LeadColumn({ col, leads, selected, onToggle, onContext, onWarm, onOpen }: {
  col: ColDef
  leads: Lead[]
  selected: Set<string>
  onToggle: (id: string) => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onWarm: (id: string) => void
  onOpen: (lead: Lead) => void
})
```

In the `leads.map(...)` inside `LeadColumn`, add `onOpen={() => onOpen(lead)}` to `DraggableLeadCard`.

- [ ] **Step 5: Update `PhasenBoard` — add detailLead state + render modal + pass onOpen**

Add state inside `PhasenBoard`:

```typescript
const [detailLead, setDetailLead] = useState<Lead | null>(null)
```

In the action bar hint text, update the string (around line 697):

```tsx
<span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
  Klicken zum Öffnen · Checkbox zum Auswählen · Ziehen zum Verschieben · Rechtsklick für Aktionen
</span>
```

Pass `onOpen` to each `LeadColumn`:

```tsx
onOpen={setDetailLead}
```

Add `LeadDetailModal` render after the closing `</>` of `PhasenBoard`'s return (but still inside the fragment), just before the last `</>`:

```tsx
{detailLead && (
  <LeadDetailModal
    lead={detailLead}
    workspaceId={workspaceId}
    onClose={() => setDetailLead(null)}
  />
)}
```

Also add `onOpen` to the `DragOverlay` lead card (it's display-only, just pass a no-op):

In the `DragOverlay`:
```tsx
<LeadCard lead={activeLead} onContext={() => {}} onOpen={() => {}} isDragging />
```

- [ ] **Step 6: Verify TypeScript compiles**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add src/routes/LeadsRoute.tsx
git commit -m "feat(leads): left-click opens LeadDetailModal, checkbox for multi-select"
```

---

### Task 5: Run all tests + Rust build check

**Files:** none (verification only)

- [ ] **Step 1: Run TypeScript tests**

```powershell
cd C:\Users\hendr\Documents\focusdesktop\cyneradev
npx vitest run 2>&1
```

Expected: all tests pass (no regressions).

- [ ] **Step 2: Run Rust tests**

```powershell
cd src-tauri
cargo test 2>&1
```

Expected: all tests pass including new `upsert_lead_stores_and_returns_phone`.

- [ ] **Step 3: Check Rust build**

```powershell
cargo build 2>&1
```

Expected: builds without errors or warnings about unused fields.

- [ ] **Step 4: Commit if any fixes were needed, otherwise done**

If clean: no commit needed.
