-- 0019_team_chat.sql — Team-Chat: messages + notifications (cloud-first, team-shared).
-- messages = der EINE Workspace-Kanal; notifications = Inbox pro Empfänger.
-- NICHT verwechseln mit der lokalen SQLite-Tabelle chat_messages (KORA-KI-Chat).
--
-- ⚠️ BEIM ANWENDEN GEGEN DIE LIVE-DB: den folgenden is_workspace_member-Block
--    ÜBERSPRINGEN, falls die Funktion dort bereits existiert (sie steuert RLS
--    app-weit). Hier nur zur Repo-Reproduzierbarkeit auf einer frischen DB.
create or replace function public.is_workspace_member(ws_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = auth.uid()::text
  );
$$;

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text not null,
  created_by    uuid not null,
  kind          text not null check (kind in ('user','system')),
  body          text not null default '',
  system_event  text check (system_event in ('task_assigned','task_completed','task_created')),
  ref_type      text check (ref_type in ('task','account','project')),
  ref_id        text,
  visibility    text not null default 'internal' check (visibility in ('internal','client')),
  mentions      jsonb not null default '[]'::jsonb,
  created_at    text not null default (now())::text,
  updated_at    text not null default (now())::text,
  deleted_at    text
);
create index if not exists messages_ws_created_idx on public.messages (workspace_id, created_at);

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text not null,
  user_id       uuid not null,
  type          text not null check (type in ('assigned','mention','comment','completed')),
  actor_id      uuid not null,
  ref_type      text not null check (ref_type in ('task','message')),
  ref_id        text not null,
  message_id    uuid references public.messages(id) on delete cascade,
  read_at       text,
  created_at    text not null default (now())::text
);
create index if not exists notifications_user_read_idx    on public.notifications (user_id, read_at);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.messages      enable row level security;
alter table public.notifications enable row level security;

-- messages: jedes Mitglied liest/schreibt; ändern/löschen nur eigene.
drop policy if exists "ws member read"   on public.messages;
drop policy if exists "ws member insert" on public.messages;
drop policy if exists "author update"    on public.messages;
drop policy if exists "author delete"    on public.messages;
create policy "ws member read"   on public.messages for select using (is_workspace_member(workspace_id));
create policy "ws member insert" on public.messages for insert with check (is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "author update"    on public.messages for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "author delete"    on public.messages for delete using (created_by = auth.uid());

-- notifications: nur eigene lesen/ändern; KEIN Client-INSERT (nur Trigger via SECURITY DEFINER).
drop policy if exists "own read"   on public.notifications;
drop policy if exists "own update" on public.notifications;
create policy "own read"   on public.notifications for select using (user_id = auth.uid());
create policy "own update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.messages      replica identity full;
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

-- ── Fan-out 1: Aufgaben-Zuweisung / -Abschluss → System-Nachricht + Notification ──
create or replace function public.tg_task_assignment_fanout()
returns trigger language plpgsql security definer as $$
declare v_msg_id uuid; v_actor uuid := auth.uid();
begin
  if new.type = 'task' and new.assignee is distinct from old.assignee and new.assignee is not null then
    insert into public.messages (workspace_id, created_by, kind, system_event, ref_type, ref_id)
    values (new.workspace_id, v_actor, 'system', 'task_assigned', 'task', new.id)
    returning id into v_msg_id;
    if new.assignee::uuid <> v_actor then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, new.assignee::uuid, 'assigned', v_actor, 'task', new.id, v_msg_id);
    end if;
  end if;
  if new.type = 'task' and new.status = 'done' and old.status is distinct from 'done' then
    insert into public.messages (workspace_id, created_by, kind, system_event, ref_type, ref_id)
    values (new.workspace_id, v_actor, 'system', 'task_completed', 'task', new.id)
    returning id into v_msg_id;
    if new.created_by is not null and new.created_by::uuid <> v_actor then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, new.created_by::uuid, 'completed', v_actor, 'task', new.id, v_msg_id);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists task_assignment_fanout on public.activities;
create trigger task_assignment_fanout
  after update on public.activities
  for each row execute function public.tg_task_assignment_fanout();

-- ── Fan-out 2: User-Nachricht → mention (immer) + comment (gedämpft) ──
create or replace function public.tg_message_fanout()
returns trigger language plpgsql security definer as $$
declare v_actor uuid := new.created_by; v_m text; v_assignee text; v_creator text;
begin
  if new.kind <> 'user' then return new; end if;

  for v_m in select jsonb_array_elements_text(new.mentions) loop
    if v_m::uuid <> v_actor then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, v_m::uuid, 'mention', v_actor, 'message', new.id, new.id);
    end if;
  end loop;

  if new.ref_type = 'task' then
    select assignee, created_by into v_assignee, v_creator
      from public.activities where id = new.ref_id;
    if v_assignee is not null and v_assignee::uuid <> v_actor and not (new.mentions ? v_assignee) then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, v_assignee::uuid, 'comment', v_actor, 'message', new.id, new.id);
    end if;
    if v_creator is not null and v_creator::uuid <> v_actor
       and v_creator is distinct from v_assignee and not (new.mentions ? v_creator) then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, v_creator::uuid, 'comment', v_actor, 'message', new.id, new.id);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists message_fanout on public.messages;
create trigger message_fanout
  after insert on public.messages
  for each row execute function public.tg_message_fanout();
