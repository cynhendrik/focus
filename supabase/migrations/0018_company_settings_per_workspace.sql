-- 0018_company_settings_per_workspace.sql — Firmendaten pro Workspace (Cloud)
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- company_settings war eine globale Single-Row (id default 'singleton', kein
-- workspace_id) → im geteilten Cloud-Betrieb würden verschiedene Agenturen sich
-- gegenseitig überschreiben (Multi-Tenant-Leck). NUR cloud-seitig: workspace_id
-- ergänzen → eine Zeile je Workspace (Gateway nutzt id = workspace_id). Der lokale
-- Desktop-/Solo-Pfad (Rust/SQLite, eine Firma) bleibt unverändert.
--
-- RLS (Notion-Muster für Workspace-Settings): Lesen = jedes Mitglied; Schreiben =
-- nur Owner (has_capability manage_members) — „nur der Arbeitgeber legt die Firma an".

alter table public.company_settings add column if not exists workspace_id text;
alter table public.company_settings alter column updated_at set default (now())::text;

alter table public.company_settings enable row level security;

drop policy if exists "ws read"      on public.company_settings;
drop policy if exists "owner insert" on public.company_settings;
drop policy if exists "owner update" on public.company_settings;

create policy "ws read" on public.company_settings
  for select using (is_workspace_member(workspace_id));

create policy "owner insert" on public.company_settings
  for insert with check (has_capability(workspace_id, 'manage_members'));

create policy "owner update" on public.company_settings
  for update using (has_capability(workspace_id, 'manage_members'))
            with check (has_capability(workspace_id, 'manage_members'));

alter table public.company_settings replica identity full;
alter publication supabase_realtime add table public.company_settings;
