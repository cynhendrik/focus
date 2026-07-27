-- Cloud-Gegenstueck zu SQLite-Migration v42 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0031 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Optionale Projekt-Zuordnung fuer Rechnungen, analog zum bestehenden deal_id-Feld.
-- NULL bleibt ein gueltiger Zustand -- nicht jede Rechnung ist an ein Projekt gekoppelt.

alter table public.invoices
  add column if not exists project_id text;
