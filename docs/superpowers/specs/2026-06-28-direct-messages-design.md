# 1:1-Direktnachrichten (Spec 2 von 2) — Design-Spec

**Datum:** 2026-06-28
**Branch-Kontext:** `feature/erechnung-2026-06-21` (baut auf Team-Chat + Chat-Overlay Spec 1 auf)
**Status:** Design freigegeben (User-Entscheidungen unten), bereit für Plan
**Vorgänger:** Spec 1 = Chat-Overlay-Kachel (`2026-06-28-team-chat-overlay-design.md`, fertig). Diese Spec schaltet die in Spec 1 angelegte, noch inaktive Mitgliederspalte scharf.

## Problem / Ziel

Der Chat hat heute **einen** flachen Workspace-Stream (`messages`, nur `workspace_id`-scoped, RLS „jedes Mitglied liest alles"). Es gibt keine Unterhaltung/keinen Empfänger. Ziel: **1:1-Direktnachrichten** im Slack-Stil — links „Team" + jedes Mitglied, Klick auf ein Mitglied öffnet den privaten Chat mit genau dieser Person. Das Datenmodell wird **gruppenfähig** gebaut (Gruppen kommen später), die Oberfläche in dieser Spec nur 1:1.

## Getroffene Entscheidungen (User)

| Frage | Entscheidung |
|---|---|
| Unterhaltungs-Modell | **`conversations` + `conversation_participants`** (gruppenfähig). NICHT `dm_key`/`recipient_id` — User will später Gruppen, sonst spätere Migration. |
| Umfang jetzt | **Gruppenfähiges Schema, aber nur 1:1-UI.** Ein DM = Unterhaltung mit genau 2 Teilnehmern. Gruppen-Erstellungs-UI = späteres Aufsatz-Spec, **ohne** Migration. |
| Ungelesen-Anzeige | **Punkt + Zähler** pro Mitglied/Team in der linken Liste + Gesamt-Punkt am Topbar-Chat-Button/Nav. |
| DM-Benachrichtigung | **Glocke + Inbox + Sprung** (wie @-Erwähnungen): DM erzeugt Notification; Klick öffnet die Kachel direkt im DM + scrollt zur Nachricht. |
| Lesebestätigung / „tippt" | **Weglassen** (YAGNI). |
| Team-Kanal | Bleibt **Sonderfall** (`conversation_id IS NULL`, RLS `is_workspace_member`) — keine Teilnehmer-Synchronisation mit der Mitgliederliste nötig. |

## Bestands-Fakten (verifiziert 2026-06-28)

- **`messages`** (`0019_team_chat.sql:16-31`): `id, workspace_id, created_by, kind('user'|'system'), body, system_event, ref_type('task'|'account'|'project'), ref_id, visibility, mentions(jsonb), created_at(text), updated_at, deleted_at`. Index `(workspace_id, created_at)`. RLS: `ws member read/insert` = `is_workspace_member(workspace_id)`; update/delete nur Autor.
- **`notifications`** (`0019:33-46`): `id, workspace_id, user_id, type('assigned'|'mention'|'comment'|'completed'), actor_id, ref_type('task'|'message'), ref_id, message_id→messages(id), read_at, created_at`. RLS: nur eigene lesen/ändern; **kein** Client-INSERT (nur Trigger SECURITY DEFINER).
- **Fan-out** `tg_message_fanout` (`0021:17-48`, AFTER INSERT auf messages, kind='user'): erzeugt `mention`-Notifications aus `mentions[]` + `comment`-Notifications für Assignee/Creator bei `ref_type='task'` (außer gemutet via `is_ref_muted`). `tg_task_assignment_fanout` (AFTER UPDATE activities) unberührt.
- **`user_workspace_prefs`** (`0021:3-9`): `(user_id, workspace_id)` PK, `muted_refs jsonb`, `updated_at`. RLS: nur eigene. → hier kommt `team_last_read_at` rein.
- **Store** `useMessagesStore` (`src/store/messages.store.ts`): flache `messages: Message[]`, `loadRecent/loadMore/appendRealtime/send`, PAGE=50. **Gateway** `messages.gateway.ts`: cloud-only (`shared()`-Guard), `listRecent/listBefore/create/softDelete`. **Mapper** `messages.mapper.ts` (`messageRowToMessage`). **Typ** `Message`/`CreateMessagePayload` (`message.types.ts`).
- **Realtime** `useWorkspaceRealtime.ts:103-104`: INSERT auf `messages` gefiltert `workspace_id=eq.X` → `appendRealtime`. Notifications gefiltert `user_id`. (Supabase wendet RLS auf Realtime an → ein Nicht-Teilnehmer bekommt fremde DMs nicht.)
- **Auswahl-Typ** `ChatOverlaySelection = 'team'` (`chat-overlay.store.ts`) — bewusst auf `'team' | { conversationId }` erweiterbar angelegt.
- **Sidebar** `ChatSidebar.tsx`: Mitglieder aktuell **disabled/„bald"**. **Overlay** `TeamChatOverlay.tsx` rendert rechts `MessageList`+`ChatComposer`. **`openChat(messageId?)`** (`src/lib/open-chat.ts`) öffnet die Kachel (heute immer Team) + setzt `pendingScrollMessageId`. Glocke (`NotificationCenter.tsx`) + Inbox (`InboxRoute.tsx`) rufen `openChat`.

## Design

### 1. Datenmodell (Migration 0023)

```sql
create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  kind         text not null default 'dm' check (kind in ('dm','group')),
  title        text,                       -- null bei dm; Gruppenname später
  created_by   uuid not null,
  created_at   text not null default (now())::text
);
create index conversations_ws_idx on public.conversations (workspace_id);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null,
  last_read_at    text,                    -- Ungelesen-Marker (DM/Gruppe)
  created_at      text not null default (now())::text,
  primary key (conversation_id, user_id)
);
create index conv_participants_user_idx on public.conversation_participants (user_id);

alter table public.messages add column conversation_id uuid references public.conversations(id) on delete cascade;
-- conversation_id IS NULL = Team-Stream (unverändert). Bestehende Zeilen bleiben NULL (kein Backfill).
create index messages_conv_created_idx on public.messages (conversation_id, created_at);

alter table public.user_workspace_prefs add column team_last_read_at text;
```

**Ungelesen-Regel (einheitlich):** „Nachrichten in dieser Unterhaltung mit `created_at > last_read` und `created_by <> ich`". `last_read` = `conversation_participants.last_read_at` (DM/Gruppe) bzw. `user_workspace_prefs.team_last_read_at` (Team).

### 2. Rechte (RLS) — kritischster Teil

Helper (SECURITY DEFINER, stable):
```sql
create or replace function public.is_conversation_participant(conv_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.conversation_participants
                 where conversation_id = conv_id and user_id = auth.uid());
$$;
```

- **`messages`** (read+insert ersetzt die 0019-Policies):
  - read: `(conversation_id is null and is_workspace_member(workspace_id)) or is_conversation_participant(conversation_id)`.
  - insert: `created_by = auth.uid() and ((conversation_id is null and is_workspace_member(workspace_id)) or is_conversation_participant(conversation_id))`.
  - update/delete: unverändert (nur Autor).
- **`conversations`**: read `is_conversation_participant(id)`; insert `created_by = auth.uid() and is_workspace_member(workspace_id)` (Erzeugung läuft de facto über die RPC). Kein update/delete in dieser Spec.
- **`conversation_participants`**: read `is_conversation_participant(conversation_id)` (du siehst Teilnehmer der Unterhaltungen, in denen du bist). Insert nur über die SECURITY-DEFINER-RPC (kein direkter Client-INSERT-Policy nötig; ohne INSERT-Policy ist Client-INSERT verboten — gewollt).
- RLS auf allen drei Tabellen aktivieren; `replica identity full` + zu `publication supabase_realtime` für `conversations`/`conversation_participants` **nur falls** wir sie live abonnieren (siehe §4 — Minimal: nicht nötig).
- **Adversarische Prüfung (Pflicht, am Ende):** eigene Agenten versuchen als Nicht-Teilnehmer fremde DMs zu lesen (`select`), zu schreiben (`insert` mit fremder conversation_id), und Teilnehmer fremder Unterhaltungen aufzulisten — alle müssen scheitern.

### 3. DM finden/anlegen — RPC `get_or_create_dm`

```sql
create or replace function public.get_or_create_dm(p_workspace text, p_peer uuid)
returns uuid language plpgsql security definer as $$
declare v_me uuid := auth.uid(); v_id uuid;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'not a member'; end if;
  -- bestehende 1:1-dm zwischen genau {me, peer} suchen
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
```
Race-sicher genug für Solo-Team-Größen; Doppelanlage durch zwei gleichzeitige Erstklicks ist unkritisch (seltener Sonderfall, beide Unterhaltungen funktionieren — optional später ein Unique-Constraint). Aufruf client-seitig via `supabase.rpc('get_or_create_dm', …)`.

### 4. Realtime
Bestehendes `messages`-Abo (`workspace_id=eq.X`) bleibt — RLS filtert DMs automatisch. `appendRealtime(msg)` routet nach `msg.conversationId` (null → Team, sonst Unterhaltung). Eine **neue** eingehende DM (Unterhaltung dem Client noch unbekannt): Store legt aus `msg` einen Listen-Eintrag an (Peer = `createdBy`, `conversationId`) und erhöht den Ungelesen-Zähler. Kein zusätzliches Abo auf `conversations`/`participants` nötig (Minimal-Ansatz).

### 5. Store-Umbau `useMessagesStore`
Von flacher Liste → **pro Unterhaltung gekeyt**. Neuer Zustand (Skizze, exakte Signaturen im Plan):
- `threads: Record<string, { messages: Message[]; hasMore: boolean; loading: boolean }>` — Key = `'team'` oder `conversationId`.
- `conversations: ConversationSummary[]` (`{ id, peerId, kind, lastMessageAt, unreadCount }`).
- `unreadTeam: number`.
- Aktionen: `loadConversations(workspaceId)`, `loadThread(workspaceId, key)`, `loadMore(workspaceId, key)`, `markRead(workspaceId, key)`, `getOrCreateDm(workspaceId, peerId): Promise<string>`, `send(payload mit conversationId|null)`, `appendRealtime(msg)`.
- `send`/`create`: `CreateMessagePayload` + optional `conversationId`; Gateway schreibt `conversation_id`.
- Mapper/Typ: `Message.conversationId: string | null`; `messageRowToMessage` mappt `r.conversation_id`.
Gateway: `listRecent`/`listBefore` bekommen einen Unterhaltungs-Filter (`conversation_id is null` für Team bzw. `=convId`); neue `listConversations(workspaceId)` (Unterhaltungen des Users + jeweils letzter Zeitstempel + Ungelesen-Zähler) und `markRead`-Schreiber (setzt `conversation_participants.last_read_at` bzw. `user_workspace_prefs.team_last_read_at`, Upsert).

### 6. Oberfläche `ChatSidebar` + Auswahl
- `ChatOverlaySelection` → `'team' | { conversationId: string; peerId: string }`; `chat-overlay.store.select` entsprechend.
- Mitglieder werden **klickbar** („bald" entfällt): Klick → `getOrCreateDm` → `select({conversationId, peerId})` → `loadThread` → `markRead`.
- Pro Mitglied + „Team" ein **Zähler-Badge** (`unreadCount`/`unreadTeam`); Summe als **Punkt am Topbar-Chat-Button + Nav „Team"**.
- Rechte Spalte rendert den Verlauf der `selected`-Unterhaltung (MessageList liest künftig aus `threads[selectedKey]` statt der globalen Liste — kleine Anpassung an MessageList oder via Prop/Selector; Plan entscheidet die saubere Naht).

### 7. Benachrichtigungen + Sprung
- `tg_message_fanout` erweitern: wenn `new.conversation_id is not null`, für **jeden anderen Teilnehmer** der Unterhaltung eine Notification `type='dm'`, `ref_type='message'`, `ref_id=new.id`, `message_id=new.id`, **`conversation_id=new.conversation_id`**. (mention/comment-Zweige bleiben für Team/Task.)
- `notifications.type`-Check um `'dm'` erweitern (ALTER constraint). **Neue Spalte** `notifications.conversation_id uuid null` (+ Mapper → `Notification.conversationId`).
- `openChat` erweitern: `openChat({ messageId?, conversationId?, peerId? })` — bei DM `select({conversationId, peerId})` + `pendingScrollMessageId`. Glocke/Inbox: bei `type='dm'`/`conversationId` den DM öffnen statt Team. Peer = Notification-`actorId`.

### 8. Edge-Cases
- **Nicht-geteilter (lokaler) Workspace:** kein Team, keine Mitglieder → Sidebar zeigt nur „Team" mit dem Teilen-Hinweis (Spec 1). DMs faktisch erst im geteilten Workspace.
- **Mitglied = ich selbst:** kein „Notiz an mich"-DM in dieser Spec — eigener Eintrag bleibt nicht klickbar (oder ausgeblendet); Plan wählt das Einfachere.
- **Doppelte DM durch Race:** akzeptiert (selten); beide funktionieren.
- **Ungelesen vs. selbst gesendet:** eigene Nachrichten zählen nie als ungelesen (`created_by <> ich`); beim Senden gilt die Unterhaltung als gelesen.

## Tests
- **RLS (DB, adversarisch):** Teilnehmer liest/schreibt eigene DM ✓; Nicht-Teilnehmer `select`/`insert` auf fremde DM **schlägt fehl**; `conversation_participants` fremder Unterhaltung nicht lesbar; Team (`conversation_id null`) weiterhin für alle Mitglieder lesbar.
- **`get_or_create_dm`:** zweimaliger Aufruf {me,peer} liefert dieselbe id; Nicht-Mitglied → Fehler.
- **Mapper:** `conversation_id` ↔ `conversationId` (inkl. null); Notification `conversation_id` ↔ `conversationId`.
- **Store:** `loadThread` füllt den richtigen Key; `appendRealtime` routet team vs. dm; unbekannte DM legt Listen-Eintrag + Ungelesen an; `markRead` nullt den Zähler; `send` schreibt conversationId.
- **Ungelesen:** Zähler = Nachrichten neuer als last_read und nicht von mir; Gesamt-Punkt = Summe.
- **Sidebar:** Mitglied-Klick ruft `getOrCreateDm`+`select`; Badges rendern; „bald" weg.
- **Sprung:** DM-Notification → `openChat` öffnet die richtige Unterhaltung + setzt pendingScroll; Task-/mention-Sprung unverändert.

## Bewusst NICHT im Scope (→ späteres Spec oder verworfen)
Gruppen-Erstellungs-/Verwaltungs-UI (Schema ist vorbereitet), Lesebestätigungen, „tippt gerade", Datei-/Bild-Anhänge in DMs, Nachrichten-Suche, Reaktionen, Unique-Constraint gegen Race-Doppel-DMs, Self-DM („Notiz an mich"). Team-Kanal-Verhalten unverändert außer Ungelesen-Marker.
