-- Cloud-Gegenstueck zu SQLite-Migration v40 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0028 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Bewusst jsonb (nicht text): der Supabase-JS-Client (de)serialisiert jsonb-Spalten
-- automatisch zu/von nativen JS-Arrays -- anders als der lokale SQLite-Pfad, wo
-- Rust den Inhalt als rohen String durchreicht. src/data/projects.mapper.ts's
-- parseAssigneeIds() behandelt beide Formen (String ODER bereits geparstes Array).

alter table public.project_phases
  add column if not exists assignee_ids jsonb not null default '[]'::jsonb;
