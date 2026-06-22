-- 0009_deals_cloud.sql — deals cloud-first: notes-Spalte + created_at/updated_at-Defaults
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Die `deals`-Tabelle existiert in Supabase bereits (Auto-Spiegel des lokalen
-- SQLite-Schemas, mit pending_sync). RLS-Policy "workspace member" ist schon da
-- (deals war im 0001-Set). Zwei additive Fixes für den Cloud-Pfad (DealsGateway):
--
-- 1) notes: lokal vorhanden (src-tauri/src/db/deal.rs), cloud fehlte → Schema-Drift.
--    Ohne die Spalte schlüge ein Insert mit notes als PGRST204 fehl bzw. notes
--    ginge verloren. Additiv ergänzt.
-- 2) created_at/updated_at (text) hatten keinen Default. dealPayloadToRow lässt
--    created_at weg (DB-Default beim Insert, Erhalt beim Update — accounts-Muster).
--    Konsistent zu accounts/invoices ((now())::text).

alter table public.deals add column if not exists notes text;
alter table public.deals alter column created_at set default (now())::text;
alter table public.deals alter column updated_at set default (now())::text;
