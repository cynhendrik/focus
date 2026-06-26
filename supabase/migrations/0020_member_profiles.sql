-- 0020_member_profiles.sql — Klarnamen-Verzeichnis für Mentions + Assignee-Picker.
-- Jeder User upsertet beim Login seine EIGENE Zeile (display_name, email).
-- Lesen darf jeder, der mit dem Profil-Inhaber mindestens einen Workspace teilt.

create table if not exists public.profiles (
  id           uuid primary key,                 -- = auth.uid()
  display_name text not null default '',
  email        text,
  updated_at   text not null default (now())::text
);

alter table public.profiles enable row level security;

-- Lesen: eigenes Profil ODER ein Profil, mit dessen Inhaber ich einen Workspace teile.
create policy "profiles read co-members" on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members m_self
    join public.workspace_members m_other
      on m_self.workspace_id = m_other.workspace_id
    where m_self.user_id  = auth.uid()::text
      and m_other.user_id = public.profiles.id::text
  )
);

-- Schreiben: ausschließlich die eigene Zeile.
create policy "profiles insert own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
