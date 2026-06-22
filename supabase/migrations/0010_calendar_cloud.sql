-- 0010_calendar_cloud.sql — calendar_events cloud-first: realtime + Defaults
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Tabelle existiert bereits (Auto-Spiegel: all_day smallint, created_at/updated_at
-- text). RLS-Policy "workspace member" ist schon da. Additive Fixes für den
-- Cloud-Pfad (CalendarGateway):
-- 1) Realtime: in supabase_realtime-Publication + replica identity full
--    (sonst feuert der workspace_id-Filter auf UPDATE/DELETE nicht — vgl. 0008).
-- 2) created_at/updated_at-Defaults: eventPayloadToRow lässt created_at weg.

alter table public.calendar_events replica identity full;
alter publication supabase_realtime add table public.calendar_events;

alter table public.calendar_events alter column created_at set default (now())::text;
alter table public.calendar_events alter column updated_at set default (now())::text;
