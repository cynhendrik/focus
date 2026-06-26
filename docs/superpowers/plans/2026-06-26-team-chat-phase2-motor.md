# Team-Chat — Phase 2: Motor (messages + notifications) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Datenmotor des Team-Chats bauen: zwei cloud-first Supabase-Tabellen (`messages`, `notifications`) mit RLS und serverseitigem Auffächern (Trigger), plus Typen/Mapper/Gateways/Stores/Realtime — alles ohne UI (die kommt in Phase 3).

**Architecture:** Cloud-only (keine lokale SQLite-Spiegelung — Chat ist inhärent kollaborativ). Clients schreiben nur Rohdaten; Postgres-`SECURITY DEFINER`-Trigger erzeugen System-Nachrichten + Benachrichtigungen (kein Client darf `notifications` direkt schreiben). Gateways/Mapper/Stores spiegeln das bestehende `notes-module`-Muster; `messages`-Store ist **append-first** mit Keyset-Pagination, weil der Kanal unbegrenzt wächst.

**Tech Stack:** Supabase/Postgres, TypeScript (strict), Zustand, Vitest. Migration wird wie im Projekt üblich via Supabase Management-API/PAT bzw. SQL-Editor gegen Projekt `mqbjmquscjtytpjebosw` angewandt.

## Global Constraints

- **Tabellen-Konventionen** (aus `0017_notes_module_cloud.sql`): `workspace_id` **text**; `created_by`/User-IDs als **uuid**; text-Zeitstempel mit `default (now())::text`; `jsonb`-Arrays; Realtime via `replica identity full` + `alter publication supabase_realtime add table`.
- **RLS-Guard:** `is_workspace_member(workspace_id text)` (SECURITY DEFINER, existiert live). Wird mit dieser Migration **erstmals ins Repo** committet (Reproduzierbarkeit).
- **`ref_id` ist `text`** (polymorph, `accounts.id`/`activities.id` sind text). User/Actor/Author-Spalten sind `uuid` (immer Auth-User).
- **Aufgaben = `activities`-Zeilen mit `type='task'`**, Assignee = `activities.assignee` (text, hält Auth-uuid laut Phase-1-Verifikation).
- **Cloud-only:** Gateways geben im Nicht-Team-Modus (`!shared()`) leere Listen / No-Ops zurück — kein Tauri-`invoke`.
- **`tsc` sauber halten:** `npx tsc --noEmit -p tsconfig.json`. **Bestehende Tests grün** (`npx vitest run`). UI-Texte deutsch.
- **Supabase-Client:** `import { supabase } from '@/lib/supabase'`.

---

## Task 1: Migration `0019_team_chat.sql` — Schema, RLS, Indizes, Realtime

**Files:**
- Create: `supabase/migrations/0019_team_chat.sql`

**Interfaces:**
- Produces: Tabellen `public.messages`, `public.notifications`; committete Funktion `public.is_workspace_member(text)`.

- [ ] **Step 1: Migrationsdatei schreiben**

`supabase/migrations/0019_team_chat.sql`:
```sql
-- 0019_team_chat.sql — Team-Chat: messages + notifications (cloud-first, team-shared).
-- messages = der EINE Workspace-Kanal; notifications = Inbox pro Empfänger.
-- NICHT verwechseln mit der lokalen SQLite-Tabelle chat_messages (KORA-KI-Chat).

-- is_workspace_member: bislang nur live deployt — hier zur Reproduzierbarkeit committet.
-- (Idempotent; überschreibt die live-Definition mit identischer Logik.)
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
create policy "ws member read"   on public.messages for select using (is_workspace_member(workspace_id));
create policy "ws member insert" on public.messages for insert with check (is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "author update"    on public.messages for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "author delete"    on public.messages for delete using (created_by = auth.uid());

-- notifications: nur eigene lesen/ändern; KEIN Client-INSERT (nur Trigger via SECURITY DEFINER).
create policy "own read"   on public.notifications for select using (user_id = auth.uid());
create policy "own update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.messages      replica identity full;
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
```

- [ ] **Step 2: Migration anwenden**

Wende die Datei wie im Projekt üblich an (Supabase Management-API mit PAT bzw. SQL-Editor des Projekts `mqbjmquscjtytpjebosw`). Führe den gesamten SQL-Inhalt aus.

- [ ] **Step 3: Schema verifizieren (SQL)**

Im SQL-Editor ausführen:
```sql
select table_name from information_schema.tables where table_schema='public' and table_name in ('messages','notifications');
select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename in ('messages','notifications');
```
Erwartung: beide Tabellen gelistet; beide in der Realtime-Publikation.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_team_chat.sql
git commit -m "feat(chat): migration 0019 messages+notifications schema, RLS, realtime"
```

---

## Task 2: Migration `0019` — Fan-out-Trigger (Auffächern)

**Files:**
- Modify: `supabase/migrations/0019_team_chat.sql` (Trigger-Funktionen + Trigger anhängen)

**Interfaces:**
- Consumes: Tabellen aus Task 1; `public.activities` (`type`, `assignee`, `created_by`, `status`, `workspace_id`, `id`).
- Produces: Trigger `task_assignment_fanout` (on activities), `message_fanout` (on messages).

- [ ] **Step 1: Trigger-SQL an die Migration anhängen**

Am Ende von `supabase/migrations/0019_team_chat.sql` ergänzen:
```sql
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
```

- [ ] **Step 2: Trigger-SQL anwenden** (wie Task 1 Step 2).

- [ ] **Step 3: Verhalten verifizieren (SQL-Szenarien)**

Mit zwei Test-User-IDs `:u1` (actor) / `:u2` als Mitglieder eines Test-Workspace `:ws` (workspace_members müssen existieren; sonst RLS irrelevant, da Trigger SECURITY DEFINER ist). Im SQL-Editor (als `:u1` authentifiziert bzw. via service-role für die Inserts):
```sql
-- Setup: eine Test-Aufgabe (activities type=task) anlegen.
-- Szenario A: Zuweisung an u2 → erwartet 1 system-message + 1 'assigned'-notification für u2.
update public.activities set assignee = '<u2>' where id = '<task>';
select count(*) from public.messages where ref_id='<task>' and system_event='task_assigned';      -- = 1
select count(*) from public.notifications where ref_id='<task>' and type='assigned' and user_id='<u2>'; -- = 1

-- Szenario B: Self-Assign (assignee = actor) → erwartet System-Message, aber 0 notifications.
-- Szenario C: status -> 'done' → 1 'task_completed'-message + 1 'completed'-notification an Ersteller (≠ actor).
```
Erwartung: Zähler wie kommentiert. Notiere die Ergebnisse.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_team_chat.sql
git commit -m "feat(chat): migration 0019 fan-out triggers (assignment + message mention/comment)"
```

---

## Task 3: Domain-Typen

**Files:**
- Create: `src/types/message.types.ts`
- Create: `src/types/notification.types.ts`

**Interfaces:**
- Produces: `Message`, `CreateMessagePayload`, `MessageKind`, `SystemEvent`, `MessageRefType`; `Notification`, `NotificationType`, `NotificationRefType`.

- [ ] **Step 1: `src/types/message.types.ts`**
```ts
export type MessageKind = 'user' | 'system'
export type SystemEvent = 'task_assigned' | 'task_completed' | 'task_created'
export type MessageRefType = 'task' | 'account' | 'project'

export interface Message {
  id:          string
  workspaceId: string
  createdBy:   string
  kind:        MessageKind
  body:        string
  systemEvent: SystemEvent | null
  refType:     MessageRefType | null
  refId:       string | null
  visibility:  'internal' | 'client'
  mentions:    string[]
  createdAt:   string
  updatedAt:   string
  deletedAt:   string | null
}

export interface CreateMessagePayload {
  workspaceId: string
  createdBy:   string
  body:        string
  refType?:    MessageRefType | null
  refId?:      string | null
  mentions?:   string[]
}
```

- [ ] **Step 2: `src/types/notification.types.ts`**
```ts
export type NotificationType = 'assigned' | 'mention' | 'comment' | 'completed'
export type NotificationRefType = 'task' | 'message'

export interface Notification {
  id:          string
  workspaceId: string
  userId:      string
  type:        NotificationType
  actorId:     string
  refType:     NotificationRefType
  refId:       string
  messageId:   string | null
  readAt:      string | null
  createdAt:   string
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `npx tsc --noEmit -p tsconfig.json` → sauber.
```bash
git add src/types/message.types.ts src/types/notification.types.ts
git commit -m "feat(chat): domain types Message + Notification"
```

---

## Task 4: `messages` Mapper + Tests

**Files:**
- Create: `src/data/messages.mapper.ts`
- Test: `src/data/messages.mapper.test.ts`

**Interfaces:**
- Consumes: `Message` (Task 3).
- Produces: `messageRowToMessage(r: any): Message`.

- [ ] **Step 1: Failing test `src/data/messages.mapper.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { messageRowToMessage } from './messages.mapper'

const row = {
  id: 'm1', workspace_id: 'ws1', created_by: 'u1', kind: 'user',
  body: 'hallo', system_event: null, ref_type: 'task', ref_id: 't1',
  visibility: 'internal', mentions: ['u2'], created_at: 'T1', updated_at: 'T1', deleted_at: null,
}

describe('messageRowToMessage', () => {
  it('maps snake_case to camelCase', () => {
    const m = messageRowToMessage(row)
    expect(m.id).toBe('m1')
    expect(m.workspaceId).toBe('ws1')
    expect(m.createdBy).toBe('u1')
    expect(m.refType).toBe('task')
    expect(m.refId).toBe('t1')
  })
  it('mentions as jsonb array stays array', () => {
    expect(messageRowToMessage(row).mentions).toEqual(['u2'])
  })
  it('mentions as JSON string parses to array', () => {
    expect(messageRowToMessage({ ...row, mentions: '["u2","u3"]' }).mentions).toEqual(['u2', 'u3'])
  })
  it('null-ish fields default safely', () => {
    const m = messageRowToMessage({ ...row, system_event: null, ref_type: null, ref_id: null, visibility: null, deleted_at: null, body: null })
    expect(m.systemEvent).toBeNull()
    expect(m.refType).toBeNull()
    expect(m.visibility).toBe('internal')
    expect(m.body).toBe('')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/data/messages.mapper.test.ts`), Import nicht auflösbar.

- [ ] **Step 3: `src/data/messages.mapper.ts`**
```ts
import type { Message } from '@/types/message.types'

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

/** Supabase-`messages`-Zeile (mentions = jsonb) → Message. */
export function messageRowToMessage(r: any): Message {
  return {
    id:          r.id,
    workspaceId: r.workspace_id,
    createdBy:   r.created_by,
    kind:        r.kind,
    body:        r.body ?? '',
    systemEvent: r.system_event ?? null,
    refType:     r.ref_type ?? null,
    refId:       r.ref_id ?? null,
    visibility:  r.visibility ?? 'internal',
    mentions:    asStringArray(r.mentions),
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
    deletedAt:   r.deleted_at ?? null,
  }
}
```

- [ ] **Step 4: Run → PASS**. **Step 5: tsc sauber.** **Step 6: Commit**
```bash
git add src/data/messages.mapper.ts src/data/messages.mapper.test.ts
git commit -m "feat(chat): messages mapper + tests"
```

---

## Task 5: `notifications` Mapper + Tests

**Files:**
- Create: `src/data/notifications.mapper.ts`
- Test: `src/data/notifications.mapper.test.ts`

**Interfaces:**
- Consumes: `Notification` (Task 3).
- Produces: `notificationRowToNotification(r: any): Notification`.

- [ ] **Step 1: Failing test `src/data/notifications.mapper.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { notificationRowToNotification } from './notifications.mapper'

const row = {
  id: 'n1', workspace_id: 'ws1', user_id: 'u2', type: 'assigned',
  actor_id: 'u1', ref_type: 'task', ref_id: 't1', message_id: 'm1',
  read_at: null, created_at: 'T1',
}

describe('notificationRowToNotification', () => {
  it('maps snake_case to camelCase', () => {
    const n = notificationRowToNotification(row)
    expect(n.id).toBe('n1')
    expect(n.userId).toBe('u2')
    expect(n.actorId).toBe('u1')
    expect(n.type).toBe('assigned')
    expect(n.messageId).toBe('m1')
  })
  it('unread when read_at null', () => {
    expect(notificationRowToNotification(row).readAt).toBeNull()
  })
  it('null message_id defaults to null', () => {
    expect(notificationRowToNotification({ ...row, message_id: null }).messageId).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `src/data/notifications.mapper.ts`**
```ts
import type { Notification } from '@/types/notification.types'

/** Supabase-`notifications`-Zeile → Notification. */
export function notificationRowToNotification(r: any): Notification {
  return {
    id:          r.id,
    workspaceId: r.workspace_id,
    userId:      r.user_id,
    type:        r.type,
    actorId:     r.actor_id,
    refType:     r.ref_type,
    refId:       r.ref_id,
    messageId:   r.message_id ?? null,
    readAt:      r.read_at ?? null,
    createdAt:   r.created_at,
  }
}
```

- [ ] **Step 4: Run → PASS. Step 5: tsc. Step 6: Commit**
```bash
git add src/data/notifications.mapper.ts src/data/notifications.mapper.test.ts
git commit -m "feat(chat): notifications mapper + tests"
```

---

## Task 6: `messages` Gateway (Supabase-only, shared-guarded)

**Files:**
- Create: `src/data/messages.gateway.ts`

**Interfaces:**
- Consumes: `supabase`, `messageRowToMessage`, `Message`/`CreateMessagePayload`, `useWorkspaceStore`.
- Produces: `MessagesGateway` mit `listRecent`, `listBefore`, `create`, `softDelete`.

- [ ] **Step 1: `src/data/messages.gateway.ts`**
```ts
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { messageRowToMessage } from './messages.mapper'
import type { Message, CreateMessagePayload } from '@/types/message.types'

// Team-/Cloud-Modus-Guard — identisch zu notes-module.gateway.ts (lokaler Helper, nicht exportiert).
function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }

function fail(error: { message: string }): never { throw new Error(error.message) }

const PAGE = 50

export const MessagesGateway = {
  /** Neueste Nachrichten, chronologisch aufsteigend zurückgegeben. Cloud-only. */
  async listRecent(workspaceId: string, limit = PAGE): Promise<Message[]> {
    if (!shared()) return []
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail(error)
    return (data ?? []).map(messageRowToMessage).reverse()
  },

  /** Ältere Seite (Keyset) vor einem created_at; chronologisch aufsteigend. */
  async listBefore(workspaceId: string, beforeCreatedAt: string, limit = PAGE): Promise<Message[]> {
    if (!shared()) return []
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .lt('created_at', beforeCreatedAt)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail(error)
    return (data ?? []).map(messageRowToMessage).reverse()
  },

  /** User-Nachricht senden. Trigger fächert Notifications auf. */
  async create(payload: CreateMessagePayload): Promise<Message> {
    const row = {
      id: crypto.randomUUID(),
      workspace_id: payload.workspaceId,
      created_by:   payload.createdBy,
      kind:         'user' as const,
      body:         payload.body,
      ref_type:     payload.refType ?? null,
      ref_id:       payload.refId ?? null,
      mentions:     payload.mentions ?? [],
    }
    const { data, error } = await supabase.from('messages').insert(row).select('*').single()
    if (error) fail(error)
    return messageRowToMessage(data)
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) fail(error)
  },
}
```
- [ ] **Step 2: tsc sauber** (`npx tsc --noEmit -p tsconfig.json`).

- [ ] **Step 3: Commit**
```bash
git add src/data/messages.gateway.ts
git commit -m "feat(chat): messages gateway (supabase-only, keyset pagination)"
```

---

## Task 7: `notifications` Gateway

**Files:**
- Create: `src/data/notifications.gateway.ts`

**Interfaces:**
- Consumes: `supabase`, `notificationRowToNotification`, `Notification`, `useWorkspaceStore`.
- Produces: `NotificationsGateway` mit `listForUser`, `markRead`, `markAllRead`.

- [ ] **Step 1: `src/data/notifications.gateway.ts`**
```ts
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { notificationRowToNotification } from './notifications.mapper'
import type { Notification } from '@/types/notification.types'

// Team-/Cloud-Modus-Guard — identisch zu notes-module.gateway.ts (lokaler Helper).
function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }

function fail(error: { message: string }): never { throw new Error(error.message) }

export const NotificationsGateway = {
  /** Eigene Benachrichtigungen, neueste zuerst. Cloud-only. */
  async listForUser(userId: string, limit = 100): Promise<Notification[]> {
    if (!shared()) return []
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail(error)
    return (data ?? []).map(notificationRowToNotification)
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) fail(error)
  },

  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
    if (error) fail(error)
  },
}
```
- [ ] **Step 2: tsc sauber. Step 3: Commit**
```bash
git add src/data/notifications.gateway.ts
git commit -m "feat(chat): notifications gateway"
```

---

## Task 8: `messages` Store (append-first + Pagination) + Tests

**Files:**
- Create: `src/store/messages.store.ts`
- Test: `src/store/messages.store.test.ts`

**Interfaces:**
- Consumes: `MessagesGateway`, `Message`, `CreateMessagePayload`.
- Produces: `useMessagesStore` mit State `{ messages, loading, hasMore }` und Aktionen `loadRecent`, `loadMore`, `appendRealtime`, `send`.

- [ ] **Step 1: Failing test `src/store/messages.store.test.ts`**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useMessagesStore } from './messages.store'
import type { Message } from '@/types/message.types'

const mk = (id: string, createdAt: string): Message => ({
  id, workspaceId: 'ws1', createdBy: 'u1', kind: 'user', body: id,
  systemEvent: null, refType: null, refId: null, visibility: 'internal',
  mentions: [], createdAt, updatedAt: createdAt, deletedAt: null,
})

describe('messages.store', () => {
  beforeEach(() => useMessagesStore.setState({ messages: [], loading: false, hasMore: true }))

  it('appendRealtime adds a new message at the end', () => {
    useMessagesStore.setState({ messages: [mk('a', 'T1')] })
    useMessagesStore.getState().appendRealtime(mk('b', 'T2'))
    expect(useMessagesStore.getState().messages.map(m => m.id)).toEqual(['a', 'b'])
  })

  it('appendRealtime ignores duplicates by id', () => {
    useMessagesStore.setState({ messages: [mk('a', 'T1')] })
    useMessagesStore.getState().appendRealtime(mk('a', 'T1'))
    expect(useMessagesStore.getState().messages).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `src/store/messages.store.ts`**
```ts
import { create } from 'zustand'
import { MessagesGateway } from '@/data/messages.gateway'
import { log } from '@/lib/logger'
import type { Message, CreateMessagePayload } from '@/types/message.types'

interface MessagesState {
  messages: Message[]
  loading:  boolean
  hasMore:  boolean
  loadRecent:     (workspaceId: string) => Promise<void>
  loadMore:       (workspaceId: string) => Promise<void>
  appendRealtime: (msg: Message) => void
  send:           (payload: CreateMessagePayload) => Promise<Message>
}

const PAGE = 50

export const useMessagesStore = create<MessagesState>()((set, get) => ({
  messages: [],
  loading:  false,
  hasMore:  true,

  loadRecent: async (workspaceId) => {
    set({ loading: true })
    try {
      const msgs = await MessagesGateway.listRecent(workspaceId, PAGE)
      set({ messages: msgs, loading: false, hasMore: msgs.length === PAGE })
    } catch (err) {
      log.error('Failed to load messages', { err })
      set({ loading: false })
    }
  },

  loadMore: async (workspaceId) => {
    const { messages, hasMore } = get()
    if (!hasMore || messages.length === 0) return
    const oldest = messages[0].createdAt
    try {
      const older = await MessagesGateway.listBefore(workspaceId, oldest, PAGE)
      set(s => ({ messages: [...older, ...s.messages], hasMore: older.length === PAGE }))
    } catch (err) {
      log.error('Failed to load older messages', { err })
    }
  },

  appendRealtime: (msg) => set(s =>
    s.messages.some(m => m.id === msg.id) ? s : { messages: [...s.messages, msg] }
  ),

  send: async (payload) => {
    const msg = await MessagesGateway.create(payload)
    get().appendRealtime(msg)
    return msg
  },
}))
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber. Step 6: Commit**
```bash
git add src/store/messages.store.ts src/store/messages.store.test.ts
git commit -m "feat(chat): messages store (append-first, pagination) + tests"
```

---

## Task 9: `notifications` Store (unread + markRead) + Tests

**Files:**
- Create: `src/store/notifications.store.ts`
- Test: `src/store/notifications.store.test.ts`

**Interfaces:**
- Consumes: `NotificationsGateway`, `Notification`.
- Produces: `useNotificationsStore` mit State `{ notifications }`, Selektor-Aktion `unreadCount()`, Aktionen `load`, `upsertRealtime`, `markRead`, `markAllRead`.

- [ ] **Step 1: Failing test `src/store/notifications.store.test.ts`**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationsStore } from './notifications.store'
import type { Notification } from '@/types/notification.types'

const mk = (id: string, readAt: string | null = null): Notification => ({
  id, workspaceId: 'ws1', userId: 'u2', type: 'mention', actorId: 'u1',
  refType: 'message', refId: 'm1', messageId: 'm1', readAt, createdAt: 'T1',
})

describe('notifications.store', () => {
  beforeEach(() => useNotificationsStore.setState({ notifications: [] }))

  it('unreadCount counts only unread', () => {
    useNotificationsStore.setState({ notifications: [mk('a'), mk('b', 'T2'), mk('c')] })
    expect(useNotificationsStore.getState().unreadCount()).toBe(2)
  })

  it('upsertRealtime prepends new, replaces by id', () => {
    useNotificationsStore.setState({ notifications: [mk('a')] })
    useNotificationsStore.getState().upsertRealtime(mk('b'))
    expect(useNotificationsStore.getState().notifications.map(n => n.id)).toEqual(['b', 'a'])
    useNotificationsStore.getState().upsertRealtime(mk('a', 'T9'))
    expect(useNotificationsStore.getState().notifications.find(n => n.id === 'a')?.readAt).toBe('T9')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `src/store/notifications.store.ts`**
```ts
import { create } from 'zustand'
import { NotificationsGateway } from '@/data/notifications.gateway'
import { log } from '@/lib/logger'
import type { Notification } from '@/types/notification.types'

interface NotificationsState {
  notifications: Notification[]
  load:           (userId: string) => Promise<void>
  upsertRealtime: (n: Notification) => void
  markRead:       (id: string) => Promise<void>
  markAllRead:    (userId: string) => Promise<void>
  unreadCount:    () => number
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],

  load: async (userId) => {
    try {
      const list = await NotificationsGateway.listForUser(userId)
      set({ notifications: list })
    } catch (err) {
      log.error('Failed to load notifications', { err })
    }
  },

  upsertRealtime: (n) => set(s => {
    const without = s.notifications.filter(x => x.id !== n.id)
    return { notifications: [n, ...without] }
  }),

  markRead: async (id) => {
    const stamp = new Date().toISOString()
    set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, readAt: stamp } : n) }))
    try { await NotificationsGateway.markRead(id) }
    catch (err) { log.error('Failed to mark notification read', { err }) }
  },

  markAllRead: async (userId) => {
    const stamp = new Date().toISOString()
    set(s => ({ notifications: s.notifications.map(n => n.readAt ? n : { ...n, readAt: stamp }) }))
    try { await NotificationsGateway.markAllRead(userId) }
    catch (err) { log.error('Failed to mark all read', { err }) }
  },

  unreadCount: () => get().notifications.filter(n => !n.readAt).length,
}))
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber. Step 6: Commit**
```bash
git add src/store/notifications.store.ts src/store/notifications.store.test.ts
git commit -m "feat(chat): notifications store (unread, markRead) + tests"
```

---

## Task 10: Realtime-Subscriptions

**Files:**
- Modify: `src/core/sync/useWorkspaceRealtime.ts`

**Interfaces:**
- Consumes: `useMessagesStore`, `useNotificationsStore`, `messageRowToMessage`, `notificationRowToNotification`, aktive `workspaceId`, aktuelle `userId`.

- [ ] **Step 1: Imports ergänzen**

Oben in `src/core/sync/useWorkspaceRealtime.ts`:
```ts
import { useMessagesStore } from '@/store/messages.store'
import { useNotificationsStore } from '@/store/notifications.store'
import { messageRowToMessage } from '@/data/messages.mapper'
import { notificationRowToNotification } from '@/data/notifications.mapper'
import { useAuthStore } from '@/store/auth.store'
```

- [ ] **Step 2: Zwei Subscriptions ergänzen**

Im selben `.channel(...)`-Aufbau, in dem die bestehenden `note_entries`-Subscriptions hängen (siehe das vorhandene `.on('postgres_changes', { ... table: 'note_entries' ... })`-Muster), zwei weitere `.on(...)`-Blöcke einfügen — VOR dem abschließenden `.subscribe()`:
```ts
.on(
  'postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'messages', filter: `workspace_id=eq.${activeWorkspaceId}` },
  (payload) => { useMessagesStore.getState().appendRealtime(messageRowToMessage(payload.new)) },
)
.on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${useAuthStore.getState().user?.id ?? ''}` },
  (payload) => {
    if (payload.eventType === 'DELETE') return
    useNotificationsStore.getState().upsertRealtime(notificationRowToNotification(payload.new))
  },
)
```
Hinweis: Der `messages`-Filter ist workspace-scoped (wie `note_entries`); der `notifications`-Filter ist **user-scoped** (`user_id=eq.<ich>`), da `postgres_changes` nur EINEN Filter erlaubt und jeder nur seine eigenen braucht (RLS als Backstop). `activeWorkspaceId` ist die im umgebenden Code bereits verwendete Variable.

- [ ] **Step 3: tsc sauber** (`npx tsc --noEmit -p tsconfig.json`).

- [ ] **Step 4: Bestehende Tests grün** (`npx vitest run`).

- [ ] **Step 5: Commit**
```bash
git add src/core/sync/useWorkspaceRealtime.ts
git commit -m "feat(chat): realtime subscriptions for messages + notifications"
```

---

## Abschluss-Verifikation Phase 2

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → alle grün (inkl. neuer mapper/store-Tests).
- [ ] Migration `0019` angewandt; SQL-Szenarien A/B/C (Task 2 Step 3) bestätigt.
- [ ] Manuell (nach Phase 3 / mit zwei Test-Logins): Zuweisung erzeugt System-Nachricht + Benachrichtigung beim Empfänger in Echtzeit.

## Bewusst NICHT in Phase 2 (kommt in Phase 3)

- Jegliche UI: Team-Chat (Vollansicht + Drawer), Inbox-Route, Glocke-Vorschau, Sprung-Verhalten, Mention-Erweiterung (Mitglieder + Aufgaben), Mitglieder-Picker an der Aufgabe.
- `muted_refs`-Stummschaltung (braucht eine Pro-User-Settings-Zeile) — bewusst auf Phase 3 verschoben, damit Phase 2 keinen neuen Settings-Store erfindet. Der mention/comment-Split (Hauptlärm-Hebel) ist bereits im Trigger.
- Inbox-Gruppierung (Typ→Kunde) — reine Render-Logik, Phase 3.
- `task_created`-System-Event (im Enum reserviert, aber noch kein Trigger-Pfad — Phase 3 entscheidet, ob „neue Aufgabe" gepostet wird).
