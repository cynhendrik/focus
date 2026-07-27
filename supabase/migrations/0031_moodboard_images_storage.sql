-- Neuer privater Storage-Bucket fuer Moodboard-Bilder (Etappe 5 des Projekt-Ausbaus).
-- Muss wie 0001-0030 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Pfad-Konvention der Objekte: {workspaceId}/{projectId}/{itemId}.{ext}
-- storage.foldername(name) liefert die Pfad-Segmente vor dem Dateinamen als Array;
-- Segment [1] ist damit die workspaceId. Die Policy prueft Mitgliedschaft in
-- public.workspace_members -- identisches Prinzip zu den bestehenden RLS-Policies
-- auf den Postgres-Tabellen dieses Projekts.

insert into storage.buckets (id, name, public)
values ('moodboard-images', 'moodboard-images', false)
on conflict (id) do nothing;

create policy "moodboard_images_select_workspace_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);

create policy "moodboard_images_insert_workspace_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);

create policy "moodboard_images_update_workspace_members"
on storage.objects for update
to authenticated
using (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);

create policy "moodboard_images_delete_workspace_members"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);
