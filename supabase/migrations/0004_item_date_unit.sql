-- 0004_item_date_unit.sql — fehlende Positions-Spalten für Cloud-Rechnungen/Angebote
-- ANGEWANDT 2026-06-21 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Hintergrund: Schema-Drift wie bei 0003. Der Finanz-Schreib-Mapper
-- (invoiceItemPayloadToRow) liefert `item_date` (Leistungsdatum) und `unit`
-- (Einheit). Die Cloud-Tabellen invoice_items/offer_items hatten diese Spalten
-- (anders als lokal) NICHT → PGRST204 "Could not find the 'item_date' column
-- of 'invoice_items'". `unit` wäre direkt danach gefolgt.
-- offer_items wird noch nicht cloud-geschrieben (Angebote-Write = Plan 3),
-- bekommt die Spalten aber zur Symmetrie/Zukunftssicherheit gleich mit.

alter table public.invoice_items add column if not exists item_date text;
alter table public.invoice_items add column if not exists unit text;
alter table public.offer_items   add column if not exists item_date text;
alter table public.offer_items   add column if not exists unit text;

-- PostgREST-Schema-Cache neu laden.
notify pgrst, 'reload schema';
