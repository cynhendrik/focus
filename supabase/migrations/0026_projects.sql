-- ANGEWANDT 2026-07-06 via Management-API (Projekt mqbjmquscjtytpjebosw).
-- Verifiziert: projects/project_phases-Tabellen+Spalten+Defaults, activities.project_id,
-- RLS aktiv auf beiden Tabellen, beide Policies, alle Indizes -- alles wie erwartet.
-- Cloud-Gegenstueck zu SQLite-Migration v37 (src-tauri/src/db/migrations.rs).

create table if not exists public.projects (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active',
  current_phase_id text,
  created_at text not null default (now())::text,
  updated_at text not null default (now())::text,
  completed_at text
);

create table if not exists public.project_phases (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null,
  order_index integer not null,
  created_at text not null default (now())::text
);

create index if not exists idx_projects_ws on public.projects(workspace_id);
create index if not exists idx_project_phases_project on public.project_phases(project_id);

alter table public.projects enable row level security;
alter table public.project_phases enable row level security;

create policy "workspace member" on public.projects
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

-- project_phases hat keine eigene workspace_id-Spalte -- Policy geht ueber den Join zum Projekt.
create policy "workspace member via project" on public.project_phases
  for all using (
    exists (select 1 from public.projects p where p.id = project_phases.project_id and is_workspace_member(p.workspace_id))
  ) with check (
    exists (select 1 from public.projects p where p.id = project_phases.project_id and is_workspace_member(p.workspace_id))
  );

alter table public.activities add column if not exists project_id text references public.projects(id);
