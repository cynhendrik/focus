-- 0022_kpis_cloud.sql — Kunden-KPIs cloud-first (Teilprojekt ② der Workspace-Sharing-Suite).
-- Eine Vorgänger-App hatte bereits eine `kpis`-Tabelle in altem Schema (customer_id,
-- ohne workspace_id/account_id) — leer (0 Zeilen, keine RLS, nicht in Realtime). Wir
-- ersetzen sie durch die cloud-first-Form, die die lokale post-v5 SQLite-Tabelle spiegelt
-- (account_id → accounts, kein created_at). Drop ist sicher, da leer + Legacy.
drop table if exists public.kpis cascade;

create table public.kpis (
  id            text primary key,
  workspace_id  text not null,
  created_by    uuid not null,
  account_id    text not null references public.accounts(id) on delete cascade,
  label         text not null,
  value         double precision,
  unit          text,
  target        double precision,
  period        text,
  updated_at    text not null default (now())::text
);
create index if not exists kpis_account_idx on public.kpis (account_id);

alter table public.kpis enable row level security;
create policy "workspace member" on public.kpis
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

alter table public.kpis replica identity full;
alter publication supabase_realtime add table public.kpis;
