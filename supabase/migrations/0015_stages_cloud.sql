-- 0015_stages_cloud.sql — pipeline_stages + lead_stages cloud-first realtime
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Beide existieren (Auto-Spiegel), RLS "workspace member" ist schon da. Additive
-- Fixes: created_at/updated_at-Defaults (text, ohne Default → 23502) + Realtime
-- (Publication + replica identity full). bool-Spalten sind smallint (im Mapper 0/1).

alter table public.pipeline_stages alter column created_at set default (now())::text;
alter table public.pipeline_stages alter column updated_at set default (now())::text;
alter table public.lead_stages     alter column created_at set default (now())::text;
alter table public.lead_stages     alter column updated_at set default (now())::text;

alter table public.pipeline_stages replica identity full;
alter table public.lead_stages     replica identity full;
alter publication supabase_realtime add table public.pipeline_stages;
alter publication supabase_realtime add table public.lead_stages;
