# Team-Chat als Overlay-Kachel (Spec 1 von 2) — Design-Spec

**Datum:** 2026-06-28
**Branch-Kontext:** `feature/erechnung-2026-06-21` (baut auf Team-Chat P3 + members.store auf)
**Status:** Design freigegeben (User-Entscheidungen unten), bereit für Plan
**Folge-Spec:** Spec 2 = 1:1-Direktnachrichten (eigenes Datenmodell, RLS, Realtime) — **nicht** Teil dieser Spec.

## Problem / Ziel

Der Team-Chat öffnet heute einen **eigenen Tab** (`appView:'team'`, Vollansicht) bzw. eine schmale rechte Schublade (`ChatDrawer`). Der Nutzer möchte ihn — wie Quick Capture — als **schwebende Kachel über der aktuellen Ansicht** öffnen, ohne den Kontext zu verlieren. Die Kachel soll bereits die **WhatsApp-Optik** tragen: links eine Liste (oben „Team", darunter die Mitglieder), rechts der Verlauf.

**Ziel dieser Spec:** Die bestehende Team-Chat-Funktion (ein gemeinsamer Workspace-Stream) als **große, mittige Overlay-Kachel** verfügbar machen, mit zweispaltiger Optik. **Kein** neues Datenmodell, **keine** echten 1:1-Chats — die Mitglieder links erscheinen, sind aber bis Spec 2 inaktiv („bald").

## Getroffene Entscheidungen (User)

| Frage | Entscheidung |
|---|---|
| Chat-Modell (Zielbild) | **Team-Kanal + DMs nebeneinander** (Slack-Modell). Der gemeinsame Stream bleibt als Eintrag „Team" oben; DMs kommen in Spec 2. |
| Aufteilung | **Erst Overlay (diese Spec), dann DMs (Spec 2).** Zwei getrennte Specs. |
| Optik jetzt | **Zweispaltig schon jetzt**: links Liste (Team + Mitglieder), rechts Verlauf. Mitglieder grau/„bald", nicht klickbar. |
| Bau-Ansatz | **Ansatz A**: neue `TeamChatOverlay`-Komponente nach Quick-Capture-Muster; `MessageList`/`ChatComposer` wiederverwenden; **alten `team`-Tab und `ChatDrawer` entfernen** → eine Chat-Oberfläche. |
| Kachel-Form | **Groß & mittig** (modal-artig) mit abgedunkeltem Backdrop. |
| Datenmodell | **Keine** DB-/RLS-/Migrations-Änderung in dieser Spec. Reiner Frontend-Umbau. |

## Bestands-Fakten (Explore 2026-06-28)

- **Chat-Datenmodell:** ein flacher Workspace-Stream. `messages` (`supabase/migrations/0019_team_chat.sql:16-30`) hat **nur** `workspace_id` als Scope — kein `channel_id`/`conversation_id`/`recipient_id`. RLS = „jedes Mitglied liest alles". (→ 1:1-DMs sind ein eigenes Teilsystem = Spec 2.)
- **Store:** `useMessagesStore` (`src/store/messages.store.ts:6-15`) — eine flache `messages: Message[]` pro `workspaceId`; `loadRecent/loadMore/appendRealtime/send`. Cloud-only (`src/data/messages.gateway.ts`), no-op wenn `!isActiveWorkspaceShared()`.
- **Realtime:** `src/core/sync/useWorkspaceRealtime.ts:103-104` — INSERT auf `messages` gefiltert nach `workspace_id`.
- **UI heute:** Vollansicht `src/routes/TeamChatRoute.tsx` (`<MessageList/>` + `<ChatComposer/>`, **keine** Mitgliederspalte). Rechte Schublade `src/components/team/ChatDrawer.tsx` (`position:fixed; right:0; width:340; zIndex:180`), geöffnet via `useUiStore.toggleChatDrawer()` (Trigger `src/components/layout/Topbar.tsx:71`). Kein Member-Klick existiert heute.
- **Routing:** `AppView`-Typ in `src/store/ui.store.ts:82`; Nav-Eintrag „Team" `src/components/layout/NavSidebar.tsx:151-152` (`setAppView('team')`); Render-Switch `src/App.tsx:243` (`case 'team': return <TeamChatRoute/>`).
- **Quick-Capture-Muster (Vorlage):** Store `src/store/global-composer.store.ts` (`open/toggle/close/openPanel`); Komponente `src/components/global/GlobalQuickComposer.tsx` (zwei `createPortal(document.body)`: Backdrop `zIndex:750` + Panel `zIndex:760`, framer-motion); global gemountet `src/App.tsx:302`; Shortcut `Strg/Cmd+K` (`GlobalQuickComposer.tsx:56-63`).
- **Mitglieder:** `useMembersStore.members()` (`src/store/members.store.ts:62-65`) → `MemberProfile[]` (`{id, displayName, email}`); eigene ID via `useAuthStore(s => s.user?.id)`; `nameOf(userId)` für Klarnamen.

## Design

### 1. Overlay-Store
Neuer winziger Zustand-Store `useChatOverlayStore` (`src/store/chat-overlay.store.ts`), analog `global-composer.store.ts`:
```ts
interface ChatOverlayState {
  open: boolean
  selected: 'team'            // Spec 2 erweitert auf: 'team' | { dm: string }
  toggle(): void
  openPanel(): void
  close(): void
  select(s: 'team'): void     // Spec 2 erweitert die Signatur
}
```
`selected` ist bewusst schon vorhanden, defaultet auf `'team'`, und wird in Spec 2 zur Auswahl der DM-Unterhaltung.

### 2. Komponente `TeamChatOverlay`
`src/components/team/TeamChatOverlay.tsx`, global in `App.tsx` gemountet (Geschwister von `GlobalQuickComposer`). Rendert via `createPortal(document.body)`:
- **Backdrop:** `position:fixed; inset:0; zIndex:850; background: oklch(0% 0 0 / 0.35)`; Klick schließt. (Über dem QuickComposer-Backdrop 750, damit sie sich nicht überlagern; QuickComposer-Bubble 800 bleibt darunter — beide nie gleichzeitig nötig, aber Z-Reihenfolge ist definiert.)
- **Kachel:** mittig (`top:50%; left:50%; transform:translate(-50%,-50%)`), `zIndex:860`, `width:min(880px, calc(100vw - 64px))`, `height:min(640px, calc(100vh - 96px))`, `borderRadius:16`, `boxShadow:var(--shadow-2)`, framer-motion (`scale:0.96→1`, `opacity`, ~200ms). `Esc` schließt (nur wenn offen und Fokus nicht in einem Eingabefeld — wie QuickComposer).
- **Innen-Layout:** Header (Titel „Team-Chat" + X) und darunter ein zweispaltiges Flex:
  - **Links** `ChatSidebar` (neue Komponente, ~240px, eigener Scroll).
  - **Rechts** Flex-Spalte: `<MessageList />` (scrollt) + `<ChatComposer />` unten. **Beide unverändert wiederverwendet.**

### 3. `ChatSidebar` (linke Spalte)
`src/components/team/ChatSidebar.tsx`:
- Oberster Eintrag **„Team"** (z.B. `#`/Gruppen-Icon), `active` wenn `selected==='team'`, Klick → `select('team')` (in Spec 1 ohnehin der einzige aktive Zustand). Aktiv-Hervorhebung via bestehende Token (`--surface-2`/Akzent).
- Darunter **Trennlinie**, dann Überschrift „Mitglieder" und alle `members()` (Klarname via `displayName`, eigener Eintrag mit „(du)"). Diese Einträge sind **disabled**: gedämpfte Farbe (`--fg-dim`), `cursor:default`, kein `onClick`, dezenter Badge/Hinweis **„bald"**. Kein Avatar-Pflicht (Initiale reicht, falls vorhanden).
- Leerer/Solo-Workspace: nur „Team" sichtbar (keine weiteren Mitglieder) — kein Sonderfall nötig.

### 4. Eingänge vereinheitlichen (Aufräumen)
- **Nav „Team"** (`NavSidebar.tsx:151-152`): statt `setAppView('team')` → `useChatOverlayStore.getState().openPanel()`. `active`-Zustand kann an `useChatOverlayStore(s => s.open)` gekoppelt werden.
- **Topbar-Chat-Button** (`Topbar.tsx:71`): statt `toggleChatDrawer()` → `useChatOverlayStore.getState().toggle()`.
- **Shortcut:** `Strg/Cmd+Shift+K` toggelt das Overlay (im `TeamChatOverlay` per `window`-Listener, analog QuickComposer; `Strg+K` bleibt Quick Capture).
- **Entfernen:**
  - `case 'team'` aus dem Render-Switch (`App.tsx:243`) und `'team'` aus dem `AppView`-Typ (`ui.store.ts:82`), inkl. evtl. Default-/Persistenz-Verweise.
  - `src/routes/TeamChatRoute.tsx` löschen (Inhalt lebt im Overlay weiter).
  - `ChatDrawer` (`src/components/team/ChatDrawer.tsx`) und seine Montage in `App.tsx:304` entfernen; `toggleChatDrawer`/zugehörigen UI-State aus `ui.store.ts` entfernen, sofern nirgends sonst genutzt (vor dem Löschen Repo-weit prüfen).
- **Inbox/Glocke bleibt unangetastet** (eigenes Feature).

### 5. Daten / Verhalten
- `MessageList`/`ChatComposer` arbeiten unverändert gegen `useMessagesStore` (Team-Stream). `loadRecent(workspaceId)` wird wie bisher angestoßen (heute beim Mounten der Chat-Oberfläche) — beim Öffnen des Overlays sicherstellen, dass `loadRecent` läuft (so wie es heute beim Betreten der Team-Ansicht/Drawer passiert).
- Realtime unverändert (globaler Workspace-Listener läuft bereits app-weit).

### 6. Edge-Cases
- **Nicht-geteilter (lokaler) Workspace:** Chat ist cloud-only; `useMessagesStore` no-op → die rechte Spalte zeigt den bestehenden Leer-/Hinweiszustand (wie heute). Die Kachel öffnet trotzdem; Verhalten = wie aktuelle Team-Ansicht im Solo-Fall.
- **Overlay offen + Quick Capture öffnen:** beide sind Portale; Z-Reihenfolge definiert. Kein gemeinsamer State; nebeneinander unkritisch (Quick-Capture-Panel 760 < Chat 860 → Chat läge oben; akzeptiert, da seltener Doppelfall).
- **Mitglied-Klick:** in Spec 1 bewusst wirkungslos (disabled) — keine Navigation, kein Fehler.

## Tests
- `useChatOverlayStore`: `openPanel`/`close`/`toggle` schalten `open`; `select('team')` setzt `selected`.
- `ChatSidebar`: rendert „Team" als aktiv bei `selected==='team'`; rendert je Mitglied einen **disabled** Eintrag (kein `onClick`, „bald"-Hinweis, Klick löst nichts aus); eigener Eintrag trägt „(du)".
- `TeamChatOverlay`: bei `open=true` gerendert (Portal), bei `open=false` nicht; rendert `MessageList` im rechten Bereich; `Esc`/Backdrop-Klick rufen `close`.
- Eingänge: Nav-„Team"-Klick und Topbar-Button rufen `openPanel`/`toggle` (statt `setAppView`/`toggleChatDrawer`).
- Regression/Aufräumen: kein verbleibender Verweis auf `appView==='team'`, `TeamChatRoute`, `ChatDrawer`, `toggleChatDrawer` (tsc + Suche grün).

## Bewusst NICHT im Scope (→ Spec 2 oder verworfen)
1:1-DM-Datenmodell (`conversations`/`recipient_id`), DM-RLS, DM-Realtime-Filter, klickbare Mitglieder, Gruppen-Chats, Ungelesen-Zähler pro Unterhaltung, Lesebestätigungen, Suche im Chat. Inbox/Glocke unverändert. Keine Änderung an `messages`-Schema oder Triggern.
