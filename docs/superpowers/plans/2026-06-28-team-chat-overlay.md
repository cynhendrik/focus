# Team-Chat Overlay-Kachel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Team-Chat als große, mittige Overlay-Kachel über der aktuellen Ansicht öffnen (statt eigenem Tab/Drawer), mit zweispaltiger WhatsApp-Optik (links Team + Mitglieder, rechts Verlauf).

**Architecture:** Neuer winziger Zustand-Store `useChatOverlayStore` (nach Vorbild `global-composer.store.ts`) + Komponente `TeamChatOverlay` (Portal über `document.body`, Backdrop, framer-motion, global in `App.tsx` gemountet), die die **unveränderten** `MessageList`/`ChatComposer` im rechten Bereich und eine neue `ChatSidebar` links wiederverwendet. Alle Eingänge (Nav „Team", Topbar-Button, Inbox-/Glocken-Sprung) zeigen auf das Overlay; der alte `team`-Tab und der `ChatDrawer` werden entfernt. Keine Datenbank-Änderung.

**Tech Stack:** React 18 + TypeScript, Zustand, framer-motion, `react-dom/createPortal`, Vitest + @testing-library/react.

## Global Constraints

- **Keine** DB-/RLS-/Migrations-Änderung. Reiner Frontend-Umbau. Der Chat bleibt der bestehende einzelne Workspace-Stream (`useMessagesStore`).
- `MessageList` und `ChatComposer` werden **unverändert** wiederverwendet (nicht umschreiben).
- Mitglieder in der linken Spalte sind in dieser Spec **inaktiv** („bald"): keine `onClick`, gedämpfte Farbe, kein Sprung. Werden erst in Spec 2 (DMs) scharf geschaltet.
- Kachel-Form: **groß & mittig** mit abgedunkeltem Backdrop. Größe `width: min(880px, calc(100vw - 64px))`, `height: min(640px, calc(100vh - 96px))`.
- Z-Index: Backdrop `850`, Kachel `860` (über QuickComposer-Panel 760 / Bubble 800).
- Tastenkürzel **`Strg/Cmd+Shift+K`** toggelt das Overlay (`Strg+K` bleibt Quick Capture); `Esc` und Backdrop-Klick schließen.
- Entfernt am Ende: `appView:'team'`, `TeamChatRoute`, `ChatDrawer`, `toggleChatDrawer`/`setChatDrawerOpen`/`chatDrawerOpen`. Inbox/Glocke bleiben funktional (jetzt → Overlay).
- Git: nur **gezielte** `git add <pfad>` — niemals `git add -A`/`.`. **Nicht anfassen:** `.gitignore`, `cultera-focus-updater.key.OLD*`.
- Nach jeder Task: `npx tsc --noEmit -p tsconfig.json` sauber + `npx vitest run` grün (aktuell 590 Tests Basis).

---

### Task 1: `useChatOverlayStore` (Overlay-Zustand)

**Files:**
- Create: `src/store/chat-overlay.store.ts`
- Test: `src/store/chat-overlay.store.test.ts`

**Interfaces:**
- Produces: `useChatOverlayStore` mit `{ open: boolean; selected: ChatOverlaySelection; toggle(): void; openPanel(): void; close(): void; select(s: ChatOverlaySelection): void }` und exportiertem Typ `export type ChatOverlaySelection = 'team'` (Spec 2 erweitert auf `'team' | { dm: string }`).

- [ ] **Step 1: Failing test schreiben** — `src/store/chat-overlay.store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useChatOverlayStore } from './chat-overlay.store'

beforeEach(() => { useChatOverlayStore.setState({ open: false, selected: 'team' }) })

describe('useChatOverlayStore', () => {
  it('openPanel öffnet, close schließt', () => {
    useChatOverlayStore.getState().openPanel()
    expect(useChatOverlayStore.getState().open).toBe(true)
    useChatOverlayStore.getState().close()
    expect(useChatOverlayStore.getState().open).toBe(false)
  })

  it('toggle kippt open hin und her', () => {
    useChatOverlayStore.getState().toggle()
    expect(useChatOverlayStore.getState().open).toBe(true)
    useChatOverlayStore.getState().toggle()
    expect(useChatOverlayStore.getState().open).toBe(false)
  })

  it('select setzt die Auswahl', () => {
    useChatOverlayStore.getState().select('team')
    expect(useChatOverlayStore.getState().selected).toBe('team')
  })
})
```

- [ ] **Step 2: Test laufen lassen → FAIL** — `npx vitest run src/store/chat-overlay.store.test.ts` — erwartet: Fehler „Cannot find module './chat-overlay.store'".

- [ ] **Step 3: Store implementieren** — `src/store/chat-overlay.store.ts`:

```ts
import { create } from 'zustand'

/** Spec 2 erweitert dies auf: 'team' | { dm: string } (Direktnachrichten). */
export type ChatOverlaySelection = 'team'

interface ChatOverlayState {
  open: boolean
  selected: ChatOverlaySelection
  toggle: () => void
  openPanel: () => void
  close: () => void
  select: (s: ChatOverlaySelection) => void
}

export const useChatOverlayStore = create<ChatOverlayState>()((set) => ({
  open: false,
  selected: 'team',
  toggle: () => set(s => ({ open: !s.open })),
  openPanel: () => set({ open: true }),
  close: () => set({ open: false }),
  select: (selected) => set({ selected }),
}))
```

- [ ] **Step 4: Test laufen lassen → PASS** — `npx vitest run src/store/chat-overlay.store.test.ts` — erwartet: 3 passed.

- [ ] **Step 5: tsc + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/store/chat-overlay.store.ts src/store/chat-overlay.store.test.ts
git commit -m "feat(chat): chat-overlay store (open/select)"
```

---

### Task 2: `ChatSidebar` (linke Spalte: Team + Mitglieder)

**Files:**
- Create: `src/components/team/ChatSidebar.tsx`
- Test: `src/components/team/ChatSidebar.test.tsx`

**Interfaces:**
- Consumes: `useChatOverlayStore` (`selected`, `select`), `useMembersStore().members()` → `MemberProfile[]` (`{ id: string; displayName: string; email: string | null }`), `useAuthStore(s => s.user?.id)`.
- Produces: `export function ChatSidebar()` (keine Props).

- [ ] **Step 1: Failing test schreiben** — `src/components/team/ChatSidebar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ChatSidebar } from './ChatSidebar'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'

beforeEach(() => {
  useChatOverlayStore.setState({ open: true, selected: 'team' })
  useMembersStore.setState({
    profiles: {
      me: { id: 'me', displayName: 'Ich Selbst', email: null },
      u2: { id: 'u2', displayName: 'Anna Vogel', email: null },
    },
    memberIds: ['me', 'u2'],
  })
  useAuthStore.setState({ user: { id: 'me' } as any })
})
afterEach(cleanup)

describe('ChatSidebar', () => {
  it('zeigt den Team-Eintrag', () => {
    render(<ChatSidebar />)
    expect(screen.getByText('Team')).toBeTruthy()
  })

  it('listet Mitglieder mit "(du)" beim eigenen Eintrag + "bald"-Badge, nicht klickbar', () => {
    const select = vi.fn()
    useChatOverlayStore.setState({ select })
    render(<ChatSidebar />)
    expect(screen.getByText('Ich Selbst (du)')).toBeTruthy()
    expect(screen.getByText('Anna Vogel')).toBeTruthy()
    expect(screen.getAllByText('bald').length).toBe(2)
    // Klick auf ein Mitglied löst keine Auswahl aus (disabled).
    fireEvent.click(screen.getByText('Anna Vogel'))
    expect(select).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test laufen lassen → FAIL** — `npx vitest run src/components/team/ChatSidebar.test.tsx` — erwartet: „Cannot find module './ChatSidebar'".

- [ ] **Step 3: Komponente implementieren** — `src/components/team/ChatSidebar.tsx`:

```tsx
import { Hash } from 'lucide-react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'

/**
 * Linke Spalte der Chat-Kachel: oben der gemeinsame „Team"-Kanal (aktiv),
 * darunter die Mitglieder. Mitglieder sind in dieser Spec inaktiv („bald") —
 * Direktnachrichten kommen in Spec 2.
 */
export function ChatSidebar() {
  const selected = useChatOverlayStore(s => s.selected)
  const select   = useChatOverlayStore(s => s.select)
  const members  = useMembersStore(s => s.members())
  const myId     = useAuthStore(s => s.user?.id)

  const teamActive = selected === 'team'

  return (
    <div style={{
      width: 240, flexShrink: 0, borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--surface-2)',
    }}>
      <button
        onClick={() => select('team')}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
          background: teamActive ? 'var(--surface)' : 'transparent',
          color: teamActive ? 'var(--fg)' : 'var(--fg-muted)',
          fontSize: 13.5, fontWeight: teamActive ? 700 : 600,
          borderLeft: `2px solid ${teamActive ? 'var(--accent)' : 'transparent'}`,
        }}
      >
        <Hash size={15} /> Team
      </button>

      <div style={{
        padding: '12px 12px 4px', fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)',
      }}>
        Mitglieder
      </div>

      {members.map(m => (
        <div
          key={m.id}
          aria-disabled
          title="Direktnachrichten kommen bald"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '8px 12px', cursor: 'default', color: 'var(--fg-dim)', fontSize: 13,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.displayName}{m.id === myId ? ' (du)' : ''}
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', opacity: 0.7,
          }}>
            bald
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Test laufen lassen → PASS** — `npx vitest run src/components/team/ChatSidebar.test.tsx` — erwartet: 2 passed.

- [ ] **Step 5: tsc + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/components/team/ChatSidebar.tsx src/components/team/ChatSidebar.test.tsx
git commit -m "feat(chat): ChatSidebar (Team + Mitglieder, Mitglieder noch inaktiv)"
```

---

### Task 3: `TeamChatOverlay` (Kachel + Portal + Shortcut) + Mount in App

**Files:**
- Create: `src/components/team/TeamChatOverlay.tsx`
- Test: `src/components/team/TeamChatOverlay.test.tsx`
- Modify: `src/App.tsx` (Import + Mount neben `GlobalQuickComposer`)

**Interfaces:**
- Consumes: `useChatOverlayStore` (`open`, `toggle`, `close`), `useMessagesStore(s => s.loadRecent)`, `useWorkspaceStore` (`activeWorkspaceId`, `isActiveWorkspaceShared()`), `ChatSidebar` (Task 2), `MessageList`/`ChatComposer` (bestehend).
- Produces: `export function TeamChatOverlay()` — global gemountet; öffnet/schließt rein über `useChatOverlayStore`.

- [ ] **Step 1: Failing test schreiben** — `src/components/team/TeamChatOverlay.test.tsx` (framer-motion + schwere Kinder werden gemockt, damit der Test die Overlay-Logik isoliert prüft):

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createElement, Fragment } from 'react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useMessagesStore } from '@/store/messages.store'

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => createElement(Fragment, null, children),
  motion: {
    div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: any) =>
      createElement('div', rest, children),
  },
}))
vi.mock('./ChatSidebar',  () => ({ ChatSidebar:  () => createElement('div', { 'data-testid': 'chat-sidebar' }) }))
vi.mock('./MessageList',  () => ({ MessageList:  () => createElement('div', { 'data-testid': 'message-list' }) }))
vi.mock('./ChatComposer', () => ({ ChatComposer: () => null }))

import { TeamChatOverlay } from './TeamChatOverlay'

beforeEach(() => {
  useChatOverlayStore.setState({ open: false, selected: 'team' })
  useMessagesStore.setState({ loadRecent: vi.fn() } as any)
  useWorkspaceStore.setState({ isActiveWorkspaceShared: () => true, activeWorkspaceId: 'ws1' } as any)
})
afterEach(cleanup)

describe('TeamChatOverlay', () => {
  it('rendert nichts wenn geschlossen', () => {
    render(<TeamChatOverlay />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zeigt MessageList + Sidebar wenn offen und Workspace geteilt', () => {
    useChatOverlayStore.setState({ open: true })
    render(<TeamChatOverlay />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('message-list')).toBeTruthy()
    expect(screen.getByTestId('chat-sidebar')).toBeTruthy()
  })

  it('zeigt den Teilen-Hinweis wenn Workspace nicht geteilt', () => {
    useWorkspaceStore.setState({ isActiveWorkspaceShared: () => false, activeWorkspaceId: 'ws1' } as any)
    useChatOverlayStore.setState({ open: true })
    render(<TeamChatOverlay />)
    expect(screen.queryByTestId('message-list')).toBeNull()
    expect(screen.getByText(/geteilt ist/)).toBeTruthy()
  })

  it('Escape schließt', () => {
    useChatOverlayStore.setState({ open: true })
    render(<TeamChatOverlay />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useChatOverlayStore.getState().open).toBe(false)
  })

  it('Strg+Shift+K toggelt', () => {
    render(<TeamChatOverlay />)
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true, shiftKey: true })
    expect(useChatOverlayStore.getState().open).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen → FAIL** — `npx vitest run src/components/team/TeamChatOverlay.test.tsx` — erwartet: „Cannot find module './TeamChatOverlay'".

- [ ] **Step 3: Komponente implementieren** — `src/components/team/TeamChatOverlay.tsx`:

```tsx
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMessagesStore } from '@/store/messages.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { ChatSidebar } from './ChatSidebar'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'

/**
 * Team-Chat als große, mittige Overlay-Kachel — global gemountet, öffnet sich
 * über der aktuellen Ansicht (wie Quick Capture). Links die ChatSidebar
 * (Team + Mitglieder), rechts der bestehende Verlauf. Ersetzt den früheren
 * `team`-Tab und den rechten ChatDrawer.
 */
export function TeamChatOverlay() {
  const open   = useChatOverlayStore(s => s.open)
  const toggle = useChatOverlayStore(s => s.toggle)
  const close  = useChatOverlayStore(s => s.close)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); return }
      if (e.key === 'Escape' && open && !inField) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, close, open])

  return <AnimatePresence>{open && <Panel onClose={close} />}</AnimatePresence>
}

function Panel({ onClose }: { onClose: () => void }) {
  const loadRecent = useMessagesStore(s => s.loadRecent)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())

  useEffect(() => {
    if (activeWorkspaceId && isShared) void loadRecent(activeWorkspaceId)
  }, [activeWorkspaceId, isShared, loadRecent])

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 850, background: 'oklch(0% 0 0 / 0.35)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit   ={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.1, 1] }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Team-Chat"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 860,
          width: 'min(880px, calc(100vw - 64px))', height: 'min(640px, calc(100vh - 96px))',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 24px 60px -16px oklch(0% 0 0 / 0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>Team-Chat</span>
          <button className="icon-btn" title="Schließen" onClick={onClose}><X size={16} /></button>
        </div>

        {!isShared ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--fg-dim)',
          }}>
            Team-Chat erscheint, sobald dieser Workspace geteilt ist (Einstellungen → Workspace teilen).
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <ChatSidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <MessageList />
              <ChatComposer />
            </div>
          </div>
        )}
      </motion.div>
    </>,
    document.body,
  )
}
```

- [ ] **Step 4: Test laufen lassen → PASS** — `npx vitest run src/components/team/TeamChatOverlay.test.tsx` — erwartet: 5 passed.

- [ ] **Step 5: In `App.tsx` mounten** — Import neben den anderen team/global-Importen ergänzen (z.B. direkt nach `import { ChatDrawer } from '@/components/team/ChatDrawer'`, Zeile ~76):

```tsx
import { TeamChatOverlay } from '@/components/team/TeamChatOverlay'
```

Und im JSX die Kachel als Geschwister neben `GlobalQuickComposer` mounten — die Zeile `<Suspense fallback={null}><GlobalQuickComposer /></Suspense>` (App.tsx:302) wird zu:

```tsx
      <Suspense fallback={null}><GlobalQuickComposer /></Suspense>
      <TeamChatOverlay />
      <HelpDrawer />
```

(Der alte `<ChatDrawer />` bleibt in dieser Task noch stehen — er wird erst in Task 5 entfernt.)

- [ ] **Step 6: Volle Suite + tsc + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/components/team/TeamChatOverlay.tsx src/components/team/TeamChatOverlay.test.tsx src/App.tsx
git commit -m "feat(chat): TeamChatOverlay (mittige Kachel, Strg+Shift+K), global gemountet"
```

Erwartet: tsc sauber; Suite grün (Basis 590 + 10 neue = 600). Das Overlay ist jetzt per `Strg+Shift+K` bedienbar; die Nav/Topbar-Eingänge folgen in Task 4.

---

### Task 4: Eingänge auf das Overlay umlenken (`openChat`-Helfer + Nav/Topbar/Inbox/Glocke)

**Files:**
- Create: `src/lib/open-chat.ts`
- Test: `src/lib/open-chat.test.ts`
- Modify: `src/components/layout/NavSidebar.tsx:151-152`
- Modify: `src/components/layout/Topbar.tsx:31-32,69-76`
- Modify: `src/components/layout/NotificationCenter.tsx:45-51`
- Modify: `src/routes/InboxRoute.tsx:33-39`

**Interfaces:**
- Produces: `export function openChat(messageId?: string | null): void` — setzt optional `pendingScrollMessageId` (für den Sprung zu einer Nachricht), wählt `'team'` und öffnet das Overlay.
- Consumes: `useUiStore.setPendingScrollMessageId`, `useChatOverlayStore` (`select`, `openPanel`, `toggle`, `open`).

- [ ] **Step 1: Failing test schreiben** — `src/lib/open-chat.test.ts`:

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
  it('öffnet das Overlay und wählt Team', () => {
    openChat()
    expect(useChatOverlayStore.getState().open).toBe(true)
    expect(useChatOverlayStore.getState().selected).toBe('team')
  })

  it('merkt sich die Nachricht für den Scroll-Sprung', () => {
    openChat('m-42')
    expect(useUiStore.getState().pendingScrollMessageId).toBe('m-42')
    expect(useChatOverlayStore.getState().open).toBe(true)
  })

  it('ohne messageId bleibt der Scroll-Merker unverändert (null)', () => {
    openChat()
    expect(useUiStore.getState().pendingScrollMessageId).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen lassen → FAIL** — `npx vitest run src/lib/open-chat.test.ts` — erwartet: „Cannot find module './open-chat'".

- [ ] **Step 3: Helfer implementieren** — `src/lib/open-chat.ts`:

```ts
import { useUiStore } from '@/store/ui.store'
import { useChatOverlayStore } from '@/store/chat-overlay.store'

/**
 * Öffnet die Team-Chat-Kachel (Team-Kanal). Mit `messageId` springt die
 * MessageList nach dem Öffnen zu dieser Nachricht (Inbox-/Glocken-Sprung).
 * Gemeinsamer Eingang für Glocke, Inbox-Route und künftige Sprünge.
 */
export function openChat(messageId?: string | null): void {
  if (messageId) useUiStore.getState().setPendingScrollMessageId(messageId)
  useChatOverlayStore.getState().select('team')
  useChatOverlayStore.getState().openPanel()
}
```

- [ ] **Step 4: Test laufen lassen → PASS** — `npx vitest run src/lib/open-chat.test.ts` — erwartet: 3 passed.

- [ ] **Step 5: NavSidebar umlenken** — `src/components/layout/NavSidebar.tsx`. Oben Import ergänzen:

```tsx
import { useChatOverlayStore } from '@/store/chat-overlay.store'
```

Im Komponenten-Body (bei den anderen `useUiStore`-Selektoren) ergänzen:

```tsx
  const chatOpen    = useChatOverlayStore(s => s.open)
  const openChatNav = useChatOverlayStore(s => s.openPanel)
```

Den „Team"-`NavItem` (Zeilen 151-152) ersetzen:

```tsx
      <NavItem icon={MessagesSquare} label="Team" active={chatOpen}
        onClick={() => openChatNav()} />
```

- [ ] **Step 6: Topbar umlenken** — `src/components/layout/Topbar.tsx`. Import ergänzen:

```tsx
import { useChatOverlayStore } from '@/store/chat-overlay.store'
```

Die beiden Drawer-Selektoren (Zeilen 31-32) ersetzen:

```tsx
  const chatOpen   = useChatOverlayStore(s => s.open)
  const toggleChat = useChatOverlayStore(s => s.toggle)
```

Den Chat-Button (Zeilen 69-76) auf die neuen Namen umstellen:

```tsx
        <button
          className="icon-btn"
          onClick={toggleChat}
          title="Team-Chat"
          style={{ color: chatOpen ? 'var(--accent)' : undefined }}
        >
          <MessagesSquare size={16} />
        </button>
```

- [ ] **Step 7: Glocke (NotificationCenter) umlenken** — `src/components/layout/NotificationCenter.tsx`. Import ergänzen:

```tsx
import { openChat } from '@/lib/open-chat'
```

Die `jump`-Funktion (Zeilen 45-51) so ändern, dass der Message-Sprung das Overlay öffnet:

```tsx
  const jump = (n: Notification) => {
    void markRead(n.id)
    setOpen(false)
    if (n.refType === 'task') { openTask(n.refId); return }
    openChat(n.messageId ?? null)
  }
```

Danach prüfen, ob `setAppView`/`setPendingScrollMsg` in dieser Datei noch anderweitig verwendet werden; falls **nicht**, die jetzt ungenutzten Selektoren/Imports entfernen (tsc-`noUnusedLocals` schlägt sonst an). `openChat` übernimmt das Setzen von `pendingScrollMessageId`.

- [ ] **Step 8: Inbox-Route umlenken** — `src/routes/InboxRoute.tsx`. Import ergänzen:

```tsx
import { openChat } from '@/lib/open-chat'
```

Die `jump`-Funktion (Zeilen 33-39) ändern:

```tsx
  const jump = (n: Notification) => {
    void markRead(n.id)
    if (n.refType === 'task') { openTask(n.refId); return }
    // ref_type === 'message' → Chat-Kachel öffnen + zur Nachricht scrollen.
    openChat(n.messageId ?? null)
  }
```

Danach ebenfalls jetzt ungenutzte `setAppView`/`setPendingScrollMsg`-Selektoren/Imports in dieser Datei entfernen, falls nirgends sonst genutzt.

- [ ] **Step 9: Volle Suite + tsc + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/lib/open-chat.ts src/lib/open-chat.test.ts src/components/layout/NavSidebar.tsx src/components/layout/Topbar.tsx src/components/layout/NotificationCenter.tsx src/routes/InboxRoute.tsx
git commit -m "feat(chat): Nav/Topbar/Inbox/Glocke öffnen die Chat-Kachel (statt team-Tab/Drawer)"
```

Erwartet: tsc sauber; Suite grün (jetzt 603). Alle Eingänge öffnen die Overlay-Kachel; der alte `team`-Tab/`ChatDrawer` ist nicht mehr erreichbar (wird in Task 5 gelöscht).

---

### Task 5: Tote Oberflächen entfernen (`team`-Tab, `ChatDrawer`, `TeamChatRoute`)

**Files:**
- Modify: `src/store/ui.store.ts` (AppView ohne `'team'`; `chatDrawerOpen`/`toggleChatDrawer`/`setChatDrawerOpen` raus)
- Modify: `src/App.tsx` (`case 'team'` + `TeamChatRoute`-Lazy + `ChatDrawer`-Import/-Mount raus)
- Modify: `src/components/layout/Topbar.tsx` (toten `team:`-Eintrag aus `VIEW_META` raus)
- Delete: `src/routes/TeamChatRoute.tsx`
- Delete: `src/components/team/ChatDrawer.tsx`

**Interfaces:**
- Consumes: nichts Neues. Reine Entfernung; Verhalten unverändert (Chat läuft über das Overlay aus Task 3/4).

- [ ] **Step 1: `AppView` bereinigen** — `src/store/ui.store.ts:82-83`. In der `AppView`-Union das `'team'` entfernen. Die Zeile

```tsx
  | 'notes'     | 'inbox'     | 'sales'     | 'team'
```

wird zu:

```tsx
  | 'notes'     | 'inbox'     | 'sales'
```

- [ ] **Step 2: Drawer-State aus `ui.store.ts` entfernen** — alle vier Vorkommen löschen:
  - Interface (Zeile 103): `chatDrawerOpen: boolean` entfernen.
  - Interface (Zeilen 126-127): `toggleChatDrawer: () => void` und `setChatDrawerOpen: (open: boolean) => void` entfernen.
  - Initialwert (Zeile 151): `chatDrawerOpen: false,` entfernen.
  - Aktionen (Zeilen 196-200): den `toggleChatDrawer`- und `setChatDrawerOpen`-Block entfernen.
  - `partialize` (Zeile 248): `chatDrawerOpen: s.chatDrawerOpen,` entfernen.

- [ ] **Step 3: `App.tsx` bereinigen**
  - Lazy-Import entfernen (Zeile 44): `const TeamChatRoute = lazy(() => named(import('@/routes/TeamChatRoute'), 'TeamChatRoute'))`.
  - `ChatDrawer`-Import entfernen (Zeile 76): `import { ChatDrawer } from '@/components/team/ChatDrawer'`.
  - Render-Switch-Zeile entfernen (Zeile 243): `case 'team':            return <TeamChatRoute />`.
  - Mount entfernen (Zeile 304): `<ChatDrawer />`.

- [ ] **Step 4: Toten `VIEW_META`-Eintrag entfernen** — `src/components/layout/Topbar.tsx:21`. Die Zeile

```tsx
  team:           { label: 'Team',           tag: 'CHAT',          Icon: MessagesSquare },
```

entfernen. (`VIEW_META` ist `Partial<Record<string, …>>`; der Eintrag ist nach Task 4 unerreichbar.) Prüfen, ob `MessagesSquare` in Topbar noch verwendet wird (Chat-Button nutzt es weiter — Import bleibt).

- [ ] **Step 5: Dateien löschen**

```bash
git rm src/routes/TeamChatRoute.tsx src/components/team/ChatDrawer.tsx
```

- [ ] **Step 6: Keine toten Verweise mehr** — sicherstellen, dass nichts übrig bleibt:

```bash
git grep -nE "TeamChatRoute|ChatDrawer|chatDrawerOpen|toggleChatDrawer|setChatDrawerOpen|appView === 'team'|setAppView\('team'\)" -- 'src/*' || echo "clean"
```

Erwartet: `clean` (keine Treffer in `src/`). Treffer in `docs/` sind ok.

- [ ] **Step 7: Volle Suite + tsc + Commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/store/ui.store.ts src/App.tsx src/components/layout/Topbar.tsx
git commit -m "refactor(chat): alten team-Tab + ChatDrawer entfernen (eine Chat-Kachel)"
```

Erwartet: tsc sauber; Suite grün (603). Eine einzige Chat-Oberfläche (die Overlay-Kachel); Inbox/Glocke öffnen sie; kein `team`-appView mehr.

---

## Abschluss-Verifikation

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün (Basis 590 + 13 neue ≈ 603).
- [ ] `git grep` aus Task 5 Step 6 → `clean`.
- [ ] **Manuell (geteilter Workspace):** Nav „Team" / Topbar-Chat-Button / `Strg+Shift+K` → mittige Kachel über der aktuellen Ansicht; links „Team" aktiv + Mitglieder grau mit „bald"; rechts Verlauf + Eingabe funktionieren. `Esc`/Backdrop schließen. Glocke/Inbox-Klick auf eine Nachricht → Kachel öffnet und scrollt zur Nachricht. **Lokaler (nicht geteilter) Workspace:** Kachel zeigt den Teilen-Hinweis.

## Spec-Coverage (Self-Review)
- §1 Overlay-Store → Task 1 ✅. §2 `TeamChatOverlay` (Portal/Backdrop/mittig/Shortcut/`loadRecent`/Teilen-Leerzustand) → Task 3 ✅. §3 `ChatSidebar` (Team aktiv, Mitglieder disabled „bald", „(du)") → Task 2 ✅. §4 Eingänge vereinheitlichen + Aufräumen → Task 4 (umlenken) + Task 5 (entfernen) ✅. §5 Daten/`loadRecent` beim Öffnen, Realtime unverändert → Task 3 ✅. §6 Edge-Cases (nicht-geteilt, Mitglied-Klick wirkungslos) → Task 2/3 ✅.
- Inbox/Glocke-Sprung (`pendingScrollMessageId`) bleibt erhalten → `openChat`-Helfer Task 4 ✅ (MessageList liest `pendingScrollMessageId` bereits).
- YAGNI: kein DM-Datenmodell, keine klickbaren Mitglieder, keine DB-Änderung (= Spec 2).
