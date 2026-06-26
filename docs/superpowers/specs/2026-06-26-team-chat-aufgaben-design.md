# Team-Chat + Aufgaben-Zuweisung — Design-Spec

**Datum:** 2026-06-26
**Branch-Kontext:** baut auf der Cloud-first/Realtime-Suite auf (Supabase-Projekt `mqbjmquscjtytpjebosw`)
**Status:** Design freigegeben, bereit für Implementierungsplan

## Problem / Ziel

In einem geteilten Workspace soll ein Mitglied (z. B. der Chef) einem anderen
(z. B. einem Mitarbeiter) eine Aufgabe zuweisen können. Der Empfänger sieht das
beim Einloggen, kann die Aufgabe abarbeiten und sich mit dem Zuweisenden im
Team-Kanal per Kommentar/Erwähnung austauschen ("@Max, mach das bis morgen" →
Max arbeitet ab → "@Lukas, fertig, schau dir das an").

## Getroffene Entscheidungen (Brainstorming)

| Frage | Entscheidung |
|---|---|
| Gesprächsort | **Workspace-Team-Chat** (zentraler Feed), nicht Kommentare-pro-Aufgabe |
| Kanal-Struktur | **Ein Kanal pro Workspace** (das Workspace *ist* der Kanal) |
| Task↔Chat-Kopplung | **Volle Verzahnung** — Zuweisung/Status posten Karten, Aufgaben verlinkbar, Nachricht→Aufgabe |
| Zuweisungsrecht | **Flach** — jedes Mitglied darf zuweisen (später per RBAC einschränkbar) |
| Benachrichtigung | **In-App-Inbox + Badges** (keine OS-Push), plus "Mir zugewiesen"-Ansicht |
| Chat-Platzierung | **Hybrid** — NAV-Vollansicht *plus* ausklappbarer Mini-Drawer für nebenbei |
| Architektur | **Ansatz A** — eigene `messages` + `notifications` Tabellen, cloud-first |

## Wichtige Bestands-Fakten (geprüft)

- Es gibt **keine `todos`-Tabelle**. Aufgaben sind `activities`-Zeilen mit
  `type='task'`; der Assignee ist `activities.assignee`
  (`src/data/todos.mapper.ts`, `src/store/todos.store.ts`).
- `workspace_id` ist projektweit **`text`** (nicht uuid); `is_workspace_member(text)`
  ist die etablierte RLS-Guard-Funktion (SECURITY DEFINER), aktuell nur live
  deployt, **nicht** im Repo.
- `accounts.id` / `activities.id` sind **`text`**. `customers` ist legacy/lokal,
  **nicht** in der Cloud — Kunden-Referenzen zeigen auf `accounts`.
- Konventionen (`0017_notes_module_cloud.sql`): `created_by`/`updated_by`,
  text-Zeitstempel mit `default (now())::text`, `jsonb`-Arrays, Realtime via
  `replica identity full` + `alter publication supabase_realtime add table`.
- KORA hat eine lokale `chat_messages`-Tabelle (SQLite, KI-Chat, kunden-scoped) —
  **nicht** verwechseln mit der neuen Cloud-`messages`. Migration kommentieren.
- Realtime: bestehende Kanäle filtern nur per `workspace_id=eq.X`
  (`src/core/sync/useWorkspaceRealtime.ts`); `postgres_changes` erlaubt **einen**
  Filter pro Subscription. RLS wird pro Abonnent erzwungen (User-JWT).

## Datenmodell

Zwei neue cloud-first Tabellen nach dem `note_entries`-Muster.

### Tabelle `messages` (der eine Team-Kanal)

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid pk | |
| `workspace_id` | **text** not null | Kanal-Scope |
| `created_by` | uuid not null | Autor / auslösender User |
| `kind` | text not null | `'user'` \| `'system'` |
| `body` | text not null default `''` | Nachrichtentext (bei System: Render-Hinweis) |
| `system_event` | text null | `'task_assigned'` \| `'task_completed'` \| `'task_created'` |
| `ref_type` | text null | `'task'` \| `'account'` |
| `ref_id` | **text** null | polymorphe Referenz (kein FK) |
| `mentions` | jsonb not null default `'[]'` | Array erwähnter `user_id`s |
| `created_at` | text default `(now())::text` | |
| `updated_at` | text default `(now())::text` | |
| `deleted_at` | text null | Soft-Delete |

Indexe: `messages (workspace_id, created_at)` für Verlauf + Keyset-Pagination.

RLS:
- SELECT: `using (is_workspace_member(workspace_id))`
- INSERT: `with check (is_workspace_member(workspace_id) and created_by = auth.uid())`
- UPDATE/DELETE: `using (created_by = auth.uid())` (nur eigene; Soft-Delete via `deleted_at`)

### Tabelle `notifications` (Inbox pro Empfänger)

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid pk | |
| `workspace_id` | **text** not null | |
| `user_id` | uuid not null | **Empfänger** |
| `type` | text not null | `'assigned'` \| `'mention'` \| `'comment'` \| `'completed'` |
| `actor_id` | uuid not null | wer es ausgelöst hat |
| `ref_type` | text not null | `'task'` \| `'message'` |
| `ref_id` | **text** not null | Ziel-ID |
| `message_id` | uuid null | FK → `messages(id) on delete cascade` (Sprung zur Nachricht) |
| `read_at` | text null | ungelesen ⇔ `null` |
| `created_at` | text default `(now())::text` | |

Indexe: `notifications (user_id, read_at)`, `notifications (user_id, created_at desc)`.

RLS:
- SELECT/UPDATE: `using (user_id = auth.uid())` (nur eigene; UPDATE nur um `read_at` zu setzen)
- **INSERT: keine Client-Policy.** Notifications entstehen ausschließlich über
  `SECURITY DEFINER`-Trigger (umgeht RLS, verhindert Spoofing).

## Fluss & Trigger (Auffächern serverseitig)

Clients schreiben nur Rohdaten (Aufgaben-Update, Nachricht). Zwei Postgres-Trigger
erzeugen Folge-Effekte zentral — kein Client darf `notifications` direkt schreiben.

### Trigger 1 — `AFTER UPDATE ON public.activities`

`WHEN (new.type = 'task' AND new.assignee IS DISTINCT FROM old.assignee
       AND new.assignee IS NOT NULL)`:
- INSERT `messages` (`kind='system'`, `system_event='task_assigned'`,
  `ref_type='task'`, `ref_id=new.id`, `created_by=auth.uid()`).
- INSERT `notifications` (`type='assigned'`, `user_id=new.assignee`,
  `actor_id=auth.uid()`, `ref_type='task'`, `ref_id=new.id`,
  `message_id=<die System-Nachricht>`) — **nur wenn `new.assignee <> auth.uid()`**.

`WHEN (new.type='task' AND new.status='done' AND old.status <> 'done')`:
- System-Nachricht `system_event='task_completed'` + `notifications`
  (`type='completed'`) an den Ersteller (`created_by`), falls ≠ actor.

### Trigger 2 — `AFTER INSERT ON public.messages`

`WHEN (new.kind = 'user')`:
- Für jede `user_id` in `new.mentions` (≠ actor) → `notifications` (`type='mention'`,
  `ref_type='message'`, `ref_id=new.id`, `message_id=new.id`).
- Falls `new.ref_type='task'`: `notifications` (`type='comment'`) an Assignee +
  Ersteller der Aufgabe (≠ actor, dedupliziert gegen bereits erwähnte User).

**Solo-Modus:** Schreibt lokal in SQLite → kein Postgres-Trigger feuert. Akzeptiert
(kein Team zum Benachrichtigen).

## Realtime

- `messages`: Subscription per `workspace_id=eq.X` (wie `note_entries`), aber
  **append-first** — neue Zeile aus `payload.new` anhängen statt voll neu laden;
  Verlauf per Keyset-Pagination über `(workspace_id, created_at, id)`. Der Chat
  wächst unbegrenzt; das bestehende "loadAll bei jedem Event" skaliert hier nicht.
- `notifications`: Subscription per **`user_id=eq.<ich>`** (nicht workspace_id),
  da nur ein Filter erlaubt ist und jeder nur seine eigenen braucht. RLS als Backstop.

## UI-Oberflächen

Drei Touchpoints, alle im Bestand verankert (`appView`-Enum, `NavSidebar`,
`RouteSwitch`, `NotificationCenter`):

1. **Team-Kanal (Hybrid: Vollansicht + Mini-Drawer)** — beide Surfaces teilen sich
   denselben `messages.store` und dieselben Komponenten (`MessageList`, `Composer`),
   nur der Container unterscheidet sich:
   - **Vollansicht:** neuer `appView: 'team'` + `TeamChatRoute`, `NavItem`
     (Icon `MessagesSquare`) mit ungelesen-Badge. Chat füllt den Arbeitsbereich.
   - **Mini-Drawer:** rechts ein-/ausklappbares Panel (≈340px), per Toggle-Button
     in der **Topbar** (neben der Glocke) — bewusst *nicht* unten rechts, um nicht
     mit der Quick-Capture-Blase zu kollidieren. Zustand `chatDrawerOpen` im
     `ui.store`; sichtbar unabhängig vom aktuellen `appView`. Der Drawer zeigt
     dieselbe Liste + Composer kompakt; ein „⤢"-Button springt in die Vollansicht.
   Composer (in beiden) nutzt das bestehende `MentionPopover`, erweitert um
   Mitglieder *und* Aufgaben (`@Person`, `@Aufgabe`).

   **Sprung-Verhalten (ein Klick):**
   - *Nachricht → Aufgabe:* Jede Nachricht mit `ref_type='task'` — System-Karte
     **oder** getippter Kommentar mit `@Aufgabe` — rendert den Aufgaben-Titel als
     klickbaren Chip/Karte (Titel, Fälligkeit, Status). Klick öffnet die Aufgabe
     (setzt `appView` + selektiert die Aufgabe in Heute-/Kunden-Ansicht). Verwaiste
     Referenz (Aufgabe gelöscht) → Chip inaktiv, Label „Aufgabe gelöscht".
   - *Inbox → Nachricht:* Klick auf eine `comment`/`mention`-Benachrichtigung
     öffnet den Kanal und scrollt via `message_id` zu genau dieser Nachricht +
     hebt sie kurz hervor (Highlight-Flash).
   - *Inbox → Aufgabe:* `assigned`/`completed`-Benachrichtigungen springen direkt
     zur Aufgabe (`ref_type='task'`).

2. **Inbox** — `NotificationCenter` (Glocke) bekommt oben einen Abschnitt
   „Für dich": echte `notifications`, ungelesen hervorgehoben, Klick markiert
   gelesen (`read_at`) + springt zum Ziel. Bisherige berechnete Übersicht bleibt
   darunter. Badge = Anzahl ungelesener `notifications`.

3. **„Mir zugewiesen"** — Sektion/Filter in der `Heute`-Ansicht (`assignee = ich`),
   plus Mitglieder-Picker an der Aufgabe zum Zuweisen (`assignee`-Feld existiert).

**Nachricht → Aufgabe:** Hover-Aktion „In Aufgabe umwandeln" → öffnet den
Quick-Composer mit vorbefülltem Text + Rückverweis (`ref` auf die Nachricht).

## Code-Struktur (nach bestehendem Cloud-first-Muster)

- `supabase/migrations/0019_team_chat.sql` — Tabellen, RLS, Trigger-Funktionen,
  Realtime-Publication; plus committete Definition von `is_workspace_member`.
- `src/types/message.types.ts`, `src/types/notification.types.ts` — Domain-Typen.
- `src/data/messages.gateway.ts` + `.mapper.ts` (+ Tests), analog
  `src/data/notifications.gateway.ts` + `.mapper.ts` (+ Tests).
- `src/store/messages.store.ts` (append-first, Pagination),
  `src/store/notifications.store.ts` (unread-count, markRead).
- `src/core/sync/useWorkspaceRealtime.ts` — zwei Subscriptions ergänzen
  (messages per workspace, notifications per user_id).
- `src/routes/TeamChatRoute.tsx` + geteilte Komponenten unter
  `src/components/team/` (`MessageList`, `Composer`, `SystemMessageCard`,
  `ChatDrawer`). Vollansicht und Drawer rendern dieselben `MessageList`/`Composer`.
- `src/store/ui.store.ts` — `chatDrawerOpen` + `toggleChatDrawer` ergänzen.
- Erweiterung: `MentionPopover` um Mitglieder + Aufgaben; `NotificationCenter` um
  den „Für dich"-Abschnitt; `NavSidebar` um den Team-Eintrag; `Topbar` um den
  Drawer-Toggle (neben der Glocke); `appView`-Enum + `RouteSwitch`.

## Edge-Cases & Sicherheit

- **Self-notify unterdrücken:** Empfänger ≠ Actor in allen Triggern.
- **Verwaiste Referenz:** Aufgabe gelöscht → Karte zeigt „Aufgabe gelöscht",
  kein Absturz; `notifications.message_id` cascade beim Löschen der Nachricht.
- **Spoofing:** `messages`-INSERT erzwingt `created_by = auth.uid()`;
  `notifications` nur via `SECURITY DEFINER`-Trigger.
- **Offline:** Kanal zeigt Offline-Zustand; kein lokaler Spiegel.

## Tests

- Mapper-Tests (row↔domain) für `messages` + `notifications`, analog
  `todos.mapper.test.ts`.
- SQL-/Trigger-Tests: Zuweisung → genau 1 System-Message + 1 Notification;
  Self-Assign → 0 Notifications; Kommentar mit Mention → 1 mention-Notification;
  Status→done → 1 completed-Notification an Ersteller.
- Store-Tests: append-first-Einfügen, Keyset-Pagination, unread-count, markRead.
- Mention-Parsing erweitert (Mitglieder + Aufgaben), analog
  `prefix-parser.test.ts`.

## Bewusst NICHT im Scope (YAGNI)

- Mehrere Kanäle / Themen-Kanäle / Kanal-pro-Kunde.
- OS-/Desktop-Push-Benachrichtigungen (Tauri).
- Read-Receipts über simples ungelesen hinaus, Reaktionen, Datei-Anhänge,
  Threads/Antworten.
- Hierarchische Zuweisungsrechte (flach zum Start; RBAC später).
