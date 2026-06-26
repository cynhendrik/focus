# Team-Chat — Phase 3: Oberflächen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den in Phase 2 gebauten Datenmotor (`messages`/`notifications`, Trigger, Realtime, Stores) in drei Oberflächen sichtbar machen: Team-Chat (Vollansicht + Mini-Drawer), Inbox (Push/Triage) und „Mein Tag" (Zuweisen) — inklusive Mention-Erweiterung (Mitglieder + Aufgaben), Sprung-Verhalten und Glocke-als-Vorschau.

**Architecture:** Reine Client-/UI-Schicht auf den bestehenden Stores (`useMessagesStore`, `useNotificationsStore`). Vollansicht und Drawer teilen sich dieselben Komponenten (`MessageList`, `ChatComposer`) — nur der Container unterscheidet sich. Mentions und der Assignee-Picker brauchen **Klarnamen** der Mitglieder; die gibt es heute clientseitig nicht (kein `profiles`-Table) — deshalb schließt **Task 1** diese Lücke mit einer schlanken `profiles`-Tabelle (Selbst-Upsert beim Login, co-member-lesbar via RLS). Alle Sprünge laufen über das bestehende `ui.store`-Navigationsmodell (`setAppView`, `openCustomerAt`) plus ein neues Feld `pendingScrollMessageId` für den Inbox→Nachricht-Sprung.

**Tech Stack:** TypeScript (strict), React, Zustand, Supabase/Postgres, Vitest. Tests kolokiert (`*.test.ts`), Lauf via `npx vitest run`, Typecheck `npx tsc --noEmit -p tsconfig.json`. Migration gegen Projekt `mqbjmquscjtytpjebosw` (Supabase Management-API/PAT bzw. SQL-Editor).

## Global Constraints

- **Phase 2 ist Voraussetzung und bereits implementiert:** `src/types/message.types.ts`, `src/types/notification.types.ts`, `src/data/messages.{gateway,mapper}.ts`, `src/data/notifications.{gateway,mapper}.ts`, `src/store/messages.store.ts` (`messages`, `loading`, `hasMore`, `loadRecent`, `loadMore`, `appendRealtime`, `send`), `src/store/notifications.store.ts` (`notifications`, `load`, `upsertRealtime`, `markRead`, `markAllRead`, `unreadCount()`), und die zwei Realtime-Subscriptions in `src/core/sync/useWorkspaceRealtime.ts` existieren. **Nicht neu bauen — nur konsumieren/erweitern.**
- **Cloud-only / shared-guarded:** Chat-UI ist nur im geteilten Workspace sinnvoll. Gateways geben im Solo-Modus leere Listen zurück (bestehend). UI zeigt im Solo-Modus einen Leerzustand, **niemals** einen Crash.
- **`workspace_members.user_id` ist `text`**, `auth.uid()` wird als `auth.uid()::text` verglichen (siehe `is_workspace_member`). `profiles.id`/`messages.created_by`/`notifications.user_id`/`activities.assignee` halten Auth-`uuid`-Strings.
- **Aufgaben = `activities`-Zeilen mit `type='task'`**, Assignee = `Todo.assignee` (`src/types/todo.types.ts:29`). Setzen via `useTodosStore.upsert({ ...todoToPayload, assignee })`.
- **`tsc` sauber halten** und **bestehende Tests grün** (Stand: 476+ grün). UI-Texte deutsch.
- **Auth-Nutzer-ID:** `useAuthStore.getState().user?.id`; Anzeigename des eigenen Users: `user?.user_metadata?.full_name` → sonst `user?.email`.
- **Supabase-Client:** `import { supabase } from '@/lib/supabase'`. **Logger:** `import { log } from '@/lib/logger'`. **UUID:** `crypto.randomUUID()`.
- **Positionierung von Overlays:** kein `will-change: transform` auf Route-Containern (siehe `RouteSwitch.tsx`-Kommentar) — Popover/Drawer mit `position: fixed`/normalem Flow, nicht in transformierten Eltern.

---

## Task 1: Migration `0020_member_profiles.sql` — Klarnamen-Verzeichnis

**Files:**
- Create: `supabase/migrations/0020_member_profiles.sql`

**Interfaces:**
- Produces: Tabelle `public.profiles (id uuid pk, display_name text, email text, updated_at text)` mit RLS (co-member-lesbar, nur eigene schreibbar).

**Warum:** Mentions (`@Person`) und der Assignee-Picker brauchen Anzeigenamen anderer Mitglieder. `auth.users.raw_user_meta_data` ist clientseitig nicht lesbar; es existiert kein `profiles`-Table. Diese Migration schließt die Lücke nach dem Standard-Supabase-Muster (Selbst-Upsert + co-member-RLS).

- [ ] **Step 1: Migrationsdatei schreiben**

`supabase/migrations/0020_member_profiles.sql`:
```sql
-- 0020_member_profiles.sql — Klarnamen-Verzeichnis für Mentions + Assignee-Picker.
-- Jeder User upsertet beim Login seine EIGENE Zeile (display_name, email).
-- Lesen darf jeder, der mit dem Profil-Inhaber mindestens einen Workspace teilt.

create table if not exists public.profiles (
  id           uuid primary key,                 -- = auth.uid()
  display_name text not null default '',
  email        text,
  updated_at   text not null default (now())::text
);

alter table public.profiles enable row level security;

-- Lesen: eigenes Profil ODER ein Profil, mit dessen Inhaber ich einen Workspace teile.
create policy "profiles read co-members" on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members m_self
    join public.workspace_members m_other
      on m_self.workspace_id = m_other.workspace_id
    where m_self.user_id  = auth.uid()::text
      and m_other.user_id = public.profiles.id::text
  )
);

-- Schreiben: ausschließlich die eigene Zeile.
create policy "profiles insert own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
```

- [ ] **Step 2: Migration anwenden**

Wende den gesamten SQL-Inhalt wie im Projekt üblich an (Supabase Management-API mit PAT bzw. SQL-Editor des Projekts `mqbjmquscjtytpjebosw`).

- [ ] **Step 3: Schema verifizieren (SQL)**

Im SQL-Editor:
```sql
select table_name from information_schema.tables where table_schema='public' and table_name='profiles';
select polname from pg_policies where schemaname='public' and tablename='profiles';
```
Erwartung: `profiles` gelistet; drei Policies (`profiles read co-members`, `profiles insert own`, `profiles update own`).

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/0020_member_profiles.sql
git commit -m "feat(chat): migration 0020 member profiles (display names, co-member RLS)"
```

---

## Task 2: Profiles-Gateway + Mapper + Tests

**Files:**
- Create: `src/types/profile.types.ts`
- Create: `src/data/profiles.mapper.ts`
- Test: `src/data/profiles.mapper.test.ts`
- Create: `src/data/profiles.gateway.ts`

**Interfaces:**
- Produces: `MemberProfile { id, displayName, email }`; `profileRowToProfile(r): MemberProfile`; `ProfilesGateway.ensureSelf(input)`, `ProfilesGateway.listByIds(ids)`.

- [ ] **Step 1: `src/types/profile.types.ts`**
```ts
export interface MemberProfile {
  id:          string
  displayName: string
  email:       string | null
}
```

- [ ] **Step 2: Failing test `src/data/profiles.mapper.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { profileRowToProfile } from './profiles.mapper'

describe('profileRowToProfile', () => {
  it('maps snake_case to camelCase', () => {
    const p = profileRowToProfile({ id: 'u1', display_name: 'Max Mustermann', email: 'max@x.de', updated_at: 'T1' })
    expect(p).toEqual({ id: 'u1', displayName: 'Max Mustermann', email: 'max@x.de' })
  })
  it('null-ish display_name / email default safely', () => {
    const p = profileRowToProfile({ id: 'u1', display_name: null, email: null })
    expect(p.displayName).toBe('')
    expect(p.email).toBeNull()
  })
})
```

- [ ] **Step 3: Run → FAIL** (`npx vitest run src/data/profiles.mapper.test.ts`).

- [ ] **Step 4: `src/data/profiles.mapper.ts`**
```ts
import type { MemberProfile } from '@/types/profile.types'

/** Supabase-`profiles`-Zeile → MemberProfile. */
export function profileRowToProfile(r: any): MemberProfile {
  return {
    id:          r.id,
    displayName: r.display_name ?? '',
    email:       r.email ?? null,
  }
}
```

- [ ] **Step 5: Run → PASS.**

- [ ] **Step 6: `src/data/profiles.gateway.ts`**
```ts
import { supabase } from '@/lib/supabase'
import { profileRowToProfile } from './profiles.mapper'
import type { MemberProfile } from '@/types/profile.types'

function fail(error: { message: string }): never { throw new Error(error.message) }

export const ProfilesGateway = {
  /** Eigene Profilzeile anlegen/aktualisieren (beim Login). Idempotent (upsert auf pk). */
  async ensureSelf(input: { id: string; displayName: string; email: string | null }): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { id: input.id, display_name: input.displayName, email: input.email, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      )
    if (error) fail(error)
  },

  /** Profile zu einer Menge von User-IDs laden (nur co-member-lesbare kommen via RLS zurück). */
  async listByIds(ids: string[]): Promise<MemberProfile[]> {
    if (ids.length === 0) return []
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', ids)
    if (error) fail(error)
    return (data ?? []).map(profileRowToProfile)
  },
}
```

- [ ] **Step 7: tsc sauber** (`npx tsc --noEmit -p tsconfig.json`).

- [ ] **Step 8: Commit**
```bash
git add src/types/profile.types.ts src/data/profiles.mapper.ts src/data/profiles.mapper.test.ts src/data/profiles.gateway.ts
git commit -m "feat(chat): profiles gateway + mapper (member display names)"
```

---

## Task 3: Members-Store (Klarnamen-Map) + Tests

**Files:**
- Create: `src/store/members.store.ts`
- Test: `src/store/members.store.test.ts`

**Interfaces:**
- Consumes: `ProfilesGateway`, `WorkspaceMembersGateway` (`src/data/workspace-members.gateway.ts`, `list(workspaceId) → { userId, role, capabilities }[]`), `useAuthStore`, `MemberProfile`.
- Produces: `useMembersStore` mit State `{ profiles: Record<string, MemberProfile>, memberIds: string[] }`, Aktionen `ensureSelf()`, `load(workspaceId)`, Selektor `nameOf(userId) → string`, `members() → MemberProfile[]`.

- [ ] **Step 1: Failing test `src/store/members.store.test.ts`**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useMembersStore } from './members.store'

describe('members.store', () => {
  beforeEach(() => useMembersStore.setState({ profiles: {}, memberIds: [] }))

  it('nameOf returns displayName when known', () => {
    useMembersStore.setState({ profiles: { u1: { id: 'u1', displayName: 'Max', email: null } }, memberIds: ['u1'] })
    expect(useMembersStore.getState().nameOf('u1')).toBe('Max')
  })

  it('nameOf falls back to a short id when unknown', () => {
    expect(useMembersStore.getState().nameOf('abcdef12-3456')).toBe('Mitglied abcdef12')
  })

  it('members() lists known profiles in memberIds order', () => {
    useMembersStore.setState({
      profiles: { u1: { id: 'u1', displayName: 'Max', email: null }, u2: { id: 'u2', displayName: 'Lukas', email: null } },
      memberIds: ['u2', 'u1'],
    })
    expect(useMembersStore.getState().members().map(m => m.displayName)).toEqual(['Lukas', 'Max'])
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `src/store/members.store.ts`**
```ts
import { create } from 'zustand'
import { ProfilesGateway } from '@/data/profiles.gateway'
import { WorkspaceMembersGateway } from '@/data/workspace-members.gateway'
import { useAuthStore } from '@/store/auth.store'
import { log } from '@/lib/logger'
import type { MemberProfile } from '@/types/profile.types'

interface MembersState {
  profiles:  Record<string, MemberProfile>
  memberIds: string[]
  ensureSelf: () => Promise<void>
  load:       (workspaceId: string) => Promise<void>
  nameOf:     (userId: string) => string
  members:    () => MemberProfile[]
}

export const useMembersStore = create<MembersState>()((set, get) => ({
  profiles: {},
  memberIds: [],

  ensureSelf: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    const displayName =
      (user.user_metadata?.full_name as string | undefined)?.trim()
      || user.email?.split('@')[0]
      || 'Nutzer'
    try {
      await ProfilesGateway.ensureSelf({ id: user.id, displayName, email: user.email ?? null })
    } catch (err) {
      log.error('Failed to ensure own profile', { err })
    }
  },

  load: async (workspaceId) => {
    try {
      const members = await WorkspaceMembersGateway.list(workspaceId)
      const ids = members.map(m => m.userId)
      const list = await ProfilesGateway.listByIds(ids)
      const byId: Record<string, MemberProfile> = {}
      for (const p of list) byId[p.id] = p
      set({ profiles: byId, memberIds: ids })
    } catch (err) {
      log.error('Failed to load members', { err })
    }
  },

  // Fallback hält die UI lesbar, falls ein Profil (noch) nicht gelesen werden kann.
  nameOf: (userId) => get().profiles[userId]?.displayName || `Mitglied ${userId.slice(0, 8)}`,

  members: () => {
    const { profiles, memberIds } = get()
    return memberIds.map(id => profiles[id]).filter(Boolean) as MemberProfile[]
  },
}))
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber.**

- [ ] **Step 6: Members beim Workspace-Wechsel laden + eigenes Profil sichern**

In `src/App.tsx` den `useMembersStore` importieren und in der bestehenden „Welle 2"-`ric(...)`-Liste (nach `loadLeads(activeWorkspaceId)`, vor `useVertraege...`) ergänzen. Import oben bei den Stores:
```ts
import { useMembersStore } from '@/store/members.store'
```
Im `ric(() => { ... })`-Block (innerhalb des `useEffect` mit dep `activeWorkspaceId`):
```ts
      useMembersStore.getState().ensureSelf()
      useMembersStore.getState().load(activeWorkspaceId)
```

- [ ] **Step 7: tsc sauber. Bestehende Tests grün** (`npx vitest run`). **Commit**
```bash
git add src/store/members.store.ts src/store/members.store.test.ts src/App.tsx
git commit -m "feat(chat): members store (display-name map) + load on workspace switch"
```

---

## Task 4: `ui.store` — Drawer-State + neue Views + Scroll-Ziel

**Files:**
- Modify: `src/store/ui.store.ts`

**Interfaces:**
- Produces: `AppView` um `'team'` erweitert (`'inbox'` existiert bereits); neue State-Felder `chatDrawerOpen: boolean`, `pendingScrollMessageId: string | null`; Aktionen `toggleChatDrawer()`, `setChatDrawerOpen(open)`, `setPendingScrollMessageId(id)`.

- [ ] **Step 1: `AppView` um `'team'` erweitern**

In `src/store/ui.store.ts`, im `AppView`-Union (`:76-89`) die Zeile mit `'notes' | 'inbox' | 'sales'` ändern zu:
```ts
  | 'notes'     | 'inbox'     | 'sales'     | 'team'
```

- [ ] **Step 2: Interface-Felder ergänzen**

Im `interface UiState` (nach `helpOpen: boolean`, `:101`) ergänzen:
```ts
  chatDrawerOpen: boolean
  /** Nachricht, zu der die MessageList nach einem Inbox-Sprung scrollen + highlighten soll. */
  pendingScrollMessageId: string | null
```
Und bei den Aktionen (nach `setHelpOpen: (open: boolean) => void`, `:122`):
```ts
  toggleChatDrawer: () => void
  setChatDrawerOpen: (open: boolean) => void
  setPendingScrollMessageId: (id: string | null) => void
```

- [ ] **Step 3: Initialwerte + Implementierungen**

Im `create(...)`-Initialobjekt (nach `helpOpen: false,`, `:140`):
```ts
      chatDrawerOpen: false,
      pendingScrollMessageId: null,
```
Bei den Aktionen (nach `setHelpOpen: (open) => set({ helpOpen: open }),`, `:186`):
```ts
      toggleChatDrawer: () =>
        set(s => ({ chatDrawerOpen: !s.chatDrawerOpen })),

      setChatDrawerOpen: (open) =>
        set({ chatDrawerOpen: open }),

      setPendingScrollMessageId: (id) =>
        set({ pendingScrollMessageId: id }),
```

- [ ] **Step 4: Drawer-Zustand persistieren**

Im `partialize`-Objekt (`:220-231`) eine Zeile ergänzen (Drawer-Vorliebe übersteht Reloads):
```ts
        chatDrawerOpen: s.chatDrawerOpen,
```
(`pendingScrollMessageId` NICHT persistieren — transient.)

- [ ] **Step 5: tsc sauber. Bestehende Tests grün. Commit**
```bash
git add src/store/ui.store.ts
git commit -m "feat(chat): ui.store team view + chat drawer + scroll-target state"
```

---

## Task 5: Mention-Kandidaten-Builder + Resolver (Mitglieder + Aufgaben) + Tests

**Files:**
- Create: `src/lib/chat/mentions.ts`
- Test: `src/lib/chat/mentions.test.ts`

**Interfaces:**
- Consumes: `MemberProfile`, `Todo`.
- Produces:
  - `ChatMentionCandidate { kind: 'member' | 'task'; id: string; name: string; sub?: string }`
  - `buildMentionCandidates(members: MemberProfile[], todos: Pick<Todo,'id'|'title'|'status'>[]): ChatMentionCandidate[]`
  - `markerFor(c: ChatMentionCandidate): string` (z. B. `@Max`, `@Logo-finalisieren`)
  - `resolveComposed(markers: ResolvedMarker[]): { mentions: string[]; ref: { refType: 'task'; refId: string } | null }`
  - `ResolvedMarker { kind: 'member' | 'task'; id: string; marker: string }`

- [ ] **Step 1: Failing test `src/lib/chat/mentions.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { buildMentionCandidates, markerFor, resolveComposed } from './mentions'

describe('buildMentionCandidates', () => {
  it('lists members first, then open tasks; skips done tasks', () => {
    const cands = buildMentionCandidates(
      [{ id: 'u1', displayName: 'Max Mustermann', email: null }],
      [{ id: 't1', title: 'Logo finalisieren', status: 'open' }, { id: 't2', title: 'Alt', status: 'done' }],
    )
    expect(cands.map(c => c.kind)).toEqual(['member', 'task'])
    expect(cands[0]).toMatchObject({ kind: 'member', id: 'u1', name: 'Max Mustermann' })
    expect(cands[1]).toMatchObject({ kind: 'task', id: 't1', name: 'Logo finalisieren' })
  })
})

describe('markerFor', () => {
  it('member marker = @firstname', () => {
    expect(markerFor({ kind: 'member', id: 'u1', name: 'Max Mustermann' })).toBe('@Max')
  })
  it('task marker = @slug (spaces → dashes, truncated)', () => {
    expect(markerFor({ kind: 'task', id: 't1', name: 'Logo finalisieren' })).toBe('@Logo-finalisieren')
  })
})

describe('resolveComposed', () => {
  it('collects member ids into mentions and first task into ref', () => {
    const out = resolveComposed([
      { kind: 'member', id: 'u1', marker: '@Max' },
      { kind: 'member', id: 'u2', marker: '@Lukas' },
      { kind: 'task', id: 't1', marker: '@Logo-finalisieren' },
    ])
    expect(out.mentions).toEqual(['u1', 'u2'])
    expect(out.ref).toEqual({ refType: 'task', refId: 't1' })
  })
  it('no task → ref null; dedupes member ids', () => {
    const out = resolveComposed([
      { kind: 'member', id: 'u1', marker: '@Max' },
      { kind: 'member', id: 'u1', marker: '@Max' },
    ])
    expect(out.mentions).toEqual(['u1'])
    expect(out.ref).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `src/lib/chat/mentions.ts`**
```ts
import type { MemberProfile } from '@/types/profile.types'
import type { Todo } from '@/types/todo.types'

export interface ChatMentionCandidate {
  kind: 'member' | 'task'
  id:   string
  name: string
  sub?: string
}

export interface ResolvedMarker {
  kind:   'member' | 'task'
  id:     string
  marker: string
}

/** Mitglieder zuerst (das laute Signal), dann offene Aufgaben. Erledigte Aufgaben fallen raus. */
export function buildMentionCandidates(
  members: MemberProfile[],
  todos: Pick<Todo, 'id' | 'title' | 'status'>[],
): ChatMentionCandidate[] {
  const memberCands: ChatMentionCandidate[] = members.map(m => ({
    kind: 'member', id: m.id, name: m.displayName, sub: m.email ?? undefined,
  }))
  const taskCands: ChatMentionCandidate[] = todos
    .filter(t => t.status !== 'done')
    .map(t => ({ kind: 'task', id: t.id, name: t.title, sub: 'Aufgabe' }))
  return [...memberCands, ...taskCands]
}

/** Anzeige-Marker. Mitglied = @Vorname; Aufgabe = @Slug (gekürzt, Leerzeichen→Bindestrich). */
export function markerFor(c: ChatMentionCandidate): string {
  if (c.kind === 'member') return `@${c.name.split(' ')[0]}`
  const slug = c.name.trim().split(/\s+/).slice(0, 4).join('-')
  return `@${slug}`
}

/** Aufgelöste Marker → Trigger-Payload: Mitglieder-IDs als mentions, erste Aufgabe als ref. */
export function resolveComposed(markers: ResolvedMarker[]): {
  mentions: string[]
  ref: { refType: 'task'; refId: string } | null
} {
  const mentions: string[] = []
  for (const m of markers) {
    if (m.kind === 'member' && !mentions.includes(m.id)) mentions.push(m.id)
  }
  const task = markers.find(m => m.kind === 'task')
  return { mentions, ref: task ? { refType: 'task', refId: task.id } : null }
}
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber. Commit**
```bash
git add src/lib/chat/mentions.ts src/lib/chat/mentions.test.ts
git commit -m "feat(chat): mention candidate builder + resolver (members + tasks)"
```

---

## Task 6: `ChatMentionPopover` (gruppiert: Mitglieder + Aufgaben)

**Files:**
- Create: `src/components/team/ChatMentionPopover.tsx`

**Interfaces:**
- Consumes: `ChatMentionCandidate` (Task 5).
- Produces: `ChatMentionPopover` (props: `open`, `query`, `candidates`, `activeIdx`, `setActiveIdx`, `onSelect`, `onClose`). Rendert im normalen Fluss über dem Composer (kein caret-anchoring — bewusst einfach für v1).

- [ ] **Step 1: `src/components/team/ChatMentionPopover.tsx`**
```tsx
import { useEffect, useMemo } from 'react'
import { Users, CheckSquare } from 'lucide-react'
import type { ChatMentionCandidate } from '@/lib/chat/mentions'

interface Props {
  open: boolean
  query: string
  candidates: ChatMentionCandidate[]
  activeIdx: number
  setActiveIdx: (i: number) => void
  onSelect: (c: ChatMentionCandidate) => void
  onClose: () => void
}

/** Liefert die gefilterte, flache Liste (Reihenfolge = Tastatur-Navigation). Max 8. */
export function filterMentionCandidates(candidates: ChatMentionCandidate[], query: string): ChatMentionCandidate[] {
  const q = query.trim().toLowerCase()
  const list = q ? candidates.filter(c => c.name.toLowerCase().includes(q)) : candidates
  return list.slice(0, 8)
}

export function ChatMentionPopover({ open, query, candidates, activeIdx, setActiveIdx, onSelect, onClose }: Props) {
  const filtered = useMemo(() => filterMentionCandidates(candidates, query), [candidates, query])

  useEffect(() => { setActiveIdx(0) }, [filtered.length, setActiveIdx])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-chat-mention]')) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open || filtered.length === 0) return null

  // Gruppen-Header nur am Wechsel kind member→task rendern.
  return (
    <div data-chat-mention style={{
      position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
      maxHeight: 260, overflowY: 'auto', zIndex: 50,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-2)', padding: 4,
    }}>
      {filtered.map((c, i) => {
        const showHeader = i === 0 || filtered[i - 1].kind !== c.kind
        const active = i === activeIdx
        return (
          <div key={`${c.kind}-${c.id}`}>
            {showHeader && (
              <div style={{
                padding: '6px 10px 4px', fontSize: 9.5, fontWeight: 700,
                color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {c.kind === 'member' ? <Users size={11} /> : <CheckSquare size={11} />}
                {c.kind === 'member' ? 'Mitglieder' : 'Aufgaben'}
              </div>
            )}
            <div
              data-chat-mention-row={i}
              onMouseDown={e => { e.preventDefault(); onSelect(c) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                borderRadius: 7, cursor: 'pointer',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--fg)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              {c.sub && (
                <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                  {c.sub}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: tsc sauber. Commit**
```bash
git add src/components/team/ChatMentionPopover.tsx
git commit -m "feat(chat): grouped mention popover (members + tasks)"
```

---

## Task 7: `ChatComposer` (textarea + Mentions + ref-Stempel)

**Files:**
- Create: `src/components/team/ChatComposer.tsx`

**Interfaces:**
- Consumes: `useMessagesStore.send`, `useMembersStore`, `useTodosStore`, `useWorkspaceStore`, `useAuthStore`, `buildMentionCandidates`/`markerFor`/`resolveComposed` (Task 5), `extractMentionQuery` (`src/components/tasks/MentionPopover.ts` Re-Export), `ChatMentionPopover`/`filterMentionCandidates` (Task 6).
- Produces: `ChatComposer` (props: `contextRef?: { refType: 'task' | 'account'; refId: string }`). Sendet eine `user`-Nachricht; stempelt `ref` aus `@Aufgabe` **oder** aus `contextRef` (Composer-seitiger Thread-Key); fügt Mitglieder-IDs als `mentions`.

- [ ] **Step 1: `src/components/team/ChatComposer.tsx`**
```tsx
import { useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useTodosStore } from '@/store/todos.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { extractMentionQuery } from '@/components/tasks/MentionPopover'
import { ChatMentionPopover, filterMentionCandidates } from './ChatMentionPopover'
import {
  buildMentionCandidates, markerFor, resolveComposed,
  type ChatMentionCandidate, type ResolvedMarker,
} from '@/lib/chat/mentions'

interface Props {
  contextRef?: { refType: 'task' | 'account'; refId: string }
}

export function ChatComposer({ contextRef }: Props = {}) {
  const send       = useMessagesStore(s => s.send)
  const members    = useMembersStore(s => s.members())
  const allTodos   = useTodosStore(s => s.allTodos)
  const [text, setText]       = useState('')
  const [markers, setMarkers] = useState<ResolvedMarker[]>([])
  const [mq, setMq]           = useState<{ open: boolean; query: string; start: number }>({ open: false, query: '', start: -1 })
  const [activeIdx, setActiveIdx] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const candidates = useMemo(
    () => buildMentionCandidates(members, allTodos),
    [members, allTodos],
  )

  const recomputeMention = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const q = extractMentionQuery(before)
    if (q) setMq({ open: true, query: q.query, start: q.startOffset })
    else setMq({ open: false, query: '', start: -1 })
  }

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    recomputeMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  const pick = (c: ChatMentionCandidate) => {
    const ta = taRef.current
    if (!ta || mq.start < 0) return
    const caret = ta.selectionStart ?? text.length
    const marker = markerFor(c)
    const next = `${text.slice(0, mq.start)}${marker} ${text.slice(caret)}`
    setText(next)
    setMarkers(prev => [...prev.filter(m => m.marker !== marker), { kind: c.kind, id: c.id, marker }])
    setMq({ open: false, query: '', start: -1 })
    queueMicrotask(() => { ta.focus(); const p = mq.start + marker.length + 1; ta.setSelectionRange(p, p) })
  }

  const submit = async () => {
    const body = text.trim()
    if (!body) return
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy   = useAuthStore.getState().user?.id ?? ''
    if (!workspaceId || !createdBy) return
    // Nur tatsächlich noch im Text vorhandene Marker zählen.
    const live = markers.filter(m => body.includes(m.marker))
    const { mentions, ref } = resolveComposed(live)
    const effectiveRef = ref ?? (contextRef ? { refType: contextRef.refType, refId: contextRef.refId } : null)
    try {
      await send({
        workspaceId, createdBy, body,
        mentions,
        refType: effectiveRef?.refType ?? null,
        refId:   effectiveRef?.refId ?? null,
      })
      setText(''); setMarkers([]); setMq({ open: false, query: '', start: -1 })
    } catch {
      // send-Fehler werden im Store geloggt; Eingabe bleibt erhalten.
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mq.open) {
      const filtered = filterMentionCandidates(candidates, mq.query)
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); return }
      if (e.key === 'Enter')     { e.preventDefault(); const c = filtered[activeIdx]; if (c) pick(c); return }
      if (e.key === 'Escape')    { e.preventDefault(); setMq({ open: false, query: '', start: -1 }); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
  }

  return (
    <div style={{ position: 'relative', padding: 12, borderTop: '1px solid var(--border)' }}>
      <ChatMentionPopover
        open={mq.open} query={mq.query} candidates={candidates}
        activeIdx={activeIdx} setActiveIdx={setActiveIdx}
        onSelect={pick} onClose={() => setMq({ open: false, query: '', start: -1 })}
      />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Nachricht … @Person oder @Aufgabe erwähnen"
          style={{
            flex: 1, resize: 'none', minHeight: 38, maxHeight: 140,
            padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13.5,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={() => void submit()}
          disabled={!text.trim()}
          title="Senden (Enter)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: text.trim() ? 'var(--accent)' : 'oklch(50% 0 0 / 0.08)',
            color: text.trim() ? 'var(--accent-ink)' : 'var(--fg-dim)',
            border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc sauber** (`npx tsc --noEmit -p tsconfig.json`).

- [ ] **Step 3: Commit**
```bash
git add src/components/team/ChatComposer.tsx
git commit -m "feat(chat): chat composer (mentions members+tasks, ref stamping)"
```

---

## Task 8: `useOpenTask`-Hook (Sprung Nachricht/Inbox → Aufgabe)

**Files:**
- Create: `src/lib/chat/useOpenTask.ts`

**Interfaces:**
- Consumes: `useTodosStore`, `useUiStore` (`openCustomerAt`, `setAppView`).
- Produces: `useOpenTask() → (taskId: string) => boolean` (true = gesprungen, false = Aufgabe nicht gefunden / verwaist).

- [ ] **Step 1: `src/lib/chat/useOpenTask.ts`**
```ts
import { useCallback } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useUiStore } from '@/store/ui.store'

/**
 * Springt zu einer Aufgabe: hat sie einen Kunden → Kundenakte, Tab „tasks";
 * sonst → „Mein Tag". Gibt false zurück, wenn die Aufgabe (noch) nicht im
 * Store ist (verwaiste Referenz) — der Aufrufer rendert dann „Aufgabe gelöscht".
 */
export function useOpenTask(): (taskId: string) => boolean {
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const setAppView     = useUiStore(s => s.setAppView)
  return useCallback((taskId: string) => {
    const todo = useTodosStore.getState().allTodos.find(t => t.id === taskId)
    if (!todo) return false
    if (todo.customerId) openCustomerAt(todo.customerId, 'tasks')
    else setAppView('dashboard')
    return true
  }, [openCustomerAt, setAppView])
}
```

- [ ] **Step 2: tsc sauber. Commit**
```bash
git add src/lib/chat/useOpenTask.ts
git commit -m "feat(chat): useOpenTask hook (jump message/inbox -> task)"
```

---

## Task 9: `SystemMessageCard` + `TaskRefChip` (System-Karten + Aufgaben-Chip)

**Files:**
- Create: `src/components/team/TaskRefChip.tsx`
- Create: `src/components/team/SystemMessageCard.tsx`

**Interfaces:**
- Consumes: `Message`, `useMembersStore.nameOf`, `useTodosStore`, `useOpenTask` (Task 8).
- Produces: `TaskRefChip` (props: `taskId`); `SystemMessageCard` (props: `message: Message`).

- [ ] **Step 1: `src/components/team/TaskRefChip.tsx`**
```tsx
import { CheckSquare } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'

/** Klickbarer Aufgaben-Chip. Verwaiste Referenz → inaktiv, Label „Aufgabe gelöscht". */
export function TaskRefChip({ taskId }: { taskId: string }) {
  const todo = useTodosStore(s => s.allTodos.find(t => t.id === taskId))
  const openTask = useOpenTask()
  const gone = !todo
  return (
    <button
      onClick={() => { if (!gone) openTask(taskId) }}
      disabled={gone}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4,
        padding: '5px 10px', borderRadius: 8,
        background: gone ? 'oklch(50% 0 0 / 0.06)' : 'var(--accent-soft)',
        color: gone ? 'var(--fg-dim)' : 'var(--accent-ink)',
        border: '1px solid var(--border)', fontSize: 12, fontWeight: 600,
        cursor: gone ? 'default' : 'pointer', maxWidth: '100%',
      }}
    >
      <CheckSquare size={13} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {gone ? 'Aufgabe gelöscht' : todo!.title}
      </span>
      {todo?.dueDate && !gone && (
        <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
          {new Date(todo.dueDate).toLocaleDateString('de', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: `src/components/team/SystemMessageCard.tsx`**
```tsx
import type { Message } from '@/types/message.types'
import { useMembersStore } from '@/store/members.store'
import { TaskRefChip } from './TaskRefChip'

const EVENT_LABEL: Record<string, string> = {
  task_assigned:  'hat eine Aufgabe zugewiesen',
  task_completed: 'hat eine Aufgabe abgeschlossen',
  task_created:   'hat eine Aufgabe erstellt',
}

/** Mittig zentrierte System-Karte (Zuweisung/Abschluss) mit Aufgaben-Chip. */
export function SystemMessageCard({ message }: { message: Message }) {
  const actor = useMembersStore(s => s.nameOf(message.createdBy))
  const label = (message.systemEvent && EVENT_LABEL[message.systemEvent]) || 'Systemereignis'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, margin: '8px 0' }}>
      <div style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>
        <strong style={{ color: 'var(--fg-muted)' }}>{actor}</strong> {label}
      </div>
      {message.refType === 'task' && message.refId && <TaskRefChip taskId={message.refId} />}
    </div>
  )
}
```

- [ ] **Step 3: tsc sauber. Commit**
```bash
git add src/components/team/TaskRefChip.tsx src/components/team/SystemMessageCard.tsx
git commit -m "feat(chat): system message card + task ref chip (jump + orphan-safe)"
```

---

## Task 10: `MessageList` (Verlauf, Gruppierung, Pagination, Highlight-Flash)

**Files:**
- Create: `src/components/team/MessageList.tsx`

**Interfaces:**
- Consumes: `useMessagesStore` (`messages`, `hasMore`, `loadMore`), `useMembersStore.nameOf`, `useUiStore` (`pendingScrollMessageId`, `setPendingScrollMessageId`), `useWorkspaceStore`, `SystemMessageCard`, `TaskRefChip`, `Message`.
- Produces: `MessageList` (props: `compact?: boolean`).

- [ ] **Step 1: `src/components/team/MessageList.tsx`**
```tsx
import { useEffect, useRef } from 'react'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { SystemMessageCard } from './SystemMessageCard'
import { TaskRefChip } from './TaskRefChip'
import type { Message } from '@/types/message.types'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
}

export function MessageList({ compact = false }: { compact?: boolean }) {
  const messages  = useMessagesStore(s => s.messages)
  const hasMore   = useMessagesStore(s => s.hasMore)
  const loadMore  = useMessagesStore(s => s.loadMore)
  const nameOf    = useMembersStore(s => s.nameOf)
  const myId      = useAuthStore(s => s.user?.id)
  const pendingScroll = useUiStore(s => s.pendingScrollMessageId)
  const clearScroll   = useUiStore(s => s.setPendingScrollMessageId)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const rowRefs   = useRef<Map<string, HTMLDivElement>>(new Map())

  // Neueste Nachricht: ans Ende scrollen (außer der Nutzer liest Älteres).
  useEffect(() => {
    if (pendingScroll) return
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pendingScroll])

  // Inbox → Nachricht: scrollen + kurz hervorheben.
  useEffect(() => {
    if (!pendingScroll) return
    const el = rowRefs.current.get(pendingScroll)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.style.transition = 'background 200ms'
    el.style.background = 'var(--accent-soft)'
    const t = setTimeout(() => { el.style.background = 'transparent'; clearScroll(null) }, 1400)
    return () => clearTimeout(t)
  }, [pendingScroll, messages.length, clearScroll])

  const onScroll = () => {
    const el = scrollRef.current
    if (el && el.scrollTop < 40 && hasMore) {
      const wsId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
      if (wsId) void loadMore(wsId)
    }
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: compact ? 10 : '16px 20px', minHeight: 0 }}>
      {hasMore && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fg-dim)', padding: 6 }}>
          Ältere Nachrichten werden beim Hochscrollen geladen …
        </div>
      )}
      {messages.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13, padding: 40 }}>
          Noch keine Nachrichten. Schreib die erste. 💬
        </div>
      )}
      {messages.map((m: Message) => {
        if (m.kind === 'system') return <SystemMessageCard key={m.id} message={m} />
        const mine = m.createdBy === myId
        return (
          <div
            key={m.id}
            ref={el => { if (el) rowRefs.current.set(m.id, el); else rowRefs.current.delete(m.id) }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', margin: '6px 0', borderRadius: 8 }}
          >
            <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', margin: '0 4px 2px' }}>
              {mine ? 'Du' : nameOf(m.createdBy)} · {timeOf(m.createdAt)}
            </div>
            <div style={{
              maxWidth: '78%', padding: '8px 12px', borderRadius: 12,
              background: mine ? 'var(--accent)' : 'var(--surface-2)',
              color: mine ? 'var(--accent-ink)' : 'var(--fg)',
              fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.body}
            </div>
            {m.refType === 'task' && m.refId && <TaskRefChip taskId={m.refId} />}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2: tsc sauber. Commit**
```bash
git add src/components/team/MessageList.tsx
git commit -m "feat(chat): message list (history, pagination, highlight-flash)"
```

---

## Task 11: `TeamChatRoute` (Vollansicht) + Route-Verdrahtung + NavItem

**Files:**
- Create: `src/routes/TeamChatRoute.tsx`
- Modify: `src/App.tsx` (lazy-Import, `renderMain`-Case)
- Modify: `src/components/layout/NavSidebar.tsx` (NavItem „Team")
- Modify: `src/components/layout/Topbar.tsx` (`VIEW_META.team`)

**Interfaces:**
- Consumes: `useMessagesStore.loadRecent`, `useWorkspaceStore`, `MessageList`, `ChatComposer`.
- Produces: `TeamChatRoute`.

- [ ] **Step 1: `src/routes/TeamChatRoute.tsx`**
```tsx
import { useEffect } from 'react'
import { MessagesSquare } from 'lucide-react'
import { useMessagesStore } from '@/store/messages.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { MessageList } from '@/components/team/MessageList'
import { ChatComposer } from '@/components/team/ChatComposer'

export function TeamChatRoute() {
  const loadRecent = useMessagesStore(s => s.loadRecent)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())

  useEffect(() => {
    if (activeWorkspaceId && isShared) void loadRecent(activeWorkspaceId)
  }, [activeWorkspaceId, isShared, loadRecent])

  if (!isShared) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--fg-dim)' }}>
        <MessagesSquare size={28} />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)' }}>Team-Chat</div>
        <div style={{ fontSize: 12.5, maxWidth: 360, textAlign: 'center' }}>
          Der Team-Chat ist verfügbar, sobald ein zweites Mitglied in diesem Workspace ist.
          Lade jemanden über deinen Beitritts-Code ein.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <MessageList />
      <ChatComposer />
    </div>
  )
}
```

- [ ] **Step 2: `src/App.tsx` — lazy-Import**

Bei den anderen `lazy(...)`-Routen (nach `const NotesRoute = ...`, `:47`):
```ts
const TeamChatRoute = lazy(() => named(import('@/routes/TeamChatRoute'), 'TeamChatRoute'))
```

- [ ] **Step 3: `src/App.tsx` — `renderMain`-Case**

In `renderMain()` (bei den anderen Cases, nach `case 'notes': return <NotesRoute />`, `:245`):
```ts
      case 'team':            return <TeamChatRoute />
```

- [ ] **Step 4: `src/components/layout/NavSidebar.tsx` — NavItem „Team"**

Icon-Import ergänzen (`:11-16`, in die `lucide-react`-Importliste `MessagesSquare` aufnehmen):
```ts
  Settings, PanelLeftClose, PanelLeftOpen, Sparkles, HelpCircle, MessagesSquare,
```
In der „Kommunikation"-Sektion, nach dem Kalender-`NavItem` (`:143-144`), einfügen:
```tsx
      <NavItem icon={MessagesSquare} label="Team" active={appView === 'team'}
        onClick={() => setAppView('team')} />
```
(Badge für ungelesene Nachrichten bewusst weggelassen — echte „ungelesen"-Zählung bräuchte Read-Cursors, die per YAGNI nicht im Scope sind. Die Inbox trägt die laute Zahl, Task 15.)

- [ ] **Step 5: `src/components/layout/Topbar.tsx` — `VIEW_META.team`**

Icon-Import ergänzen (`:3-6`, `MessagesSquare` in die `lucide-react`-Liste) und in `VIEW_META` (nach `profile: { ... }`, `:20`) eine Zeile:
```ts
  team:           { label: 'Team',           tag: 'CHAT',          Icon: MessagesSquare },
```

- [ ] **Step 6: tsc sauber. Bestehende Tests grün** (`npx vitest run` — beachte `src/lib/help-content.test.ts` listet gültige `appView`-Werte; `'team'` ggf. dort ergänzen, falls der Test fehlschlägt).

- [ ] **Step 7: Commit**
```bash
git add src/routes/TeamChatRoute.tsx src/App.tsx src/components/layout/NavSidebar.tsx src/components/layout/Topbar.tsx
git commit -m "feat(chat): team chat full view route + nav + topbar"
```

---

## Task 12: `ChatDrawer` (Mini-Panel) + Topbar-Toggle

**Files:**
- Create: `src/components/team/ChatDrawer.tsx`
- Modify: `src/components/layout/Topbar.tsx` (Toggle-Button neben der Glocke)
- Modify: `src/App.tsx` (Drawer global mounten)

**Interfaces:**
- Consumes: `useUiStore` (`chatDrawerOpen`, `setChatDrawerOpen`, `setAppView`), `useMessagesStore.loadRecent`, `useWorkspaceStore`, `MessageList`, `ChatComposer`.
- Produces: `ChatDrawer`.

- [ ] **Step 1: `src/components/team/ChatDrawer.tsx`**
```tsx
import { useEffect } from 'react'
import { X, Maximize2 } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useMessagesStore } from '@/store/messages.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'

/** Rechts ein-/ausklappbares Mini-Panel — sichtbar unabhängig vom appView. */
export function ChatDrawer() {
  const open       = useUiStore(s => s.chatDrawerOpen)
  const setOpen    = useUiStore(s => s.setChatDrawerOpen)
  const setAppView = useUiStore(s => s.setAppView)
  const loadRecent = useMessagesStore(s => s.loadRecent)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())

  useEffect(() => {
    if (open && activeWorkspaceId && isShared) void loadRecent(activeWorkspaceId)
  }, [open, activeWorkspaceId, isShared, loadRecent])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 340, zIndex: 180,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Team-Chat</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" title="Vollansicht" onClick={() => { setAppView('team'); setOpen(false) }}>
            <Maximize2 size={15} />
          </button>
          <button className="icon-btn" title="Schließen" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>
      </div>
      {!isShared ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--fg-dim)' }}>
          Team-Chat erscheint, sobald ein zweites Mitglied im Workspace ist.
        </div>
      ) : (
        <>
          <MessageList compact />
          <ChatComposer />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Topbar-Toggle ergänzen**

In `src/components/layout/Topbar.tsx` Icon-Import `MessagesSquare` (bereits in Task 11 ergänzt) verwenden. Selektoren oben (nach `setZeitPanel`, `:28`):
```ts
  const chatDrawerOpen   = useUiStore(s => s.chatDrawerOpen)
  const toggleChatDrawer = useUiStore(s => s.toggleChatDrawer)
```
Im rechten Controls-Block, **vor** `<NotificationCenter />` (`:65`):
```tsx
        <button
          className="icon-btn"
          onClick={toggleChatDrawer}
          title="Team-Chat"
          style={{ color: chatDrawerOpen ? 'var(--accent)' : undefined }}
        >
          <MessagesSquare size={16} />
        </button>
```

- [ ] **Step 3: Drawer global mounten**

In `src/App.tsx` Import bei den Layout-Komponenten ergänzen:
```ts
import { ChatDrawer } from '@/components/team/ChatDrawer'
```
Im JSX nach `<HelpDrawer />` (`:305`) einfügen:
```tsx
      <ChatDrawer />
```

- [ ] **Step 4: tsc sauber. Bestehende Tests grün. Commit**
```bash
git add src/components/team/ChatDrawer.tsx src/components/layout/Topbar.tsx src/App.tsx
git commit -m "feat(chat): chat mini-drawer + topbar toggle"
```

---

## Task 13: Inbox-Gruppierung (Render-Logik) + Tests

**Files:**
- Create: `src/lib/chat/inbox-grouping.ts`
- Test: `src/lib/chat/inbox-grouping.test.ts`

**Interfaces:**
- Consumes: `Notification`.
- Produces:
  - `NotificationGroup { key: string; type: NotificationType; refId: string; items: Notification[] }`
  - `groupNotifications(list: Notification[]): { byType: Record<NotificationType, NotificationGroup[]>; order: NotificationType[] }`
  - `loudUnreadCount(list: Notification[]): number` (nur `assigned` + `mention`, ungelesen)

- [ ] **Step 1: Failing test `src/lib/chat/inbox-grouping.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { groupNotifications, loudUnreadCount } from './inbox-grouping'
import type { Notification } from '@/types/notification.types'

const mk = (id: string, type: Notification['type'], refId: string, readAt: string | null = null): Notification => ({
  id, workspaceId: 'ws1', userId: 'u2', type, actorId: 'u1',
  refType: type === 'assigned' || type === 'completed' ? 'task' : 'message',
  refId, messageId: 'm-' + id, readAt, createdAt: 'T' + id,
})

describe('groupNotifications', () => {
  it('groups comment/mention by refId; priority order assigned→mention→comment→completed', () => {
    const { byType, order } = groupNotifications([
      mk('1', 'comment', 'taskA'), mk('2', 'comment', 'taskA'),
      mk('3', 'assigned', 'taskB'), mk('4', 'mention', 'msgC'),
    ])
    expect(order).toEqual(['assigned', 'mention', 'comment', 'completed'])
    expect(byType.comment).toHaveLength(1)        // taskA zusammengefasst
    expect(byType.comment[0].items).toHaveLength(2)
    expect(byType.assigned[0].items).toHaveLength(1)
  })
})

describe('loudUnreadCount', () => {
  it('counts only unread assigned + mention', () => {
    const list = [mk('1', 'assigned', 'a'), mk('2', 'mention', 'b'), mk('3', 'comment', 'c'), mk('4', 'completed', 'd'), mk('5', 'assigned', 'e', 'TX')]
    expect(loudUnreadCount(list)).toBe(2)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `src/lib/chat/inbox-grouping.ts`**
```ts
import type { Notification, NotificationType } from '@/types/notification.types'

export interface NotificationGroup {
  key:    string
  type:   NotificationType
  refId:  string
  items:  Notification[]
}

const ORDER: NotificationType[] = ['assigned', 'mention', 'comment', 'completed']

/**
 * Primär nach Typ, Priorität assigned→mention→comment→completed.
 * comment/mention zusätzlich nach refId zusammengefasst (eine aufklappbare Zeile
 * statt N) — assigned/completed bleiben einzeln (Aktion bzw. FYI pro Aufgabe).
 */
export function groupNotifications(list: Notification[]): {
  byType: Record<NotificationType, NotificationGroup[]>
  order:  NotificationType[]
} {
  const byType = { assigned: [], mention: [], comment: [], completed: [] } as Record<NotificationType, NotificationGroup[]>
  const collapse = (t: NotificationType) => t === 'comment' || t === 'mention'

  for (const t of ORDER) {
    const ofType = list.filter(n => n.type === t)
    if (collapse(t)) {
      const map = new Map<string, NotificationGroup>()
      for (const n of ofType) {
        const g = map.get(n.refId) ?? { key: `${t}:${n.refId}`, type: t, refId: n.refId, items: [] }
        g.items.push(n)
        map.set(n.refId, g)
      }
      byType[t] = [...map.values()]
    } else {
      byType[t] = ofType.map(n => ({ key: `${t}:${n.id}`, type: t, refId: n.refId, items: [n] }))
    }
  }
  return { byType, order: ORDER }
}

/** Laute Zahl fürs Nav-Badge: nur ungelesene assigned + mention. */
export function loudUnreadCount(list: Notification[]): number {
  return list.filter(n => !n.readAt && (n.type === 'assigned' || n.type === 'mention')).length
}
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber. Commit**
```bash
git add src/lib/chat/inbox-grouping.ts src/lib/chat/inbox-grouping.test.ts
git commit -m "feat(chat): inbox grouping + loud-unread count helpers"
```

---

## Task 14: `InboxRoute` (Push/Triage) + Sprung-Verhalten + Route-Verdrahtung

**Files:**
- Create: `src/routes/InboxRoute.tsx`
- Modify: `src/App.tsx` (lazy-Import, `renderMain`: `'inbox'` umwidmen)
- Modify: `src/components/layout/NavSidebar.tsx` (NavItem „Inbox" mit Badge)
- Modify: `src/components/layout/Topbar.tsx` (`VIEW_META.inbox`)

**Interfaces:**
- Consumes: `useNotificationsStore` (`notifications`, `load`, `markRead`), `useAuthStore`, `useMembersStore.nameOf`, `groupNotifications`/`loudUnreadCount` (Task 13), `useOpenTask` (Task 8), `useUiStore` (`setAppView`, `setPendingScrollMessageId`).
- Produces: `InboxRoute`.

- [ ] **Step 1: `src/routes/InboxRoute.tsx`**
```tsx
import { useEffect, useMemo, useState } from 'react'
import { Inbox as InboxIcon, UserPlus, AtSign, MessageCircle, CheckCircle2 } from 'lucide-react'
import { useNotificationsStore } from '@/store/notifications.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { useUiStore } from '@/store/ui.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'
import { groupNotifications, type NotificationGroup } from '@/lib/chat/inbox-grouping'
import type { Notification, NotificationType } from '@/types/notification.types'

const TYPE_META: Record<NotificationType, { label: string; Icon: typeof InboxIcon }> = {
  assigned:  { label: 'Zugewiesen',      Icon: UserPlus },
  mention:   { label: 'Erwähnungen',     Icon: AtSign },
  comment:   { label: 'Kommentare',      Icon: MessageCircle },
  completed: { label: 'Abgeschlossen',   Icon: CheckCircle2 },
}

export function InboxRoute() {
  const notifications = useNotificationsStore(s => s.notifications)
  const load          = useNotificationsStore(s => s.load)
  const markRead      = useNotificationsStore(s => s.markRead)
  const myId          = useAuthStore(s => s.user?.id)
  const nameOf        = useMembersStore(s => s.nameOf)
  const setAppView            = useUiStore(s => s.setAppView)
  const setPendingScrollMsg   = useUiStore(s => s.setPendingScrollMessageId)
  const openTask = useOpenTask()

  useEffect(() => { if (myId) void load(myId) }, [myId, load])

  const unread = useMemo(() => notifications.filter(n => !n.readAt), [notifications])
  const { byType, order } = useMemo(() => groupNotifications(unread), [unread])

  const jump = (n: Notification) => {
    void markRead(n.id)
    if (n.refType === 'task') { openTask(n.refId); return }
    // ref_type === 'message' → Kanal öffnen + zur Nachricht scrollen.
    if (n.messageId) setPendingScrollMsg(n.messageId)
    setAppView('team')
  }

  const totalUnread = unread.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Inbox</span>
        <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{totalUnread} ungelesen</span>
      </div>

      {totalUnread === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13.5, padding: 48 }}>
          Inbox Zero — nichts Offenes. 🎉
        </div>
      )}

      {order.map(type => {
        const groups = byType[type]
        if (groups.length === 0) return null
        const { label, Icon } = TYPE_META[type]
        return (
          <div key={type} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)', marginBottom: 6 }}>
              <Icon size={12} /> {label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groups.map(g => <GroupRow key={g.key} group={g} nameOf={nameOf} onJump={jump} onMarkRead={markRead} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GroupRow({ group, nameOf, onJump, onMarkRead }: {
  group: NotificationGroup
  nameOf: (id: string) => string
  onJump: (n: Notification) => void
  onMarkRead: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const head = group.items[0]
  const actors = [...new Set(group.items.map(i => nameOf(i.actorId)))].join(', ')

  if (group.items.length === 1) {
    return (
      <button onClick={() => onJump(head)} style={rowStyle}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{nameOf(head.actorId)}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{labelFor(head)}</span>
      </button>
    )
  }
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
      <button onClick={() => setExpanded(e => !e)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontFamily: 'inherit', padding: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{group.items.length} neue · {actors}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && group.items.map(n => (
        <button key={n.id} onClick={() => onJump(n)} style={{ ...rowStyle, marginTop: 6 }}>
          <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>{nameOf(n.actorId)} · {labelFor(n)}</span>
        </button>
      ))}
      <button onClick={() => group.items.forEach(n => void onMarkRead(n.id))} style={{ alignSelf: 'flex-end', marginTop: 6, fontSize: 11, color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        Alle als gelesen
      </button>
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', cursor: 'pointer', fontFamily: 'inherit',
}

function labelFor(n: Notification): string {
  switch (n.type) {
    case 'assigned':  return 'hat dir eine Aufgabe zugewiesen'
    case 'mention':   return 'hat dich erwähnt'
    case 'comment':   return 'hat zu deiner Aufgabe kommentiert'
    case 'completed': return 'hat deine Aufgabe abgeschlossen'
  }
}
```

- [ ] **Step 2: `src/App.tsx` — lazy-Import + `'inbox'` umwidmen**

Lazy-Import (nach `TeamChatRoute`, Task 11 Step 2):
```ts
const InboxRoute = lazy(() => named(import('@/routes/InboxRoute'), 'InboxRoute'))
```
Im `renderMain()` die **bestehende** Redirect-Zeile `case 'inbox': return <PosteingangRoute />` (`:260`) ersetzen durch:
```ts
      case 'inbox':           return <InboxRoute />
```

- [ ] **Step 3: `src/components/layout/NavSidebar.tsx` — NavItem „Inbox" mit lauter Zahl**

Import ergänzen (oben):
```ts
import { useNotificationsStore } from '@/store/notifications.store'
import { loudUnreadCount } from '@/lib/chat/inbox-grouping'
```
Icon `Inbox` ist bereits importiert (`:14`). In `NavSidebar()` einen Selektor ergänzen (bei den anderen `use…Store`-Aufrufen):
```ts
  const loudInbox = useNotificationsStore(s => loudUnreadCount(s.notifications))
```
NavItem in der „Menü"-Sektion, nach „Finanzen" (`:126`), einfügen:
```tsx
      <NavItem icon={Inbox} label="Inbox" active={appView === 'inbox'}
        onClick={() => setAppView('inbox')} badge={loudInbox || undefined} badgeAccent />
```

- [ ] **Step 4: `src/components/layout/Topbar.tsx` — `VIEW_META.inbox`**

In `VIEW_META` (nach der `team`-Zeile aus Task 11) eine Zeile (Icon `Inbox` aus `lucide-react` importieren):
```ts
  inbox:          { label: 'Inbox',          tag: 'BENACHRICHTIGUNGEN', Icon: Inbox },
```

- [ ] **Step 5: tsc sauber. Bestehende Tests grün** (ggf. `'inbox'` ist in `help-content.test.ts` bereits gelistet — kein Eingriff nötig). **Commit**
```bash
git add src/routes/InboxRoute.tsx src/App.tsx src/components/layout/NavSidebar.tsx src/components/layout/Topbar.tsx
git commit -m "feat(chat): inbox route (grouping, jump-to-target) + nav badge"
```

---

## Task 15: Glocke (`NotificationCenter`) als Vorschau derselben `notifications`

**Files:**
- Modify: `src/components/layout/NotificationCenter.tsx` (komplett ersetzen)

**Interfaces:**
- Consumes: `useNotificationsStore`, `useAuthStore`, `useMembersStore.nameOf`, `useUiStore` (`setAppView`, `setPendingScrollMessageId`), `useOpenTask` (Task 8), `loudUnreadCount` (Task 13).
- Produces: `NotificationCenter` (Vorschau: Top-12 ungelesen + „Alle ansehen →" zur Inbox).

**Warum:** Die heutige Glocke berechnet eine eigene Mail/Follow-up/Rechnungs/Lead-Aggregation. Laut Spec wandert das raus (eigene Heimat in Mail/Akquise/Finanzen); die Glocke wird zur Vorschau derselben `notifications`-Quelle wie die Inbox.

- [ ] **Step 1: `src/components/layout/NotificationCenter.tsx` ersetzen**
```tsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationsStore } from '@/store/notifications.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { useUiStore } from '@/store/ui.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'
import { loudUnreadCount } from '@/lib/chat/inbox-grouping'
import type { Notification } from '@/types/notification.types'

const LABEL: Record<Notification['type'], string> = {
  assigned:  'hat dir eine Aufgabe zugewiesen',
  mention:   'hat dich erwähnt',
  comment:   'hat zu deiner Aufgabe kommentiert',
  completed: 'hat deine Aufgabe abgeschlossen',
}

/** Glocke = Vorschau der Inbox: Top-12 ungelesen + „Alle ansehen →". */
export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const notifications = useNotificationsStore(s => s.notifications)
  const load          = useNotificationsStore(s => s.load)
  const markRead      = useNotificationsStore(s => s.markRead)
  const myId          = useAuthStore(s => s.user?.id)
  const nameOf        = useMembersStore(s => s.nameOf)
  const setAppView          = useUiStore(s => s.setAppView)
  const setPendingScrollMsg = useUiStore(s => s.setPendingScrollMessageId)
  const openTask = useOpenTask()

  useEffect(() => { if (myId) void load(myId) }, [myId, load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const unread = useMemo(() => notifications.filter(n => !n.readAt), [notifications])
  const preview = unread.slice(0, 12)
  const loud = loudUnreadCount(notifications)

  const jump = (n: Notification) => {
    void markRead(n.id)
    setOpen(false)
    if (n.refType === 'task') { openTask(n.refId); return }
    if (n.messageId) setPendingScrollMsg(n.messageId)
    setAppView('team')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        title={loud > 0 ? `Benachrichtigungen (${loud})` : 'Benachrichtigungen'}
        onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', color: (open || loud > 0) ? 'var(--accent)' : undefined }}
      >
        <Bell size={16} />
        {loud > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 14, height: 14, padding: '0 3px',
            borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{loud}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxHeight: 460,
          overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-2)', zIndex: 200, padding: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 8px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Benachrichtigungen</span>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)' }}>{unread.length} ungelesen</span>
          </div>

          {preview.length === 0 ? (
            <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12.5 }}>
              Alles gelesen. 🎉
            </div>
          ) : (
            <>
              {preview.map(n => (
                <button
                  key={n.id}
                  onClick={() => jump(n)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 1, width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8,
                    color: 'var(--fg)', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{nameOf(n.actorId)}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{LABEL[n.type]}</span>
                </button>
              ))}
              <button
                onClick={() => { setAppView('inbox'); setOpen(false) }}
                style={{ width: '100%', textAlign: 'center', padding: '8px', marginTop: 4, fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Alle ansehen →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: tsc sauber. Bestehende Tests grün. Commit**
```bash
git add src/components/layout/NotificationCenter.tsx
git commit -m "feat(chat): bell becomes preview of notifications inbox"
```

---

## Task 16: „Nachricht → Aufgabe" — Hover-Aktion am Composer-Kontext

**Files:**
- Modify: `src/components/team/MessageList.tsx` (Hover-Aktion „In Aufgabe umwandeln" pro User-Nachricht)
- Modify: `src/store/ui.store.ts` (Prefill-Feld für den Quick-Composer)
- Modify: `src/components/global/GlobalQuickComposer.tsx` (Prefill konsumieren)

**Interfaces:**
- Produces: `ui.store` `quickComposerPrefill: string | null` + `openQuickComposerWith(text)`; MessageList rendert pro eigener/fremder User-Nachricht eine Hover-Aktion, die den Quick-Composer mit dem Nachrichtentext öffnet.

> **Hinweis:** Diese Task setzt voraus, dass `GlobalQuickComposer` ein per-Store
> öffenbares Prefill akzeptiert. Lies `src/components/global/GlobalQuickComposer.tsx`
> **vor** Step 3 und passe die konkrete Open-/Prefill-Verdrahtung an die dort
> vorhandene API an (Selektor-Namen, Open-Flag). Die Schritte unten zeigen das
> Zielverhalten; die exakten Feldnamen können abweichen.

- [ ] **Step 1: `ui.store` Prefill ergänzen**

In `src/store/ui.store.ts`: Interface-Feld (bei den anderen Drawer-Feldern aus Task 4):
```ts
  quickComposerPrefill: string | null
```
Aktion (Interface):
```ts
  openQuickComposerWith: (text: string) => void
```
Initialwert: `quickComposerPrefill: null,` — und Implementierung (setzt Prefill + öffnet den bestehenden Quick-Composer; nutzt das vorhandene `setQuickCaptureOpen`/Quick-Composer-Flag):
```ts
      openQuickComposerWith: (text) =>
        set({ quickComposerPrefill: text, quickCaptureOpen: true }),
```
(`quickComposerPrefill` NICHT in `partialize` aufnehmen — transient.)

- [ ] **Step 2: Hover-Aktion in `MessageList`**

In `src/components/team/MessageList.tsx` den `useUiStore`-Import um `openQuickComposerWith` erweitern und in der User-Nachrichten-Bubble (im `.map`, nur für `m.kind === 'user'`) eine kleine Aktion ergänzen, sichtbar bei Hover des Bubble-Containers (z. B. ein kleiner Button „In Aufgabe umwandeln" unter der Bubble):
```tsx
            <button
              onClick={() => useUiStore.getState().openQuickComposerWith(m.body)}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 2,
                fontSize: 10.5, color: 'var(--fg-dim)', background: 'transparent',
                border: 'none', cursor: 'pointer',
              }}
            >
              In Aufgabe umwandeln
            </button>
```

- [ ] **Step 3: `GlobalQuickComposer` Prefill konsumieren**

`src/components/global/GlobalQuickComposer.tsx` lesen, dann beim Öffnen den `quickComposerPrefill` als Anfangstext übernehmen und nach dem Übernehmen via `setState({ quickComposerPrefill: null })` zurücksetzen (konkrete Verdrahtung an die dort vorhandene Open-/Editor-API anpassen).

- [ ] **Step 4: tsc sauber. Bestehende Tests grün. Commit**
```bash
git add src/store/ui.store.ts src/components/team/MessageList.tsx src/components/global/GlobalQuickComposer.tsx
git commit -m "feat(chat): convert message to task (prefilled quick composer)"
```

---

## Task 17: „Mein Tag" — Assignee-Picker an der Aufgabe (Zuweisen)

**Files:**
- Create: `src/components/team/AssigneePicker.tsx`
- Modify: `src/components/tasks/TaskRow.tsx` (Picker im aufgeklappten Detail)
- Modify: `src/store/todos.store.ts` (Aktion `setAssignee`)

**Interfaces:**
- Consumes: `useMembersStore` (`members()`, `nameOf`), `useTodosStore.setAssignee`, `Todo`.
- Produces: `AssigneePicker` (props: `todo: Todo`); `useTodosStore.setAssignee(id, assignee | undefined)`.

- [ ] **Step 1: `todos.store` — `setAssignee`**

In `src/store/todos.store.ts`: im `interface TodosState` (bei den anderen Aktionen, nach `setPriority`, `:124`):
```ts
  setAssignee:     (id: string, assignee: string | undefined) => Promise<void>
```
Implementierung (bei den anderen Aktionen, nach `setPriority`, `:303-307`):
```ts
  setAssignee: async (id, assignee) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), assignee })
  },
```
(Der Zuweisungs-Trigger aus Phase 2 feuert serverseitig beim `assignee`-Wechsel → System-Nachricht + Notification.)

- [ ] **Step 2: `src/components/team/AssigneePicker.tsx`**
```tsx
import { useState } from 'react'
import { UserPlus, Check } from 'lucide-react'
import { useMembersStore } from '@/store/members.store'
import { useTodosStore } from '@/store/todos.store'
import type { Todo } from '@/types/todo.types'

/** Mitglieder-Picker an einer Aufgabe. Schreibt assignee → Trigger benachrichtigt. */
export function AssigneePicker({ todo }: { todo: Todo }) {
  const [open, setOpen] = useState(false)
  const members     = useMembersStore(s => s.members())
  const nameOf      = useMembersStore(s => s.nameOf)
  const setAssignee = useTodosStore(s => s.setAssignee)

  const current = todo.assignee ? nameOf(todo.assignee) : 'Niemand'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
      >
        <UserPlus size={13} /> {current}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 60, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-2)', padding: 4 }}>
          {members.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--fg-dim)' }}>Keine Mitglieder geladen.</div>
          )}
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => { void setAssignee(todo.id, m.id); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <span style={{ flex: 1 }}>{m.displayName}</span>
              {todo.assignee === m.id && <Check size={14} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
          {todo.assignee && (
            <button
              onClick={() => { void setAssignee(todo.id, undefined); setOpen(false) }}
              style={{ width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 12.5, fontFamily: 'inherit' }}
            >
              Zuweisung entfernen
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `TaskRow` — Picker im aufgeklappten Detail**

In `src/components/tasks/TaskRow.tsx` Import ergänzen:
```ts
import { AssigneePicker } from '@/components/team/AssigneePicker'
```
Im aufgeklappten Detail-Block (`open && (...)`, vor dem Lösch-Button-Container, `:228`) einfügen:
```tsx
          <div>
            <div className="card-label">Zuständig</div>
            <AssigneePicker todo={todo} />
          </div>
```

- [ ] **Step 4: tsc sauber. Bestehende Tests grün. Commit**
```bash
git add src/components/team/AssigneePicker.tsx src/components/tasks/TaskRow.tsx src/store/todos.store.ts
git commit -m "feat(chat): assignee picker on task (triggers fan-out)"
```

---

## Task 18 (optional — „billige v1"): Stummschalten von Kommentar-Threads (`muted_refs`)

> **Scope-Hinweis:** Phase 2 hat den **mention/comment-Split** (Hauptlärm-Hebel)
> bereits im Trigger. `muted_refs` ist die in der Spec genannte „billige v1"-
> Ergänzung. Sie berührt eine **neue Migration + den Phase-2-Comment-Trigger** —
> deshalb bewusst als letzte, optionale Task. Kann verschoben werden, ohne dass
> die Phase-3-Oberflächen unvollständig sind.

**Files:**
- Create: `supabase/migrations/0021_muted_refs.sql`
- Create: `src/data/user-prefs.gateway.ts`
- Modify: `src/components/team/TaskRefChip.tsx` (Mute-Toggle)

**Interfaces:**
- Produces: Tabelle `public.user_workspace_prefs (user_id uuid, workspace_id text, muted_refs jsonb, pk(user_id, workspace_id))`; aktualisierter `tg_message_fanout`, der `comment`-Notifications für gemutete `ref_id` überspringt; `UserPrefsGateway.toggleMute(workspaceId, refId)`.

- [ ] **Step 1: Migration `supabase/migrations/0021_muted_refs.sql`**
```sql
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
```
Anwenden + verifizieren (wie Task 1 Step 2/3): `update`-Szenario — Kommentar an gemuteten Thread erzeugt **0** `comment`-Notifications.

- [ ] **Step 2: `src/data/user-prefs.gateway.ts`**
```ts
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth.store'

function fail(error: { message: string }): never { throw new Error(error.message) }

export const UserPrefsGateway = {
  async getMuted(workspaceId: string): Promise<string[]> {
    const uid = useAuthStore.getState().user?.id
    if (!uid) return []
    const { data, error } = await supabase
      .from('user_workspace_prefs')
      .select('muted_refs')
      .eq('user_id', uid).eq('workspace_id', workspaceId).maybeSingle()
    if (error) fail(error)
    const v = data?.muted_refs
    return Array.isArray(v) ? v as string[] : []
  },

  async toggleMute(workspaceId: string, refId: string): Promise<string[]> {
    const uid = useAuthStore.getState().user?.id
    if (!uid) return []
    const current = await this.getMuted(workspaceId)
    const next = current.includes(refId) ? current.filter(r => r !== refId) : [...current, refId]
    const { error } = await supabase
      .from('user_workspace_prefs')
      .upsert({ user_id: uid, workspace_id: workspaceId, muted_refs: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,workspace_id' })
    if (error) fail(error)
    return next
  },
}
```

- [ ] **Step 3: Mute-Toggle am `TaskRefChip`** (kleines „🔕"-Icon neben dem Chip, ruft `UserPrefsGateway.toggleMute(workspaceId, taskId)`). Workspace via `useWorkspaceStore.getState().activeWorkspaceId`.

- [ ] **Step 4: tsc sauber. Bestehende Tests grün. Commit**
```bash
git add supabase/migrations/0021_muted_refs.sql src/data/user-prefs.gateway.ts src/components/team/TaskRefChip.tsx
git commit -m "feat(chat): mute comment threads (muted_refs v1)"
```

---

## Abschluss-Verifikation Phase 3

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → alle grün (inkl. neuer Helper-Tests: `mentions`, `inbox-grouping`, `profiles.mapper`, `members.store`).
- [ ] Migration `0020` (+ optional `0021`) angewandt und verifiziert.
- [ ] **Manueller Smoke-Test mit zwei Logins** im selben geteilten Workspace:
  - User A weist User B eine Aufgabe zu (Assignee-Picker) → bei B erscheint in Echtzeit eine System-Karte im Team-Chat **und** eine `assigned`-Benachrichtigung in Inbox + Glocke.
  - B schreibt im Team-Chat „@A fertig" → bei A landet eine `mention`-Benachrichtigung; Klick darauf öffnet den Kanal und scrollt/flasht zur Nachricht.
  - Aufgaben-Chip in der System-Karte öffnet die Aufgabe; gelöschte Aufgabe → Chip „Aufgabe gelöscht", kein Crash.
  - Mini-Drawer (Topbar-Toggle) zeigt dieselbe Liste; „⤢" springt in die Vollansicht.
  - Solo-Workspace: Team-Chat + Drawer zeigen den Leerzustand, kein Crash.

## Self-Review (gegen die Spec geprüft)

- **UI-Oberfläche 1 (Team-Chat, Hybrid):** Vollansicht (Task 11) + Drawer (Task 12), geteilte `MessageList`/`ChatComposer` (Tasks 7/10) ✅; Mention-Erweiterung Mitglieder+Aufgaben (Tasks 5/6/7) ✅; Sprung Nachricht→Aufgabe (Tasks 8/9), Inbox→Nachricht (Tasks 4/10/14), Inbox→Aufgabe (Tasks 8/14) ✅.
- **UI-Oberfläche 2 (Inbox):** Route + Gruppierung Typ→Kunde (Tasks 13/14) ✅; Glocke als Vorschau derselben Quelle (Task 15) ✅; Badge nur `assigned`+`mention` (Task 13 `loudUnreadCount`) ✅.
- **UI-Oberfläche 3 (Mein Tag):** Assignee-Picker an der Aufgabe (Task 17) ✅. Die `assignee=ich`-Filter selbst kamen in **Phase 1** — hier nur der Zuweis-Picker, wie in der Spec für Phase 3 vorgesehen.
- **Nachricht → Aufgabe (Hover-Aktion):** Task 16 ✅.
- **Stummschalten (`muted_refs`, billige v1):** Task 18 (optional) ✅.
- **Lücke geschlossen:** Klarnamen-Verzeichnis (Tasks 1–3) — in der Spec implizit vorausgesetzt, im Code nicht vorhanden; ohne das wären `@Person` und der Picker namenlos.
- **Bewusst NICHT umgesetzt (YAGNI, Spec-konform):** keine zusätzlichen Kanäle; kein Read-Cursor/Read-Receipts (daher **kein** numerisches „ungelesen"-Badge am Team-Nav, nur an der Inbox); keine OS-Push; kein Kundenportal (nur `visibility` aus Phase 2 vorbereitet).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-26-team-chat-phase3-oberflaechen.md`. Zwei Ausführungs-Optionen:

1. **Subagent-Driven (empfohlen)** — ein frischer Subagent pro Task, Review zwischen den Tasks, schnelle Iteration (`superpowers:subagent-driven-development`).
2. **Inline-Ausführung** — Tasks in dieser Session abarbeiten mit Checkpoints (`superpowers:executing-plans`).

Welcher Ansatz?
