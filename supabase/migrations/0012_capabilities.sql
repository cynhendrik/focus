-- 0012_capabilities.sql — RBAC-Fundament: capabilities + has_capability()
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- workspace_members.role kennt bisher 'owner'/'member'; 'admin' kommt hinzu
-- (kein Enum-Typ, role ist text — kein DDL nötig, nur Werte). capabilities[]
-- hält gezielte Freischaltungen für 'member'. has_capability() ist die einzige
-- Wahrheit für RLS; SECURITY DEFINER wie is_workspace_member (vermeidet Rekursion,
-- wenn es in workspace_members-Policies genutzt wird).

alter table public.workspace_members
  add column if not exists capabilities text[] not null default '{}';

create or replace function public.has_capability(ws_id text, cap text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id
      and m.user_id = auth.uid()::text
      and (
        m.role = 'owner'
        or (m.role = 'admin' and cap <> 'manage_members')
        or cap = any(m.capabilities)
      )
  );
$$;
