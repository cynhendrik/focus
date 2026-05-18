# Follow-Up Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Globalen Follow-Up Center bauen: alle offenen Follow-Ups workspace-weit nach Dringlichkeit gruppiert, Inaktivitätserkennung für Kunden ohne Kontakt in 14+ Tagen, Quick-Create im Kunden-Dashboard.

**Architecture:** 1 neuer Rust-Command (get_last_activity_dates) + CrmService/Store-Erweiterung + KpisRoute rewrite + NavSidebar-Eintrag + DashboardPane Quick-Create.

**Tech Stack:** Rust (rusqlite), TypeScript, React, Tailwind, Zustand

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/src/db/activity.rs` | Neue Funktion `get_last_activity_dates` + Struct `AccountActivityDate` |
| `src-tauri/src/commands/activity.rs` | Neuer Command `get_last_activity_dates` |
| `src-tauri/src/main.rs` | Command registrieren |
| `src/types/crm.types.ts` | `AccountActivityDate` Interface hinzufügen |
| `src/services/crm.service.ts` | `getAllFollowUps` + `getLastActivityDates` Methoden |
| `src/store/crm.store.ts` | `allFollowUps`, `lastActivity`, `loadAll` hinzufügen |
| `src/routes/KpisRoute.tsx` | Vollständiger Rewrite zu Follow-Up Center |
| `src/components/layout/NavSidebar.tsx` | "Follow-Ups" Eintrag mit Bell-Icon |
| `src/components/customer/tabs/DashboardPane.tsx` | Quick-Create Follow-Up in Lead Score Card |

---

## Task 1: Rust — get_last_activity_dates

**Files:**
- Modify: `src-tauri/src/db/activity.rs`
- Modify: `src-tauri/src/commands/activity.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Struct + DB-Funktion in activity.rs**

Am Ende von `src-tauri/src/db/activity.rs`, vor dem `#[cfg(test)]` Block, einfügen:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountActivityDate {
    pub account_id: String,
    pub last_activity_at: Option<String>,
}

pub fn get_last_activity_dates(conn: &Connection, workspace_id: &str) -> Result<Vec<AccountActivityDate>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT account_id, MAX(created_at) as last_activity_at
         FROM activities
         WHERE workspace_id = ?1
         GROUP BY account_id
         ORDER BY last_activity_at ASC"
    )?;
    let rows = stmt.query_map([workspace_id], |r| {
        Ok(AccountActivityDate {
            account_id: r.get(0)?,
            last_activity_at: r.get(1)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

- [ ] **Step 2: Command in commands/activity.rs**

Am Ende der Datei, nach dem letzten `#[tauri::command]` Block, einfügen:

```rust
#[tauri::command]
pub fn get_last_activity_dates(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<db::activity::AccountActivityDate>, AppError> {
    db::activity::get_last_activity_dates(&db.conn(), &workspace_id)
}
```

- [ ] **Step 3: Import in commands/activity.rs prüfen**

Stelle sicher dass `db` im use-Statement enthalten ist:

```rust
use crate::{
    AppError, engine, activity_engine,
    db::{self, activity::{Activity, CreateActivityPayload, UpdateActivityPayload}},
    db::pool::DbPool,
};
```

Kein `AccountActivityDate` explizit importieren nötig — wird über `db::activity::AccountActivityDate` referenziert.

- [ ] **Step 4: Command in main.rs registrieren**

In `src-tauri/src/main.rs`, im `.invoke_handler(tauri::generate_handler![...])` Block, `commands::activity::get_last_activity_dates` hinzufügen. Finde den Block mit `get_open_tasks` und füge danach ein:

```rust
commands::activity::get_last_activity_dates,
```

- [ ] **Step 5: Build prüfen**

```powershell
cd src-tauri && cargo check 2>&1
```

Expected: keine Fehler.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/db/activity.rs src-tauri/src/commands/activity.rs src-tauri/src/main.rs
git commit -m "feat(crm/c): Rust command get_last_activity_dates"
```

---

## Task 2: TypeScript — Typen + Service + Store

**Files:**
- Modify: `src/types/crm.types.ts`
- Modify: `src/services/crm.service.ts`
- Modify: `src/store/crm.store.ts`

- [ ] **Step 1: AccountActivityDate Interface in crm.types.ts**

Am Ende von `src/types/crm.types.ts` einfügen:

```typescript
export interface AccountActivityDate {
  accountId: string
  lastActivityAt: string | null
}
```

- [ ] **Step 2: CrmService erweitern**

In `src/services/crm.service.ts`, am Anfang, `useWorkspaceStore` Import prüfen — bereits vorhanden.
Zusätzlich `AccountActivityDate` aus crm.types importieren:

```typescript
import type { FollowUp, UpsertFollowUpPayload, AccountActivityDate } from '@/types/crm.types'
```

Im `CrmService` Objekt, nach `delete`, zwei neue Methoden einfügen:

```typescript
async getAllFollowUps(workspaceId: string): Promise<FollowUp[]> {
  const activities = await invoke<Activity[]>('get_open_tasks', { workspaceId })
  return activities
    .filter(a => {
      try { return JSON.parse(a.payload).is_follow_up === true } catch { return false }
    })
    .map(activityToFollowUp)
},

getLastActivityDates(workspaceId: string): Promise<AccountActivityDate[]> {
  return invoke('get_last_activity_dates', { workspaceId })
},
```

- [ ] **Step 3: useCrmStore erweitern**

In `src/store/crm.store.ts`:

Import erweitern:
```typescript
import type { FollowUp, UpsertFollowUpPayload, AccountActivityDate } from '@/types/crm.types'
import { useWorkspaceStore } from '@/store/workspace.store'
```

Interface `CrmState` erweitern:
```typescript
interface CrmState {
  followUps: FollowUp[]
  allFollowUps: FollowUp[]
  lastActivity: AccountActivityDate[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  loadAll: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertFollowUpPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}
```

Initialstate ergänzen:
```typescript
allFollowUps: [],
lastActivity: [],
```

`loadAll` Action hinzufügen (nach `loadForCustomer`):
```typescript
loadAll: async (workspaceId) => {
  set({ isLoading: true, error: null })
  try {
    const [allFollowUps, lastActivity] = await Promise.all([
      CrmService.getAllFollowUps(workspaceId),
      CrmService.getLastActivityDates(workspaceId),
    ])
    set({ allFollowUps, lastActivity, isLoading: false })
  } catch (err) {
    const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
    set({ isLoading: false, error })
    log.error('Failed to load all follow-ups', { error })
  }
},
```

- [ ] **Step 4: Typecheck**

```powershell
npm run typecheck
```

Expected: keine Fehler.

- [ ] **Step 5: Commit**

```powershell
git add src/types/crm.types.ts src/services/crm.service.ts src/store/crm.store.ts
git commit -m "feat(crm/c): AccountActivityDate type + CrmService.getAllFollowUps + loadAll"
```

---

## Task 3: Follow-Up Center UI (KpisRoute)

**Files:**
- Modify: `src/routes/KpisRoute.tsx`

- [ ] **Step 1: Vollständiger Rewrite**

Ersetze den gesamten Inhalt von `src/routes/KpisRoute.tsx` mit:

```tsx
import { useEffect } from 'react'
import { useCrmStore } from '@/store/crm.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useUiStore } from '@/store/ui.store'
import type { FollowUp } from '@/types/crm.types'

const INACTIVITY_DAYS = 14

function daysAgo(iso: string | null): number {
  if (!iso) return 9999
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function isOverdue(fu: FollowUp): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return fu.dueDate < today
}

function isDueToday(fu: FollowUp): boolean {
  return fu.dueDate === new Date().toISOString().slice(0, 10)
}

function isDueThisWeek(fu: FollowUp): boolean {
  const today = new Date()
  const end = new Date(today)
  end.setDate(today.getDate() + (6 - today.getDay() + 1)) // next Sunday
  const due = new Date(fu.dueDate)
  return due > today && due <= end
}

function formatDue(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d überfällig`
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

type Urgency = 'overdue' | 'today' | 'week' | 'later'

function urgency(fu: FollowUp): Urgency {
  if (isOverdue(fu)) return 'overdue'
  if (isDueToday(fu)) return 'today'
  if (isDueThisWeek(fu)) return 'week'
  return 'later'
}

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Überfällig',
  today:   'Heute',
  week:    'Diese Woche',
  later:   'Später',
}

const URGENCY_COLOR: Record<Urgency, string> = {
  overdue: 'var(--danger)',
  today:   'var(--warn)',
  week:    'var(--accent)',
  later:   'var(--fg-muted)',
}

function FollowUpCard({ fu, customerName, onDone, onDelete, onOpenCustomer }: {
  fu: FollowUp
  customerName: string
  onDone: () => void
  onDelete: () => void
  onOpenCustomer: () => void
}) {
  const u = urgency(fu)
  return (
    <div className="task-card group" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 6 }}>{fu.title}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={onOpenCustomer}
              style={{
                fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)',
                background: 'var(--accent-soft)', borderRadius: 99, padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              {customerName}
            </button>
            <span style={{ fontSize: 11, fontWeight: 600, color: URGENCY_COLOR[u] }}>
              {formatDue(fu.dueDate)}
            </span>
            {fu.priority === 'high' && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--accent-ink)',
                background: 'var(--accent)', borderRadius: 99, padding: '2px 7px',
              }}>Priorität</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={onDone}
            title="Erledigt"
            style={{
              width: 26, height: 26, borderRadius: 8, border: '1.5px solid var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: 'var(--fg-muted)', cursor: 'pointer',
              transition: 'all 180ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)' }}
          >✓</button>
          <button
            onClick={onDelete}
            className="task-delete"
            style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--fg-dim)', cursor: 'pointer', opacity: 0, transition: 'opacity 180ms' }}
          >✕</button>
        </div>
      </div>
    </div>
  )
}

const URGENCY_ORDER: Urgency[] = ['overdue', 'today', 'week', 'later']

export function KpisRoute() {
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const isLoading    = useCrmStore(s => s.isLoading)
  const loadAll      = useCrmStore(s => s.loadAll)
  const remove       = useCrmStore(s => s.remove)
  const upsert       = useCrmStore(s => s.upsert)
  const customers    = useCustomersStore(s => s.customers)
  const setSelected  = useUiStore(s => s.setSelectedCustomer)
  const setAppView   = useUiStore(s => s.setAppView)

  useEffect(() => {
    if (workspaceId) loadAll(workspaceId)
  }, [workspaceId])

  const customerName = (id: string) =>
    customers.find(c => c.id === id)?.name ?? 'Unbekannt'

  const openCustomer = (customerId: string) => {
    setSelected(customerId)
    setAppView('clients')
  }

  const handleDone = async (fu: FollowUp) => {
    await upsert({ id: fu.id, customerId: fu.customerId, title: fu.title, dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority })
    if (workspaceId) loadAll(workspaceId)
  }

  const handleDelete = async (id: string) => {
    await remove(id)
    if (workspaceId) loadAll(workspaceId)
  }

  // Inaktive Kunden: in lastActivity Map einlesen, Kunden ohne Eintrag oder mit altem Eintrag finden
  const activityMap = new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt]))
  const inactiveCustomers = customers.filter(c => {
    const last = activityMap.get(c.id) ?? null
    return daysAgo(last) >= INACTIVITY_DAYS
  })

  const overdue = allFollowUps.filter(f => urgency(f) === 'overdue').length
  const today   = allFollowUps.filter(f => urgency(f) === 'today').length
  const week    = allFollowUps.filter(f => urgency(f) === 'week').length

  return (
    <div className="main-inner">
      <div className="greeting">
        <h1 className="greeting-title">Follow-Ups<em>.</em></h1>
        <div className="greeting-sub">
          {overdue > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{overdue} überfällig</span>}
          <span>{today} heute · {week} diese Woche · {allFollowUps.length} gesamt</span>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Lädt…
        </div>
      ) : (
        <>
          {URGENCY_ORDER.map(u => {
            const items = allFollowUps.filter(f => urgency(f) === u)
            if (items.length === 0) return null
            return (
              <div key={u} style={{ marginBottom: 28 }}>
                <div className="section-head" style={{ marginTop: 0, marginBottom: 12 }}>
                  <h2 style={{ color: URGENCY_COLOR[u] }}>{URGENCY_LABEL[u]}</h2>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map(fu => (
                    <FollowUpCard
                      key={fu.id}
                      fu={fu}
                      customerName={customerName(fu.customerId)}
                      onDone={() => handleDone(fu)}
                      onDelete={() => handleDelete(fu.id)}
                      onOpenCustomer={() => openCustomer(fu.customerId)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {allFollowUps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
              Keine offenen Follow-Ups — alles erledigt.
            </div>
          )}

          {/* Inaktive Kunden */}
          {inactiveCustomers.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-head" style={{ marginBottom: 12 }}>
                <h2>Kunden ohne Kontakt <span style={{ color: 'var(--fg-dim)', fontWeight: 400, fontSize: 13 }}>({INACTIVITY_DAYS}+ Tage)</span></h2>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{inactiveCustomers.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {inactiveCustomers.map(c => {
                  const last = activityMap.get(c.id) ?? null
                  const days = daysAgo(last)
                  return (
                    <div
                      key={c.id}
                      className="task-card"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'default' }}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginLeft: 10 }}>
                          {last ? `Letzter Kontakt: vor ${days} Tagen` : 'Noch kein Kontakt'}
                        </span>
                      </div>
                      <button
                        onClick={() => openCustomer(c.id)}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 12px' }}
                      >
                        + Follow-Up
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      <style>{`.task-card:hover .task-delete { opacity: 1 !important; }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```powershell
npm run typecheck
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```powershell
git add src/routes/KpisRoute.tsx
git commit -m "feat(crm/c): Follow-Up Center — globale Übersicht nach Dringlichkeit + Inaktivitätsliste"
```

---

## Task 4: NavSidebar + DashboardPane

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`
- Modify: `src/components/customer/tabs/DashboardPane.tsx`

- [ ] **Step 1: Bell Icon importieren in NavSidebar**

Import-Zeile anpassen:

```typescript
import {
  LayoutDashboard, Users, FileText, CheckSquare,
  Calendar, Mail, Settings, Bell,
} from 'lucide-react'
```

- [ ] **Step 2: Follow-Ups Eintrag hinzufügen**

Nach dem Tasks-Eintrag (Zeile mit `kbd="T"`), neuen Eintrag einfügen:

```tsx
<SidebarNavItem icon={Bell} label="Follow-Ups" active={appView === 'kpis'} onClick={() => setAppView('kpis')} kbd="U" />
```

- [ ] **Step 3: Quick-Create in DashboardPane**

In `src/components/customer/tabs/DashboardPane.tsx`, am Anfang `useState` importieren (bereits vorhanden prüfen) und `useCrmStore` Import ergänzen falls nicht da.

Store-Zugriff in der Komponente hinzufügen:
```tsx
const upsertFollowUp = useCrmStore(s => s.upsert)
const [showFuForm, setShowFuForm] = useState(false)
const [fuTitle, setFuTitle]       = useState('')
const [fuDate, setFuDate]         = useState(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))
```

In der Lead Score Card JSX, nach dem `</div>` der breakdown section, einfügen:

```tsx
<div className="mt-3 pt-3 border-t border-[var(--border)]">
  {showFuForm ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        value={fuTitle}
        onChange={e => setFuTitle(e.target.value)}
        placeholder="Follow-Up Titel…"
        className="text-xs px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--fg-dim)]"
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="date"
          value={fuDate}
          onChange={e => setFuDate(e.target.value)}
          className="flex-1 text-xs px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={async () => {
            if (!fuTitle.trim()) return
            await upsertFollowUp({ customerId, title: fuTitle.trim(), dueDate: fuDate, priority: 'normal' })
            setFuTitle(''); setShowFuForm(false)
          }}
          className="btn-primary"
          style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }}
        >
          Speichern
        </button>
        <button
          onClick={() => setShowFuForm(false)}
          style={{ fontSize: 11, padding: '4px 8px', color: 'var(--fg-muted)' }}
        >
          ✕
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setShowFuForm(true)}
      className="text-xs text-[var(--fg-2)] hover:text-[var(--accent)] transition-colors"
    >
      + Follow-Up erstellen
    </button>
  )}
</div>
```

- [ ] **Step 4: Typecheck**

```powershell
npm run typecheck
```

Expected: keine Fehler.

- [ ] **Step 5: Test Suite**

```powershell
npm run test:run
```

Expected: alle Tests grün.

- [ ] **Step 6: Commit**

```powershell
git add src/components/layout/NavSidebar.tsx src/components/customer/tabs/DashboardPane.tsx
git commit -m "feat(crm/c): Follow-Ups NavSidebar-Eintrag + Quick-Create in DashboardPane"
```
