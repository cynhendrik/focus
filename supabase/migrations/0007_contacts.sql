-- ============================================================================
-- contacts — Cloud-first-Scheibe (Kontakte)
-- ============================================================================
-- Die Tabelle existierte bisher nur lokal (SQLite). Spalten spiegeln das lokale
-- Schema (src-tauri/src/db/contact.rs): alle text, is_primary boolean. created_at
-- bekommt einen Default, da das Gateway-Upsert die Spalte beim Update bewusst
-- weglässt (Original bleibt erhalten, Insert nutzt den Default) — vgl. 0006.
-- account_id ohne harte FK: aktivitäten-Lehre — leere FK-Werte werden als NULL
-- geschrieben; kein Cloud-FK, um Typ-/Reihenfolge-Probleme zu vermeiden.
-- ============================================================================

create table if not exists public.contacts (
  id                text primary key,
  workspace_id      text not null,
  created_by        text not null,
  account_id        text,
  first_name        text not null,
  last_name         text,
  email             text,
  phone             text,
  role              text,
  is_primary        boolean not null default false,
  avatar_url        text,
  linkedin_url      text,
  decision_power    text,
  preferred_channel text,
  notes             text,
  birthday          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists contacts_account_id_idx   on public.contacts (account_id);
create index if not exists contacts_workspace_id_idx on public.contacts (workspace_id);

-- RLS: lesen/schreiben nur in eigenen Workspaces (Muster aus 0001).
alter table public.contacts enable row level security;
drop policy if exists contacts_ws_all on public.contacts;
create policy contacts_ws_all on public.contacts
  for all
  using (workspace_id in (select public.current_workspace_ids()))
  with check (workspace_id in (select public.current_workspace_ids()));
