-- Cloud-Gegenstueck zu SQLite-Migration v38 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0026 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).

alter table public.projects
  add column if not exists retainer_monthly real not null default 0,
  add column if not exists retainer_hours integer not null default 0,
  add column if not exists retainer_months integer;

alter table public.project_phases
  add column if not exists start_date text not null default '',
  add column if not exists end_date text not null default '',
  add column if not exists gate_name text not null default 'Freigabe',
  add column if not exists gate_state text not null default 'open',
  add column if not exists gate_date text,
  add column if not exists gate_approved_by text,
  add column if not exists progress_percent integer not null default 0;

update public.project_phases
set start_date = (created_at::date)::text,
    end_date = (created_at::date + interval '14 days')::date::text
where start_date = '';
