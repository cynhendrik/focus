-- 0025_prepared_items.sql — prepared_items: der Freigabe-Stapel (Spec 2026-07-02 §6).
-- Cloud-Zweig für geteilte Workspaces. NICHT automatisch anwenden — manuell via Management-API einspielen.
-- Typ-Konvention dieses Projekts: workspaces.id ist TEXT (nicht uuid) — alle IDs hier als text,
-- konsistent mit den übrigen Tabellen und is_workspace_member(ws_id text).
create table if not exists public.prepared_items (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  type text not null,
  source_kind text not null,
  source_id text not null,
  assignee text,
  payload jsonb not null default '{}'::jsonb,
  score double precision not null default 0,
  status text not null default 'pending',
  snooze_until timestamptz,
  rule_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (workspace_id, source_kind, source_id)
);

create index if not exists idx_prepared_items_ws_status on public.prepared_items(workspace_id, status, score);

alter table public.prepared_items enable row level security;

create policy "workspace member" on public.prepared_items
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
