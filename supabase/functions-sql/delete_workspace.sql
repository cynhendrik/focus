-- delete_workspace(ws_id text)
-- Owner löscht seinen Workspace KOMPLETT: alle workspace-gescopeten Tabellen
-- (per workspace_id-Spalte, schema-introspektiv → driftfest), inkl. company_settings
-- und workspace_members, plus die workspaces-Zeile selbst.
--
-- SECURITY DEFINER, aber strikt auf den ws_id des aufrufenden Owners begrenzt
-- (Owner-Check via workspace_members.role='owner' und auth.uid()).
--
-- Hinweise (verifiziert gegen Live-Schema mqbjmquscjtytpjebosw, 2026-06-29):
--   * workspaces.id und workspace_*.workspace_id/user_id sind TEXT (nicht uuid)
--     → Param ist `text`, Owner-Vergleich nutzt auth.uid()::text.
--   * KEIN session_replication_role (nur Superuser; postgres darf das nicht) — nicht nötig:
--     alle FKs zwischen den workspace_id-Tabellen sind CASCADE oder SET NULL, also ist die
--     Löschreihenfolge egal; CASCADE räumt zudem Legacy-Kinder (invoice_items, payments,
--     conversation_participants …) mit weg.
-- Adversarisch getestet: Nicht-Owner → Exception, 0 gelöscht; Owner → Workspace + Daten weg.

create or replace function public.delete_workspace(ws_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  is_owner boolean;
  t record;
begin
  select exists(
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()::text and role = 'owner'
  ) into is_owner;
  if not coalesce(is_owner, false) then
    raise exception 'not authorized: only the workspace owner can delete this workspace';
  end if;

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
$fn$;

revoke all on function public.delete_workspace(text) from public;
revoke execute on function public.delete_workspace(text) from anon;  -- Supabase-Default-Grant entfernen
grant execute on function public.delete_workspace(text) to authenticated;
