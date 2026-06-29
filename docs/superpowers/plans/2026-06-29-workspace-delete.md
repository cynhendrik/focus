# Workspace löschen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen Workspace vollständig löschbar machen — lokal (SQLite-Voll-Purge) und Cloud (Supabase-RPC mit Owner-Check, kaskadiert alle Daten + Mitgliedschaften + die `workspaces`-Zeile).

**Architecture:** Drei Schichten analog zum bestehenden „Zurücksetzen": Rust-Command `cmd_delete_workspace` (lokale DB), Supabase-RPC `delete_workspace(ws_id)` (Cloud, SECURITY DEFINER, schema-introspektiv), und ein Store-Helfer `deleteWorkspace(id)`, der je nach `isShared` routet. UI als rote Karte in der Gefahrenzone.

**Tech Stack:** Rust/rusqlite (Tauri), Supabase Postgres (plpgsql RPC), TypeScript/Zustand, React, Vitest.

## Global Constraints
- TDD: pro Code-Änderung zuerst der fehlschlagende Test, dann minimal grün.
- Tests müssen grün bleiben (aktuell 689) + `npx tsc --noEmit` clean.
- Owner-Check **serverseitig** in der RPC (nicht nur UI).
- Supabase: **vor dem Anwenden** Live-Schema/Policies gegen Projekt `mqbjmquscjtytpjebosw` prüfen (Management-API + PAT, der User gibt ihn pro Einsatz; danach rotieren). Additive/reversible Änderung = ok.
- Commit-Messages enden mit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Nur gezielte Pfade stagen (NIE `git add -A`; `.gitignore` + `*.OLD`-Keys sind User-WIP).

---

### Task 1: Lokaler Voll-Purge (Rust `delete_workspace_local` + `cmd_delete_workspace`)

**Files:**
- Modify: `src-tauri/src/commands/export.rs` (neue fn + Command + Test; neben `reset_workspace_local`)
- Modify: `src-tauri/src/main.rs:327` (Command registrieren, neben `cmd_reset_workspace`)

**Interfaces:**
- Produces: `pub fn delete_workspace_local(conn: &mut rusqlite::Connection) -> Result<(), String>` und `#[tauri::command] pub fn cmd_delete_workspace(db: State<'_, DbPool>) -> Result<(), String>`. Frontend ruft `invoke('cmd_delete_workspace')` (keine Argumente).

- [ ] **Step 1: Failing test** — ans Ende des `#[cfg(test)] mod tests` in `src-tauri/src/commands/export.rs` anfügen:

```rust
#[test]
fn delete_workspace_local_clears_even_kept_tables() {
    use rusqlite::Connection;
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE accounts (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT);
         CREATE TABLE company_settings (id TEXT PRIMARY KEY, name TEXT);
         CREATE TABLE app_state (k TEXT PRIMARY KEY, v TEXT);
         INSERT INTO accounts VALUES ('a1','ws1','A');
         INSERT INTO company_settings VALUES ('c1','Meine Firma');
         INSERT INTO app_state VALUES ('theme','dark');",
    ).unwrap();

    delete_workspace_local(&mut conn).unwrap();

    let accounts: i64 = conn.query_row("SELECT count(*) FROM accounts", [], |r| r.get(0)).unwrap();
    let company:  i64 = conn.query_row("SELECT count(*) FROM company_settings", [], |r| r.get(0)).unwrap();
    let appstate: i64 = conn.query_row("SELECT count(*) FROM app_state", [], |r| r.get(0)).unwrap();
    assert_eq!(accounts, 0);
    assert_eq!(company, 0);   // anders als reset_workspace_local: company_settings wird MIT geleert
    assert_eq!(appstate, 1);  // App-Shell-State bleibt
}
```

- [ ] **Step 2: Test schlägt fehl (fn fehlt)**

Run: `cd src-tauri && cargo test delete_workspace_local_clears_even_kept_tables`
Expected: Compile-Fehler „cannot find function `delete_workspace_local`".

- [ ] **Step 3: Implementierung** — direkt nach `reset_workspace_local` in `export.rs` einfügen:

```rust
/// Wie reset_workspace_local, aber für DELETE: leert ALLE Inhalts-Tabellen inkl.
/// Firmenprofil/Nummernkreise. Nur der App-Shell-State (app_state) bleibt erhalten.
pub fn delete_workspace_local(conn: &mut rusqlite::Connection) -> Result<(), String> {
    const KEEP: &[&str] = &["app_state"];

    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;
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
pub fn cmd_delete_workspace(db: State<'_, DbPool>) -> Result<(), String> {
    let mut conn = db.conn();
    delete_workspace_local(&mut conn)
}
```

- [ ] **Step 4: Test grün**

Run: `cd src-tauri && cargo test delete_workspace_local_clears_even_kept_tables`
Expected: PASS.

- [ ] **Step 5: Command registrieren** — in `src-tauri/src/main.rs` direkt nach Zeile `commands::export::cmd_reset_workspace,` ergänzen:

```rust
            commands::export::cmd_delete_workspace,
```

- [ ] **Step 6: Rust baut**

Run: `cd src-tauri && cargo check`
Expected: erfolgreich (keine Fehler).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/export.rs src-tauri/src/main.rs
git commit -m "feat(workspace): lokaler Voll-Purge cmd_delete_workspace

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Supabase-RPC `delete_workspace(ws_id)` (Cloud-Cascade, Owner-only)

**Files:**
- Create: `supabase/functions-sql/delete_workspace.sql` (zur Nachverfolgung im Repo; angewendet wird per Management-API)

**Interfaces:**
- Produces: Postgres-Funktion `public.delete_workspace(ws_id <typ>)`, aufrufbar via `supabase.rpc('delete_workspace', { ws_id })`. Wirft Exception, wenn Caller nicht Owner. Param-Typ = Typ von `workspaces.id` (in Step 1 verifizieren).

- [ ] **Step 1: Live-Schema prüfen** (User gibt PAT). Per Management-API `POST /v1/projects/mqbjmquscjtytpjebosw/database/query` folgende Queries absetzen und Ergebnisse festhalten:

```sql
-- a) Typ der Workspace-ID + des Members-User-Felds (für Param-Typ & auth.uid()-Vergleich)
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and ((table_name='workspaces' and column_name='id')
    or (table_name='workspace_members' and column_name in ('workspace_id','user_id','role')));

-- b) Alle Tabellen mit workspace_id-Spalte (= die zu leerenden)
select table_name from information_schema.columns
where table_schema='public' and column_name='workspace_id' order by table_name;

-- c) Existiert reset_workspace schon? (Muster/Vergleich)
select proname from pg_proc where proname in ('reset_workspace','delete_workspace');
```

Erwartung: `workspaces.id` und `workspace_members.user_id` Typ notiert (oft `uuid`, ggf. `text`). Liste der `workspace_id`-Tabellen liegt vor.

- [ ] **Step 2: Funktions-SQL schreiben** nach `supabase/functions-sql/delete_workspace.sql`. **Falls `user_id`/`id` = `text`** statt `uuid`: `ws_id text` und `auth.uid()::text` verwenden; bei `uuid` die uuid-Variante. Schema-introspektive Variante (kein hartcodiertes Tabellen-Listing → driftfest):

```sql
-- Owner löscht seinen Workspace komplett (alle workspace_id-Tabellen + Mitglieder + Zeile).
-- SECURITY DEFINER, aber strikt auf ws_id des Owners begrenzt.
create or replace function public.delete_workspace(ws_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if not exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Nur der Inhaber kann diesen Workspace löschen';
  end if;

  -- Alle Tabellen mit einer workspace_id-Spalte (außer workspaces selbst) leeren.
  -- workspace_members + company_settings haben workspace_id → hier mit erfasst.
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'workspace_id'
      and c.table_name <> 'workspaces'
  loop
    execute format('delete from public.%I where workspace_id = $1', t.table_name) using ws_id;
  end loop;

  delete from public.workspaces where id = ws_id;
end;
$$;

revoke all on function public.delete_workspace(uuid) from public;
grant execute on function public.delete_workspace(uuid) to authenticated;
```

- [ ] **Step 3: Anwenden** per Management-API (`{"query": "<inhalt der .sql>"}` POSTen). Bei Typ `text`: Signatur/`grant` entsprechend (`delete_workspace(text)`).

Expected: `success`. Danach prüfen: `select proname, pg_get_functiondef(oid) from pg_proc where proname='delete_workspace';`

- [ ] **Step 4: Adversarisch live testen.** Mit zwei Test-Usern bzw. via SQL (auth.uid() simulieren ist schwer — daher echter 2-User-Test in der App in Task 4, ODER serverseitig mit gesetztem `request.jwt.claims`). Minimal jetzt: Wegwerf-Workspace als Owner anlegen, Daten reinlegen, RPC aufrufen → alle Zeilen weg, `workspaces`-Zeile weg. Als Nicht-Mitglied → Exception, 0 gelöscht. Ergebnis festhalten.

- [ ] **Step 5: Commit** (nur die SQL-Datei zur Nachverfolgung):

```bash
git add supabase/functions-sql/delete_workspace.sql
git commit -m "feat(workspace): delete_workspace RPC (owner-only cascade)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: PAT-Hinweis** — User erinnern, den verwendeten PAT zu rotieren.

---

### Task 3: Store-Helfer `deleteWorkspace(id)`

**Files:**
- Modify: `src/store/workspace.store.ts` (Interface + Implementierung; `invoke`-Import ergänzen)
- Test: `src/store/workspace.store.test.ts`

**Interfaces:**
- Consumes: `supabase.rpc('delete_workspace', { ws_id })` (Task 2), `invoke('cmd_delete_workspace')` (Task 1).
- Produces: `deleteWorkspace: (id: string) => Promise<void>` auf dem Store. Entfernt den Workspace aus `workspaces`/`localWorkspaces` und schaltet `activeWorkspaceId` um (verbleibender bzw. `null`).

- [ ] **Step 1: Failing tests** — in `src/store/workspace.store.test.ts` neuen Block anfügen (oben im File `import { invoke } from '@tauri-apps/api/core'` ist NICHT nötig; stattdessen mock):

```ts
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))

describe('deleteWorkspace', () => {
  it('lokal: ruft cmd_delete_workspace, entfernt den Eintrag, schaltet aktiv auf null', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    useWorkspaceStore.setState({
      workspaces: [],
      localWorkspaces: [makeLocalWorkspace('l1', 'Lokal')],
      activeWorkspaceId: 'l1',
    })
    await useWorkspaceStore.getState().deleteWorkspace('l1')
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('cmd_delete_workspace')
    expect(useWorkspaceStore.getState().localWorkspaces).toHaveLength(0)
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull()
  })

  it('geteilt: ruft die RPC mit ws_id und entfernt den Workspace', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any)
    useWorkspaceStore.setState({
      workspaces: [{ id: 'c1', name: 'Cloud', logo_url: null, role: 'owner', isShared: true, join_code: null, capabilities: [] }],
      localWorkspaces: [],
      activeWorkspaceId: 'c1',
    })
    await useWorkspaceStore.getState().deleteWorkspace('c1')
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('delete_workspace', { ws_id: 'c1' })
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0)
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull()
  })

  it('geteilt: RPC-Fehler wirft, Workspace bleibt', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Nur der Inhaber' } } as any)
    useWorkspaceStore.setState({
      workspaces: [{ id: 'c1', name: 'Cloud', logo_url: null, role: 'member', isShared: true, join_code: null, capabilities: [] }],
      localWorkspaces: [], activeWorkspaceId: 'c1',
    })
    await expect(useWorkspaceStore.getState().deleteWorkspace('c1')).rejects.toThrow('Nur der Inhaber')
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Tests schlagen fehl**

Run: `npx vitest run src/store/workspace.store.test.ts`
Expected: FAIL — `deleteWorkspace is not a function`.

- [ ] **Step 3: Implementierung** — in `src/store/workspace.store.ts`:

Import oben ergänzen:
```ts
import { invoke } from '@tauri-apps/api/core'
```

Interface (`WorkspaceState`) nach `joinWorkspaceByCode` ergänzen:
```ts
  deleteWorkspace: (id: string) => Promise<void>
```

Implementierung nach `joinWorkspaceByCode` einfügen:
```ts
      deleteWorkspace: async (id) => {
        const all = [...get().workspaces, ...get().localWorkspaces]
        const ws = all.find((w) => w.id === id)
        if (!ws) return
        if (ws.isShared) {
          const { error } = await supabase.rpc('delete_workspace', { ws_id: id })
          if (error) throw new Error(error.message || 'Löschen fehlgeschlagen')
          set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }))
        } else {
          await invoke('cmd_delete_workspace')
          set((s) => ({ localWorkspaces: s.localWorkspaces.filter((w) => w.id !== id) }))
        }
        if (get().activeWorkspaceId === id) {
          const remaining = [...get().workspaces, ...get().localWorkspaces]
          set({ activeWorkspaceId: remaining.length > 0 ? remaining[0].id : null })
        }
      },
```

- [ ] **Step 4: Tests grün**

Run: `npx vitest run src/store/workspace.store.test.ts`
Expected: PASS (alle, inkl. der bestehenden).

- [ ] **Step 5: tsc clean**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe.

- [ ] **Step 6: Commit**

```bash
git add src/store/workspace.store.ts src/store/workspace.store.test.ts
git commit -m "feat(workspace): deleteWorkspace store-helper (lokal + cloud)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: UI — „Workspace löschen" in der Gefahrenzone

**Files:**
- Modify: `src/components/settings/GefahrenzoneSettings.tsx`

**Interfaces:**
- Consumes: `useWorkspaceStore().deleteWorkspace(id)` (Task 3), `isActiveWorkspaceShared()`, `activeWorkspaceId`, `workspaces` (Owner-Ableitung).

- [ ] **Step 1: State + Handler** — in `GefahrenzoneSettings.tsx` ergänzen.

`deleteWorkspace` aus dem Store holen (zu den vorhandenen Hooks):
```ts
  const deleteWorkspace = useWorkspaceStore(s => s.deleteWorkspace)
  const localWorkspaces = useWorkspaceStore(s => s.localWorkspaces)
```

`busy`-Typ erweitern: `useState<'export' | 'import' | 'reset' | 'delete' | null>(null)` und ein eigener Bestätigungstext:
```ts
  const [confirmDelete, setConfirmDelete] = useState('')
```

Handler (neben `handleReset`):
```ts
  const handleDelete = async () => {
    if (!activeId) return
    if (isShared && !isOwner) {
      toast({ message: 'Nur der Inhaber dieses Workspace kann ihn löschen.', variant: 'error' })
      return
    }
    const sharedWarn = isShared
      ? '\n\nACHTUNG: Dieser Workspace ist GETEILT — er wird für ALLE Mitglieder gelöscht.'
      : ''
    if (!window.confirm(`Workspace „${activeId}" endgültig löschen? Alle Inhalte UND der Workspace selbst werden entfernt. Unwiderruflich.${sharedWarn}`)) return
    setBusy('delete')
    try {
      await deleteWorkspace(activeId)
      toast({ message: 'Workspace gelöscht — App lädt neu…', variant: 'success', durationMs: 2000 })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast({ message: `Löschen fehlgeschlagen: ${String(e)}`, variant: 'error' })
      setBusy(null)
    }
  }
```

- [ ] **Step 2: Karte rendern** — nach der „Reset"-`SettingCard` (vor `</SettingsPage>`) einfügen:

```tsx
      {/* Löschen */}
      <SettingCard danger>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={15} style={{ color: '#f87171' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>Workspace löschen</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Entfernt diesen Workspace vollständig — alle Inhalte und den Workspace selbst. Nicht rückgängig machbar.
          {isShared ? ' Bei geteilten Workspaces für alle Mitglieder.' : ''}
        </p>
        {isShared && !isOwner && (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 10px' }}>
            Nur der Inhaber dieses Workspace kann ihn löschen.
          </p>
        )}
        {!isShared && localWorkspaces.length > 1 && (
          <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 10px' }}>
            Hinweis: Lokale Workspaces teilen sich eine Datenbank — dies leert die lokalen Daten aller lokalen Workspaces.
          </p>
        )}
        <input
          value={confirmDelete}
          onChange={e => setConfirmDelete(e.target.value)}
          placeholder='Tippe "löschen" zum Bestätigen'
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            borderRadius: 'var(--radius-sm)', marginBottom: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
          }}
        />
        <button
          disabled={confirmDelete !== 'löschen' || (isShared && !isOwner) || busy !== null}
          onClick={handleDelete}
          style={{
            padding: '7px 16px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
            cursor: confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? 'pointer' : 'not-allowed',
            background: confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? '#ef4444' : 'var(--surface-2)',
            border: '1px solid ' + (confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? '#ef4444' : 'var(--border)'),
            color: confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? '#fff' : 'var(--fg-dim)',
            transition: 'background 140ms, color 140ms',
          }}
        >
          {busy === 'delete' ? 'Lösche…' : 'Workspace löschen'}
        </button>
      </SettingCard>
```

- [ ] **Step 3: tsc clean**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe.

- [ ] **Step 4: Volle Testsuite grün**

Run: `npx vitest run`
Expected: alle grün (689 + neue).

- [ ] **Step 5: Manuelle Verifikation (im Dev-Server / Exe)**
  - Lokaler Workspace: Gefahrenzone → „löschen" tippen → löschen → App lädt neu → WorkspacePicker.
  - Geteilter Workspace als **Owner**: löschen → in Supabase sind `workspaces`-Zeile + Daten weg (per `select count(*)`-Spot-Check).
  - Geteilter Workspace als **Nicht-Owner**: kein aktiver Button / Hinweis „nur Inhaber".

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/GefahrenzoneSettings.tsx
git commit -m "feat(workspace): 'Workspace löschen' in der Gefahrenzone (owner-gated)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (durchgeführt)
- **Spec-Abdeckung:** Cloud-RPC (Task 2), lokaler Purge (Task 1), Store-Routing (Task 3), UI/Gefahrenzone + Owner-Gate + Bestätigung + Post-Delete-Reload (Task 4), Sicherheit/adversarisch (Task 2 Step 4 + Task 4 Step 5). Paywall/Verlassen/Storage bewusst out (Spec).
- **Platzhalter:** keine — jeder Step enthält echten Code/Befehl. Einzig environment-abhängig: RPC-Param-Typ (uuid vs text) — in Task 2 Step 1 explizit zu verifizieren, beide Varianten benannt.
- **Typ-Konsistenz:** `deleteWorkspace(id: string)` einheitlich in Interface, Impl, Tests, UI; RPC-Name `delete_workspace` + Param `ws_id` in RPC, Store, Test identisch; Command-Name `cmd_delete_workspace` in Rust + Store-Mock identisch.
