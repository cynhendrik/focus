-- 0021_muted_refs.sql — billige v1-Stummschaltung: pro User+Workspace eine Zeile
-- mit muted_refs (jsonb-Array von ref_ids). Der Comment-Fan-out überspringt sie.
create table if not exists public.user_workspace_prefs (
  user_id      uuid  not null,
  workspace_id text  not null,
  muted_refs   jsonb not null default '[]'::jsonb,
  updated_at   text  not null default (now())::text,
  primary key (user_id, workspace_id)
);
alter table public.user_workspace_prefs enable row level security;
create policy "prefs own read"   on public.user_workspace_prefs for select using (user_id = auth.uid());
create policy "prefs own write"  on public.user_workspace_prefs for insert with check (user_id = auth.uid());
create policy "prefs own update" on public.user_workspace_prefs for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Comment-Fan-out: gemutete Empfänger überspringen. Ersetzt den comment-Zweig
-- aus 0019 (mention-Zweig unverändert). Hier als komplette Neudefinition.
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

create or replace function public.is_ref_muted(p_user uuid, p_ws text, p_ref text)
returns boolean language sql security definer stable as $$
  select coalesce(
    (select muted_refs ? p_ref from public.user_workspace_prefs
      where user_id = p_user and workspace_id = p_ws),
    false);
$$;
