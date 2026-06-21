-- 0005_allocate_offer_number.sql — laufende Angebotsnummer für Cloud-Angebote
-- ANGEWANDT 2026-06-21 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Spiegelt das lokale Rust-Format ANG-{YYYY}-{NNN} (3-stellig, per-Workspace
-- fortlaufend). offer_sequences hat (anders als invoice_sequences) kein
-- format/seq_year → festes Format. SECURITY DEFINER + FOR UPDATE wie
-- allocate_invoice_number.

create or replace function public.allocate_offer_number(ws_id text)
returns text language plpgsql security definer as $$
declare v_next int; v_to_use int;
begin
  insert into public.offer_sequences (workspace_id, next_number, start_number)
    values (ws_id, 0, 1) on conflict (workspace_id) do nothing;
  select next_number into v_next from public.offer_sequences where workspace_id = ws_id for update;
  v_to_use := coalesce(v_next, 0) + 1;
  update public.offer_sequences set next_number = v_to_use where workspace_id = ws_id;
  return 'ANG-' || to_char(now(),'YYYY') || '-' || lpad(v_to_use::text, 3, '0');
end $$;

grant execute on function public.allocate_offer_number(text) to authenticated;
