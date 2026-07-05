# Phase 1 „Vertrauen + Präsenz" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stille Fehler sichtbar machen (Sync, Mahn-PDF, Speichern) und der App eine Präsenz-Schicht geben (System-Notifications, Tray, Autostart, Morgen-Briefing, Geld-/Team-Events) — Phase 1 der Dach-Spec `docs/superpowers/specs/2026-07-02-vorbereiteter-schreibtisch-design.md`.

**Architecture:** Rust/Tauri-2-Backend bekommt Fehler-Tracking in der `sync_queue`, Tray-Icon mit Hide-to-Tray und die Plugins `notification`/`autostart`. Das React-Frontend bekommt einen persistierten Notification-Settings-Store, einen Notify-Service (Gating: Schalter + Ruhezeiten), drei Ereignisquellen (Briefing-Scheduler, Geld-Events, Team-Events) und sichtbare Sync-/Speicher-Fehler. Alle Entscheidungslogik ist deterministischer Code, kein KI-Call.

**Tech Stack:** Tauri 2 (Rust, rusqlite, tauri-plugin-notification, tauri-plugin-autostart, tray-icon-Feature), React 18 + TypeScript + Zustand (persist), Vitest.

## Global Constraints

- **Sprache:** Alle UI-Texte und neuen Fehlermeldungen auf Deutsch.
- **Tests:** Vitest, colocated als `<name>.test.ts(x)` neben der Quelldatei. Ausführen: `npx vitest run <pfad>`. Rust: `cargo test` in `src-tauri/`.
- **Kein neues Parallel-System:** Bestehende Stores/Services erweitern, nichts duplizieren.
- **Kein KI-Call** in irgendeinem Teil dieses Plans.
- **Arbeitsbranch:** `feature/phase1-vertrauen-praesenz`, abgezweigt von `feature/erechnung-2026-06-21`.
- **Vor jedem Commit:** betroffene Tests grün; am Ende jeder Task zusätzlich `npm run typecheck` (bzw. `cargo check` bei Rust-Tasks).
- Zustand-Persist-Keys nutzen das Präfix `cultera-` (Bestandskonvention).

---

### Task 0: Branch anlegen

**Files:** keine Änderungen.

- [ ] **Step 1: Branch erstellen**

```bash
git checkout -b feature/phase1-vertrauen-praesenz
```

Expected: `Switched to a new branch 'feature/phase1-vertrauen-praesenz'`

---

### Task 1: Rust — Sync-Queue-Fehler-Tracking

Server-Ablehnungen (4xx) bleiben heute still für immer in der Queue und `last_synced_at` wird trotzdem gesetzt. Danach: abgelehnte Einträge werden markiert und gezählt, `last_synced_at` nur bei komplettem Erfolg.

**Files:**
- Modify: `src-tauri/src/db/migrations.rs` (CURRENT_VERSION 34→35, neuer Migrationsfall)
- Modify: `src-tauri/src/db/schema.rs` (sync_queue-CREATE um 2 Spalten ergänzen)
- Modify: `src-tauri/src/core/sync/mod.rs` (Helper + `failed_count` in `SyncStatus` + neues Command)
- Modify: `src-tauri/src/core/sync/push.rs` (Ablehnung ≠ Erfolg ≠ Netzfehler)
- Modify: `src-tauri/src/core/sync/connectivity.rs` (Event `cultera://sync-failed-count`)
- Modify: `src-tauri/src/main.rs` (Command registrieren)

**Interfaces:**
- Produces: `get_failed_count(conn) -> Result<u32, AppError>`, `mark_entry_failed(conn, id, error)`, Tauri-Command `get_failed_sync_entries() -> Vec<FailedSyncEntry>`, `SyncStatus.failed_count: u32`, Event `cultera://sync-failed-count` (u32). Task 2 konsumiert Event + `failed_count`.

- [ ] **Step 1: Fehlschlagende Rust-Tests schreiben**

In `src-tauri/src/core/sync/mod.rs` im bestehenden `mod tests`-Block ergänzen:

```rust
    #[test]
    fn mark_entry_failed_sets_error_and_counts() {
        let conn = setup();
        enqueue(&conn, "customers", "c1", "INSERT", serde_json::json!({"id": "c1"})).unwrap();
        let id: String = conn.query_row("SELECT id FROM sync_queue LIMIT 1", [], |r| r.get(0)).unwrap();
        mark_entry_failed(&conn, &id, "HTTP 403: RLS verweigert").unwrap();
        mark_entry_failed(&conn, &id, "HTTP 403: RLS verweigert").unwrap();
        assert_eq!(get_failed_count(&conn).unwrap(), 1);
        let attempts: i64 = conn.query_row("SELECT attempts FROM sync_queue WHERE id = ?1", [&id], |r| r.get(0)).unwrap();
        assert_eq!(attempts, 2);
    }

    #[test]
    fn failed_count_zero_without_errors() {
        let conn = setup();
        enqueue(&conn, "customers", "c1", "INSERT", serde_json::json!({"id": "c1"})).unwrap();
        assert_eq!(get_failed_count(&conn).unwrap(), 0);
    }
```

- [ ] **Step 2: Tests laufen lassen — müssen scheitern**

Run: `cd src-tauri && cargo test mark_entry_failed`
Expected: Compile-Fehler (`mark_entry_failed` / `get_failed_count` existieren nicht).

- [ ] **Step 3: Migration 35 + Schema**

`src-tauri/src/db/migrations.rs`: `const CURRENT_VERSION: u32 = 34;` → `35`. Im `match version`-Block vor `_ => Ok(())` einfügen:

```rust
        35 => {
            // sync_queue: Fehler-Tracking — Server-Ablehnungen (4xx) wurden bisher
            // still endlos wiederholt. attempts/last_error machen sie zähl- und anzeigbar.
            if !column_exists(conn, "sync_queue", "attempts") {
                conn.execute_batch("ALTER TABLE sync_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;")?;
            }
            if !column_exists(conn, "sync_queue", "last_error") {
                conn.execute_batch("ALTER TABLE sync_queue ADD COLUMN last_error TEXT;")?;
            }
            Ok(())
        }
```

`src-tauri/src/db/schema.rs`: das `CREATE TABLE IF NOT EXISTS sync_queue (…)` suchen (`grep -n "sync_queue" src-tauri/src/db/schema.rs`) und in der Spaltenliste nach `created_at …` ergänzen:

```sql
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
```

(Guard-Muster wie Migration 34: frische Installs bekommen die Spalten über `create_tables`, Bestandsinstallationen über Migration 35 — `column_exists` verhindert doppeltes ALTER.)

- [ ] **Step 4: Helper + Status + Command in `mod.rs`**

Nach `get_pending_count` einfügen:

```rust
pub fn get_failed_count(conn: &rusqlite::Connection) -> Result<u32, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE last_error IS NOT NULL", [], |r| r.get(0)
    )?;
    Ok(count as u32)
}

pub fn mark_entry_failed(conn: &rusqlite::Connection, id: &str, error: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_queue SET attempts = attempts + 1, last_error = ?2 WHERE id = ?1",
        rusqlite::params![id, error],
    )?;
    Ok(())
}
```

`SyncStatus` erweitern und beide Commands befüllen:

```rust
#[derive(Debug, Serialize)]
pub struct SyncStatus {
    pub pending_count: u32,
    pub failed_count: u32,
    pub last_synced_at: String,
    pub is_online: bool,
}
```

In `get_sync_status` und `sync_now` jeweils `let failed_count = get_failed_count(&conn)?;` ergänzen und ins Struct schreiben.

Neues Command ans Dateiende (vor `mod tests`):

```rust
#[derive(Debug, Serialize)]
pub struct FailedSyncEntry {
    pub table_name: String,
    pub record_id: String,
    pub operation: String,
    pub attempts: i64,
    pub last_error: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn get_failed_sync_entries(db: tauri::State<'_, DbPool>) -> Result<Vec<FailedSyncEntry>, AppError> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT table_name, record_id, operation, attempts, last_error, created_at
         FROM sync_queue WHERE last_error IS NOT NULL ORDER BY created_at ASC LIMIT 50",
    )?;
    let rows = stmt.query_map([], |row| Ok(FailedSyncEntry {
        table_name: row.get(0)?, record_id: row.get(1)?, operation: row.get(2)?,
        attempts: row.get(3)?, last_error: row.get(4)?, created_at: row.get(5)?,
    }))?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

- [ ] **Step 5: `push.rs` — Ablehnung markieren, `last_synced_at` nur bei komplettem Erfolg**

`flush_pending` komplett ersetzen (Signatur bleibt):

```rust
pub async fn flush_pending(
    client: &reqwest::Client,
    state: &SyncState,
    pool: &DbPool,
) -> Result<(), AppError> {
    let token = match state.get_token() {
        Some(t) => t,
        None => return Ok(()),
    };

    let entries = get_queue(pool)?;
    if entries.is_empty() { return Ok(()); }

    let mut all_ok = true;
    for entry in &entries {
        // Netzfehler (Err) brechen den Batch ab: temporär, nicht als Ablehnung werten.
        match send_entry(client, state, &token, entry).await? {
            PushOutcome::Delivered => delete_entry(pool, &entry.id)?,
            PushOutcome::Rejected(reason) => {
                mark_failed(pool, &entry.id, &reason)?;
                all_ok = false;
            }
        }
    }

    // Ehrlich bleiben: „synchronisiert" nur, wenn wirklich alles durchging.
    if all_ok {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = pool.conn();
        set_last_synced_at(&conn, &now)?;
    }

    Ok(())
}

enum PushOutcome { Delivered, Rejected(String) }

async fn send_entry(
    client: &reqwest::Client,
    state: &SyncState,
    token: &str,
    entry: &SyncEntry,
) -> Result<PushOutcome, AppError> {
    match entry.operation.as_str() {
        "INSERT" | "UPDATE" => {
            let url = format!("{}/rest/v1/{}", state.supabase_url, entry.table_name);
            let payload: serde_json::Value = serde_json::from_str(&entry.payload)
                .map_err(|e| AppError::Validation(e.to_string()))?;
            let resp = client.post(&url)
                .header("Authorization", format!("Bearer {token}"))
                .header("apikey", &state.anon_key)
                .header("Content-Type", "application/json")
                .header("Prefer", "resolution=merge-duplicates,return=minimal")
                .json(&payload)
                .send()
                .await
                .map_err(|e| AppError::ExternalApi(e.to_string()))?;
            let status = resp.status();
            if status.is_success() || status.as_u16() == 409 {
                Ok(PushOutcome::Delivered)
            } else {
                let body = resp.text().await.unwrap_or_default();
                Ok(PushOutcome::Rejected(format!("HTTP {}: {}", status.as_u16(), truncate(&body, 200))))
            }
        }
        "DELETE" => {
            let url = format!(
                "{}/rest/v1/{}?id=eq.{}",
                state.supabase_url, entry.table_name, entry.record_id
            );
            let resp = client.delete(&url)
                .header("Authorization", format!("Bearer {token}"))
                .header("apikey", &state.anon_key)
                .send()
                .await
                .map_err(|e| AppError::ExternalApi(e.to_string()))?;
            let status = resp.status();
            if status.is_success() || status.as_u16() == 404 {
                Ok(PushOutcome::Delivered)
            } else {
                let body = resp.text().await.unwrap_or_default();
                Ok(PushOutcome::Rejected(format!("HTTP {}: {}", status.as_u16(), truncate(&body, 200))))
            }
        }
        other => Ok(PushOutcome::Rejected(format!("Unbekannte Operation: {other}"))),
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max { s.to_string() }
    else { s.chars().take(max).collect::<String>() + "…" }
}

fn mark_failed(pool: &DbPool, id: &str, reason: &str) -> Result<(), AppError> {
    let conn = pool.conn();
    super::mark_entry_failed(&conn, id, reason)
}
```

- [ ] **Step 6: Event in `connectivity.rs`**

Im `if is_online`-Block den Erfolgszweig so erweitern, dass IMMER (auch nach Push-Fehler) beide Zähler emittiert werden:

```rust
        if is_online {
            if let Err(e) = push::flush_pending(&client, &state, &pool).await {
                eprintln!("[SyncWorker] Push failed: {e}");
            }
            let conn = pool.conn();
            if let Ok(count) = super::get_pending_count(&conn) {
                let _ = app.emit("cultera://pending-count", count);
            }
            if let Ok(fcount) = super::get_failed_count(&conn) {
                let _ = app.emit("cultera://sync-failed-count", fcount);
            }
        }
```

- [ ] **Step 7: Command registrieren**

`src-tauri/src/main.rs`, im `invoke_handler` nach `core::sync::sync_now,`:

```rust
            core::sync::get_failed_sync_entries,
```

- [ ] **Step 8: Tests + Check**

Run: `cd src-tauri && cargo test && cargo check`
Expected: alle Tests PASS (inkl. der 2 neuen), kein Warning-Fail.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/db/migrations.rs src-tauri/src/db/schema.rs src-tauri/src/core/sync/
git add src-tauri/src/main.rs
git commit -m "feat(sync): Fehler-Tracking fuer sync_queue — Ablehnungen sichtbar statt stiller Endlos-Retry"
```

---

### Task 2: UI — Sync-Fehler sichtbar + „Erneut versuchen"

**Files:**
- Modify: `src/store/workspace.store.ts` (`failedCount` + Setter)
- Modify: `src/core/sync/useSyncBridge.ts` (Listener)
- Create: `src/components/layout/SyncStatusChip.tsx`
- Create: `src/components/layout/SyncStatusChip.test.tsx`
- Modify: `src/components/layout/NavSidebar.tsx` (Chip im Footer mounten)

**Interfaces:**
- Consumes: Event `cultera://sync-failed-count` (u32), Command `sync_now` → `{ pending_count, failed_count, last_synced_at, is_online }` (Task 1).
- Produces: `useWorkspaceStore` Felder `failedCount: number`, `setFailedCount(n: number): void`.

- [ ] **Step 1: Fehlschlagenden Komponententest schreiben**

`src/components/layout/SyncStatusChip.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncStatusChip } from './SyncStatusChip'
import { useWorkspaceStore } from '@/store/workspace.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({ pending_count: 0, failed_count: 0, last_synced_at: '', is_online: true }) }))

describe('SyncStatusChip', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      failedCount: 0,
      activeWorkspaceId: 'ws1',
      workspaces: [{ id: 'ws1', name: 'Test', logo_url: null, role: 'owner', capabilities: [], isShared: true, join_code: null }],
      localWorkspaces: [],
    } as never)
  })

  it('rendert nichts ohne Fehler', () => {
    const { container } = render(<SyncStatusChip />)
    expect(container.firstChild).toBeNull()
  })

  it('zeigt Anzahl haengender Aenderungen', () => {
    useWorkspaceStore.setState({ failedCount: 3 } as never)
    render(<SyncStatusChip />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Sync-Fehler')).toBeInTheDocument()
  })

  it('rendert nichts im lokalen Workspace', () => {
    useWorkspaceStore.setState({
      failedCount: 3,
      workspaces: [],
      localWorkspaces: [{ id: 'ws1', name: 'Lokal', logo_url: null, role: 'owner', capabilities: [], isShared: false, join_code: null }],
    } as never)
    const { container } = render(<SyncStatusChip />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/components/layout/SyncStatusChip.test.tsx`
Expected: FAIL („Cannot find module './SyncStatusChip'").

- [ ] **Step 3: Store + Bridge erweitern**

`src/store/workspace.store.ts`: im Interface nach `pendingCount: number` → `failedCount: number`, nach `setPendingCount…` → `setFailedCount: (count: number) => void`. Im Store-Objekt nach `pendingCount: 0,` → `failedCount: 0,` und neben `setPendingCount`:

```ts
      setFailedCount: (count) => set({ failedCount: count }),
```

`src/core/sync/useSyncBridge.ts`: Selector + Listener ergänzen:

```ts
  const setFailedCount = useWorkspaceStore(s => s.setFailedCount)
```

nach dem Pending-Listener:

```ts
    // 4. Fehlgeschlagene Sync-Einträge (Server-Ablehnungen) empfangen
    const unlistenFailed = listen<number>(
      'cultera://sync-failed-count',
      (event) => setFailedCount(event.payload)
    )
```

Cleanup ergänzen: `unlistenFailed.then(fn => fn())`, Dependency-Array um `setFailedCount` erweitern.

- [ ] **Step 4: Chip-Komponente**

`src/components/layout/SyncStatusChip.tsx`:

```tsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'

interface SyncNowResult { pending_count: number; failed_count: number; last_synced_at: string; is_online: boolean }

/**
 * Sichtbarer Zustand für hängende Sync-Einträge (Server-Ablehnungen).
 * Vorher: stiller Endlos-Retry — der Nutzer erfuhr nie, dass Daten klemmen.
 */
export function SyncStatusChip() {
  const failedCount = useWorkspaceStore(s => s.failedCount)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const [busy, setBusy] = useState(false)

  if (!isShared || failedCount === 0) return null

  const retry = async () => {
    if (busy) return
    setBusy(true)
    try {
      const st = await invoke<SyncNowResult>('sync_now')
      useWorkspaceStore.getState().setPendingCount(st.pending_count)
      useWorkspaceStore.getState().setFailedCount(st.failed_count)
      if (st.failed_count === 0) {
        useToastStore.getState().show({ message: 'Alle Änderungen synchronisiert.', variant: 'success' })
      } else {
        useToastStore.getState().show({
          message: `${st.failed_count} Änderungen weiterhin abgelehnt — bitte erneut anmelden oder Support kontaktieren.`,
          variant: 'error', durationMs: 8000,
        })
      }
    } catch {
      useToastStore.getState().show({ message: 'Synchronisation fehlgeschlagen — bitte Verbindung prüfen.', variant: 'error', durationMs: 8000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="nav-item"
      data-active="false"
      data-label="Sync-Fehler"
      onClick={retry}
      title={`${failedCount} Änderungen konnten nicht synchronisiert werden — klicken für erneuten Versuch`}
    >
      {busy ? <RefreshCw size={18} strokeWidth={1.75} /> : <CloudOff size={18} strokeWidth={1.75} />}
      <span className="nav-item__label">Sync-Fehler</span>
      <span className="nav-badge nav-badge--a">{failedCount}</span>
    </button>
  )
}
```

- [ ] **Step 5: Im NavSidebar-Footer mounten**

`src/components/layout/NavSidebar.tsx`: Import `import { SyncStatusChip } from './SyncStatusChip'`. Direkt nach `<div className="nav-foot-divider" />` (Zeile ~157) einfügen:

```tsx
      <SyncStatusChip />
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run src/components/layout/SyncStatusChip.test.tsx && npm run typecheck`
Expected: 3 Tests PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/store/workspace.store.ts src/core/sync/useSyncBridge.ts src/components/layout/SyncStatusChip.tsx src/components/layout/SyncStatusChip.test.tsx src/components/layout/NavSidebar.tsx
git commit -m "feat(sync): Sync-Fehler-Chip in der Sidebar — haengende Aenderungen sichtbar + Retry"
```

---

### Task 3: Mahnung ohne PDF blockieren + Versand-Protokoll am Kunden

Heute: PDF-Erzeugung scheitert still (`catch { /* PDF optional */ }` in `prepareReminder`) → Mahnung geht ohne Anhang raus. Danach: Vorbereitung schlägt sichtbar fehl; erfolgreicher Versand hinterlässt eine Aktivität am Kunden.

**Files:**
- Modify: `src/services/dunning.service.ts`
- Modify: `src/services/dunning.service.test.ts` (neue Fälle)

**Interfaces:**
- Consumes: `ActivitiesGateway.create(payload: CreateActivityPayload)` aus `@/data/activities.gateway` (existiert), `useAuthStore` aus `@/store/auth.store`.
- Produces: unverändertes Result-Interface; neue Fehlermeldung `'Rechnungs-PDF konnte nicht erzeugt werden — Mahnung nicht gesendet. Bitte erneut versuchen.'`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/services/dunning.service.test.ts` (bestehende Mock-Struktur der Datei beachten — falls dort bereits Modul-Mocks existieren, in den bestehenden `vi.mock`-Block integrieren) einen neuen `describe`-Block ergänzen:

```ts
describe('prepareReminder: PDF-Pflicht', () => {
  it('bricht ab, wenn das Rechnungs-PDF nicht erzeugt werden kann', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { FinanceGateway } = await import('@/data/finance.gateway')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer GmbH', email: 'info@meyer.de' }] } as never)
    vi.mocked(FinanceGateway.getInvoice).mockRejectedValueOnce(new Error('db locked'))

    const invoice = {
      id: 'inv1', accountId: 'acc1', number: 'R-100', dueDate: '2026-06-01',
      total: 1190, status: 'overdue',
    } as never

    const result = await prepareReminder(invoice, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('PDF')
  })
})
```

Falls `FinanceGateway` in der Datei noch nicht gemockt ist, oben ergänzen:

```ts
vi.mock('@/data/finance.gateway', () => ({ FinanceGateway: { getInvoice: vi.fn() } }))
vi.mock('@/data/contacts.gateway', () => ({ ContactsGateway: { getByAccount: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/lib/ai/corra', () => ({ generateCorraDraft: vi.fn().mockRejectedValue(new Error('offline')) }))
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/services/dunning.service.test.ts`
Expected: neuer Test FAIL (aktuell liefert `prepareReminder` trotz PDF-Fehler `ok: true` mit leeren `attachmentPaths`).

- [ ] **Step 3: PDF-Fehler zum harten Abbruch machen**

In `src/services/dunning.service.ts`, `prepareReminder`, den Block

```ts
    let attachmentPaths: string[] = []
    if (account) {
      try {
        ...
        attachmentPaths = [path]
      } catch { /* PDF optional */ }
    }
```

ersetzen durch:

```ts
    let attachmentPaths: string[] = []
    if (account) {
      try {
        const full = await FinanceGateway.getInvoice(invoice.id)
        const { getInvoicePdfBytes } = await import('@/components/finance/InvoicePDF')
        const bytes = await getInvoicePdfBytes(full, profile, account)
        const safe = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
        const filename = `${levelLabel(level)}_${invoice.number ?? invoice.id.slice(0, 8)}_${safe}.pdf`
        const path = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
        attachmentPaths = [path]
      } catch (err) {
        // Kein stilles Degradieren: eine Mahnung ohne Rechnungs-PDF geht nicht raus.
        log.warn('reminder PDF generation failed', { invoiceId: invoice.id, err })
        return { ok: false, error: 'Rechnungs-PDF konnte nicht erzeugt werden — Mahnung nicht gesendet. Bitte erneut versuchen.' }
      }
    }
```

- [ ] **Step 4: Protokoll-Aktivität nach erfolgreichem Versand**

Imports oben in `dunning.service.ts` ergänzen:

```ts
import { ActivitiesGateway } from '@/data/activities.gateway'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
```

In `sendReminder`, nach dem erfolgreichen `recordReminderSent`-try/catch und vor dem finalen `return { invoiceId: invoice.id, ok: true }`:

```ts
  // Protokollbuch: Der Versand ist am Kunden nachlesbar (was, wann, an wen).
  try {
    await ActivitiesGateway.create({
      workspaceId: useWorkspaceStore.getState().getActiveWorkspaceId() ?? '',
      createdBy: useAuthStore.getState().user?.id ?? '',
      accountId: invoice.accountId,
      type: 'note',
      title: `${levelLabel(level)} versendet · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)}`,
      body: `Per E-Mail an ${prep.data.to.join(', ')} — mit Rechnungs-PDF.`,
    })
  } catch (protoErr) {
    log.warn('reminder protocol activity failed', { invoiceId: invoice.id, protoErr })
  }
```

(Sollte `ActivityType` den Wert `'note'` nicht enthalten — `npm run typecheck` zeigt es —, den in `src/types/activity.types.ts` definierten passendsten Typ verwenden, z. B. `'email'` mit `direction: 'out'`.)

- [ ] **Step 5: Tests + Typecheck**

Run: `npx vitest run src/services/dunning.service.test.ts && npm run typecheck`
Expected: PASS (alle Bestandsfälle + neuer Fall), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/dunning.service.ts src/services/dunning.service.test.ts
git commit -m "fix(mahnwesen): Mahnung ohne PDF wird blockiert statt still degradiert; Versand-Protokoll am Kunden"
```

---

### Task 4: Verständliche Fehler (humanizeError) + stille Catches sichtbar machen

**Files:**
- Create: `src/lib/humanize-error.ts`
- Create: `src/lib/humanize-error.test.ts`
- Modify: `src/components/finance/InvoiceForm.tsx` (Zeile ~164, `setError(String(e))`)
- Modify: `src/components/onboarding/CompanyStep.tsx` (leerer Catch beim Speichern)
- Modify: `src/core/sync/useMailAutoSync.ts` (verschluckter Sync-Fehler)

**Interfaces:**
- Produces: `humanizeError(err: unknown, fallback: string): string`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/lib/humanize-error.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { humanizeError } from './humanize-error'

describe('humanizeError', () => {
  it('nutzt den Fallback bei leerem/unbrauchbarem Fehler', () => {
    expect(humanizeError(null, 'Speichern fehlgeschlagen.')).toBe('Speichern fehlgeschlagen.')
    expect(humanizeError({}, 'Speichern fehlgeschlagen.')).toBe('Speichern fehlgeschlagen.')
  })

  it('haengt die Fehlermeldung lesbar an', () => {
    expect(humanizeError(new Error('UNIQUE constraint failed: invoices.number'), 'Rechnung konnte nicht gespeichert werden.'))
      .toBe('Rechnung konnte nicht gespeichert werden. (UNIQUE constraint failed: invoices.number)')
  })

  it('entfernt technische Praefixe und kuerzt lange Meldungen', () => {
    const long = 'invoke error: ' + 'x'.repeat(300)
    const out = humanizeError(long, 'Fehler.')
    expect(out.startsWith('Fehler. (xxx')).toBe(true)
    expect(out.length).toBeLessThan(220)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/lib/humanize-error.test.ts`
Expected: FAIL („Cannot find module './humanize-error'").

- [ ] **Step 3: Implementieren**

`src/lib/humanize-error.ts`:

```ts
/**
 * Macht aus rohen Fehlern (Rust-Strings, Error-Objekte, Supabase-Fehler) eine
 * lesbare deutsche Meldung: benannter Kontext zuerst, technisches Detail in Klammern.
 * Ersetzt das Muster `setError(String(e))`, das Nutzern rohe DB-Fehler zeigte.
 */
const TECH_PREFIXES = [/^invoke error:?\s*/i, /^error:?\s*/i]
const MAX_DETAIL = 180

export function humanizeError(err: unknown, fallback: string): string {
  let raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  raw = raw.trim()
  for (const p of TECH_PREFIXES) raw = raw.replace(p, '')
  if (!raw || raw === '[object Object]' || raw === 'null' || raw === 'undefined') return fallback
  if (raw.length > MAX_DETAIL) raw = raw.slice(0, MAX_DETAIL - 1) + '…'
  return `${fallback} (${raw})`
}
```

- [ ] **Step 4: Die drei Aufrufstellen umstellen**

`src/components/finance/InvoiceForm.tsx`: Import `import { humanizeError } from '@/lib/humanize-error'`; Zeile `} catch (e) { setError(String(e)) }` →

```ts
    } catch (e) { setError(humanizeError(e, 'Rechnung konnte nicht gespeichert werden.')) }
```

`src/components/onboarding/CompanyStep.tsx`: Import `import { toastError } from '@/store/toast.store'`; den Catch in `handleSave` ersetzen:

```ts
    try {
      await saveProfile({ ...profile, ...form })
    } catch (err) {
      // Nicht mehr still: der Nutzer erfaehrt, dass seine Firmendaten NICHT gespeichert sind.
      toastError('Unternehmensdaten konnten nicht gespeichert werden — bitte spaeter unter Einstellungen → Unternehmen pruefen.')
      console.warn('CompanyStep saveProfile failed', err)
    }
```

`src/core/sync/useMailAutoSync.ts`: Import `import { toastError } from '@/store/toast.store'`; im Effect vor `runSync` eine Dedupe-Variable und den Catch ersetzen:

```ts
    let lastToastedError = ''
    const runSync = () => {
      const { selectedAccountId, isSyncing, sync } = useMailStore.getState()
      if (!selectedAccountId || isSyncing) return
      void sync(mailCustomerRefsJson())
        .then(() => { lastToastedError = '' })
        .catch((err: unknown) => {
          // Einmal pro Fehlerursache melden statt still schlucken (oder 5-Minuten-Spam).
          const msg = err instanceof Error ? err.message : String(err)
          if (msg !== lastToastedError) {
            lastToastedError = msg
            toastError('Mail-Abruf fehlgeschlagen — neue Mails fehlen möglicherweise.')
          }
        })
    }
```

- [ ] **Step 5: Tests + Typecheck**

Run: `npx vitest run src/lib/humanize-error.test.ts src/components/onboarding/CompanyStep.test.tsx && npm run typecheck`
Expected: PASS, tsc clean. (CompanyStep-Bestandstest mitlaufen lassen — er darf nicht brechen.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/humanize-error.ts src/lib/humanize-error.test.ts src/components/finance/InvoiceForm.tsx src/components/onboarding/CompanyStep.tsx src/core/sync/useMailAutoSync.ts
git commit -m "fix(errors): humanizeError statt String(e); CompanyStep- und Mail-Sync-Fehler sichtbar"
```

---

### Task 5: Rust — Notification-/Autostart-Plugins, Tray, Hide-to-Tray

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json` (Fenster `visible: false`)
- Modify: `src-tauri/src/main.rs` (Plugins, Tray, CloseToTray-State, `--hidden`-Start)
- Modify: `src-tauri/capabilities/main.json`
- Modify: `package.json` (JS-Plugin-Pakete)

**Interfaces:**
- Produces: Tray mit Id `"main-tray"`; Command `cmd_set_close_to_tray(enabled: bool)`; JS-Pakete `@tauri-apps/plugin-notification` und `@tauri-apps/plugin-autostart` installiert. Tasks 7/11/12 konsumieren.

- [ ] **Step 1: Rust-Abhängigkeiten**

`src-tauri/Cargo.toml`:

```toml
tauri = { version = "2", features = ["devtools", "tray-icon", "image-png"] }
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
tauri-plugin-opener = "2"
tauri-plugin-notification = "2"
tauri-plugin-autostart = "2"
```

- [ ] **Step 2: JS-Pakete installieren**

Run: `npm install @tauri-apps/plugin-notification @tauri-apps/plugin-autostart`
Expected: beide Pakete in `package.json` dependencies (^2.x).

- [ ] **Step 3: Fenster startet unsichtbar (Setup zeigt es)**

`src-tauri/tauri.conf.json`, im `main`-Fenster-Objekt ergänzen:

```json
        "visible": false
```

- [ ] **Step 4: main.rs — Plugins, State, Tray, Close-Handler**

Oben bei den `use`-Statements ergänzen:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use tauri_plugin_autostart::MacosLauncher;
```

Nach den bestehenden Struct-Definitionen (unter `struct Message`) einfügen:

```rust
/// Verhalten beim Fenster-Schließen: true = in den Tray minimieren (Default),
/// false = App wirklich beenden. Wird von den Einstellungen per Command gesetzt.
pub struct CloseToTray(pub AtomicBool);

#[tauri::command]
fn cmd_set_close_to_tray(state: tauri::State<'_, CloseToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}
```

Im Builder die Plugins registrieren (nach `tauri_plugin_opener::init()`):

```rust
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
```

Im `setup`-Closure NACH `app.manage(db_pool.clone());` ergänzen:

```rust
            app.manage(CloseToTray(AtomicBool::new(true)));
```

Den Fenster-Block (`let window = …` bis `window.maximize().unwrap();`) ersetzen durch:

```rust
            let window = app.get_webview_window("main").unwrap();
            window.set_title("Cultera OS").unwrap();
            // Autostart übergibt --hidden: dann im Tray bleiben statt Fenster zeigen.
            let start_hidden = std::env::args().any(|a| a == "--hidden");
            if !start_hidden {
                window.maximize().unwrap();
                window.show().unwrap();
            }
```

Danach (noch im `setup`) den Tray aufbauen:

```rust
            // ── Tray: Cultera OS lebt im Hintergrund weiter ─────────────────────
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                fn show_main(app: &tauri::AppHandle) {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }

                let open_item = MenuItem::with_id(app, "open", "Cultera OS öffnen", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                TrayIconBuilder::with_id("main-tray")
                    .icon(app.default_window_icon().cloned().expect("Fenster-Icon fehlt"))
                    .tooltip("Cultera OS")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => show_main(app),
                        "quit" => {
                            commands::export::auto_export(app);
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up, ..
                        } = event {
                            show_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }
```

`on_window_event` ersetzen:

```rust
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Sicherheitsnetz-Backup wie bisher — best effort.
                commands::export::auto_export(window.app_handle());
                // Default: in den Tray statt beenden — die Präsenz-Schicht
                // (Briefing, Geld-Events) lebt nur, solange der Prozess lebt.
                let to_tray = window.app_handle().state::<CloseToTray>().0.load(Ordering::Relaxed);
                if to_tray && window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
```

Command registrieren — im `invoke_handler` nach `focus_ai_chat,`:

```rust
            cmd_set_close_to_tray,
```

**Hinweis für den Umsetzer:** Falls `auto_export` `&tauri::AppHandle` erwartet und der Compiler im Menü-Event meckert, `commands::export::auto_export(app)` ↔ `auto_export(&app)` gemäß Signatur anpassen — `cargo check` zeigt es.

- [ ] **Step 5: Capabilities für JS-Zugriff**

`src-tauri/capabilities/main.json`, im `permissions`-Array ergänzen:

```json
    "notification:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled",
```

- [ ] **Step 6: Kompilieren + Typecheck**

Run: `cd src-tauri && cargo check` und danach `npm run typecheck`
Expected: beides clean. (Erster `cargo check` mit neuen Plugins dauert mehrere Minuten.)

- [ ] **Step 7: Manueller Smoke-Test**

Run: `npm run tauri dev`, dann: (a) Fenster erscheint maximiert, (b) Tray-Icon vorhanden, (c) Fenster schließen → App bleibt im Tray, (d) Linksklick aufs Tray-Icon → Fenster wieder da, (e) Tray-Menü „Beenden" → Prozess endet.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/src/main.rs src-tauri/capabilities/main.json package.json package-lock.json
git commit -m "feat(praesenz): Notification+Autostart-Plugins, Tray-Icon, Hide-to-Tray beim Schliessen"
```

---

### Task 6: Notification-Settings-Store + Ruhezeiten-Logik

**Files:**
- Create: `src/lib/notifications/quiet-hours.ts`
- Create: `src/lib/notifications/quiet-hours.test.ts`
- Create: `src/store/notification-settings.store.ts`

**Interfaces:**
- Produces:
  - `isQuietTime(d: Date, cfg: QuietConfig): boolean`, `isWeekend(d: Date): boolean`,
    `shouldFireBriefing(now: Date, cfg: BriefingConfig, lastFiredDate: string, todayIso: string): boolean`
  - `useNotificationSettingsStore` mit Feldern `briefingEnabled, briefingTime, moneyEventsEnabled, teamEventsEnabled, quietHoursEnabled, quietFrom, quietUntil, weekendQuiet, closeToTray, lastBriefingDate, notifiedOverdueIds` und Aktionen `set(patch)`, `markBriefingFired(dateIso)`, `markOverdueNotified(ids)`.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`src/lib/notifications/quiet-hours.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isQuietTime, isWeekend, shouldFireBriefing } from './quiet-hours'

const CFG = { quietHoursEnabled: true, quietFrom: '18:00', quietUntil: '07:00', weekendQuiet: true }
// 2026-07-01 ist ein Mittwoch, 2026-07-04 ein Samstag.
const wed = (h: number, m = 0) => new Date(2026, 6, 1, h, m)
const sat = (h: number) => new Date(2026, 6, 4, h)

describe('isQuietTime', () => {
  it('Abend und frueher Morgen sind Ruhezeit (ueber Mitternacht)', () => {
    expect(isQuietTime(wed(19), CFG)).toBe(true)
    expect(isQuietTime(wed(6, 30), CFG)).toBe(true)
    expect(isQuietTime(wed(10), CFG)).toBe(false)
  })
  it('Wochenende ist Ruhezeit, wenn weekendQuiet an', () => {
    expect(isQuietTime(sat(10), CFG)).toBe(true)
    expect(isQuietTime(sat(10), { ...CFG, weekendQuiet: false })).toBe(false)
  })
  it('deaktivierte Ruhezeiten blocken nicht', () => {
    expect(isQuietTime(wed(19), { ...CFG, quietHoursEnabled: false, weekendQuiet: false })).toBe(false)
  })
})

describe('isWeekend', () => {
  it('Samstag/Sonntag true, Mittwoch false', () => {
    expect(isWeekend(sat(10))).toBe(true)
    expect(isWeekend(wed(10))).toBe(false)
  })
})

describe('shouldFireBriefing', () => {
  const BCFG = { ...CFG, briefingEnabled: true, briefingTime: '08:30' }
  it('feuert werktags ab Briefing-Zeit genau einmal pro Tag', () => {
    expect(shouldFireBriefing(wed(8, 29), BCFG, '', '2026-07-01')).toBe(false)
    expect(shouldFireBriefing(wed(8, 31), BCFG, '', '2026-07-01')).toBe(true)
    expect(shouldFireBriefing(wed(9), BCFG, '2026-07-01', '2026-07-01')).toBe(false)
  })
  it('feuert nicht am Wochenende, nicht wenn deaktiviert, nicht in Ruhezeit', () => {
    expect(shouldFireBriefing(sat(9), BCFG, '', '2026-07-04')).toBe(false)
    expect(shouldFireBriefing(wed(9), { ...BCFG, briefingEnabled: false }, '', '2026-07-01')).toBe(false)
    expect(shouldFireBriefing(wed(19), BCFG, '', '2026-07-01')).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/lib/notifications/quiet-hours.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementieren**

`src/lib/notifications/quiet-hours.ts`:

```ts
/**
 * Ruhezeiten-Logik der Präsenz-Schicht — pure Funktionen, kein Store-Zugriff.
 * „Ruhig aber präsent": nach quietFrom, vor quietUntil und (optional) am
 * Wochenende bleibt die App stumm.
 */
export interface QuietConfig {
  quietHoursEnabled: boolean
  quietFrom: string   // 'HH:MM'
  quietUntil: string  // 'HH:MM'
  weekendQuiet: boolean
}

export interface BriefingConfig extends QuietConfig {
  briefingEnabled: boolean
  briefingTime: string // 'HH:MM'
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function isQuietTime(d: Date, cfg: QuietConfig): boolean {
  if (cfg.weekendQuiet && isWeekend(d)) return true
  if (!cfg.quietHoursEnabled) return false
  const now = d.getHours() * 60 + d.getMinutes()
  const from = minutesOf(cfg.quietFrom)
  const until = minutesOf(cfg.quietUntil)
  // Fenster über Mitternacht (18:00 → 07:00) korrekt behandeln.
  return from <= until ? now >= from && now < until : now >= from || now < until
}

export function shouldFireBriefing(
  now: Date, cfg: BriefingConfig, lastFiredDate: string, todayIso: string,
): boolean {
  if (!cfg.briefingEnabled) return false
  if (lastFiredDate === todayIso) return false
  if (isWeekend(now)) return false
  if (isQuietTime(now, cfg)) return false
  return now.getHours() * 60 + now.getMinutes() >= minutesOf(cfg.briefingTime)
}
```

`src/store/notification-settings.store.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotificationSettings {
  briefingEnabled: boolean
  briefingTime: string
  moneyEventsEnabled: boolean
  teamEventsEnabled: boolean
  quietHoursEnabled: boolean
  quietFrom: string
  quietUntil: string
  weekendQuiet: boolean
  closeToTray: boolean
  lastBriefingDate: string
  notifiedOverdueIds: string[]
}

interface NotificationSettingsState extends NotificationSettings {
  set: (patch: Partial<NotificationSettings>) => void
  markBriefingFired: (dateIso: string) => void
  markOverdueNotified: (ids: string[]) => void
}

export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      briefingEnabled: true,
      briefingTime: '08:30',
      moneyEventsEnabled: true,
      teamEventsEnabled: true,
      quietHoursEnabled: true,
      quietFrom: '18:00',
      quietUntil: '07:00',
      weekendQuiet: true,
      closeToTray: true,
      lastBriefingDate: '',
      notifiedOverdueIds: [],

      set: (patch) => set(patch),
      markBriefingFired: (dateIso) => set({ lastBriefingDate: dateIso }),
      // Deckel bei 500 IDs — alte Rechnungen fallen raus, kein unbegrenztes Wachstum.
      markOverdueNotified: (ids) => set(s => ({
        notifiedOverdueIds: [...new Set([...s.notifiedOverdueIds, ...ids])].slice(-500),
      })),
    }),
    { name: 'cultera-notification-settings' },
  ),
)
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/lib/notifications/quiet-hours.test.ts && npm run typecheck`
Expected: alle PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/ src/store/notification-settings.store.ts
git commit -m "feat(praesenz): Notification-Settings-Store + Ruhezeiten/Briefing-Logik (pure, getestet)"
```

---

### Task 7: Notify-Service (Gating + OS-Notification)

**Files:**
- Create: `src/services/notify.service.ts`
- Create: `src/services/notify.service.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-notification` (Task 5), `isQuietTime` + `useNotificationSettingsStore` (Task 6).
- Produces: `notify(kind: NotifyKind, title: string, body: string): Promise<void>`, `shouldNotify(kind, now, settings): boolean`, Typ `NotifyKind = 'briefing' | 'money' | 'team'`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/services/notify.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldNotify } from './notify.service'

const BASE = {
  briefingEnabled: true, briefingTime: '08:30',
  moneyEventsEnabled: true, teamEventsEnabled: true,
  quietHoursEnabled: true, quietFrom: '18:00', quietUntil: '07:00', weekendQuiet: true,
}
const wed10 = new Date(2026, 6, 1, 10) // Mittwoch 10:00
const wed19 = new Date(2026, 6, 1, 19) // Mittwoch 19:00 (Ruhezeit)

describe('shouldNotify', () => {
  it('respektiert die Kind-Schalter', () => {
    expect(shouldNotify('money', wed10, { ...BASE, moneyEventsEnabled: false })).toBe(false)
    expect(shouldNotify('team', wed10, { ...BASE, teamEventsEnabled: false })).toBe(false)
    expect(shouldNotify('briefing', wed10, { ...BASE, briefingEnabled: false })).toBe(false)
  })
  it('money/team schweigen in der Ruhezeit, briefing prueft Ruhezeit separat', () => {
    expect(shouldNotify('money', wed19, BASE)).toBe(false)
    expect(shouldNotify('team', wed19, BASE)).toBe(false)
    expect(shouldNotify('money', wed10, BASE)).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/services/notify.service.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementieren**

`src/services/notify.service.ts`:

```ts
import { isQuietTime, type BriefingConfig } from '@/lib/notifications/quiet-hours'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'
import { log } from '@/lib/logger'

export type NotifyKind = 'briefing' | 'money' | 'team'

type GateSettings = BriefingConfig & { moneyEventsEnabled: boolean; teamEventsEnabled: boolean }

/**
 * Pure Gating-Regel: Kind-Schalter + Ruhezeiten. Das Briefing prüft die
 * Ruhezeit bereits in shouldFireBriefing — hier nur money/team.
 */
export function shouldNotify(kind: NotifyKind, now: Date, s: GateSettings): boolean {
  if (kind === 'briefing' && !s.briefingEnabled) return false
  if (kind === 'money' && !s.moneyEventsEnabled) return false
  if (kind === 'team' && !s.teamEventsEnabled) return false
  if (kind !== 'briefing' && isQuietTime(now, s)) return false
  return true
}

/**
 * Sendet eine System-Notification, wenn die Regeln es erlauben.
 * Wirft nie — eine gescheiterte Notification darf keinen Flow brechen.
 */
export async function notify(kind: NotifyKind, title: string, body: string): Promise<void> {
  try {
    const s = useNotificationSettingsStore.getState()
    if (!shouldNotify(kind, new Date(), s)) return
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import('@tauri-apps/plugin-notification')
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
    if (!granted) return
    sendNotification({ title, body })
  } catch (err) {
    log.warn('notify failed', { kind, err })
  }
}
```

(Der Plugin-Import ist dynamisch, damit Vitest/jsdom das Tauri-Plugin nie laden muss — `shouldNotify` bleibt pur testbar.)

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/services/notify.service.test.ts && npm run typecheck`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/notify.service.ts src/services/notify.service.test.ts
git commit -m "feat(praesenz): Notify-Service mit Kind-Schaltern + Ruhezeiten-Gating"
```

---

### Task 8: Morgen-Briefing (Text-Baustein + Scheduler)

Die bestehende `koraLine`-Logik aus `DashboardRoute` wird in eine pure Funktion extrahiert (DRY: Dashboard UND Notification nutzen denselben Satzbau) und ein Scheduler feuert sie werktags zur eingestellten Zeit als System-Notification. **Leerer Tag → keine Notification** (Spec §7).

**Files:**
- Create: `src/lib/notifications/briefing.ts`
- Create: `src/lib/notifications/briefing.test.ts`
- Modify: `src/routes/DashboardRoute.tsx` (koraLine nutzt `buildTodayLine`)
- Create: `src/hooks/useBriefingScheduler.ts`
- Modify: `src/App.tsx` (Hook mounten)

**Interfaces:**
- Consumes: `shouldFireBriefing`, `useNotificationSettingsStore` (Task 6), `notify` (Task 7).
- Produces: `buildTodayLine(c: TodayCounts): string` (leerer String bei leerem Tag), `interface TodayCounts { overdueCount, overdueSum, fusDue, tasksDue, eventsToday }`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/lib/notifications/briefing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTodayLine } from './briefing'

describe('buildTodayLine', () => {
  it('baut den Satz mit deutschen Pluralformen und Und-Verknuepfung', () => {
    expect(buildTodayLine({ overdueCount: 2, overdueSum: 2400, fusDue: 1, tasksDue: 0, eventsToday: 1 }))
      .toBe('Heute stehen an: 2 Rechnungen (2.400 €), 1 Follow-up und 1 Termin.')
  })
  it('Singular korrekt', () => {
    expect(buildTodayLine({ overdueCount: 1, overdueSum: 500, fusDue: 0, tasksDue: 1, eventsToday: 0 }))
      .toBe('Heute stehen an: 1 Rechnung (500 €) und 1 To-do.')
  })
  it('leerer Tag → leerer String (Stille ist die Belohnung)', () => {
    expect(buildTodayLine({ overdueCount: 0, overdueSum: 0, fusDue: 0, tasksDue: 0, eventsToday: 0 })).toBe('')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/lib/notifications/briefing.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementieren**

`src/lib/notifications/briefing.ts`:

```ts
/**
 * Der eine Tages-Satz („Heute stehen an: …") — regelbasierter Satz-Baukasten,
 * genutzt vom Dashboard (koraLine) UND vom Morgen-Briefing. Kein KI-Call.
 */
export interface TodayCounts {
  overdueCount: number
  overdueSum: number
  fusDue: number
  tasksDue: number
  eventsToday: number
}

function eur0(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function joinDe(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`
}

/** Leerer Tag → leerer String; Aufrufer entscheidet über den Fallback-Text. */
export function buildTodayLine(c: TodayCounts): string {
  const parts: string[] = []
  if (c.overdueCount) parts.push(`${c.overdueCount} ${c.overdueCount === 1 ? 'Rechnung' : 'Rechnungen'} (${eur0(c.overdueSum)})`)
  if (c.fusDue) parts.push(`${c.fusDue} Follow-up${c.fusDue === 1 ? '' : 's'}`)
  if (c.tasksDue) parts.push(`${c.tasksDue} To-do${c.tasksDue === 1 ? '' : 's'}`)
  if (c.eventsToday) parts.push(`${c.eventsToday} Termin${c.eventsToday === 1 ? '' : 'e'}`)
  return parts.length ? `Heute stehen an: ${joinDe(parts)}.` : ''
}
```

- [ ] **Step 4: DashboardRoute auf `buildTodayLine` umstellen**

`src/routes/DashboardRoute.tsx`: Import ergänzen `import { buildTodayLine } from '@/lib/notifications/briefing'`. Das `koraLine`-useMemo (Zeile ~326–333) ersetzen durch:

```tsx
  const koraLine = useMemo(() =>
    buildTodayLine({
      overdueCount: overdueInvoices.length,
      overdueSum: geldUnterwegs,
      fusDue: dueToday.fus,
      tasksDue: dueToday.tasks,
      eventsToday: events.length,
    }) || 'Heute steht nichts Dringendes an — ein guter Tag für Fokusarbeit.',
  [overdueInvoices, geldUnterwegs, dueToday.fus, dueToday.tasks, events.length])
```

Die dadurch ungenutzten lokalen Helfer `eur0`/`joinDe` in `DashboardRoute.tsx` entfernen, falls sie sonst nirgends in der Datei verwendet werden (`npm run typecheck` bzw. eslint-no-unused zeigt es).

- [ ] **Step 5: Scheduler-Hook**

`src/hooks/useBriefingScheduler.ts`:

```ts
import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useCrmStore } from '@/store/crm.store'
import { useTodosStore } from '@/store/todos.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'
import { shouldFireBriefing } from '@/lib/notifications/quiet-hours'
import { buildTodayLine } from '@/lib/notifications/briefing'
import { notify } from '@/services/notify.service'

const TICK_MS = 60_000

function todayLocalIso(): string {
  return new Date().toLocaleDateString('sv')
}

/**
 * Morgen-Briefing: prüft jede Minute, ob werktags die Briefing-Zeit erreicht ist,
 * und sendet den Tages-Satz als System-Notification — genau einmal pro Tag.
 * Leerer Tag → keine Notification (Stille ist die Belohnung), zählt aber als gefeuert.
 */
export function useBriefingScheduler() {
  useEffect(() => {
    const tick = () => {
      const s = useNotificationSettingsStore.getState()
      const now = new Date()
      const todayIso = todayLocalIso()
      if (!shouldFireBriefing(now, s, s.lastBriefingDate, todayIso)) return

      const invoices = useFinanceStore.getState().invoices
      const overdue = invoices.filter(i =>
        i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft'
        && (i.status === 'overdue' || i.dueDate.slice(0, 10) < todayIso))
      const followUps = useCrmStore.getState().allFollowUps
      const fusDue = followUps.filter(f => f.status === 'offen' && f.dueDate.slice(0, 10) <= todayIso).length
      const tasksDue = useTodosStore.getState().allTodos
        .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length
      const eventsToday = useCalendarStore.getState().todayEvents.length

      const line = buildTodayLine({
        overdueCount: overdue.length,
        overdueSum: overdue.reduce((sum, i) => sum + i.total, 0),
        fusDue, tasksDue, eventsToday,
      })

      // Erst als gefeuert markieren, dann senden — verhindert Doppel-Feuern bei langsamem notify.
      s.markBriefingFired(todayIso)
      if (line) void notify('briefing', 'Guten Morgen', line)
    }

    tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [])
}
```

- [ ] **Step 6: In App mounten**

`src/App.tsx`: Import `import { useBriefingScheduler } from '@/hooks/useBriefingScheduler'`. Nach `useOnboardingSync()` (Zeile ~221):

```tsx
  useBriefingScheduler()
```

- [ ] **Step 7: Tests + Typecheck**

Run: `npx vitest run src/lib/notifications/briefing.test.ts && npm run typecheck`
Expected: PASS, tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/notifications/briefing.ts src/lib/notifications/briefing.test.ts src/routes/DashboardRoute.tsx src/hooks/useBriefingScheduler.ts src/App.tsx
git commit -m "feat(praesenz): Morgen-Briefing als System-Notification, Satzbau geteilt mit Dashboard-koraLine"
```

---

### Task 9: Geld-Events (überfällig geworden + Zahlung eingegangen)

**Files:**
- Create: `src/lib/notifications/money-events.ts`
- Create: `src/lib/notifications/money-events.test.ts`
- Create: `src/hooks/useMoneyEvents.ts`
- Modify: `src/App.tsx` (Hook mounten)
- Modify: `src/store/finance.store.ts` (`addPayment`: Bezahlt-Notification)

**Interfaces:**
- Consumes: `notify` (Task 7), `useNotificationSettingsStore.notifiedOverdueIds`/`markOverdueNotified` (Task 6).
- Produces: `newlyOverdueInvoices(invoices: Invoice[], alreadyNotified: string[], todayIso: string): Invoice[]`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/lib/notifications/money-events.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { newlyOverdueInvoices } from './money-events'
import type { Invoice } from '@/types/finance.types'

const inv = (id: string, status: string, dueDate: string): Invoice =>
  ({ id, status, dueDate, total: 100, accountId: 'a', number: id } as never)

describe('newlyOverdueInvoices', () => {
  const today = '2026-07-02'
  it('findet ueberfaellige offene Rechnungen, die noch nicht gemeldet wurden', () => {
    const result = newlyOverdueInvoices(
      [inv('a', 'open', '2026-07-01'), inv('b', 'open', '2026-07-05')], [], today)
    expect(result.map(i => i.id)).toEqual(['a'])
  })
  it('ignoriert bereits gemeldete, bezahlte, stornierte und Entwuerfe', () => {
    const result = newlyOverdueInvoices([
      inv('a', 'open', '2026-07-01'),
      inv('b', 'paid', '2026-07-01'),
      inv('c', 'cancelled', '2026-07-01'),
      inv('d', 'draft', '2026-07-01'),
    ], ['a'], today)
    expect(result).toEqual([])
  })
  it('faellig heute ist noch nicht ueberfaellig', () => {
    expect(newlyOverdueInvoices([inv('a', 'open', today)], [], today)).toEqual([])
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/lib/notifications/money-events.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Pure Funktion implementieren**

`src/lib/notifications/money-events.ts`:

```ts
import type { Invoice } from '@/types/finance.types'

/**
 * Rechnungen, die überfällig sind und noch nie gemeldet wurden.
 * Je Rechnung genau EINE Meldung (Spec §7: „je Ereignis genau einmal").
 */
export function newlyOverdueInvoices(
  invoices: Invoice[], alreadyNotified: string[], todayIso: string,
): Invoice[] {
  const seen = new Set(alreadyNotified)
  return invoices.filter(i =>
    !seen.has(i.id)
    && i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft'
    && !!i.dueDate && i.dueDate.slice(0, 10) < todayIso,
  )
}
```

- [ ] **Step 4: Hook für Überfällig-Events**

`src/hooks/useMoneyEvents.ts`:

```ts
import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'
import { newlyOverdueInvoices } from '@/lib/notifications/money-events'
import { notify } from '@/services/notify.service'

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

/**
 * Meldet Rechnungen, die überfällig geworden sind — je Rechnung genau einmal.
 * Mehr als 3 auf einmal werden gebündelt (kein Notification-Spam nach Urlaub).
 */
export function useMoneyEvents() {
  const invoices = useFinanceStore(s => s.invoices)

  useEffect(() => {
    if (invoices.length === 0) return
    const s = useNotificationSettingsStore.getState()
    const todayIso = new Date().toLocaleDateString('sv')
    const fresh = newlyOverdueInvoices(invoices, s.notifiedOverdueIds, todayIso)
    if (fresh.length === 0) return

    // Erst markieren, dann senden — verhindert Doppel-Meldungen bei Re-Renders.
    s.markOverdueNotified(fresh.map(i => i.id))

    if (fresh.length <= 3) {
      for (const inv of fresh) {
        void notify('money',
          `Rechnung ${inv.number ?? ''} ist überfällig`,
          `${eur(inv.total)} offen. Die Zahlungserinnerung liegt im Mahnwesen bereit.`)
      }
    } else {
      const sum = fresh.reduce((acc, i) => acc + i.total, 0)
      void notify('money',
        `${fresh.length} Rechnungen sind überfällig`,
        `Insgesamt ${eur(sum)} offen. Details im Mahnwesen.`)
    }
  }, [invoices])
}
```

`src/App.tsx`: Import + Mount direkt unter `useBriefingScheduler()`:

```tsx
  useMoneyEvents()
```

- [ ] **Step 5: Zahlung-eingegangen-Event in `addPayment`**

`src/store/finance.store.ts`, die `addPayment`-Aktion (Zeile ~217) ersetzen:

```ts
  addPayment: (payload) => withErrorToast('Zahlung konnte nicht gespeichert werden.', async () => {
    const prevStatus = get().invoices.find(i => i.id === payload.invoiceId)?.status
    await FinanceGateway.addPayment(payload)
    // Rechnungen + Zahlungen neu laden — Status kann auf "bezahlt" kippen.
    const [invoices, payments] = await Promise.all([
      FinanceGateway.getInvoices(payload.workspaceId),
      FinanceGateway.getPaymentsByWorkspace(payload.workspaceId),
    ])
    set({ invoices, payments })
    // Geld-Event: Rechnung ist durch diese Zahlung vollständig bezahlt worden.
    const inv = invoices.find(i => i.id === payload.invoiceId)
    if (inv && inv.status === 'paid' && prevStatus !== 'paid') {
      const { notify } = await import('@/services/notify.service')
      void notify('money', 'Zahlung eingegangen ✓',
        `Rechnung ${inv.number ?? ''} ist vollständig bezahlt.`)
    }
  }),
```

(Falls `CreatePaymentPayload` das Feld anders nennt als `invoiceId` — `npm run typecheck` zeigt es —, den dortigen Feldnamen verwenden.)

- [ ] **Step 6: Tests + Typecheck**

Run: `npx vitest run src/lib/notifications/money-events.test.ts src/store/finance.store.test.ts && npm run typecheck`
Expected: PASS (Bestandstests von finance.store dürfen nicht brechen), tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notifications/money-events.ts src/lib/notifications/money-events.test.ts src/hooks/useMoneyEvents.ts src/App.tsx src/store/finance.store.ts
git commit -m "feat(praesenz): Geld-Events — Rechnung ueberfaellig (einmalig) + Zahlung eingegangen"
```

---

### Task 10: Team-Events als OS-Notification

**Files:**
- Modify: `src/store/notifications.store.ts` (`upsertRealtime`)
- Modify: `src/store/notifications.store.test.ts` (neuer Fall)

**Interfaces:**
- Consumes: `notify` (Task 7), `Notification.type` aus `@/types/notification.types`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/store/notifications.store.test.ts` ergänzen (Mock-Stil der Datei beachten):

```ts
vi.mock('@/services/notify.service', () => ({ notify: vi.fn() }))

describe('upsertRealtime → OS-Notification', () => {
  it('meldet ungelesene Team-Events an den Notify-Service', async () => {
    const { notify } = await import('@/services/notify.service')
    const { useNotificationsStore } = await import('./notifications.store')
    useNotificationsStore.getState().upsertRealtime({
      id: 'n1', workspaceId: 'ws', userId: 'u1', type: 'mention', actorId: 'u2',
      refType: 'task', refId: 't1', messageId: null, conversationId: null,
      readAt: null, createdAt: '2026-07-02T10:00:00Z',
    } as never)
    await Promise.resolve() // dynamischer Import auflösen
    await Promise.resolve()
    expect(vi.mocked(notify)).toHaveBeenCalledWith('team', 'Du wurdest erwähnt', 'In Cultera OS ansehen.')
  })

  it('meldet bereits gelesene Events NICHT', async () => {
    const { notify } = await import('@/services/notify.service')
    vi.mocked(notify).mockClear()
    const { useNotificationsStore } = await import('./notifications.store')
    useNotificationsStore.getState().upsertRealtime({
      id: 'n2', workspaceId: 'ws', userId: 'u1', type: 'dm', actorId: 'u2',
      refType: 'task', refId: 't1', messageId: null, conversationId: null,
      readAt: '2026-07-02T10:00:00Z', createdAt: '2026-07-02T10:00:00Z',
    } as never)
    await Promise.resolve()
    await Promise.resolve()
    expect(vi.mocked(notify)).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/store/notifications.store.test.ts`
Expected: neue Fälle FAIL (notify wird nie aufgerufen).

- [ ] **Step 3: `upsertRealtime` erweitern**

`src/store/notifications.store.ts`, `upsertRealtime` ersetzen:

```ts
  upsertRealtime: (n) => {
    set(s => {
      const without = s.notifications.filter(x => x.id !== n.id)
      return { notifications: [n, ...without] }
    })
    // Team-Event → OS: die In-App-Glocke reicht nur, wenn man hinschaut.
    if (!n.readAt) {
      const TITLES: Record<string, string> = {
        assigned:  'Neue Aufgabe für dich',
        mention:   'Du wurdest erwähnt',
        comment:   'Neuer Kommentar',
        completed: 'Aufgabe erledigt',
        dm:        'Neue Nachricht',
      }
      void import('@/services/notify.service').then(({ notify }) =>
        notify('team', TITLES[n.type] ?? 'Team-Benachrichtigung', 'In Cultera OS ansehen.'),
      ).catch(() => { /* Notification ist optional, Store-Update nicht */ })
    }
  },
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/store/notifications.store.test.ts && npm run typecheck`
Expected: PASS (alle, inkl. Bestandsfälle), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/notifications.store.ts src/store/notifications.store.test.ts
git commit -m "feat(praesenz): Team-Events (Zuweisung/Mention/DM) als System-Notification"
```

---

### Task 11: Einstellungen-Seite „Benachrichtigungen" + Autostart-Schalter

**Files:**
- Modify: `src/store/ui.store.ts` (`SettingsTab` um `'benachrichtigungen'` erweitern, Zeile 74)
- Modify: `src/components/settings/SettingsSidebar.tsx` (Eintrag in Gruppe „Konto")
- Modify: `src/routes/SettingsRoute.tsx` (VALID_TABS + Render-Case)
- Create: `src/components/settings/BenachrichtigungenSettings.tsx`
- Create: `src/components/settings/BenachrichtigungenSettings.test.tsx`

**Interfaces:**
- Consumes: `useNotificationSettingsStore` (Task 6), `@tauri-apps/plugin-autostart` (Task 5), Command `cmd_set_close_to_tray` (Task 5), Kit `SettingsPage`/`SettingCard` aus `src/components/settings/ui`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/components/settings/BenachrichtigungenSettings.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BenachrichtigungenSettings } from './BenachrichtigungenSettings'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/plugin-autostart', () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
}))

describe('BenachrichtigungenSettings', () => {
  beforeEach(() => {
    useNotificationSettingsStore.setState({
      briefingEnabled: true, briefingTime: '08:30', moneyEventsEnabled: true,
      teamEventsEnabled: true, quietHoursEnabled: true, quietFrom: '18:00',
      quietUntil: '07:00', weekendQuiet: true, closeToTray: true,
    })
  })

  it('zeigt die Kernschalter', () => {
    render(<BenachrichtigungenSettings />)
    expect(screen.getByLabelText('Morgen-Briefing')).toBeChecked()
    expect(screen.getByLabelText('Geld-Ereignisse')).toBeChecked()
    expect(screen.getByLabelText('Team-Ereignisse')).toBeChecked()
  })

  it('Briefing-Schalter schreibt in den Store', () => {
    render(<BenachrichtigungenSettings />)
    fireEvent.click(screen.getByLabelText('Morgen-Briefing'))
    expect(useNotificationSettingsStore.getState().briefingEnabled).toBe(false)
  })

  it('Briefing-Zeit ist editierbar', () => {
    render(<BenachrichtigungenSettings />)
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '07:45' } })
    expect(useNotificationSettingsStore.getState().briefingTime).toBe('07:45')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/components/settings/BenachrichtigungenSettings.test.tsx`
Expected: FAIL (Komponente existiert nicht).

- [ ] **Step 3: Komponente implementieren**

`src/components/settings/BenachrichtigungenSettings.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { SettingsPage, SettingCard } from './ui'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'

function ToggleRow({ id, label, hint, checked, onChange }: {
  id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
      <input
        id={id} type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1 }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</label>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{hint}</div>
      </div>
    </div>
  )
}

function TimeRow({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, width: 120 }}>{label}</label>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingCard>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>{title}</h3>
      {children}
    </SettingCard>
  )
}

export function BenachrichtigungenSettings() {
  const s = useNotificationSettingsStore()
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    void import('@tauri-apps/plugin-autostart')
      .then(m => m.isEnabled())
      .then(setAutostart)
      .catch(() => setAutostart(null))
  }, [])

  const toggleAutostart = async (on: boolean) => {
    setAutostart(on)
    try {
      const m = await import('@tauri-apps/plugin-autostart')
      if (on) await m.enable(); else await m.disable()
    } catch {
      setAutostart(!on)
    }
  }

  const toggleCloseToTray = (on: boolean) => {
    s.set({ closeToTray: on })
    void invoke('cmd_set_close_to_tray', { enabled: on }).catch(() => {})
  }

  return (
    <SettingsPage
      title="Benachrichtigungen"
      subtitle="Ruhig aber präsent — was sich melden darf und wann Ruhe ist"
      maxWidth={640}
    >
      <Section title="Morgen-Briefing">
        <ToggleRow id="briefing" label="Morgen-Briefing" checked={s.briefingEnabled}
          hint="Werktags eine Benachrichtigung mit dem Tagesüberblick. An leeren Tagen bleibt die App stumm."
          onChange={(v) => s.set({ briefingEnabled: v })} />
        <TimeRow id="briefing-time" label="Uhrzeit" value={s.briefingTime}
          onChange={(v) => s.set({ briefingTime: v })} />
      </Section>

      <Section title="Ereignisse">
        <ToggleRow id="money" label="Geld-Ereignisse" checked={s.moneyEventsEnabled}
          hint="Rechnung überfällig geworden, Zahlung vollständig eingegangen — je Ereignis genau einmal."
          onChange={(v) => s.set({ moneyEventsEnabled: v })} />
        <ToggleRow id="team" label="Team-Ereignisse" checked={s.teamEventsEnabled}
          hint="Zuweisungen, Erwähnungen und Direktnachrichten aus deinem Team."
          onChange={(v) => s.set({ teamEventsEnabled: v })} />
      </Section>

      <Section title="Ruhezeiten">
        <ToggleRow id="quiet" label="Ruhezeiten aktiv" checked={s.quietHoursEnabled}
          hint="In der Ruhezeit sendet Cultera OS keine Benachrichtigungen."
          onChange={(v) => s.set({ quietHoursEnabled: v })} />
        <TimeRow id="quiet-from" label="Ruhe ab" value={s.quietFrom} onChange={(v) => s.set({ quietFrom: v })} />
        <TimeRow id="quiet-until" label="Ruhe bis" value={s.quietUntil} onChange={(v) => s.set({ quietUntil: v })} />
        <ToggleRow id="weekend" label="Wochenende stumm" checked={s.weekendQuiet}
          hint="Samstag und Sonntag keine Benachrichtigungen — auch kein Briefing."
          onChange={(v) => s.set({ weekendQuiet: v })} />
      </Section>

      <Section title="Hintergrund">
        <ToggleRow id="tray" label="Beim Schließen im Hintergrund weiterlaufen" checked={s.closeToTray}
          hint="Cultera OS bleibt im Tray aktiv, damit Briefing und Ereignisse dich erreichen. Beenden jederzeit über das Tray-Menü."
          onChange={toggleCloseToTray} />
        <ToggleRow id="autostart" label="Mit Windows starten" checked={autostart === true}
          hint={autostart === null ? 'Status wird geladen …' : 'Startet Cultera OS beim Anmelden minimiert im Hintergrund.'}
          onChange={toggleAutostart} />
      </Section>
    </SettingsPage>
  )
}
```

- [ ] **Step 4: Tab verdrahten**

`src/store/ui.store.ts` Zeile 74: `'benachrichtigungen'` zur `SettingsTab`-Union hinzufügen.

`src/components/settings/SettingsSidebar.tsx`: `BellRing` zum lucide-Import hinzufügen; in der Gruppe „Konto" nach `aussehen`:

```ts
    { key: 'benachrichtigungen', label: 'Benachrichtigungen', icon: BellRing },
```

`src/routes/SettingsRoute.tsx`: Import `import { BenachrichtigungenSettings } from '@/components/settings/BenachrichtigungenSettings'`; `'benachrichtigungen'` in `VALID_TABS` aufnehmen; im `switch`:

```tsx
      case 'benachrichtigungen': return <BenachrichtigungenSettings />
```

- [ ] **Step 5: Tests + Typecheck**

Run: `npx vitest run src/components/settings/BenachrichtigungenSettings.test.tsx && npm run typecheck`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/store/ui.store.ts src/components/settings/SettingsSidebar.tsx src/routes/SettingsRoute.tsx src/components/settings/BenachrichtigungenSettings.tsx src/components/settings/BenachrichtigungenSettings.test.tsx
git commit -m "feat(praesenz): Einstellungen 'Benachrichtigungen' — Briefing, Ereignisse, Ruhezeiten, Autostart, Tray"
```

---

### Task 12: Tray-Status (Tooltip-Zähler) + Start-Verdrahtung + Abschluss

**Files:**
- Modify: `src-tauri/src/main.rs` (Command `cmd_update_tray_status`)
- Create: `src/hooks/usePresenceBridge.ts`
- Modify: `src/App.tsx` (Hook mounten)

**Interfaces:**
- Consumes: Tray `"main-tray"` + `cmd_set_close_to_tray` (Task 5), Zähler-Quellen wie NavSidebar (`useFinanceStore`, `useTodosStore`, `useMailStore`).
- Produces: Rust-Command `cmd_update_tray_status(open_count: u32)`.

- [ ] **Step 1: Rust-Command**

`src-tauri/src/main.rs`, unter `cmd_set_close_to_tray` einfügen:

```rust
#[tauri::command]
fn cmd_update_tray_status(app: tauri::AppHandle, open_count: u32) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let tip = if open_count > 0 {
            format!("Cultera OS — {open_count} offene Punkte")
        } else {
            "Cultera OS — alles erledigt".to_string()
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}
```

Im `invoke_handler` nach `cmd_set_close_to_tray,` registrieren:

```rust
            cmd_update_tray_status,
```

Run: `cd src-tauri && cargo check`
Expected: clean.

- [ ] **Step 2: Presence-Bridge-Hook**

`src/hooks/usePresenceBridge.ts`:

```ts
import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'

/**
 * Verbindet Frontend-Zustand mit der Rust-Präsenz-Schicht:
 * 1. wendet die persistierte Close-to-Tray-Einstellung beim Start an,
 * 2. hält den Tray-Tooltip auf dem Stand der offenen Punkte
 *    (gleiche Zählung wie das KORA-Badge in der NavSidebar).
 */
export function usePresenceBridge() {
  const closeToTray = useNotificationSettingsStore(s => s.closeToTray)

  const overdueCount = useFinanceStore(s =>
    s.invoices.filter(i => {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
      return i.status === 'overdue' || new Date(i.dueDate) < new Date()
    }).length)
  const todayTodos = useTodosStore(s =>
    s.allTodos.filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length)
  const unreadMails = useMailStore(s => s.emails.filter(e => !e.isRead).length)

  useEffect(() => {
    void invoke('cmd_set_close_to_tray', { enabled: closeToTray }).catch(() => {})
  }, [closeToTray])

  useEffect(() => {
    const openCount = overdueCount + todayTodos + unreadMails
    void invoke('cmd_update_tray_status', { openCount }).catch(() => {})
  }, [overdueCount, todayTodos, unreadMails])
}
```

`src/App.tsx`: Import + Mount unter `useMoneyEvents()`:

```tsx
  usePresenceBridge()
```

- [ ] **Step 3: Gesamtverifikation**

Run: `npx vitest run` → Expected: alle Tests PASS (Bestand ~514 + neue).
Run: `npm run typecheck` → Expected: clean.
Run: `cd src-tauri && cargo test && cargo check` → Expected: PASS/clean.

- [ ] **Step 4: Manueller Smoke-Test (Präsenz Ende-zu-Ende)**

Run: `npm run tauri dev`
1. Einstellungen → Benachrichtigungen: Briefing-Zeit auf „in 2 Minuten" stellen, App-Fenster schließen (App bleibt im Tray) → Briefing-Notification erscheint zur eingestellten Zeit (sofern heute etwas ansteht und keine Ruhezeit greift; ggf. Ruhezeiten-Schalter kurz deaktivieren).
2. Rechnung mit gestrigem Fälligkeitsdatum anlegen und auf „offen" stellen → „Rechnung … ist überfällig"-Notification (einmalig).
3. Zahlung in voller Höhe erfassen → „Zahlung eingegangen ✓".
4. Tray-Tooltip zeigt „Cultera OS — n offene Punkte".

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs src/hooks/usePresenceBridge.ts src/App.tsx
git commit -m "feat(praesenz): Tray-Tooltip mit offenen Punkten + Close-to-Tray-Einstellung beim Start anwenden"
```
