-- 0006_offers_created_at_default.sql — fehlender Default auf offers.created_at
-- ANGEWANDT 2026-06-21 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Schema-Drift: offers.created_at ist NOT NULL OHNE Default (anders als
-- invoices.created_at und payments.created_at, die (now())::text-Defaults haben).
-- Der Cloud-Angebots-Insert (offerPayloadToRow lässt created_at = DB-Default weg)
-- scheiterte daher mit 23502 "null value in column created_at". Default ergänzt,
-- konsistent zu payments/invoices.

alter table public.offers alter column created_at set default (now())::text;
