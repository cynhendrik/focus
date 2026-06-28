# 1:1-Direktnachrichten (Spec 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1:1-Direktnachrichten im Chat (Klick auf ein Mitglied öffnet den privaten Verlauf), auf einem gruppenfähigen `conversations`-Datenmodell, mit Ungelesen-Zählern und Glocke/Inbox-Benachrichtigung.

**Architecture:** Neue Tabellen `conversations` + `conversation_participants`; `messages.conversation_id` (NULL = Team-Stream, unverändert). RLS: DM lesen/schreiben nur Teilnehmer (`is_conversation_participant`); Team weiter `is_workspace_member`. DM-Anlage über SECURITY-DEFINER-RPC `get_or_create_dm`; Übersicht/Ungelesen über RPC `chat_overview`. `useMessagesStore` wird von einer flachen Liste auf **pro Unterhaltung gekeyte Threads** umgebaut; die Auswahl lebt in `useChatOverlayStore`. Realtime bleibt das bestehende workspace-weite `messages`-Abo (RLS filtert DMs); `appendRealtime` routet nach `conversationId`.

**Tech Stack:** Supabase (Postgres/RLS/RPC), React + TS + Zustand, Vitest. Migration via Supabase Management API.

## Global Constraints

- **Gruppenfähiges Schema, aber nur 1:1-UI** in dieser Spec. Ein DM = Unterhaltung `kind='dm'` mit genau 2 Teilnehmern. Keine Gruppen-Erstellungs-UI.
- **Team-Kanal bleibt unverändert**: `messages.conversation_id IS NULL`, RLS `is_workspace_member`. Keine Teilnehmer-Synchronisation der Mitgliederliste.
- **RLS ist sicherheitskritisch**: ein Nicht-Teilnehmer darf eine fremde DM weder lesen noch beschreiben noch deren Teilnehmer auflisten. Wird am Ende **adversarisch** geprüft.
- **Zeitvergleich immer als Zeitstempel, nie als Text**: `created_at` ist `(now())::text` (Format `2026-06-28 12:00:00+00`), `last_read_at` aus dem Client ist `toISOString()` (Format `2026-06-28T12:00:00Z`). Lexikografischer Textvergleich ist FALSCH. In SQL `::timestamptz` casten; im Client `new Date(...)` vergleichen.
- **Eigene Nachrichten zählen nie als ungelesen** (`created_by <> ich`).
- Chat ist **cloud-only** (Gateways no-op via `isActiveWorkspaceShared()`); DMs sind nur im geteilten Workspace nutzbar.
- Git: nur **gezielte** `git add <pfad>` — nie `git add -A`/`.`. **Nicht anfassen:** `.gitignore`, `cultera-focus-updater.key.OLD*`.
- Nach jeder TS-Task: `npx tsc --noEmit -p tsconfig.json` sauber + `npx vitest run` grün (Basis 604).
- **Migration (Task 1) wendet der Controller live an** (Management API + PAT), nicht der Implementer. Der Implementer schreibt nur die `.sql`-Datei.
- Supabase-Projekt: `mqbjmquscjtytpjebosw`. **Immer vor Schreibzugriff Live-Schema prüfen** (Spalten-Existenz/Typen) — Drift möglich.

---

### Task 1: Migration `0023_direct_messages.sql` (Schema + RLS + RPCs + Trigger)

**Files:**
- Create: `supabase/migrations/0023_direct_messages.sql`

**Interfaces:**
- Produces (DB): tables `conversations`, `conversation_participants`; `messages.conversation_id`; `user_workspace_prefs.team_last_read_at`; `notifications.conversation_id` + type `'dm'`; functions `is_conversation_participant(uuid)`, `get_or_create_dm(text, uuid) returns uuid`, `chat_overview(text) returns jsonb`; extended `tg_message_fanout`.

- [ ] **Step 1: Migration schreiben** — `supabase/migrations/0023_direct_messages.sql`:

```sql
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
      'lastMessageAt', (select max(m.created_at) from public.messages m where m.conversation_id = c.id and m.deleted_at is null),
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
```

- [ ] **Step 2: Commit (nur die Datei — Controller wendet live an)**

```bash
git add supabase/migrations/0023_direct_messages.sql
git commit -m "feat(chat): migration 0023 — DM conversations, RLS, get_or_create_dm + chat_overview RPC, DM fan-out"
```

**Controller-Schritt (nach Commit, NICHT der Implementer):** Live-Schema von `messages`/`notifications`/`user_workspace_prefs` prüfen, dann die Migration via Management API (`POST /v1/projects/mqbjmquscjtytpjebosw/database/query`) anwenden. Danach **adversarische RLS-Probe** (siehe Abschluss-Verifikation).

---

### Task 2: Typen + Mapper (`conversationId` überall)

**Files:**
- Modify: `src/types/message.types.ts`
- Modify: `src/data/messages.mapper.ts`
- Modify: `src/types/notification.types.ts`
- Modify: `src/data/notifications.mapper.ts`
- Create: `src/types/conversation.types.ts`
- Test: `src/data/messages.mapper.test.ts` (create), `src/data/notifications.mapper.test.ts` (create)

**Interfaces:**
- Produces: `Message.conversationId: string | null`; `CreateMessagePayload.conversationId?: string | null`; `Notification.conversationId: string | null`; `NotificationType` includes `'dm'`; `ConversationSummary = { conversationId: string; peerId: string; lastMessageAt: string | null; unreadCount: number }`; `ChatOverview = { teamUnread: number; conversations: ConversationSummary[] }`.

- [ ] **Step 1: Failing test (messages mapper)** — `src/data/messages.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { messageRowToMessage } from './messages.mapper'

describe('messageRowToMessage conversationId', () => {
  it('maps conversation_id', () => {
    expect(messageRowToMessage({ id: 'm1', conversation_id: 'c1', mentions: [] }).conversationId).toBe('c1')
  })
  it('null when absent (team)', () => {
    expect(messageRowToMessage({ id: 'm1', mentions: [] }).conversationId).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/data/messages.mapper.test.ts` (property missing).

- [ ] **Step 3: Types + mapper**

`src/types/message.types.ts` — add to `Message` (after `mentions`): `conversationId: string | null`; add to `CreateMessagePayload`: `conversationId?: string | null`.

`src/data/messages.mapper.ts` — in the returned object add: `conversationId: r.conversation_id ?? null,`.

`src/types/notification.types.ts` — `NotificationType` → `'assigned' | 'mention' | 'comment' | 'completed' | 'dm'`; add to `Notification`: `conversationId: string | null`.

`src/data/notifications.mapper.ts` — in `notificationRowToNotification` add `conversationId: r.conversation_id ?? null,`.

Create `src/types/conversation.types.ts`:

```ts
export interface ConversationSummary {
  conversationId: string
  peerId:         string
  lastMessageAt:  string | null
  unreadCount:    number
}

export interface ChatOverview {
  teamUnread:    number
  conversations: ConversationSummary[]
}
```

- [ ] **Step 4: Failing test (notifications mapper)** — `src/data/notifications.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { notificationRowToNotification } from './notifications.mapper'

describe('notificationRowToNotification conversationId', () => {
  it('maps conversation_id + dm type', () => {
    const n = notificationRowToNotification({ id: 'n1', type: 'dm', conversation_id: 'c1', ref_type: 'message', ref_id: 'm1' })
    expect(n.conversationId).toBe('c1'); expect(n.type).toBe('dm')
  })
  it('null conversationId when absent', () => {
    expect(notificationRowToNotification({ id: 'n1', type: 'mention', ref_type: 'message', ref_id: 'm1' }).conversationId).toBeNull()
  })
})
```

- [ ] **Step 5: Run both mapper tests → PASS**; `npx tsc --noEmit -p tsconfig.json` clean.

- [ ] **Step 6: Commit**

```bash
git add src/types/message.types.ts src/data/messages.mapper.ts src/types/notification.types.ts src/data/notifications.mapper.ts src/types/conversation.types.ts src/data/messages.mapper.test.ts src/data/notifications.mapper.test.ts
git commit -m "feat(chat): conversationId on Message/Notification + ConversationSummary types"
```

---

### Task 3: Thread-Key-Helfer

**Files:**
- Create: `src/lib/chat/threads.ts`
- Test: `src/lib/chat/threads.test.ts`

**Interfaces:**
- Produces: `type ChatThreadKey = string`; `TEAM_KEY = 'team'`; `threadKeyOf(selection: 'team' | { conversationId: string }): string`.

- [ ] **Step 1: Failing test** — `src/lib/chat/threads.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { threadKeyOf, TEAM_KEY } from './threads'

describe('threadKeyOf', () => {
  it('team selection → TEAM_KEY', () => { expect(threadKeyOf('team')).toBe(TEAM_KEY) })
  it('dm selection → conversationId', () => { expect(threadKeyOf({ conversationId: 'c9' })).toBe('c9') })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — `src/lib/chat/threads.ts`:

```ts
export const TEAM_KEY = 'team'
export type ChatThreadKey = string

/** Map a chat selection to its thread key in the messages store. */
export function threadKeyOf(selection: 'team' | { conversationId: string }): ChatThreadKey {
  return selection === 'team' ? TEAM_KEY : selection.conversationId
}
```

- [ ] **Step 4: Run → PASS**; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/threads.ts src/lib/chat/threads.test.ts
git commit -m "feat(chat): threadKeyOf helper"
```

---

### Task 4: Gateways (messages conversation-filter + ConversationsGateway)

**Files:**
- Modify: `src/data/messages.gateway.ts`
- Create: `src/data/conversations.gateway.ts`
- Test: `src/data/conversations.gateway.test.ts`

**Interfaces:**
- Consumes: `threadKeyOf`/`TEAM_KEY` (Task 3), `ChatOverview`/`ConversationSummary` (Task 2), `messageRowToMessage`.
- Produces:
  - `MessagesGateway.listRecent(workspaceId, conversationId: string | null, limit?)` and `listBefore(workspaceId, conversationId: string | null, beforeCreatedAt, limit?)` — **conversation-aware** (filter `conversation_id is null` for team, else `=conversationId`).
  - `MessagesGateway.create(payload)` writes `conversation_id` from `payload.conversationId ?? null`.
  - `ConversationsGateway.getOrCreateDm(workspaceId, peerId): Promise<string>` (rpc `get_or_create_dm`).
  - `ConversationsGateway.overview(workspaceId): Promise<ChatOverview>` (rpc `chat_overview`).
  - `ConversationsGateway.markRead(workspaceId, key: string): Promise<void>` — `key==='team'` → upsert `user_workspace_prefs.team_last_read_at`; else update `conversation_participants.last_read_at` for own row.

- [ ] **Step 1: `MessagesGateway` conversation-aware machen** — `src/data/messages.gateway.ts`. In `listRecent`/`listBefore` Signatur um `conversationId: string | null` erweitern und den Filter ergänzen; in `create` `conversation_id` schreiben. Konkret:

`listRecent(workspaceId: string, conversationId: string | null, limit = PAGE)` — nach `.eq('workspace_id', workspaceId)` einfügen:
```ts
      .filter('conversation_id', conversationId === null ? 'is' : 'eq', conversationId as any)
```
(Hinweis: für `is` muss der Wert `null` sein; `.is('conversation_id', null)` wenn team, sonst `.eq('conversation_id', conversationId)`. Sauberer Zweig:)
```ts
    let q = supabase.from('messages').select('*').eq('workspace_id', workspaceId).is('deleted_at', null)
    q = conversationId === null ? q.is('conversation_id', null) : q.eq('conversation_id', conversationId)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
```
Analog in `listBefore` (zusätzlich `.lt('created_at', beforeCreatedAt)`).

In `create` das row-Objekt um `conversation_id: payload.conversationId ?? null,` ergänzen.

- [ ] **Step 2: Failing test (ConversationsGateway)** — `src/data/conversations.gateway.test.ts` (mockt `@/lib/supabase` + workspace-shared):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ isActiveWorkspaceShared: () => true }) } }))

import { ConversationsGateway } from './conversations.gateway'

beforeEach(() => { rpc.mockReset() })

describe('ConversationsGateway', () => {
  it('getOrCreateDm calls rpc and returns the id', async () => {
    rpc.mockResolvedValue({ data: 'conv-1', error: null })
    const id = await ConversationsGateway.getOrCreateDm('ws1', 'peer1')
    expect(rpc).toHaveBeenCalledWith('get_or_create_dm', { p_workspace: 'ws1', p_peer: 'peer1' })
    expect(id).toBe('conv-1')
  })
  it('overview maps the rpc jsonb', async () => {
    rpc.mockResolvedValue({ data: { teamUnread: 2, conversations: [{ conversationId: 'c1', peerId: 'p1', lastMessageAt: 't', unread: 3 }] }, error: null })
    const ov = await ConversationsGateway.overview('ws1')
    expect(ov.teamUnread).toBe(2)
    expect(ov.conversations[0]).toEqual({ conversationId: 'c1', peerId: 'p1', lastMessageAt: 't', unreadCount: 3 })
  })
})
```

- [ ] **Step 3: Run → FAIL**.

- [ ] **Step 4: `ConversationsGateway` implementieren** — `src/data/conversations.gateway.ts`:

```ts
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { TEAM_KEY } from '@/lib/chat/threads'
import type { ChatOverview, ConversationSummary } from '@/types/conversation.types'

function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function fail(error: { message: string }): never { throw new Error(error.message) }

export const ConversationsGateway = {
  /** Findet/legt die 1:1-Unterhaltung mit peer an; gibt conversationId zurück. */
  async getOrCreateDm(workspaceId: string, peerId: string): Promise<string> {
    const { data, error } = await supabase.rpc('get_or_create_dm', { p_workspace: workspaceId, p_peer: peerId })
    if (error) fail(error)
    return data as string
  },

  /** Team-Ungelesen + DM-Liste (Peer, letzter Zeitstempel, Ungelesen). Cloud-only. */
  async overview(workspaceId: string): Promise<ChatOverview> {
    if (!shared()) return { teamUnread: 0, conversations: [] }
    const { data, error } = await supabase.rpc('chat_overview', { p_workspace: workspaceId })
    if (error) fail(error)
    const raw = (data ?? { teamUnread: 0, conversations: [] }) as any
    const conversations: ConversationSummary[] = (raw.conversations ?? []).map((c: any) => ({
      conversationId: c.conversationId,
      peerId:         c.peerId,
      lastMessageAt:  c.lastMessageAt ?? null,
      unreadCount:    c.unread ?? 0,
    }))
    return { teamUnread: raw.teamUnread ?? 0, conversations }
  },

  /** Markiert eine Unterhaltung (oder Team) als gelesen (last_read = jetzt). */
  async markRead(workspaceId: string, key: string): Promise<void> {
    if (!shared()) return
    const now = new Date().toISOString()
    if (key === TEAM_KEY) {
      const userId = useAuthStore.getState().user?.id
      if (!userId) return
      const { error } = await supabase.from('user_workspace_prefs')
        .upsert({ user_id: userId, workspace_id: workspaceId, team_last_read_at: now }, { onConflict: 'user_id,workspace_id' })
      if (error) fail(error)
    } else {
      const userId = useAuthStore.getState().user?.id
      if (!userId) return
      const { error } = await supabase.from('conversation_participants')
        .update({ last_read_at: now }).eq('conversation_id', key).eq('user_id', userId)
      if (error) fail(error)
    }
  },
}
```

- [ ] **Step 5: Run → PASS**; volle Suite + tsc (Signaturänderung an `listRecent`/`listBefore` bricht erstmal den Store/Consumer — wird in Task 5 angepasst; falls die Suite hier wegen der Signatur rot ist, ist das erwartet, weil der Store noch die alte Signatur ruft → **Task 4 committet erst, nachdem `messages.store` in Task 5 nachzieht**? Nein: um Task 4 isoliert grün zu halten, die alten `loadRecent(workspaceId)`-Aufrufer NICHT hier brechen). **Lösung:** In Task 4 die `messages.gateway`-Signatur additiv halten — `conversationId` als **zweiter Parameter mit Default** `= null`:
  - `listRecent(workspaceId: string, conversationId: string | null = null, limit = PAGE)`
  - `listBefore(workspaceId: string, conversationId: string | null = null, beforeCreatedAt: string, limit = PAGE)` → Default-Param vor Pflicht-Param geht nicht; daher `listBefore(workspaceId, beforeCreatedAt, conversationId = null, limit = PAGE)` (Reihenfolge: workspaceId, beforeCreatedAt, conversationId, limit).
  Damit bleibt der bestehende Store (ruft `listRecent(workspaceId)` / `listBefore(workspaceId, oldest)`) tsc-grün und verhält sich wie bisher (team). Task 5 stellt dann auf explizite Keys um.

- [ ] **Step 6: Commit**

```bash
git add src/data/messages.gateway.ts src/data/conversations.gateway.ts src/data/conversations.gateway.test.ts
git commit -m "feat(chat): conversation-aware messages gateway + ConversationsGateway (getOrCreateDm/overview/markRead)"
```

---

### Task 5: `useMessagesStore` auf gekeyte Threads umbauen (Herzstück)

**Files:**
- Modify: `src/store/messages.store.ts`
- Test: `src/store/messages.store.test.ts` (create)

**Interfaces:**
- Consumes: `MessagesGateway` (Task 4), `ConversationsGateway` (Task 4), `threadKeyOf`/`TEAM_KEY` (Task 3), `useChatOverlayStore` (für „wird gerade angeschaut?"), `useAuthStore`, `Message`, `ConversationSummary`.
- Produces (new store shape):
  - State: `threads: Record<string, { messages: Message[]; hasMore: boolean; loading: boolean; loadingMore: boolean }>`, `conversations: ConversationSummary[]`, `unreadTeam: number`.
  - Actions: `loadOverview(workspaceId)`, `loadThread(workspaceId, key)`, `loadMore(workspaceId, key)`, `markRead(workspaceId, key)`, `getOrCreateDm(workspaceId, peerId): Promise<string>`, `send(payload)`, `appendRealtime(msg)`.
  - Helper export `emptyThread()`.

- [ ] **Step 1: Failing test** — `src/store/messages.store.test.ts` (mockt beide Gateways + chat-overlay + auth):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/messages.gateway', () => ({ MessagesGateway: {
  listRecent: vi.fn().mockResolvedValue([]), listBefore: vi.fn().mockResolvedValue([]),
  create: vi.fn(), softDelete: vi.fn(),
}}))
vi.mock('@/data/conversations.gateway', () => ({ ConversationsGateway: {
  getOrCreateDm: vi.fn(), overview: vi.fn().mockResolvedValue({ teamUnread: 0, conversations: [] }), markRead: vi.fn(),
}}))
vi.mock('@/store/chat-overlay.store', () => ({ useChatOverlayStore: { getState: () => ({ open: false, selected: 'team' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'me' } }) } }))

import { useMessagesStore } from './messages.store'
import { MessagesGateway } from '@/data/messages.gateway'
import { ConversationsGateway } from '@/data/conversations.gateway'
import { TEAM_KEY } from '@/lib/chat/threads'

const msg = (id: string, over: any = {}) => ({ id, workspaceId: 'ws1', createdBy: 'peer', conversationId: null, createdAt: '2026-01-01 00:00:00+00', mentions: [], ...over })

beforeEach(() => {
  useMessagesStore.setState({ threads: {}, conversations: [], unreadTeam: 0 })
  vi.clearAllMocks()
})

describe('useMessagesStore threads', () => {
  it('loadThread fills the right key', async () => {
    ;(MessagesGateway.listRecent as any).mockResolvedValue([msg('m1')])
    await useMessagesStore.getState().loadThread('ws1', TEAM_KEY)
    expect(useMessagesStore.getState().threads[TEAM_KEY].messages.map(m => m.id)).toEqual(['m1'])
    expect(MessagesGateway.listRecent).toHaveBeenCalledWith('ws1', null, expect.any(Number))
  })

  it('loadThread for a dm passes the conversationId', async () => {
    await useMessagesStore.getState().loadThread('ws1', 'c1')
    expect(MessagesGateway.listRecent).toHaveBeenCalledWith('ws1', 'c1', expect.any(Number))
  })

  it('appendRealtime routes team vs dm', () => {
    useMessagesStore.getState().appendRealtime(msg('t1', { conversationId: null }))
    useMessagesStore.getState().appendRealtime(msg('d1', { conversationId: 'c1' }))
    expect(useMessagesStore.getState().threads[TEAM_KEY]?.messages.map(m => m.id)).toEqual(['t1'])
    expect(useMessagesStore.getState().threads['c1']?.messages.map(m => m.id)).toEqual(['d1'])
  })

  it('appendRealtime on an unviewed dm increments its unread + adds a conversation entry', () => {
    useMessagesStore.getState().appendRealtime(msg('d1', { conversationId: 'c1', createdBy: 'peer' }))
    const conv = useMessagesStore.getState().conversations.find(c => c.conversationId === 'c1')
    expect(conv?.unreadCount).toBe(1)
    expect(conv?.peerId).toBe('peer')
  })

  it('appendRealtime on the team stream (unviewed) increments unreadTeam', () => {
    useMessagesStore.getState().appendRealtime(msg('t1', { conversationId: null, createdBy: 'peer' }))
    expect(useMessagesStore.getState().unreadTeam).toBe(1)
  })

  it('own messages never count as unread', () => {
    useMessagesStore.getState().appendRealtime(msg('t1', { conversationId: null, createdBy: 'me' }))
    expect(useMessagesStore.getState().unreadTeam).toBe(0)
  })

  it('markRead zeroes the counter and calls the gateway', async () => {
    useMessagesStore.setState({ unreadTeam: 5 })
    await useMessagesStore.getState().markRead('ws1', TEAM_KEY)
    expect(useMessagesStore.getState().unreadTeam).toBe(0)
    expect(ConversationsGateway.markRead).toHaveBeenCalledWith('ws1', TEAM_KEY)
  })

  it('send writes conversationId and appends', async () => {
    ;(MessagesGateway.create as any).mockResolvedValue(msg('s1', { conversationId: 'c1', createdBy: 'me' }))
    await useMessagesStore.getState().send({ workspaceId: 'ws1', createdBy: 'me', body: 'hi', conversationId: 'c1' })
    expect(MessagesGateway.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c1' }))
    expect(useMessagesStore.getState().threads['c1'].messages.map(m => m.id)).toEqual(['s1'])
  })

  it('loadOverview sets conversations + unreadTeam', async () => {
    ;(ConversationsGateway.overview as any).mockResolvedValue({ teamUnread: 4, conversations: [{ conversationId: 'c1', peerId: 'p1', lastMessageAt: 't', unreadCount: 2 }] })
    await useMessagesStore.getState().loadOverview('ws1')
    expect(useMessagesStore.getState().unreadTeam).toBe(4)
    expect(useMessagesStore.getState().conversations[0].conversationId).toBe('c1')
  })
})
```

- [ ] **Step 2: Run → FAIL** (store shape not present).

- [ ] **Step 3: Store implementieren** — `src/store/messages.store.ts` komplett ersetzen:

```ts
import { create } from 'zustand'
import { MessagesGateway } from '@/data/messages.gateway'
import { ConversationsGateway } from '@/data/conversations.gateway'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useAuthStore } from '@/store/auth.store'
import { TEAM_KEY, threadKeyOf } from '@/lib/chat/threads'
import { log } from '@/lib/logger'
import type { Message, CreateMessagePayload } from '@/types/message.types'
import type { ConversationSummary } from '@/types/conversation.types'

interface ThreadState { messages: Message[]; hasMore: boolean; loading: boolean; loadingMore: boolean }
export const emptyThread = (): ThreadState => ({ messages: [], hasMore: true, loading: false, loadingMore: false })

interface MessagesState {
  threads:       Record<string, ThreadState>
  conversations: ConversationSummary[]
  unreadTeam:    number
  loadOverview:  (workspaceId: string) => Promise<void>
  loadThread:    (workspaceId: string, key: string) => Promise<void>
  loadMore:      (workspaceId: string, key: string) => Promise<void>
  markRead:      (workspaceId: string, key: string) => Promise<void>
  getOrCreateDm: (workspaceId: string, peerId: string) => Promise<string>
  send:          (payload: CreateMessagePayload) => Promise<Message>
  appendRealtime:(msg: Message) => void
}

const PAGE = 50
const keyOfMessage = (m: Message): string => m.conversationId ?? TEAM_KEY

export const useMessagesStore = create<MessagesState>()((set, get) => ({
  threads: {},
  conversations: [],
  unreadTeam: 0,

  loadOverview: async (workspaceId) => {
    try {
      const ov = await ConversationsGateway.overview(workspaceId)
      set({ conversations: ov.conversations, unreadTeam: ov.teamUnread })
    } catch (err) { log.error('Failed to load chat overview', { err }) }
  },

  loadThread: async (workspaceId, key) => {
    set(s => ({ threads: { ...s.threads, [key]: { ...(s.threads[key] ?? emptyThread()), loading: true } } }))
    try {
      const conversationId = key === TEAM_KEY ? null : key
      const msgs = await MessagesGateway.listRecent(workspaceId, conversationId, PAGE)
      set(s => ({ threads: { ...s.threads, [key]: { messages: msgs, hasMore: msgs.length === PAGE, loading: false, loadingMore: false } } }))
    } catch (err) {
      log.error('Failed to load thread', { err, key })
      set(s => ({ threads: { ...s.threads, [key]: { ...(s.threads[key] ?? emptyThread()), loading: false } } }))
    }
  },

  loadMore: async (workspaceId, key) => {
    const t = get().threads[key]
    if (!t || !t.hasMore || t.messages.length === 0 || t.loadingMore) return
    const oldest = t.messages[0].createdAt
    set(s => ({ threads: { ...s.threads, [key]: { ...t, loadingMore: true } } }))
    try {
      const conversationId = key === TEAM_KEY ? null : key
      const older = await MessagesGateway.listBefore(workspaceId, oldest, conversationId, PAGE)
      set(s => {
        const cur = s.threads[key] ?? emptyThread()
        const existing = new Set(cur.messages.map(m => m.id))
        const fresh = older.filter(m => !existing.has(m.id))
        return { threads: { ...s.threads, [key]: { ...cur, messages: [...fresh, ...cur.messages], hasMore: older.length === PAGE, loadingMore: false } } }
      })
    } catch (err) {
      log.error('Failed to load older messages', { err })
      set(s => ({ threads: { ...s.threads, [key]: { ...(s.threads[key] ?? emptyThread()), loadingMore: false } } }))
    }
  },

  markRead: async (workspaceId, key) => {
    set(s => key === TEAM_KEY
      ? { unreadTeam: 0 }
      : { conversations: s.conversations.map(c => c.conversationId === key ? { ...c, unreadCount: 0 } : c) })
    try { await ConversationsGateway.markRead(workspaceId, key) }
    catch (err) { log.error('Failed to mark chat read', { err }) }
  },

  getOrCreateDm: async (workspaceId, peerId) => {
    const id = await ConversationsGateway.getOrCreateDm(workspaceId, peerId)
    set(s => s.conversations.some(c => c.conversationId === id)
      ? s
      : { conversations: [...s.conversations, { conversationId: id, peerId, lastMessageAt: null, unreadCount: 0 }] })
    return id
  },

  send: async (payload) => {
    const msg = await MessagesGateway.create(payload)
    get().appendRealtime(msg)
    return msg
  },

  appendRealtime: (msg) => {
    const key = keyOfMessage(msg)
    const myId = useAuthStore.getState().user?.id
    const ov = useChatOverlayStore.getState()
    const viewing = ov.open && threadKeyOf(ov.selected as any) === key
    const fromMe = msg.createdBy === myId

    set(s => {
      const cur = s.threads[key] ?? emptyThread()
      const threads = cur.messages.some(m => m.id === msg.id)
        ? s.threads
        : { ...s.threads, [key]: { ...cur, messages: [...cur.messages, msg] } }

      let unreadTeam = s.unreadTeam
      let conversations = s.conversations
      const countsAsUnread = !fromMe && !viewing

      if (key === TEAM_KEY) {
        if (countsAsUnread) unreadTeam = s.unreadTeam + 1
      } else {
        const exists = conversations.some(c => c.conversationId === key)
        if (!exists) {
          conversations = [...conversations, { conversationId: key, peerId: msg.createdBy, lastMessageAt: msg.createdAt, unreadCount: countsAsUnread ? 1 : 0 }]
        } else {
          conversations = conversations.map(c => c.conversationId === key
            ? { ...c, lastMessageAt: msg.createdAt, unreadCount: countsAsUnread ? c.unreadCount + 1 : c.unreadCount }
            : c)
        }
      }
      return { threads, unreadTeam, conversations }
    })

    if (viewing) void get().markRead(msg.workspaceId, key)
  },
}))
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/store/messages.store.test.ts`).

- [ ] **Step 5: Consumer-Breaks beheben** — die alten Aufrufer der Store-API anpassen, damit tsc + Suite grün sind:
  - `src/components/team/TeamChatOverlay.tsx`: `Panel` rief `loadRecent(activeWorkspaceId)`. Ersetzen durch `loadOverview(activeWorkspaceId)` **und** `loadThread(activeWorkspaceId, TEAM_KEY)` beim Öffnen (Import `TEAM_KEY` + `loadOverview`/`loadThread`). (Die feinere Auswahl-gesteuerte Ladung kommt in Task 7/8 — hier nur tsc/Suite grün halten, Team lädt wie bisher.)
  - `src/components/team/MessageList.tsx`: liest aktuell `useMessagesStore(s => s.messages)` / `s.hasMore` / `s.loadMore`. Übergangsweise auf den Team-Thread zeigen: `const t = useMessagesStore(s => s.threads[TEAM_KEY])`; `const messages = t?.messages ?? []`; `hasMore = t?.hasMore ?? false`; `loadMore` → `useMessagesStore.getState().loadMore(workspaceId, TEAM_KEY)` (workspaceId via `useWorkspaceStore`). (Task 7 macht es Thread-prop-basiert.)
  - Falls weitere Dateien `useMessagesStore(s => s.messages)` / `s.loadRecent` referenzieren: `git grep -n "s.messages\|loadRecent\|\.send(" -- src/components src/routes` und jeden Treffer auf die neue API ziehen (Team-Default), tsc als Wahrheit.

- [ ] **Step 6: tsc + volle Suite grün + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/store/messages.store.ts src/store/messages.store.test.ts src/components/team/TeamChatOverlay.tsx src/components/team/MessageList.tsx
git commit -m "feat(chat): keyed message threads + conversations + unread in useMessagesStore"
```

---

### Task 6: Auswahl-Typ erweitern (`chat-overlay.store`)

**Files:**
- Modify: `src/store/chat-overlay.store.ts`
- Modify: `src/store/chat-overlay.store.test.ts`

**Interfaces:**
- Produces: `ChatOverlaySelection = 'team' | { conversationId: string; peerId: string }`; `select(s: ChatOverlaySelection)` unchanged signature shape.

- [ ] **Step 1: Test erweitern** — in `src/store/chat-overlay.store.test.ts` einen Fall ergänzen:

```ts
  it('select kann eine DM-Auswahl setzen', () => {
    useChatOverlayStore.getState().select({ conversationId: 'c1', peerId: 'p1' })
    expect(useChatOverlayStore.getState().selected).toEqual({ conversationId: 'c1', peerId: 'p1' })
  })
```

- [ ] **Step 2: Run → FAIL** (Typ erlaubt nur `'team'`).

- [ ] **Step 3: Typ erweitern** — `src/store/chat-overlay.store.ts`:

```ts
export type ChatOverlaySelection = 'team' | { conversationId: string; peerId: string }
```
(Rest unverändert; `selected: 'team'` bleibt Default; `select(selected)` akzeptiert nun beide.)

- [ ] **Step 4: Run → PASS**; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/chat-overlay.store.ts src/store/chat-overlay.store.test.ts
git commit -m "feat(chat): ChatOverlaySelection supports dm {conversationId, peerId}"
```

---

### Task 7: `MessageList` + `ChatComposer` thread-scoped machen

**Files:**
- Modify: `src/components/team/MessageList.tsx`
- Modify: `src/components/team/ChatComposer.tsx`
- Modify: `src/components/team/TeamChatOverlay.tsx`
- Test: `src/components/team/MessageList.test.tsx` (create)

**Interfaces:**
- `MessageList` bekommt Prop `threadKey: string` (default `TEAM_KEY`); rendert `threads[threadKey]`. `loadMore(workspaceId, threadKey)`.
- `ChatComposer` bekommt Prop `conversationId: string | null` (default null) und sendet ihn mit.
- `TeamChatOverlay` berechnet aus `useChatOverlayStore.selected` den `threadKey` (via `threadKeyOf`) + die `conversationId` und reicht sie an `MessageList`/`ChatComposer`; lädt bei Auswahlwechsel `loadThread` + `markRead`.

- [ ] **Step 1: Failing test** — `src/components/team/MessageList.test.tsx` (mockt Stores, prüft thread-scoping):

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useMessagesStore, emptyThread } from '@/store/messages.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { MessageList } from './MessageList'

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'me' } as any })
  useMembersStore.setState({ profiles: { me: { id: 'me', displayName: 'Ich', email: null }, p1: { id: 'p1', displayName: 'Peer', email: null } }, memberIds: ['me','p1'] })
  useMessagesStore.setState({ threads: {
    team: { ...emptyThread(), messages: [{ id: 't1', workspaceId: 'ws1', createdBy: 'p1', conversationId: null, body: 'team-hi', kind: 'user', mentions: [], systemEvent: null, refType: null, refId: null, visibility: 'internal', createdAt: '2026-01-01 00:00:00+00', updatedAt: '2026-01-01 00:00:00+00', deletedAt: null }] },
    c1:   { ...emptyThread(), messages: [{ id: 'd1', workspaceId: 'ws1', createdBy: 'p1', conversationId: 'c1', body: 'dm-hi', kind: 'user', mentions: [], systemEvent: null, refType: null, refId: null, visibility: 'internal', createdAt: '2026-01-01 00:00:00+00', updatedAt: '2026-01-01 00:00:00+00', deletedAt: null }] },
  }, conversations: [], unreadTeam: 0 })
})
afterEach(cleanup)

describe('MessageList thread-scoping', () => {
  it('renders the team thread by default', () => {
    render(<MessageList />)
    expect(screen.getByText('team-hi')).toBeTruthy()
    expect(screen.queryByText('dm-hi')).toBeNull()
  })
  it('renders the dm thread when threadKey is set', () => {
    render(<MessageList threadKey="c1" />)
    expect(screen.getByText('dm-hi')).toBeTruthy()
    expect(screen.queryByText('team-hi')).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: `MessageList` umstellen** — `src/components/team/MessageList.tsx`:
  - Signatur: `export function MessageList({ compact = false, threadKey = TEAM_KEY }: { compact?: boolean; threadKey?: string })` (Import `TEAM_KEY` aus `@/lib/chat/threads`).
  - `const thread = useMessagesStore(s => s.threads[threadKey])`; `const messages = thread?.messages ?? []`; `const hasMore = thread?.hasMore ?? false`; `const loadMore = useMessagesStore(s => s.loadMore)`.
  - „load more"-Aufruf: `loadMore(workspaceId, threadKey)` mit `const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''` (Import ergänzen, falls nicht vorhanden).
  - Restliche Render-/Scroll-Logik unverändert (nutzt `messages`).

- [ ] **Step 4: `ChatComposer` umstellen** — `src/components/team/ChatComposer.tsx`:
  - Props erweitern: `interface Props { contextRef?: {...}; conversationId?: string | null }` und in `submit` an `send({...})` `conversationId: conversationId ?? null` ergänzen.
  - Bei DM-Modus (`conversationId` gesetzt) bleibt @-Mention-Logik unverändert (für 1:1 unkritisch).

- [ ] **Step 5: `TeamChatOverlay` verdrahten** — `src/components/team/TeamChatOverlay.tsx`, im `Panel`:
  - `const selected = useChatOverlayStore(s => s.selected)`; `const threadKey = threadKeyOf(selected)`; `const conversationId = selected === 'team' ? null : selected.conversationId` (Import `threadKeyOf`/`TEAM_KEY`).
  - Effekt bei Auswahl-/Workspace-Wechsel: `if (activeWorkspaceId && isShared) { void loadOverview(activeWorkspaceId); void loadThread(activeWorkspaceId, threadKey); void markRead(activeWorkspaceId, threadKey) }` (Abhängigkeiten: `activeWorkspaceId, isShared, threadKey`). `loadOverview` darf auch einmalig laufen.
  - JSX rechts: `<MessageList threadKey={threadKey} />` und `<ChatComposer conversationId={conversationId} />`.

- [ ] **Step 6: Run Test → PASS**; volle Suite + tsc grün. (Der bestehende Spec-1-Test `TeamChatOverlay.test.tsx` mockt `MessageList`/`ChatComposer` → bleibt grün; falls er die alten Props prüft, ggf. anpassen.)

- [ ] **Step 7: Commit**

```bash
git add src/components/team/MessageList.tsx src/components/team/ChatComposer.tsx src/components/team/TeamChatOverlay.tsx src/components/team/MessageList.test.tsx
git commit -m "feat(chat): thread-scoped MessageList + ChatComposer, overlay drives selection"
```

---

### Task 8: `ChatSidebar` — Mitglieder klickbar + Ungelesen-Badges + Gesamt-Punkt

**Files:**
- Modify: `src/components/team/ChatSidebar.tsx`
- Modify: `src/components/team/ChatSidebar.test.tsx`
- Modify: `src/components/layout/Topbar.tsx`
- Modify: `src/components/layout/NavSidebar.tsx`
- Create: `src/lib/chat/total-unread.ts` + test

**Interfaces:**
- Consumes: `useMessagesStore` (`conversations`, `unreadTeam`, `getOrCreateDm`), `useChatOverlayStore` (`selected`, `select`), `useWorkspaceStore.activeWorkspaceId`, `useMembersStore`, `useAuthStore`.
- Produces: `totalUnread(unreadTeam, conversations): number` (sum); ChatSidebar with clickable members (DM open) + per-row badge; Topbar/Nav show a dot when `totalUnread > 0`.

- [ ] **Step 1: Failing test (total-unread)** — `src/lib/chat/total-unread.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { totalUnread } from './total-unread'

describe('totalUnread', () => {
  it('sums team + conversation unread', () => {
    expect(totalUnread(2, [{ conversationId: 'c1', peerId: 'p', lastMessageAt: null, unreadCount: 3 }, { conversationId: 'c2', peerId: 'q', lastMessageAt: null, unreadCount: 1 }])).toBe(6)
  })
  it('zero when nothing unread', () => { expect(totalUnread(0, [])).toBe(0) })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — `src/lib/chat/total-unread.ts`:

```ts
import type { ConversationSummary } from '@/types/conversation.types'

export function totalUnread(unreadTeam: number, conversations: ConversationSummary[]): number {
  return unreadTeam + conversations.reduce((sum, c) => sum + c.unreadCount, 0)
}
```

- [ ] **Step 4: `ChatSidebar` umbauen** — `src/components/team/ChatSidebar.tsx`. Mitglieder werden klickbar; pro Mitglied/Team ein Zähler-Badge. Komplettersatz:

```tsx
import { Hash } from 'lucide-react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

function Badge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span style={{
      minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--accent)',
      color: 'var(--accent-ink)', fontSize: 10.5, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{n > 99 ? '99+' : n}</span>
  )
}

export function ChatSidebar() {
  const selected = useChatOverlayStore(s => s.selected)
  const select   = useChatOverlayStore(s => s.select)
  const members  = useMembersStore(s => s.members())
  const myId     = useAuthStore(s => s.user?.id)
  const conversations = useMessagesStore(s => s.conversations)
  const unreadTeam    = useMessagesStore(s => s.unreadTeam)
  const getOrCreateDm = useMessagesStore(s => s.getOrCreateDm)
  const workspaceId   = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const teamActive = selected === 'team'

  const openDm = async (peerId: string) => {
    if (!workspaceId) return
    const conversationId = await getOrCreateDm(workspaceId, peerId)
    select({ conversationId, peerId })
  }

  const unreadFor = (peerId: string) =>
    conversations.find(c => c.peerId === peerId)?.unreadCount ?? 0

  return (
    <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--surface-2)' }}>
      <button
        onClick={() => select('team')}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', cursor: 'pointer',
          textAlign: 'left', width: '100%', background: teamActive ? 'var(--surface)' : 'transparent',
          color: teamActive ? 'var(--fg)' : 'var(--fg-muted)', fontSize: 13.5, fontWeight: teamActive ? 700 : 600,
          borderLeft: `2px solid ${teamActive ? 'var(--accent)' : 'transparent'}`,
        }}
      >
        <Hash size={15} /> <span style={{ flex: 1 }}>Team</span> <Badge n={unreadTeam} />
      </button>

      <div style={{ padding: '12px 12px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
        Mitglieder
      </div>

      {members.filter(m => m.id !== myId).map(m => {
        const active = typeof selected === 'object' && selected.peerId === m.id
        return (
          <button
            key={m.id}
            onClick={() => void openDm(m.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', cursor: 'pointer',
              textAlign: 'left', width: '100%', background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--fg)' : 'var(--fg-muted)', fontSize: 13, fontWeight: active ? 700 : 500,
              borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayName}</span>
            <Badge n={unreadFor(m.id)} />
          </button>
        )
      })}
    </div>
  )
}
```
(Hinweis: der eigene Eintrag entfällt — kein Self-DM in dieser Spec; das „bald" ist weg.)

- [ ] **Step 5: `ChatSidebar`-Test anpassen** — `src/components/team/ChatSidebar.test.tsx`. Die alten „disabled/bald"-Asserts ersetzen durch: Team-Eintrag vorhanden + aktiv; Mitglieder (außer ich) als Buttons; Klick auf ein Mitglied ruft `getOrCreateDm` und dann `select` mit `{conversationId, peerId}`; Badge rendert bei `unreadCount>0`. Beispiel-Kern:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ChatSidebar } from './ChatSidebar'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

beforeEach(() => {
  useChatOverlayStore.setState({ open: true, selected: 'team' })
  useMembersStore.setState({ profiles: { me: { id: 'me', displayName: 'Ich', email: null }, p1: { id: 'p1', displayName: 'Anna Vogel', email: null } }, memberIds: ['me','p1'] })
  useAuthStore.setState({ user: { id: 'me' } as any })
  useWorkspaceStore.setState({ activeWorkspaceId: 'ws1' } as any)
  useMessagesStore.setState({ threads: {}, conversations: [{ conversationId: 'c1', peerId: 'p1', lastMessageAt: null, unreadCount: 2 }], unreadTeam: 0, getOrCreateDm: vi.fn().mockResolvedValue('c1') } as any)
})
afterEach(cleanup)

describe('ChatSidebar DMs', () => {
  it('zeigt Team + Mitglieder (ohne mich), kein "bald"', () => {
    render(<ChatSidebar />)
    expect(screen.getByText('Team')).toBeTruthy()
    expect(screen.getByText('Anna Vogel')).toBeTruthy()
    expect(screen.queryByText('Ich')).toBeNull()
    expect(screen.queryByText('bald')).toBeNull()
  })
  it('zeigt Ungelesen-Badge am Mitglied', () => {
    render(<ChatSidebar />)
    expect(screen.getByText('2')).toBeTruthy()
  })
  it('Klick auf Mitglied öffnet DM (getOrCreateDm + select)', async () => {
    const select = vi.fn(); useChatOverlayStore.setState({ select })
    render(<ChatSidebar />)
    fireEvent.click(screen.getByText('Anna Vogel'))
    await waitFor(() => expect(select).toHaveBeenCalledWith({ conversationId: 'c1', peerId: 'p1' }))
  })
})
```

- [ ] **Step 6: Gesamt-Punkt in Topbar + Nav** —
  - `src/components/layout/Topbar.tsx`: `import { totalUnread } from '@/lib/chat/total-unread'` + `useMessagesStore`. `const total = useMessagesStore(s => totalUnread(s.unreadTeam, s.conversations))`. Am Chat-Button (MessagesSquare) einen kleinen Punkt zeigen, wenn `total > 0` (kleines absolut positioniertes `<span>` analog Glocken-Badge in `NotificationCenter`).
  - `src/components/layout/NavSidebar.tsx`: am „Team"-`NavItem` ein `badge={total || undefined}` setzen (NavItem unterstützt `badge` bereits, siehe Mail-Eintrag) mit `const total = useMessagesStore(s => totalUnread(s.unreadTeam, s.conversations))`.

- [ ] **Step 7: tsc + volle Suite grün + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/lib/chat/total-unread.ts src/lib/chat/total-unread.test.ts src/components/team/ChatSidebar.tsx src/components/team/ChatSidebar.test.tsx src/components/layout/Topbar.tsx src/components/layout/NavSidebar.tsx
git commit -m "feat(chat): clickable members open DMs + unread badges + total dot"
```

---

### Task 9: DM-Benachrichtigung → Sprung in die richtige Unterhaltung

**Files:**
- Modify: `src/lib/open-chat.ts`
- Modify: `src/lib/open-chat.test.ts`
- Modify: `src/components/layout/NotificationCenter.tsx`
- Modify: `src/routes/InboxRoute.tsx`

**Interfaces:**
- `openChat(opts?: { messageId?: string | null; conversationId?: string | null; peerId?: string | null })` — bei `conversationId`+`peerId` → `select({conversationId, peerId})`, sonst Team; setzt `pendingScrollMessageId` aus `messageId`; öffnet das Overlay.
- NotificationCenter/InboxRoute: bei `type==='dm'` (bzw. `n.conversationId`) `openChat({ messageId: n.messageId, conversationId: n.conversationId, peerId: n.actorId })`, sonst wie bisher.

- [ ] **Step 1: Test anpassen** — `src/lib/open-chat.test.ts`. Bestehende Aufrufe `openChat('m-42')` auf die neue Objekt-Signatur umstellen und einen DM-Fall ergänzen:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openChat } from './open-chat'
import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'

beforeEach(() => {
  useChatOverlayStore.setState({ open: false, selected: 'team' })
  useUiStore.setState({ pendingScrollMessageId: null })
})

describe('openChat', () => {
  it('ohne Argumente: Team öffnen', () => {
    openChat()
    expect(useChatOverlayStore.getState().open).toBe(true)
    expect(useChatOverlayStore.getState().selected).toBe('team')
  })
  it('mit messageId: Scroll-Merker setzen', () => {
    openChat({ messageId: 'm-42' })
    expect(useUiStore.getState().pendingScrollMessageId).toBe('m-42')
  })
  it('mit conversationId+peerId: DM auswählen + öffnen', () => {
    openChat({ messageId: 'm1', conversationId: 'c1', peerId: 'p1' })
    expect(useChatOverlayStore.getState().selected).toEqual({ conversationId: 'c1', peerId: 'p1' })
    expect(useUiStore.getState().pendingScrollMessageId).toBe('m1')
    expect(useChatOverlayStore.getState().open).toBe(true)
  })
})
```

- [ ] **Step 2: Run → FAIL** (alte String-Signatur).

- [ ] **Step 3: `openChat` umstellen** — `src/lib/open-chat.ts`:

```ts
import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'

interface OpenChatOpts { messageId?: string | null; conversationId?: string | null; peerId?: string | null }

/** Öffnet die Chat-Kachel. Mit conversationId+peerId direkt im DM, sonst im Team.
 *  messageId → MessageList scrollt nach dem Öffnen dorthin. */
export function openChat(opts: OpenChatOpts = {}): void {
  const { messageId, conversationId, peerId } = opts
  if (messageId) useUiStore.getState().setPendingScrollMessageId(messageId)
  if (conversationId && peerId) useChatOverlayStore.getState().select({ conversationId, peerId })
  else useChatOverlayStore.getState().select('team')
  useChatOverlayStore.getState().openPanel()
}
```

- [ ] **Step 4: Aufrufer anpassen** —
  - `src/components/layout/NotificationCenter.tsx`, `jump`:
```tsx
    if (n.refType === 'task') { openTask(n.refId); return }
    openChat({ messageId: n.messageId, conversationId: n.conversationId, peerId: n.actorId })
```
  - `src/routes/InboxRoute.tsx`, `jump`: identisch (task-Zweig zuerst, dann `openChat({ messageId: n.messageId, conversationId: n.conversationId, peerId: n.actorId })`).
  (Bei Team-mention/comment ist `n.conversationId` null → openChat öffnet Team wie bisher.)

- [ ] **Step 5: Run open-chat-Test → PASS**; volle Suite + tsc grün.

- [ ] **Step 6: Commit**

```bash
git add src/lib/open-chat.ts src/lib/open-chat.test.ts src/components/layout/NotificationCenter.tsx src/routes/InboxRoute.tsx
git commit -m "feat(chat): DM notifications jump into the right conversation"
```

---

## Abschluss-Verifikation

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün.
- [ ] **Migration live angewendet** (Controller, Management API) + Live-Schema bestätigt: `conversations`, `conversation_participants`, `messages.conversation_id`, `user_workspace_prefs.team_last_read_at`, `notifications.conversation_id` + `dm`-Typ vorhanden.
- [ ] **Adversarische RLS-Probe (Controller, Pflicht):** Mit zwei verschiedenen Test-Usern (oder service-role-simuliert über `auth.uid()`):
  - Teilnehmer liest/schreibt seine DM ✓.
  - **Nicht-Teilnehmer** `select * from messages where conversation_id = <fremde dm>` → **0 Zeilen**.
  - **Nicht-Teilnehmer** `insert into messages (... conversation_id = <fremde dm>)` → **abgelehnt** (RLS).
  - **Nicht-Teilnehmer** `select * from conversation_participants where conversation_id = <fremde dm>` → **0 Zeilen**.
  - Team-Nachricht (`conversation_id null`) weiterhin für jedes Mitglied lesbar ✓.
- [ ] **Manuell (2 Logins, geteilter Workspace):** A klickt B in der Liste → DM öffnet; A schreibt → B bekommt **Glocke/Inbox-Eintrag**, Klick öffnet den DM + scrollt; Ungelesen-Zähler bei B steigt, wird beim Öffnen 0; Gesamt-Punkt an Topbar/Nav stimmt; C sieht den A↔B-DM **nicht**.

## Spec-Coverage (Self-Review)
- §1 Datenmodell → Task 1 ✅. §2 RLS (kritisch) → Task 1 + adversarische Probe (Abschluss) ✅. §3 `get_or_create_dm` → Task 1/4 ✅. §4 Realtime (Routing in appendRealtime) → Task 5 ✅ (Abo unverändert). §5 Store-Umbau → Task 5 ✅. §6 Sidebar/Auswahl/Badges → Task 6/7/8 ✅. §7 Benachrichtigungen + Sprung → Task 1 (Trigger) + Task 9 ✅. §8 Edge-Cases (nicht-geteilt, Self-DM ausgeblendet, eigene Nachrichten nie ungelesen, Zeitvergleich als Zeitstempel) → Task 1/5/8 ✅.
- YAGNI: keine Gruppen-UI, keine Lesebestätigung/Tippt-Anzeige, keine Anhänge.
- Typkonsistenz: `conversationId`/`peerId`/`ConversationSummary.unreadCount`/`ChatOverview.teamUnread`/`threadKeyOf`/`TEAM_KEY` durchgängig.
