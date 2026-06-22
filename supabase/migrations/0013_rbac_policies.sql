-- 0013_rbac_policies.sql — RLS auf Capabilities umstellen
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).

-- ── Verträge: own data → contracts-Capability ──────────────────────────────
drop policy if exists "own data" on public.vertraege;
create policy "contracts capability" on public.vertraege
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'contracts'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'contracts'));

-- ── Finanzen: workspace member → + finances-Capability ─────────────────────
drop policy if exists "workspace member" on public.invoices;
create policy "finances capability" on public.invoices
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'));

drop policy if exists "workspace member" on public.offers;
create policy "finances capability" on public.offers
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'));

drop policy if exists "payments_ws" on public.payments;
create policy "finances capability" on public.payments
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'));

-- Kind-Tabellen über das Elternteil scopen (workspace + finances).
drop policy if exists "via invoice" on public.invoice_items;
create policy "via invoice finances" on public.invoice_items
  for all
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_items.invoice_id
                   and is_workspace_member(i.workspace_id)
                   and has_capability(i.workspace_id, 'finances')))
  with check (exists (select 1 from public.invoices i
                 where i.id = invoice_items.invoice_id
                   and is_workspace_member(i.workspace_id)
                   and has_capability(i.workspace_id, 'finances')));

drop policy if exists "via offer" on public.offer_items;
create policy "via offer finances" on public.offer_items
  for all
  using (exists (select 1 from public.offers o
                 where o.id = offer_items.offer_id
                   and is_workspace_member(o.workspace_id)
                   and has_capability(o.workspace_id, 'finances')))
  with check (exists (select 1 from public.offers o
                 where o.id = offer_items.offer_id
                   and is_workspace_member(o.workspace_id)
                   and has_capability(o.workspace_id, 'finances')));

-- ── workspace_members: self-update-Eskalation verhindern ───────────────────
-- "own memberships" (ALL) erlaubte einem Mitglied, die EIGENE role/capabilities
-- zu ändern. Aufsplitten: self-INSERT (createWorkspace-Owner-Zeile) + self/owner-
-- DELETE (verlassen / entfernen) erlaubt; UPDATE NUR mit manage_members (Owner).
-- SELECT-Policy "members can view co-members" bleibt unverändert.
drop policy if exists "own memberships" on public.workspace_members;

create policy "self insert membership" on public.workspace_members
  for insert with check (user_id = auth.uid()::text);

create policy "leave or owner remove" on public.workspace_members
  for delete using (user_id = auth.uid()::text or has_capability(workspace_id, 'manage_members'));

create policy "owner updates members" on public.workspace_members
  for update
  using      (has_capability(workspace_id, 'manage_members'))
  with check (has_capability(workspace_id, 'manage_members'));
