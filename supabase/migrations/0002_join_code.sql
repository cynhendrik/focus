-- 0002_join_code.sql — Beitritts-Code für Workspaces (Shared-Workspace Pilot, Subsystem B)
-- MANUELL im Supabase SQL-Editor anwenden (Projekt mqbjmquscjtytpjebosw).
-- Annahme aus 0001: workspace_members.workspace_id ist TEXT, workspaces.id ist uuid.
-- Falls das reale Schema abweicht, die ::text-Casts unten anpassen.

-- 1. Spalte
alter table public.workspaces add column if not exists join_code text unique;

-- 2. Backfill: bestehende Workspaces ohne Code bekommen einen 6-stelligen Zufallscode
--    aus dem sicheren Alphabet (ohne 0/O/1/I).
do $$
declare
  w record;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  for w in select id from public.workspaces where join_code is null loop
    loop
      code := '';
      for i in 1..6 loop
        code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      begin
        update public.workspaces set join_code = code where id = w.id;
        exit;
      exception when unique_violation then
        -- Kollision: neu würfeln
      end;
    end loop;
  end loop;
end $$;

-- 3. RPC: per Code beitreten. SECURITY DEFINER, damit der (noch nicht berechtigte)
--    Beitretende den Workspace per Code finden und seine Mitgliedschaft anlegen kann.
create or replace function public.join_workspace_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
begin
  select id into ws_id from public.workspaces where join_code = p_code;
  if ws_id is null then
    raise exception 'Ungültiger Code';
  end if;
  -- Idempotent OHNE Abhängigkeit von einem Unique-Constraint auf (workspace_id, user_id):
  -- nur einfügen, wenn die Mitgliedschaft noch nicht existiert. So entstehen auch bei
  -- mehrfachem Beitritt keine Duplikate (die sonst die isShared-Mitgliederzahl verfälschen).
  insert into public.workspace_members (workspace_id, user_id, role)
  select ws_id::text, auth.uid(), 'member'
  where not exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id::text and user_id = auth.uid()
  );
  return ws_id;
end $$;

grant execute on function public.join_workspace_by_code(text) to authenticated;

-- 4. RLS: Workspace-Updates (Name, Logo, join_code) NUR durch Owner.
--    WICHTIG: 0001 definiert ein breiteres `ws_update` (jedes Mitglied darf updaten).
--    Permissive Policies werden ge-OR-t — die Owner-Beschränkung greift also nur,
--    wenn wir das breite `ws_update` hier ersetzen. (Im Pilot sind Workspace-
--    Einstellungen ohnehin Owner-Sache.)
alter table public.workspaces enable row level security;
drop policy if exists ws_update on public.workspaces;
drop policy if exists ws_update_owner on public.workspaces;
create policy ws_update_owner on public.workspaces
  for update
  using (
    id::text in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
  );
