-- 0024_dm_read_rpc.sql — Härtung: DM-„gelesen" über SECURITY-DEFINER-RPC statt
-- einer client-seitigen UPDATE-Policy auf conversation_participants.
--
-- Grund: die 0023-Policy "cp own update" (USING/ CHECK nur user_id = auth.uid())
-- ließ einen Teilnehmer die PK-Spalte conversation_id seiner eigenen Zeile auf
-- eine FREMDE Unterhaltung umbiegen → danach wäre is_conversation_participant
-- für diese fremde DM true und deren Nachrichten lesbar. Wir entfernen die
-- Client-UPDATE-Policy komplett (kein direkter Client-Write mehr auf die
-- Tabelle) und setzen last_read_at nur noch über eine DEFINER-RPC, die die
-- Teilnehmerschaft prüft und ausschließlich die eigene Zeile berührt.

drop policy if exists "cp own update" on public.conversation_participants;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_conversation_participant(p_conversation) then
    raise exception 'not a participant';
  end if;
  update public.conversation_participants
     set last_read_at = (now())::text
   where conversation_id = p_conversation and user_id = auth.uid();
end; $$;
