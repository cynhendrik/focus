-- 0023_direct_messages.sql — 1:1 (gruppenfähige) Direktnachrichten.
-- messages.conversation_id IS NULL = Team-Stream (unverändert). Gesetzt = DM/Gruppe.

-- ── Schema ──────────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  kind         text not null default 'dm' check (kind in ('dm','group')),
  title        text,
  created_by   uuid not null,
  created_at   text not null default (now())::text
);
create index if not exists conversations_ws_idx on public.conversations (workspace_id);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null,
  last_read_at    text,
  created_at      text not null default (now())::text,
  primary key (conversation_id, user_id)
);
create index if not exists conv_participants_user_idx on public.conversation_participants (user_id);

alter table public.messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at);

alter table public.user_workspace_prefs add column if not exists team_last_read_at text;

alter table public.notifications add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add  constraint notifications_type_check
  check (type in ('assigned','mention','comment','completed','dm'));

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.conversations              enable row level security;
alter table public.conversation_participants  enable row level security;

create or replace function public.is_conversation_participant(conv_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.conversation_participants
                 where conversation_id = conv_id and user_id = auth.uid());
$$;

-- conversations: nur Teilnehmer lesen. Schreiben ausschließlich über die DEFINER-RPC.
drop policy if exists "conv participant read" on public.conversations;
create policy "conv participant read" on public.conversations
  for select using (public.is_conversation_participant(id));

-- participants: Teilnehmer lesen; eigene Zeile (last_read_at) updaten. Insert nur via RPC.
drop policy if exists "cp participant read"  on public.conversation_participants;
drop policy if exists "cp own update"        on public.conversation_participants;
create policy "cp participant read" on public.conversation_participants
  for select using (public.is_conversation_participant(conversation_id));
create policy "cp own update" on public.conversation_participants
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- messages: Team (conversation_id null) = Mitglied; DM/Gruppe = Teilnehmer.
drop policy if exists "ws member read"   on public.messages;
drop policy if exists "ws member insert" on public.messages;
create policy "ws member read" on public.messages for select using (
  (conversation_id is null and public.is_workspace_member(workspace_id))
  or public.is_conversation_participant(conversation_id)
);
create policy "ws member insert" on public.messages for insert with check (
  created_by = auth.uid()
  and ((conversation_id is null and public.is_workspace_member(workspace_id))
       or public.is_conversation_participant(conversation_id))
);
-- author update/delete bleiben aus 0019 bestehen (nicht neu definieren).

-- ── RPC: DM finden/anlegen ───────────────────────────────────────────────────
create or replace function public.get_or_create_dm(p_workspace text, p_peer uuid)
returns uuid language plpgsql security definer as $$
declare v_me uuid := auth.uid(); v_id uuid;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'not a member'; end if;
  if p_peer = v_me then raise exception 'cannot dm self'; end if;
  if not exists (select 1 from public.workspace_members
                 where workspace_id = p_workspace and user_id = p_peer::text) then
    raise exception 'peer not a member';
  end if;
  select c.id into v_id from public.conversations c
   where c.workspace_id = p_workspace and c.kind = 'dm'
     and exists (select 1 from public.conversation_participants p where p.conversation_id=c.id and p.user_id=v_me)
     and exists (select 1 from public.conversation_participants p where p.conversation_id=c.id and p.user_id=p_peer)
     and (select count(*) from public.conversation_participants p where p.conversation_id=c.id) = 2
   limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.conversations (workspace_id, kind, created_by) values (p_workspace, 'dm', v_me) returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id) values (v_id, v_me), (v_id, p_peer);
  return v_id;
end; $$;

-- ── RPC: Chat-Übersicht (Team-Ungelesen + DM-Liste mit Peer/Ungelesen) ───────
create or replace function public.chat_overview(p_workspace text)
returns jsonb language plpgsql security definer stable as $$
declare v_me uuid := auth.uid(); v_team_read text; v_team integer; v_convs jsonb;
begin
  if not public.is_workspace_member(p_workspace) then return jsonb_build_object('teamUnread',0,'conversations','[]'::jsonb); end if;

  select team_last_read_at into v_team_read from public.user_workspace_prefs
    where user_id = v_me and workspace_id = p_workspace;

  select count(*) into v_team from public.messages m
    where m.workspace_id = p_workspace and m.conversation_id is null
      and m.deleted_at is null and m.created_by <> v_me
      and m.created_at::timestamptz > coalesce(v_team_read::timestamptz, '-infinity'::timestamptz);

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_convs from (
    select jsonb_build_object(
      'conversationId', c.id,
      'peerId', peer.user_id,
      'lastMessageAt', (select max(m.created_at::timestamptz)::text from public.messages m where m.conversation_id = c.id and m.deleted_at is null),
      'unread', (
        select count(*) from public.messages m
        where m.conversation_id = c.id and m.deleted_at is null and m.created_by <> v_me
          and m.created_at::timestamptz > coalesce(me.last_read_at::timestamptz, '-infinity'::timestamptz)
      )
    ) as row
    from public.conversations c
    join public.conversation_participants me   on me.conversation_id = c.id and me.user_id = v_me
    join public.conversation_participants peer on peer.conversation_id = c.id and peer.user_id <> v_me
    where c.workspace_id = p_workspace and c.kind = 'dm'
  ) sub;

  return jsonb_build_object('teamUnread', coalesce(v_team,0), 'conversations', v_convs);
end; $$;

-- ── Fan-out: DM → Notification für die anderen Teilnehmer ─────────────────────
-- Komplette Neudefinition (DM-Zweig ergänzt; mention/comment-Zweige aus 0021 unverändert).
create or replace function public.tg_message_fanout()
returns trigger language plpgsql security definer as $$
declare v_actor uuid := new.created_by; v_m text; v_assignee text; v_creator text; v_p uuid;
begin
  if new.kind <> 'user' then return new; end if;

  -- DM/Gruppe: jeden anderen Teilnehmer benachrichtigen, dann fertig.
  if new.conversation_id is not null then
    for v_p in select user_id from public.conversation_participants
               where conversation_id = new.conversation_id and user_id <> v_actor loop
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id, conversation_id)
      values (new.workspace_id, v_p, 'dm', v_actor, 'message', new.id, new.id, new.conversation_id);
    end loop;
    return new;
  end if;

  -- Team-Stream: mention (immer) + comment (gedämpft) wie 0021.
  for v_m in select jsonb_array_elements_text(new.mentions) loop
    if v_m::uuid <> v_actor then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, v_m::uuid, 'mention', v_actor, 'message', new.id, new.id);
    end if;
  end loop;

  if new.ref_type = 'task' then
    select assignee, created_by into v_assignee, v_creator from public.activities where id = new.ref_id;
    if v_assignee is not null and v_assignee::uuid <> v_actor and not (new.mentions ? v_assignee)
       and not public.is_ref_muted(v_assignee::uuid, new.workspace_id, new.ref_id) then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, v_assignee::uuid, 'comment', v_actor, 'message', new.id, new.id);
    end if;
    if v_creator is not null and v_creator::uuid <> v_actor
       and v_creator is distinct from v_assignee and not (new.mentions ? v_creator)
       and not public.is_ref_muted(v_creator::uuid, new.workspace_id, new.ref_id) then
      insert into public.notifications (workspace_id, user_id, type, actor_id, ref_type, ref_id, message_id)
      values (new.workspace_id, v_creator::uuid, 'comment', v_actor, 'message', new.id, new.id);
    end if;
  end if;
  return new;
end; $$;
-- Trigger selbst (message_fanout AFTER INSERT) existiert bereits aus 0019 — nicht neu anlegen.

-- ── Realtime: nur messages bleibt abonniert (RLS filtert DMs). conversations/
--    participants werden NICHT publiziert (Client leitet neue DMs aus der
--    eingehenden Nachricht ab). Minimal-Ansatz.
