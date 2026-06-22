-- 0011_vertraege_realtime.sql — vertraege cloud-first realtime-fähig machen
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Tabelle existiert bereits (Auto-Spiegel: items jsonb, kein updated_at,
-- created_at text ohne Default). RLS-Policy ist hier BEWUSST anders: "own data"
-- (created_by = auth.uid()) — Verträge sind Chef/Admin-Daten, rollenbasiertes
-- Teilen an Mitarbeiter ist ein späteres Feature (braucht Rollen auf
-- workspace_members). Daher KEINE Policy-Änderung hier.
--
-- created_at-Default NICHT nötig: der Store setzt createdAt beim Anlegen, das
-- Gateway sendet created_at mit. Nur Realtime ergänzen:

alter table public.vertraege replica identity full;
alter publication supabase_realtime add table public.vertraege;
