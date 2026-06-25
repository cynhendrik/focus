-- reset_workspace(ws_id) — leert alle Daten eines Workspace in der Cloud,
-- behält aber das Setup (Firmenprofil + Nummernkreise). Owner-only.
--
-- DEPLOY: einmalig im Supabase-SQL-Editor (oder via Management-API) ausführen.
-- Passe ggf. `workspace_members` / `role = 'owner'` an die echten Namen an
-- (Prüfabfrage siehe unten).
--
-- Hält die KEEP-Liste mit dem lokalen Reset konsistent
-- (src-tauri/src/commands/export.rs → reset_workspace_local):
--   company_settings, invoice_sequences, offer_sequences, time_planning, app_state
--
-- Mechanik: löscht dynamisch aus JEDER public-Tabelle, die eine `workspace_id`-Spalte
-- hat (außer der KEEP-Liste). Dadurch wachsen neue Tabellen automatisch mit.
-- `session_replication_role=replica` deaktiviert FK-/Trigger-Prüfung NUR für diese
-- Transaktion, sodass die Lösch-Reihenfolge egal ist.

-- ── Prüfabfrage: echte Mitglieder-/Rollen-Tabelle bestätigen ──────────────────
-- select table_name, column_name from information_schema.columns
-- where table_schema='public' and column_name in ('workspace_id','user_id','role')
-- order by table_name, column_name;

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
  -- 1) Owner-Check
  select exists(
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid() and role = 'owner'
  ) into is_owner;
  if not coalesce(is_owner, false) then
    raise exception 'not authorized: only the workspace owner can reset this workspace';
  end if;

  -- 2) FK-Reihenfolge umgehen (nur in dieser Transaktion)
  perform set_config('session_replication_role', 'replica', true);

  -- 3) Alle Workspace-Tabellen leeren, außer der KEEP-Liste (Setup)
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'workspace_id'
      and c.table_name <> all (array[
        'company_settings', 'invoice_sequences', 'offer_sequences',
        'time_planning', 'app_state'
      ])
  loop
    execute format('delete from public.%I where workspace_id = $1', t.table_name) using ws_id;
  end loop;
end;
$$;

revoke all on function public.reset_workspace(uuid) from public;
grant execute on function public.reset_workspace(uuid) to authenticated;
