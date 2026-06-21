-- 0003_accounts_vat_id.sql — fehlende vat_id-Spalte für Cloud-`accounts`
-- ANGEWANDT 2026-06-21 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Hintergrund: Die App schreibt im Shared-Workspace Kunden/Accounts über
-- AccountsGateway → Supabase `accounts`. Der Schreib-Mapper (accountPayloadToRow)
-- liefert u.a. `vat_id` (USt-IdNr., für Reverse-Charge/EU-B2B-Rechnungen).
-- Die Cloud-Tabelle hatte diese Spalte (anders als das lokale SQLite-Schema) NICHT
-- → PostgREST-Fehler "Could not find the 'vat_id' column of 'accounts'".
-- Alle übrigen vom Mapper geschriebenen Spalten existieren; alle NOT-NULL-Spalten,
-- die der Client-Insert nicht setzt (pipeline_stage, lead_status, lead_source, …),
-- haben passende Defaults — daher ist diese eine Spalte der einzige nötige Eingriff.

alter table public.accounts add column if not exists vat_id text;

-- PostgREST-Schema-Cache neu laden, damit die Spalte sofort akzeptiert wird.
notify pgrst, 'reload schema';
