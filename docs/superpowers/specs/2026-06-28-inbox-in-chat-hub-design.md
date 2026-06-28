# Inbox in den Chat-Hub — Design-Spec

**Datum:** 2026-06-28
**Branch-Kontext:** `feature/erechnung-2026-06-21` (baut auf Chat-Overlay Spec 1 + Direktnachrichten Spec 2 auf)
**Status:** Design freigegeben (User-Entscheidungen unten), bereit für Plan

## Problem / Ziel

Die Inbox ist heute ein eigener Nav-Eintrag + eigene Route (`appView:'inbox'`, `InboxRoute`). Der Nutzer will den Nav-Slot sparen und den Chat zum **Kommunikations-Hub** machen: links oben die **eigene Inbox** (alle wichtigen Markierungen), darunter **Team**, dann die **DMs** — alles in der Chat-Overlay-Kachel. Klick auf „Inbox" zeigt rechts die Benachrichtigungsliste statt eines Nachrichten-Verlaufs.

## Getroffene Entscheidungen (User)

| Frage | Entscheidung |
|---|---|
| Glocke (Topbar) | **Behalten** als Schnell-Peek; ihr „Alle ansehen" öffnet die Kachel auf der Inbox. |
| Start-Ansicht beim Öffnen | **Inbox zuerst** (`selected` default `'inbox'`). |
| Nav-Eintrag, der die Kachel öffnet | Bleibt **„Team"** (kein Umbenennen in „Chat"). |
| Aufgaben-Sprung aus der Inbox | **Kachel schließen** (sonst läge sie über der Aufgabe). Nachrichten-/DM-Sprung lässt die Kachel offen und wechselt die Auswahl. |
| Datenmodell | **Keine** DB-Änderung. Reiner UI-Umbau. |

## Bestands-Fakten (verifiziert 2026-06-28)

- `InboxRoute` (`src/routes/InboxRoute.tsx`): self-contained — lädt eigene Notifications (`useNotificationsStore.load(myId)`), gruppiert via `groupNotifications` (`src/lib/chat/inbox-grouping.ts`), rendert pro Typ (`TYPE_META`) Gruppen mit `GroupRow`; `jump(n)`: `markRead` → `refType==='task'` → `useOpenTask()`; sonst `openChat({messageId, conversationId, peerId: actorId})`.
- Eingänge/Verweise auf `'inbox'`: Nav-Eintrag `NavSidebar.tsx:138-139` (`setAppView('inbox')`, `badge={loudInbox || undefined} badgeAccent`); Render-Case `App.tsx:256` (`case 'inbox': return <InboxRoute/>`) + lazy-Import; `AppView`-Typ `ui.store.ts:83`; Glocke `NotificationCenter.tsx:105` („Alle ansehen →" `setAppView('inbox')`); `help-content.test.ts:7` listet `'inbox'` als gültigen `appView`.
- Chat-Overlay: `useChatOverlayStore` (`selected: 'team' | {conversationId, peerId}`, default `'team'`, `select`, `open`, `openPanel`, `toggle`, `close`); `TeamChatOverlay` (Panel: links `ChatSidebar`, rechts `MessageList`+`ChatComposer`, plus `!isShared`-Hinweis); `ChatSidebar` (Team-Eintrag oben + Mitglieder/DMs mit Badges); `openChat(opts)` (`src/lib/open-chat.ts`) öffnet die Kachel + selektiert Team/DM + setzt `pendingScrollMessageId`.
- `useNotificationsStore`: `notifications`, `load(userId)`, `markRead`, `unreadCount()`; `loudUnreadCount(notifications)` (in `inbox-grouping` o.ä.) für „laute" Zähler.

## Design

### 1. `InboxPanel` extrahieren
Neuer `src/components/team/InboxPanel.tsx`: enthält die Listen-/Gruppen-Render-Logik, die heute in `InboxRoute` lebt (`groupNotifications`, `TYPE_META`, `GroupRow`, `labelFor`, `rowStyle`). Lädt beim Mount die eigenen Notifications (`load(myId)`). Header „Inbox" + „N ungelesen" + Leerzustand „Inbox Zero". **Kein** Nachrichten-Eingabefeld.
- `jump(n)`: `markRead(n.id)`; `refType==='task'` → `useOpenTask()(n.refId)` **und `useChatOverlayStore.getState().close()`** (Kachel schließen, damit die Aufgabe sichtbar wird); sonst `openChat({messageId, conversationId, peerId: actorId})` (selektiert Team/DM in der offenen Kachel, scrollt).
- `InboxRoute.tsx` wird gelöscht; sein Inhalt lebt in `InboxPanel` weiter. (DRY — keine Duplizierung.)

### 2. Auswahl-Typ + Default
`ChatOverlaySelection = 'inbox' | 'team' | { conversationId: string; peerId: string }`. `chat-overlay.store`: default `selected: 'inbox'`. `threadKeyOf` bleibt für `'team'`/DM zuständig (Inbox hat keinen Thread-Key — die rechte Spalte verzweigt vor `MessageList`).

### 3. `ChatSidebar` — Inbox-Eintrag oben
Neuer oberster Eintrag **„Inbox"** (Icon `Inbox`), aktiv wenn `selected==='inbox'`, Klick → `select('inbox')`. Badge = **ungelesene Benachrichtigungen** (`useNotificationsStore` — `unreadCount()` bzw. der „laute" Zähler, konsistent zum bisherigen Nav-Badge `loudInbox`). Darunter wie bisher **Team** (Chat-Ungelesen) und **Mitglieder/DMs**.

### 4. `TeamChatOverlay` — rechte Spalte verzweigt
Im Panel: `const selected = useChatOverlayStore(s => s.selected)`. Rechte Spalte:
- `selected === 'inbox'` → `<InboxPanel />` (volle Breite rechts, kein Composer).
- sonst → wie bisher `<MessageList threadKey={threadKey} />` + `<ChatComposer conversationId={conversationId} />`.
Der `!isShared`-Hinweis bleibt; im lokalen Workspace zeigt auch die Inbox den „erst teilen"-Hinweis (Benachrichtigungen sind cloud-only — `InboxPanel` lädt dann nichts / zeigt leer). Die Lade-/`markRead`-Effekte für Team/DM laufen nur, wenn `selected` eine Unterhaltung ist (nicht bei `'inbox'`).

### 5. Eingänge / Aufräumen
- **Nav „Inbox" entfernen** (`NavSidebar.tsx:138-139`) inkl. `loudInbox`-Selektor, falls sonst ungenutzt.
- **Route entfernen**: `case 'inbox'` (`App.tsx:256`) + lazy-Import von `InboxRoute`; `'inbox'` aus dem `AppView`-Typ (`ui.store.ts:83`); `'inbox'` aus der Liste in `help-content.test.ts:7`.
- **Glocke** (`NotificationCenter.tsx:105`): „Alle ansehen →" ruft statt `setAppView('inbox')` → `useChatOverlayStore.getState().select('inbox')` + `.openPanel()` (+ `setOpen(false)` für das Dropdown). Falls `setAppView` danach in der Datei ungenutzt → entfernen.
- **Nav „Team"** (aus Spec 1): bleibt; öffnet die Kachel und `select('team')` (Label = Team → wählt Team). Topbar-Chat-Button toggelt (landet auf `selected`, also beim ersten Mal Inbox). `Strg/Cmd+Shift+K` unverändert.

### 6. Badges (klar getrennt)
- Inbox-Eintrag links: ungelesene Benachrichtigungen.
- Topbar-Chat-Button-Punkt + Nav-„Team"-Badge: Chat-Ungelesen (Team+DMs) — wie Spec 2, unverändert.
- Glocke: Benachrichtigungen — unverändert.
(Bewusst kein Zusammenzählen von Chat- und Benachrichtigungs-Ungelesenen, sonst Doppelsignal.)

## Edge-Cases
- **Lokaler (nicht geteilter) Workspace:** Inbox-Panel lädt keine Benachrichtigungen (cloud-only) → Leerzustand/„erst teilen"-Hinweis; Inbox-Eintrag bleibt sichtbar, Badge 0.
- **Aufgabe aus Inbox, die gelöscht wurde:** `useOpenTask` verhält sich wie heute (kein toter Sprung) + Kachel schließt trotzdem.
- **DM-Sprung aus Inbox:** selektiert den DM; falls die Unterhaltung dem Client noch unbekannt ist, greift die bestehende `openChat`/Store-Logik (Peer = `actorId`).

## Tests
- `chat-overlay.store`: `select('inbox')` setzt `selected==='inbox'`; default ist `'inbox'`.
- `InboxPanel`: rendert Gruppen aus ungelesenen Notifications; Task-Klick → `openTask` + `close()`; Message-Klick → `openChat` (mit conversationId/peerId); Leerzustand bei 0.
- `ChatSidebar`: Inbox-Eintrag oben, aktiv bei `selected==='inbox'`, Klick → `select('inbox')`; Badge zeigt Benachrichtigungs-Ungelesene.
- `TeamChatOverlay`: bei `selected==='inbox'` rendert `InboxPanel` und **kein** `ChatComposer`; bei team/DM weiterhin `MessageList`+`ChatComposer`.
- Regression/Aufräumen: kein Verweis mehr auf `appView==='inbox'`, `setAppView('inbox')`, `InboxRoute` (tsc + Suche grün); Glocke „Alle ansehen" öffnet die Kachel auf Inbox.

## Bewusst NICHT im Scope
Inbox-Filter/Suche, „als alle gelesen"-Bulk über alle Typen (bestehendes Verhalten bleibt), Benachrichtigungs-Einstellungen, Zusammenführen von Chat- und Benachrichtigungs-Zählern. Keine DB-/Trigger-Änderung.
