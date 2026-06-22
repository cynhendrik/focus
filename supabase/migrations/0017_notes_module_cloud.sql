-- 0017_notes_module_cloud.sql — note_entries + note_folders cloud-first (team-shared)
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Beide existieren (Auto-Spiegel) mit workspace_id + created_by + updated_by →
-- für Team-Sharing gedacht. RLS war "own data" (per-Ersteller) → auf workspace
-- member umstellen, damit das Team Kundennotizen sieht. Schema-Drift: stickies
-- fehlte in der Cloud (jsonb ergänzen). tags ist bereits jsonb. created_at/
-- updated_at brauchen Defaults. Plus Realtime.

alter table public.note_entries add column if not exists stickies jsonb not null default '[]'::jsonb;

drop policy if exists "own data" on public.note_entries;
create policy "workspace member" on public.note_entries
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

drop policy if exists "own data" on public.note_folders;
create policy "workspace member" on public.note_folders
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

alter table public.note_entries alter column created_at set default (now())::text;
alter table public.note_entries alter column updated_at set default (now())::text;
alter table public.note_folders alter column created_at set default (now())::text;
alter table public.note_folders alter column updated_at set default (now())::text;

alter table public.note_entries replica identity full;
alter table public.note_folders replica identity full;
alter publication supabase_realtime add table public.note_entries;
alter publication supabase_realtime add table public.note_folders;
