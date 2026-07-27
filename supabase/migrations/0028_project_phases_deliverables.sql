-- Cloud-Gegenstueck zu SQLite-Migration v39 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0027 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Bewusst jsonb (nicht text): der Supabase-JS-Client (de)serialisiert jsonb-Spalten
-- automatisch zu/von nativen JS-Arrays -- anders als der lokale SQLite-Pfad, wo
-- Rust den Inhalt als rohen String durchreicht. src/data/projects.mapper.ts's
-- parseDeliverables() behandelt beide Formen (String ODER bereits geparstes Array).

alter table public.project_phases
  add column if not exists deliverables jsonb not null default '[]'::jsonb;
