-- 0014_auftraege_cloud.sql — Aufträge + Zeiteinträge cloud-first
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Beide Tabellen existieren bereits (Auto-Spiegel; auftraege hat Drift-Extra-
-- spalten name/budget_hours/hourly_rate, die der Client nicht nutzt). Bisher lag
-- das Feature nur im localStorage. Additive Fixes für den Cloud-Pfad:
-- 1) zeiteintraege-RLS von "own data" auf workspace member (Abrechnung braucht
--    Team-Sicht; konsistent zu auftraege). Sicher: bisher keine Cloud-Daten.
-- 2) created_at/updated_at-Defaults (text, ohne Default → 23502 beim Insert).
-- 3) Realtime: Publication + replica identity full.

drop policy if exists "own data" on public.zeiteintraege;
drop policy if exists "workspace member" on public.zeiteintraege;
create policy "workspace member" on public.zeiteintraege
  for all
  using      (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

alter table public.auftraege     alter column created_at set default (now())::text;
alter table public.auftraege     alter column updated_at set default (now())::text;
alter table public.zeiteintraege alter column created_at set default (now())::text;

alter table public.auftraege     replica identity full;
alter table public.zeiteintraege replica identity full;
alter publication supabase_realtime add table public.auftraege;
alter publication supabase_realtime add table public.zeiteintraege;
