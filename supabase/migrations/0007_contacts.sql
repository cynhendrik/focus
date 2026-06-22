-- 0007_contacts.sql — Kontakte cloud-first: RLS + created_at/updated_at-Defaults
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Befund beim Live-Check: die `contacts`-Tabelle existierte in Supabase BEREITS
-- als Auto-Spiegel des lokalen SQLite-Schemas (alle Spalten text, is_primary &
-- pending_sync smallint, created_at/updated_at text). Nicht neu anlegen — nur die
-- additiven Fixes, damit der Cloud-Pfad (ContactsGateway) funktioniert:
--
-- 1) RLS aktiv + Policy nach dem Projekt-Muster `is_workspace_member(workspace_id)`
--    (NICHT current_workspace_ids() aus 0001 — die Funktion existiert live nicht;
--    0001 war ein nie so angewandter Entwurf, real heißt sie is_workspace_member).
-- 2) created_at/updated_at brauchen Defaults: contactPayloadToRow lässt created_at
--    weg (DB-Default beim Insert, Erhalt beim Update — accounts-Muster). Ohne Default
--    schlüge der Insert mit 23502 fehl (NOT NULL). Konsistent zu accounts/invoices.

alter table public.contacts enable row level security;

drop policy if exists "workspace member" on public.contacts;
create policy "workspace member" on public.contacts
  for all
  using (is_workspace_member(workspace_id));

alter table public.contacts alter column created_at set default (now())::text;
alter table public.contacts alter column updated_at set default (now())::text;
