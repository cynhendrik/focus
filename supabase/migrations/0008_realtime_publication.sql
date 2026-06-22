-- 0008_realtime_publication.sql — activities/contacts/deals realtime-fähig machen
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Befund: Supabase liefert `postgres_changes` NUR für Tabellen in der Publication
-- `supabase_realtime`. Drin waren bisher nur accounts, invoices, invoice_items,
-- offers, offer_items, payments. → Die Realtime-Reloads für activities (Todos/
-- Notizen/Deadlines/CRM, Branch-Scheiben) und contacts (letzte Scheibe) feuerten
-- LIVE GAR NICHT. Zusätzlich brauchen die Tabellen `replica identity full`, damit
-- der client-seitige Filter `workspace_id=eq.X` auch auf UPDATE/DELETE greift
-- (die schon funktionierenden Tabellen haben alle replica identity full).

alter table public.activities replica identity full;
alter table public.contacts   replica identity full;
alter table public.deals      replica identity full;

alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.contacts;
alter publication supabase_realtime add table public.deals;
