# Inbox in den Chat-Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Inbox aus dem eigenen Nav-Tab in die Chat-Overlay-Kachel verlegen — links oben „Inbox", darunter „Team", dann DMs; rechts zeigt „Inbox" die Benachrichtigungsliste. Nav-Eintrag + `appView:'inbox'`-Route entfallen.

**Architecture:** Die `InboxRoute`-Liste wird in eine `InboxPanel`-Komponente extrahiert und in der Kachel gerendert. `ChatOverlaySelection` bekommt `'inbox'` (Default), die Kachel-rechte-Spalte verzweigt: `selected==='inbox'` → `InboxPanel` (kein Composer), sonst `MessageList`+`ChatComposer`. Alle `'inbox'`-Nav/Route-Verweise werden entfernt; die Glocke öffnet „Alle ansehen" künftig die Kachel auf der Inbox. Keine DB-Änderung.

**Tech Stack:** React + TS + Zustand, Vitest.

## Global Constraints

- **Keine** DB-/Migrations-/Trigger-Änderung. Reiner UI-Umbau.
- Glocke (Topbar `NotificationCenter`) **bleibt**; nur ihr „Alle ansehen →" wird umgehängt.
- Nav-Eintrag, der die Kachel öffnet, **bleibt „Team"** (kein Umbenennen).
- **Inbox ist die Default-Auswahl** der Kachel (`selected: 'inbox'`).
- **Aufgaben-Sprung aus der Inbox schließt die Kachel**; Nachrichten-/DM-Sprung lässt sie offen und wechselt die Auswahl.
- Badges getrennt: Inbox-Eintrag = ungelesene **Benachrichtigungen** (`loudUnreadCount`); Topbar-Chat-Button/Nav-„Team" = **Chat**-Ungelesen (Team+DMs, unverändert); Glocke = Benachrichtigungen (unverändert).
- DRY: keine doppelte Inbox-Listen-Logik — `InboxRoute` wird Wrapper bzw. gelöscht.
- Git: nur **gezielte** `git add <pfad>` — nie `git add -A`/`.`. **Nicht anfassen:** `.gitignore`, `cultera-focus-updater.key.OLD*`.
- Nach jeder Task: `npx tsc --noEmit -p tsconfig.json` sauber + `npx vitest run` grün (Basis 628).

---

### Task 1: `InboxPanel` extrahieren (aus `InboxRoute`)

**Files:**
- Create: `src/components/team/InboxPanel.tsx`
- Modify: `src/routes/InboxRoute.tsx` (wird zum dünnen Wrapper über `InboxPanel`)
- Test: `src/components/team/InboxPanel.test.tsx`

**Interfaces:**
- Produces: `export function InboxPanel()` — rendert die gruppierte Benachrichtigungsliste; Task-Sprung schließt die Kachel (`useChatOverlayStore.close()`), Nachrichten-Sprung via `openChat`.

- [ ] **Step 1: Failing test** — `src/components/team/InboxPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const closeMock = vi.fn()
const openTaskMock = vi.fn()
const openChatMock = vi.fn()
vi.mock('@/store/chat-overlay.store', () => ({ useChatOverlayStore: Object.assign(
  (sel: any) => sel({ close: closeMock }), { getState: () => ({ close: closeMock }) }) }))
vi.mock('@/lib/chat/useOpenTask', () => ({ useOpenTask: () => openTaskMock }))
vi.mock('@/lib/open-chat', () => ({ openChat: (o: any) => openChatMock(o) }))

import { InboxPanel } from './InboxPanel'
import { useNotificationsStore } from '@/store/notifications.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'

const notif = (over: any) => ({ id: 'n1', workspaceId: 'ws1', userId: 'me', type: 'dm', actorId: 'p1', refType: 'message', refId: 'm1', messageId: 'm1', conversationId: 'c1', readAt: null, createdAt: 't', ...over })

beforeEach(() => {
  closeMock.mockReset(); openTaskMock.mockReset(); openChatMock.mockReset()
  useAuthStore.setState({ user: { id: 'me' } as any })
  useMembersStore.setState({ profiles: { p1: { id: 'p1', displayName: 'Anna', email: null } }, memberIds: ['p1'] })
  useNotificationsStore.setState({ notifications: [], load: vi.fn(), markRead: vi.fn() } as any)
})
afterEach(cleanup)

describe('InboxPanel', () => {
  it('zeigt Inbox-Zero bei keinen ungelesenen', () => {
    render(<InboxPanel />)
    expect(screen.getByText(/Inbox Zero/)).toBeTruthy()
  })
  it('Task-Benachrichtigung: Klick → openTask + Kachel schließen', () => {
    useNotificationsStore.setState({ notifications: [notif({ type: 'assigned', refType: 'task', refId: 'task-7' })], load: vi.fn(), markRead: vi.fn() } as any)
    render(<InboxPanel />)
    fireEvent.click(screen.getByText('Anna'))
    expect(openTaskMock).toHaveBeenCalledWith('task-7')
    expect(closeMock).toHaveBeenCalled()
    expect(openChatMock).not.toHaveBeenCalled()
  })
  it('Nachrichten-Benachrichtigung: Klick → openChat (DM), Kachel bleibt offen', () => {
    useNotificationsStore.setState({ notifications: [notif({ type: 'dm', refType: 'message', conversationId: 'c1', actorId: 'p1', messageId: 'm1' })], load: vi.fn(), markRead: vi.fn() } as any)
    render(<InboxPanel />)
    fireEvent.click(screen.getByText('Anna'))
    expect(openChatMock).toHaveBeenCalledWith({ messageId: 'm1', conversationId: 'c1', peerId: 'p1' })
    expect(closeMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/components/team/InboxPanel.test.tsx` (Modul fehlt).

- [ ] **Step 3: `InboxPanel` implementieren** — `src/components/team/InboxPanel.tsx` (Inhalt 1:1 aus `InboxRoute`, plus Kachel-schließen beim Task-Sprung):

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Inbox as InboxIcon, UserPlus, AtSign, MessageCircle, CheckCircle2 } from 'lucide-react'
import { useNotificationsStore } from '@/store/notifications.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'
import { openChat } from '@/lib/open-chat'
import { groupNotifications, type NotificationGroup } from '@/lib/chat/inbox-grouping'
import type { Notification, NotificationType } from '@/types/notification.types'

const TYPE_META: Record<NotificationType, { label: string; Icon: typeof InboxIcon }> = {
  assigned:  { label: 'Zugewiesen',    Icon: UserPlus },
  mention:   { label: 'Erwähnungen',   Icon: AtSign },
  comment:   { label: 'Kommentare',    Icon: MessageCircle },
  completed: { label: 'Abgeschlossen', Icon: CheckCircle2 },
  dm:        { label: 'Nachrichten',   Icon: InboxIcon },
}

/** Inbox-Liste als Panel in der Chat-Kachel (links Auswahl „Inbox"). */
export function InboxPanel() {
  const notifications = useNotificationsStore(s => s.notifications)
  const load          = useNotificationsStore(s => s.load)
  const markRead      = useNotificationsStore(s => s.markRead)
  const myId          = useAuthStore(s => s.user?.id)
  const nameOf        = useMembersStore(s => s.nameOf)
  const closeOverlay  = useChatOverlayStore(s => s.close)
  const openTask = useOpenTask()

  useEffect(() => { if (myId) void load(myId) }, [myId, load])

  const unread = useMemo(() => notifications.filter(n => !n.readAt), [notifications])
  const { byType, order } = useMemo(() => groupNotifications(unread), [unread])

  const jump = (n: Notification) => {
    void markRead(n.id)
    if (n.refType === 'task') { openTask(n.refId); closeOverlay(); return }
    // ref_type === 'message' → Auswahl in den Team-/DM-Verlauf wechseln (Kachel bleibt offen).
    openChat({ messageId: n.messageId, conversationId: n.conversationId, peerId: n.actorId })
  }

  const totalUnread = unread.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Inbox</span>
        <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{totalUnread} ungelesen</span>
      </div>

      {totalUnread === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13.5, padding: 40 }}>
          Inbox Zero — nichts Offenes. 🎉
        </div>
      )}

      {order.map(type => {
        const groups = byType[type]
        if (groups.length === 0) return null
        const { label, Icon } = TYPE_META[type]
        return (
          <div key={type} style={{ marginBottom: 16 }}>
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
    case 'dm':        return 'hat dir geschrieben'
  }
}
```

- [ ] **Step 4: `InboxRoute` zum Wrapper machen** — `src/routes/InboxRoute.tsx` komplett ersetzen (keine Duplizierung; die Route existiert noch bis Task 4):

```tsx
import { InboxPanel } from '@/components/team/InboxPanel'

/** @deprecated Inbox lebt jetzt in der Chat-Kachel (InboxPanel). Diese Route wird entfernt. */
export function InboxRoute() {
  return <InboxPanel />
}
```

- [ ] **Step 5: Run → PASS**; tsc + volle Suite grün.

- [ ] **Step 6: Commit**

```bash
git add src/components/team/InboxPanel.tsx src/components/team/InboxPanel.test.tsx src/routes/InboxRoute.tsx
git commit -m "feat(chat): extract InboxPanel from InboxRoute (task-jump closes overlay)"
```

---

### Task 2: `'inbox'`-Auswahl in der Kachel (Selection + Overlay-Verzweigung)

**Files:**
- Modify: `src/store/chat-overlay.store.ts`
- Modify: `src/lib/chat/threads.ts`
- Modify: `src/components/team/TeamChatOverlay.tsx`
- Modify: `src/store/messages.store.ts` (das `as any` an `threadKeyOf(ov.selected)` entfällt)
- Modify: `src/components/team/TeamChatOverlay.test.tsx` (Spec-1-Test: Message-Fälle explizit auf `selected:'team'` stellen + InboxPanel mocken)
- Modify: `src/store/chat-overlay.store.test.ts`

**Interfaces:**
- `ChatOverlaySelection = 'inbox' | 'team' | { conversationId: string; peerId: string }`; default `selected: 'inbox'`.
- `threadKeyOf(selection)` akzeptiert auch `'inbox'` und gibt `'inbox'` zurück.

- [ ] **Step 1: Auswahl-Typ + Default** — `src/store/chat-overlay.store.ts`:
  - Typ: `export type ChatOverlaySelection = 'inbox' | 'team' | { conversationId: string; peerId: string }`.
  - Default: `selected: 'inbox'` (statt `'team'`).
  - In `src/store/chat-overlay.store.test.ts`: das `beforeEach`/Default-Assert auf `'inbox'` anpassen und einen Fall ergänzen:
    ```ts
    it('select inbox', () => { useChatOverlayStore.getState().select('inbox'); expect(useChatOverlayStore.getState().selected).toBe('inbox') })
    ```

- [ ] **Step 2: `threadKeyOf` erweitern** — `src/lib/chat/threads.ts`:

```ts
export const TEAM_KEY = 'team'
export type ChatThreadKey = string

/** Map a chat selection to its thread key. 'inbox' has no message thread. */
export function threadKeyOf(selection: 'inbox' | 'team' | { conversationId: string }): ChatThreadKey {
  if (selection === 'team') return TEAM_KEY
  if (selection === 'inbox') return 'inbox'
  return selection.conversationId
}
```
  - In `src/lib/chat/threads.test.ts` einen Fall ergänzen: `expect(threadKeyOf('inbox')).toBe('inbox')`.

- [ ] **Step 3: `messages.store` — `as any` entfernen** — in `appendRealtime` die Zeile `threadKeyOf(ov.selected as any)` zu `threadKeyOf(ov.selected)` (jetzt typkompatibel, da `threadKeyOf` `'inbox'` kennt).

- [ ] **Step 4: `TeamChatOverlay` rechte Spalte verzweigen** — `src/components/team/TeamChatOverlay.tsx`:
  - Import ergänzen: `import { InboxPanel } from './InboxPanel'`.
  - Im `Panel`: nach `const selected = …`:
    ```tsx
    const isInbox = selected === 'inbox'
    const threadKey = threadKeyOf(selected)
    const conversationId = (selected === 'team' || selected === 'inbox') ? null : selected.conversationId
    ```
  - Lade-Effekt: nur Threads laden/markieren, wenn KEINE Inbox:
    ```tsx
    useEffect(() => {
      if (!activeWorkspaceId || !isShared) return
      void loadOverview(activeWorkspaceId)
      if (selected !== 'inbox') {
        void loadThread(activeWorkspaceId, threadKey)
        void markRead(activeWorkspaceId, threadKey)
      }
    }, [activeWorkspaceId, isShared, selected, threadKey, loadOverview, loadThread, markRead])
    ```
  - Rechte Spalte (im `isShared`-Zweig) verzweigen:
    ```tsx
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <ChatSidebar />
      {isInbox ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <InboxPanel />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <MessageList threadKey={threadKey} />
          <ChatComposer conversationId={conversationId} />
        </div>
      )}
    </div>
    ```

- [ ] **Step 5: Spec-1-Overlay-Test anpassen** — `src/components/team/TeamChatOverlay.test.tsx`: am Anfang `vi.mock('./InboxPanel', () => ({ InboxPanel: () => null }))` ergänzen; in den Tests, die `MessageList`/Composer erwarten, vor dem Render `useChatOverlayStore.setState({ open: true, selected: 'team' })` setzen (Default ist jetzt `'inbox'`). Die bestehenden `!isShared`/Esc/Shortcut-Fälle bleiben.

- [ ] **Step 6: tsc + volle Suite grün + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/store/chat-overlay.store.ts src/store/chat-overlay.store.test.ts src/lib/chat/threads.ts src/lib/chat/threads.test.ts src/store/messages.store.ts src/components/team/TeamChatOverlay.tsx src/components/team/TeamChatOverlay.test.tsx
git commit -m "feat(chat): 'inbox' selection (default) renders InboxPanel in the overlay"
```

---

### Task 3: `ChatSidebar` — Inbox-Eintrag oben + Badge

**Files:**
- Modify: `src/components/team/ChatSidebar.tsx`
- Modify: `src/components/team/ChatSidebar.test.tsx`

**Interfaces:**
- Consumes: `useChatOverlayStore.select('inbox')`, `useNotificationsStore` + `loudUnreadCount` für das Badge.

- [ ] **Step 1: Failing test** — in `src/components/team/ChatSidebar.test.tsx` ergänzen (im `beforeEach` `useNotificationsStore` mit Notifications setzen):

```tsx
it('zeigt den Inbox-Eintrag oben, aktiv bei selected==="inbox"', () => {
  useChatOverlayStore.setState({ open: true, selected: 'inbox' })
  render(<ChatSidebar />)
  expect(screen.getByText('Inbox')).toBeTruthy()
})
it('Klick auf Inbox → select("inbox")', () => {
  const select = vi.fn(); useChatOverlayStore.setState({ select })
  render(<ChatSidebar />)
  fireEvent.click(screen.getByText('Inbox'))
  expect(select).toHaveBeenCalledWith('inbox')
})
```
(Import `useNotificationsStore` im Test ergänzen; im `beforeEach` `useNotificationsStore.setState({ notifications: [] } as any)`.)

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Inbox-Eintrag implementieren** — `src/components/team/ChatSidebar.tsx`:
  - Imports ergänzen: `import { Hash, Inbox as InboxIcon } from 'lucide-react'` (Hash bleibt); `import { useNotificationsStore } from '@/store/notifications.store'`; `import { loudUnreadCount } from '@/lib/chat/inbox-grouping'`.
  - Selektoren ergänzen: `const inboxUnread = useNotificationsStore(s => loudUnreadCount(s.notifications))`; `const inboxActive = selected === 'inbox'`.
  - Als ERSTES Kind im Wrapper (vor dem Team-Button) einfügen:
    ```tsx
    <button
      onClick={() => select('inbox')}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', cursor: 'pointer',
        textAlign: 'left', width: '100%', background: inboxActive ? 'var(--surface)' : 'transparent',
        color: inboxActive ? 'var(--fg)' : 'var(--fg-muted)', fontSize: 13.5, fontWeight: inboxActive ? 700 : 600,
        borderLeft: `2px solid ${inboxActive ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      <InboxIcon size={15} /> <span style={{ flex: 1 }}>Inbox</span> <Badge n={inboxUnread} />
    </button>
    ```
  (Der bestehende `teamActive`/Team-Button + Mitglieder bleiben unverändert darunter.)

- [ ] **Step 4: Run → PASS**; tsc + volle Suite grün.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/ChatSidebar.tsx src/components/team/ChatSidebar.test.tsx
git commit -m "feat(chat): Inbox entry on top of ChatSidebar with unread badge"
```

---

### Task 4: Nav-Inbox + Route entfernen, Glocke umhängen

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/store/ui.store.ts`
- Modify: `src/lib/help-content.test.ts`
- Modify: `src/components/layout/NotificationCenter.tsx`
- Delete: `src/routes/InboxRoute.tsx`

**Interfaces:**
- Reine Entfernung/Umhängung; Verhalten danach: Inbox nur noch in der Kachel; Glocke „Alle ansehen" öffnet die Kachel auf der Inbox.

- [ ] **Step 1: NavSidebar — Inbox-Eintrag entfernen** — `src/components/layout/NavSidebar.tsx`:
  - Die beiden Zeilen des Inbox-`NavItem` (`:138-139`, `label="Inbox" … onClick={() => setAppView('inbox')} badge={loudInbox …}`) entfernen.
  - Den Selektor `const loudInbox = useNotificationsStore(s => loudUnreadCount(s.notifications))` (`:87`) entfernen.
  - Prüfen, ob `Inbox` (lucide), `useNotificationsStore`, `loudUnreadCount` danach in der Datei noch verwendet werden; ungenutzte Imports entfernen (tsc `noUnusedLocals`). (`useMessagesStore`/`totalUnread` bleiben — die treiben das „Team"-Badge.)

- [ ] **Step 2: App.tsx — Route entfernen** — `src/App.tsx`:
  - `case 'inbox':           return <InboxRoute />` (`:256`) entfernen.
  - Den `InboxRoute`-Lazy-Import entfernen (such nach `InboxRoute` im Importblock).

- [ ] **Step 3: `AppView` bereinigen** — `src/store/ui.store.ts:83`: `'inbox'` aus der Union entfernen (`| 'notes' | 'inbox' | 'sales'` → `| 'notes' | 'sales'`).

- [ ] **Step 4: help-content-Test** — `src/lib/help-content.test.ts:7`: `'inbox'` aus der Liste gültiger appViews entfernen.

- [ ] **Step 5: Glocke umhängen** — `src/components/layout/NotificationCenter.tsx`:
  - Import ergänzen: `import { useChatOverlayStore } from '@/store/chat-overlay.store'`.
  - „Alle ansehen →"-Button (`:105`): `onClick={() => { setAppView('inbox'); setOpen(false) }}` ersetzen durch:
    ```tsx
    onClick={() => { useChatOverlayStore.getState().select('inbox'); useChatOverlayStore.getState().openPanel(); setOpen(false) }}
    ```
  - Danach prüfen, ob `setAppView` / `useUiStore` in der Datei noch genutzt werden; falls nicht → Selektor `const setAppView = useUiStore(s => s.setAppView)` (`:30`) + ggf. `useUiStore`-Import entfernen.

- [ ] **Step 6: `InboxRoute` löschen**

```bash
git rm src/routes/InboxRoute.tsx
```

- [ ] **Step 7: Keine toten Verweise** — sicherstellen:

```bash
git grep -nE "appView === 'inbox'|setAppView\('inbox'\)|routes/InboxRoute|<InboxRoute" -- 'src/*' || echo "clean"
```
Erwartet: `clean` (Treffer in `docs/` ok). (`InboxPanel` bleibt natürlich.)

- [ ] **Step 8: tsc + volle Suite grün + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/components/layout/NavSidebar.tsx src/App.tsx src/store/ui.store.ts src/lib/help-content.test.ts src/components/layout/NotificationCenter.tsx
git commit -m "refactor(chat): remove Inbox nav/route; bell 'view all' opens the chat hub inbox"
```

---

## Abschluss-Verifikation

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün.
- [ ] `git grep` aus Task 4 Step 7 → `clean`.
- [ ] **Manuell (geteilter Workspace):** Chat öffnen (Topbar-Button / `Strg+Shift+K`) → landet auf **Inbox** (links oben aktiv, Badge = ungelesene Benachrichtigungen), darunter Team + Mitglieder. Klick auf eine **Aufgaben**-Benachrichtigung → springt zur To-Do, **Kachel schließt**. Klick auf eine **DM/Team**-Benachrichtigung → Kachel bleibt offen, wechselt in den Verlauf, scrollt zur Nachricht. **Glocke** oben rechts zeigt weiter die Vorschau; „Alle ansehen" öffnet die Kachel auf der Inbox. Kein „Inbox"-Eintrag mehr in der linken Haupt-Navigation.

## Spec-Coverage (Self-Review)
- §1 InboxPanel extrahieren (+ Task-Sprung schließt Kachel) → Task 1 ✅. §2 Auswahl-Typ `'inbox'` + Default → Task 2 ✅. §3 ChatSidebar Inbox-Eintrag + Badge → Task 3 ✅. §4 Overlay rechte Spalte verzweigt (InboxPanel ohne Composer, Lade-Guard) → Task 2 ✅. §5 Nav/Route/AppView/help-content entfernen + Glocke umhängen + InboxRoute löschen → Task 4 ✅. §6 Badges getrennt (Inbox=Benachrichtigungen via loudUnreadCount; Chat-Button/Nav unverändert) → Task 3 ✅.
- YAGNI: keine Inbox-Suche/Filter, keine Zähler-Zusammenführung, keine DB-Änderung.
- Typkonsistenz: `ChatOverlaySelection` (`'inbox'|'team'|{conversationId,peerId}`), `threadKeyOf` akzeptiert `'inbox'`, `InboxPanel` durchgängig.
