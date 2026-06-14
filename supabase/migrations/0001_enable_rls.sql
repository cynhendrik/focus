-- ============================================================================
-- Row Level Security (RLS) — Cynera Focus
-- ============================================================================
-- WARUM: Der Client liefert nur den öffentlichen anon-Key aus; der Rust-Sync
-- schreibt mit dem JWT des angemeldeten Nutzers nach PostgREST. Das EINZIGE,
-- was die Daten eines Nutzers schützt, ist RLS. Ohne diese Policies kann jeder
-- mit der App alle Daten aller Nutzer lesen/ändern.
--
-- SCOPE: Heute syncen nur diese Tabellen nach Supabase:
--   - workspaces, workspace_members  (vom JS-Client, src/store/workspace.store.ts)
--   - accounts, deals, activities    (vom Rust-Sync, enqueue() in src-tauri/src/db)
-- Andere Tabellen (invoices, contacts, customers, …) sind aktuell LOKAL und
-- existieren in Supabase nicht — für sie hier KEINE Policy (würde fehlschlagen).
-- Wird der Sync später erweitert, müssen für jede neue Tabelle Policies ergänzt
-- werden (Muster siehe unten). `customers` & Kinder brauchen davor eine
-- workspace_id-Spalte — sie haben aktuell keine Besitz-Spalte.
--
-- ⚠️  VOR PRODUKTION: zuerst auf einem STAGING-Supabase-Projekt anwenden und
--     testen. Spaltentypen (uuid vs text) ggf. an euer echtes Schema anpassen:
--     accounts/deals/activities.workspace_id ist hier als TEXT angenommen
--     (so wie im lokalen SQLite-Schema), workspaces.id als uuid.
-- ============================================================================

-- Workspaces der/die der aktuelle Nutzer angehört (als text, für den Vergleich
-- mit den TEXT-workspace_id-Spalten der Datentabellen).
create or replace function public.current_workspace_ids()
returns setof text
language sql
stable
security invoker
as $$
  select wm.workspace_id::text
  from public.workspace_members wm
  where wm.user_id = auth.uid()
$$;

-- ── workspaces ──────────────────────────────────────────────────────────────
alter table public.workspaces enable row level security;

drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces
  for select using (id::text in (select public.current_workspace_ids()));

drop policy if exists ws_insert on public.workspaces;
create policy ws_insert on public.workspaces
  for insert with check (created_by = auth.uid());

drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces
  for update using (id::text in (select public.current_workspace_ids()));

-- ── workspace_members ───────────────────────────────────────────────────────
alter table public.workspace_members enable row level security;

-- Nutzer sieht die Mitgliedschaften der Workspaces, in denen er selbst ist.
drop policy if exists wm_select on public.workspace_members;
create policy wm_select on public.workspace_members
  for select using (
    user_id = auth.uid()
    or workspace_id::text in (select public.current_workspace_ids())
  );

-- Nutzer darf sich selbst eine Mitgliedschaft anlegen (Workspace-Erstellung).
drop policy if exists wm_insert on public.workspace_members;
create policy wm_insert on public.workspace_members
  for insert with check (user_id = auth.uid());

drop policy if exists wm_delete on public.workspace_members;
create policy wm_delete on public.workspace_members
  for delete using (user_id = auth.uid());

-- ── Datentabellen (workspace_id-scoped) ─────────────────────────────────────
-- Eine „for all"-Policy pro Tabelle: lesen/schreiben nur in eigenen Workspaces.
do $$
declare t text;
begin
  foreach t in array array['accounts','deals','activities']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_ws_all', t);
    execute format($f$
      create policy %I on public.%I
        for all
        using (workspace_id in (select public.current_workspace_ids()))
        with check (workspace_id in (select public.current_workspace_ids()));
    $f$, t || '_ws_all', t);
  end loop;
end $$;

-- ── Muster für später (wenn Sync erweitert wird) ────────────────────────────
-- Für jede neue workspace_id-Tabelle (invoices, offers, contacts, calendar_events,
-- pipeline_stages, smart_lists, campaigns, follow_up_queue, …):
--   alter table public.<t> enable row level security;
--   create policy <t>_ws_all on public.<t> for all
--     using (workspace_id in (select public.current_workspace_ids()))
--     with check (workspace_id in (select public.current_workspace_ids()));
-- Für Kind-Tabellen ohne workspace_id (invoice_items → invoices, …): über das
-- Elternteil scopen, z. B.:
--   using (invoice_id in (select id from public.invoices
--                         where workspace_id in (select public.current_workspace_ids())))
