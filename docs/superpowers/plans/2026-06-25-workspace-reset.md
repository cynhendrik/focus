# Workspace-Reset (echte Gefahrenzone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** „Workspace zurücksetzen" leert wirklich alle Inhalte (lokal SQLite + Cloud Supabase), behält aber Setup (Firmenprofil, Einstellungen, Rechnungs-Nummernkreis); nur für Owner.

**Architecture:** Lokal: Rust-Command `cmd_reset_workspace`, das per Schema-Introspektion alle User-Tabellen außer einer Keep-Liste in einer Transaktion leert (gleiches Muster wie der vorhandene `build_backup_json`). Cloud: Supabase-RPC `reset_workspace(ws_id)` (SECURITY DEFINER, owner-checked, löscht dynamisch alle Tabellen mit `workspace_id`-Spalte außer `company_settings`). Client: `GefahrenzoneSettings.handleReset` ruft beides auf, owner-gated, mit Shared-Warnung, dann Reload.

**Tech Stack:** Rust (rusqlite, Tauri command), Postgres/Supabase (plpgsql RPC, deploy via Management-API), React/TS (Zustand `useWorkspaceStore`).

---

## Referenz (verifiziert)

- `src-tauri/src/commands/export.rs`: Commands geben `Result<_, String>` zurück; `cmd_export_backup(db: State<'_, DbPool>, …)` nutzt `db.conn()`. `build_backup_json` listet User-Tabellen per `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue'`. Tests laufen mit `rusqlite::Connection::open_in_memory()` + `crate::db::schema::create_tables(&conn)`.
- Command-Registrierung: in `src-tauri/src/main.rs` im `tauri::generate_handler![…]`-Block (z. B. `commands::invoice::update_invoice_status,` als Muster).
- Tabellen, die als **Setup** erhalten bleiben: `company_settings`, `invoice_sequences`.
- `GefahrenzoneSettings.tsx`: hat Confirm-Input („zurücksetzen"), gateter Button, `handleReset`-Stub. Import-Pattern für `invoke` vorhanden. `workspaceId` kommt als Prop rein.
- Owner-Rolle/Shared-Status: aus `useWorkspaceStore` (aktiver Workspace + Rolle). Beim Implementieren die echten Selektoren prüfen (z. B. `workspaces.find(w => w.id === activeId)?.role === 'owner'`, `isShared`).

## File Structure

- **Modify** `src-tauri/src/commands/export.rs` — `reset_workspace_local(conn)` (rein, testbar) + `cmd_reset_workspace` (Command).
- **Modify** `src-tauri/src/main.rs` — Command registrieren.
- **Create (Supabase)** Postgres-Funktion `reset_workspace(ws_id uuid)` — deploy via Management-API (kein Repo-File; SQL im Plan).
- **Modify** `src/components/settings/GefahrenzoneSettings.tsx` — echtes `handleReset` (owner-gated, shared-Warnung, lokal+Cloud, Reload).

---

## Task 1: Lokales Reset (Rust, TDD)

**Files:**
- Modify: `src-tauri/src/commands/export.rs`
- Test: (im selben File, `#[cfg(test)]`-Modul)

- [ ] **Step 1: Failing-Test schreiben**

Im `#[cfg(test)] mod tests` von `export.rs` ergänzen:

```rust
    #[test]
    fn reset_clears_data_but_keeps_setup() {
        let mut conn = sample_conn();
        // Setup-Tabellen füllen (müssen erhalten bleiben)
        conn.execute(
            "INSERT INTO company_settings (id, profile, modules, crm_config, updated_at) \
             VALUES ('ws1','{}','{}','{}','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoice_sequences (workspace_id, next_number, start_number, format, seq_year) \
             VALUES ('ws1', 5, 1, 'RE-{seq}', 2026)", []).unwrap();
        // Inhalts-Tabellen füllen (müssen weg)
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','ws1','u1','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, total, created_at, updated_at) \
             VALUES ('i1','ws1','u1','a1','2026-01-01','2026-01-15',119.0,'2026-01-01','2026-01-01')", []).unwrap();

        reset_workspace_local(&mut conn).unwrap();

        // Inhalte weg
        let accounts: i64 = conn.query_row("SELECT count(*) FROM accounts", [], |r| r.get(0)).unwrap();
        let invoices: i64 = conn.query_row("SELECT count(*) FROM invoices", [], |r| r.get(0)).unwrap();
        assert_eq!(accounts, 0);
        assert_eq!(invoices, 0);
        // Setup bleibt
        let settings: i64 = conn.query_row("SELECT count(*) FROM company_settings", [], |r| r.get(0)).unwrap();
        let seq: i64 = conn.query_row("SELECT next_number FROM invoice_sequences WHERE workspace_id='ws1'", [], |r| r.get(0)).unwrap();
        assert_eq!(settings, 1);
        assert_eq!(seq, 5);
    }
```

(Falls die Spalten von `company_settings`/`invoice_sequences` im echten Schema abweichen: kurz `crate::db::schema` ansehen und die INSERTs an die realen Spalten anpassen — die Test-Aussage bleibt: Setup-Zeilen überleben, Inhalts-Zeilen verschwinden.)

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `cd src-tauri && cargo test reset_clears_data_but_keeps_setup`
Expected: FAIL — `cannot find function reset_workspace_local`.

- [ ] **Step 3: Implementierung**

In `export.rs` (z. B. nach `build_backup_json`) ergänzen:

```rust
/// Leert alle User-Inhalts-Tabellen in einer Transaktion, behält aber das Setup
/// (Firmenprofil + Rechnungs-Nummernkreis). Schema-introspektiv wie der Backup-Export,
/// damit neue Tabellen automatisch mit-geleert werden.
pub fn reset_workspace_local(conn: &mut rusqlite::Connection) -> Result<(), String> {
    // Setup-Tabellen, die NICHT geleert werden. `sync_queue` + sqlite-internes sind eh ausgenommen.
    const KEEP: &[&str] = &["company_settings", "invoice_sequences"];

    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // FK-sicher: innerhalb der Transaktion FK-Prüfung aus, damit die Lösch-Reihenfolge egal ist.
    tx.execute_batch("PRAGMA defer_foreign_keys=ON;").map_err(|e| e.to_string())?;
    for t in &tables {
        if KEEP.contains(&t.as_str()) { continue; }
        tx.execute(&format!("DELETE FROM \"{t}\""), [])
            .map_err(|e| format!("{t}: {e}"))?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cmd_reset_workspace(db: State<'_, DbPool>) -> Result<(), String> {
    let mut conn = db.conn();
    reset_workspace_local(&mut conn)
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `cd src-tauri && cargo test reset_clears_data_but_keeps_setup`
Expected: PASS.

- [ ] **Step 5: Command registrieren**

In `src-tauri/src/main.rs` im `tauri::generate_handler![…]`-Block eine Zeile ergänzen (neben den anderen `commands::export::…`/`save_pdf`-Einträgen):

```rust
            commands::export::cmd_reset_workspace,
```

- [ ] **Step 6: Build prüfen + Commit**

Run: `cd src-tauri && cargo build`
Expected: kompiliert ohne Fehler.

```bash
git add src-tauri/src/commands/export.rs src-tauri/src/main.rs
git commit -m "feat(reset): local cmd_reset_workspace — clears content, keeps setup (TDD)"
```

---

## Task 2: Cloud-Reset (Supabase-RPC)

**Files:**
- Deploy (kein Repo-File): Postgres-Funktion `reset_workspace(ws_id uuid)` in das Supabase-Projekt (via Management-API / SQL-Editor).

> **Hinweis für den Ausführenden:** Dieser Task braucht Zugriff auf die Live-Supabase (Management-API/PAT oder SQL-Editor). Er ist NICHT über die App testbar; verifiziere manuell (Owner löscht / Nicht-Owner bekommt Exception).

- [ ] **Step 1: Mitglieder-/Rollen-Tabelle bestätigen**

Führe im Supabase-SQL-Editor aus, um die echte Membership-/Rollen-Tabelle + Spalten zu finden:

```sql
select table_name, column_name
from information_schema.columns
where table_schema='public'
  and (column_name in ('workspace_id','user_id','role'))
order by table_name, column_name;
```
Erwartet: eine Tabelle (z. B. `workspace_members`) mit `workspace_id`, `user_id`, `role`. Notiere den echten Tabellen-/Spaltennamen und die Owner-Rolle (z. B. `'owner'`).

- [ ] **Step 2: Funktion deployen**

Im SQL-Editor ausführen (passe `workspace_members` / `role = 'owner'` an die in Step 1 gefundenen Namen an, falls abweichend):

```sql
create or replace function public.reset_workspace(ws_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner boolean;
  t record;
begin
  -- 1) Owner-Check: nur der Inhaber des Workspace darf zurücksetzen
  select exists(
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid() and role = 'owner'
  ) into is_owner;
  if not coalesce(is_owner, false) then
    raise exception 'not authorized: only the workspace owner can reset this workspace';
  end if;

  -- 2) FK-Reihenfolge umgehen: innerhalb der Transaktion Replikations-Rolle setzen
  --    (deaktiviert FK-/Trigger-Prüfung für die Bulk-Deletes; gilt nur in dieser Transaktion)
  perform set_config('session_replication_role', 'replica', true);

  -- 3) Alle Tabellen mit workspace_id-Spalte leeren, außer company_settings (Setup bleibt)
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'workspace_id'
      and c.table_name <> 'company_settings'
  loop
    execute format('delete from public.%I where workspace_id = $1', t.table_name) using ws_id;
  end loop;
end;
$$;

revoke all on function public.reset_workspace(uuid) from public;
grant execute on function public.reset_workspace(uuid) to authenticated;
```

- [ ] **Step 3: Manuell verifizieren**

- Als Owner über den SQL-Editor (oder die App in Task 3) `select reset_workspace('<deine-ws-uuid>');` → Workspace-Datentabellen sind leer, `company_settings` bleibt.
- Mit einem Nicht-Owner-Token → Exception „not authorized".
- (Kein automatisierter Repo-Test für die DB-Funktion.)

- [ ] **Step 4: SQL dokumentieren**

Lege die deployte Funktion als Referenz im Repo ab (damit sie nachvollziehbar/versioniert ist): erstelle `supabase/functions-sql/reset_workspace.sql` mit dem finalen SQL aus Step 2 und committe:

```bash
git add supabase/functions-sql/reset_workspace.sql
git commit -m "feat(reset): supabase reset_workspace RPC (owner-checked, workspace-scoped)"
```

---

## Task 3: Client-Verdrahtung (GefahrenzoneSettings)

**Files:**
- Modify: `src/components/settings/GefahrenzoneSettings.tsx`

- [ ] **Step 1: Owner-Rolle + Shared-Status lesen**

Oben in der Komponente die nötigen Selektoren ergänzen (echte Namen in `src/store/workspace.store.ts` prüfen — erwartet: aktiver Workspace + `role` + `isShared`/`isActiveWorkspaceShared`):

```typescript
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
```
In der Komponente:
```typescript
  const activeId = useWorkspaceStore(s => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const isOwner = workspaces.find(w => w.id === activeId)?.role === 'owner'
```
(Falls die Rolle anders heißt/abgebildet ist, an `workspace.store` anpassen. `isActiveWorkspaceShared()` wird bereits an anderer Stelle genutzt — denselben Selektor verwenden.)

- [ ] **Step 2: `handleReset` echt implementieren**

Ersetze den `handleReset`-Stub durch:

```typescript
  const handleReset = async () => {
    if (!isOwner) {
      toast({ message: 'Nur der Inhaber dieses Workspace kann zurücksetzen.', variant: 'error' })
      return
    }
    const sharedWarn = isShared
      ? '\n\nACHTUNG: Dieser Workspace ist GETEILT — dies löscht die Daten für ALLE Mitglieder.'
      : ''
    if (!window.confirm(`Workspace wirklich zurücksetzen? Alle Inhalte werden gelöscht (Firmenprofil & Einstellungen bleiben). Unwiderruflich.${sharedWarn}`)) {
      return
    }
    setBusy('reset')
    try {
      // 1) Lokal leeren
      await invoke('cmd_reset_workspace')
      // 2) Cloud leeren (nur bei geteiltem/Cloud-Workspace)
      if (isShared && activeId) {
        const { error } = await supabase.rpc('reset_workspace', { ws_id: activeId })
        if (error) {
          toast({ message: `Lokal geleert, aber Cloud-Reset fehlgeschlagen: ${error.message}. Bitte erneut ausführen.`, variant: 'error', durationMs: 8000 })
          setBusy(null)
          return
        }
      }
      toast({ message: 'Workspace zurückgesetzt — App lädt neu…', variant: 'success', durationMs: 2000 })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast({ message: `Reset fehlgeschlagen: ${String(e)}`, variant: 'error' })
      setBusy(null)
    }
  }
```
Erweitere den `busy`-State-Typ um `'reset'`: `useState<'export' | 'import' | 'reset' | null>(null)`.

- [ ] **Step 3: Reset-Button-UI anpassen (Owner-Gate + busy)**

Im Reset-Block: den Button zusätzlich deaktivieren, wenn kein Owner oder busy; und für Nicht-Owner einen Hinweis zeigen. Konkret den `disabled` des Buttons erweitern auf `confirmText !== 'zurücksetzen' || !isOwner || busy !== null`, und unter der Beschreibung (`<p>…Nicht rückgängig…</p>`) ergänzen:
```tsx
        {!isOwner && (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 10px' }}>
            Nur der Inhaber dieses Workspace kann zurücksetzen.
          </p>
        )}
```
Den Button-`onClick` bleibt `handleReset` (jetzt async).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 5: Manuell verifizieren** (Owner, Testdaten anlegen, zurücksetzen)

Dev-App: Einstellungen → Daten & Gefahrenzone → „zurücksetzen" tippen → Button aktiv → klicken → Bestätigungs-Dialog (mit Shared-Warnung) → bestätigen → Inhalte weg, Firmenprofil/Nummernkreis bleiben, App lädt neu. Als Nicht-Owner: Hinweis + Button gesperrt.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/GefahrenzoneSettings.tsx
git commit -m "feat(reset): wire real workspace reset (owner-gated, local + cloud, shared warning)"
```

---

## Abschluss

- [ ] **Volle Verifikation**

Run: `cd src-tauri && cargo test` (Rust grün), dann im Repo-Root `npm run typecheck && npx vitest run` (sauber/grün).
Manuell: Owner legt Testdaten an → Reset → Inhalte lokal + Cloud leer, Setup intakt, App frisch.
