-- 0016_workspace_members_realtime.sql — RBAC-Rollenänderungen live propagieren
-- ANGEWANDT 2026-06-22 via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- Letzter RBAC-Nachzügler: bisher wirkte eine Rollen-/Capability-Änderung erst
-- nach Workspace-Wechsel. workspace_members in die Realtime-Publication + replica
-- identity full → der workspace_members-Channel lädt role+capabilities live neu.

alter table public.workspace_members replica identity full;
alter publication supabase_realtime add table public.workspace_members;
