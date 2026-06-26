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
| Benachrichtigung | **In-App-Inbox + Badges** (keine OS-Push) |
| Persönliche Fläche | **„HEUTE" aufspalten** in *Mein Tag* (Pull/Commitment, `assignee=ich`) + *Inbox* (Push/Triage) — statt eine Fläche zu überladen |
| Chat-Platzierung | **Hybrid** — NAV-Vollansicht *plus* ausklappbarer Mini-Drawer für nebenbei |
| Architektur | **Ansatz A** — eigene `messages` + `notifications` Tabellen, cloud-first |
| Skalierungs-Schutz | Mention≠Kommentar trennen · Inbox gruppieren (Typ→Kunde) · Kommentare an `ref` heften (Thread-Key) |
| Zukunfts-Fit | **Eine** Spalte `visibility` heute → Kundenportal später additiv (kein Rewrite) |

> **Skalierungs- & Zukunfts-Erkundung (4 Agenten, 2026-06-26):** Bei 20–50 Kunden
> × 3–6 Mitarbeitern kippt eine einzelne „HEUTE"-Fläche und ein flacher Kanal in
> Lärm. Branchen-Konsens (Linear/Asana/Basecamp/Things): **zwei** Flächen —
> Triage-*Inbox* (Push) getrennt von *Mein Tag* (Pull). Der **eine Kanal** bleibt
> (kein Fragmentieren), Skalierung kommt über Thread-Keys + Inbox-Gruppierung, nicht
> über neue Container. Künftiges Kundenportal ist zu ~90% gratis future-proof
> (polymorphe `ref`, OR-kombinierte RLS-Policies) — nur **eine** Spalte (`visibility`)
> ist billige Versicherung, die heute mit muss.

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
| `ref_type` | text null | `'task'` \| `'account'` (später `'project'`) |
| `ref_id` | **text** null | polymorphe Referenz (kein FK) — dient auch als **Thread-Key** |
| `visibility` | text not null default `'internal'` | `check (visibility in ('internal','client'))` — Zukunfts-Versicherung fürs Kundenportal |
| `mentions` | jsonb not null default `'[]'` | Array erwähnter `user_id`s |
| `created_at` | text default `(now())::text` | |
| `updated_at` | text default `(now())::text` | |
| `deleted_at` | text null | Soft-Delete |

Indexe: `messages (workspace_id, created_at)` für Verlauf + Keyset-Pagination.

**Thread-Key (Skalierung ohne Fragmentieren):** `ref_type`/`ref_id` sind nicht nur
für System-Karten — auch ein *getippter* Kommentar, der aus einem Kunden-/Aufgaben-
Kontext verfasst wird, bekommt `ref` mitgestempelt (Composer-seitig, kein Schema-
Change). Dadurch ist jede Nachricht filterbar („nur Kunde X") — ein **Filter/Lens**
auf der einen Tabelle, **kein** neuer Container.

**`visibility`:** Heute schreibt jede Team-Nachricht automatisch `'internal'`. Die
Spalte verankert ab Zeile null die Invariante *„nichts ist kundensichtbar, außer
explizit markiert"*. Ein künftiges Kundenportal fügt nur eine **zweite** permissive
RLS-Policy (`… and visibility='client'`) hinzu — die `messages`-Tabelle wird nie
umgeschrieben. Mehr dazu unter „Zukunfts-Fit".

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
- **`mention` (immer benachrichtigen — das laute Signal):** für jede `user_id` in
  `new.mentions` (≠ actor) → `notifications` (`type='mention'`, `ref_type='message'`,
  `ref_id=new.id`, `message_id=new.id`).
- **`comment` (gedämpft — sonst Lärm bei 50×6):** falls `new.ref_type='task'`,
  `notifications` (`type='comment'`) **nur** an Assignee + Ersteller der Aufgabe,
  die ≠ actor sind, **noch nicht** über `mentions` erfasst wurden **und** den Thread
  nicht stummgeschaltet haben. Dieser Pfad ist die lauteste Quelle im System — die
  Trennung mention/comment (zwei `type`-Werte) ist Pflicht, kein Nice-to-have.

> **Stummschalten (billige v1):** ein `muted_refs jsonb` auf einer Pro-User-
> Einstellungszeile; der Trigger überspringt `comment`-Notifications, deren `ref_id`
> der Empfänger gemutet hat. Serverseitige Mute-Erzwingung darüber hinaus = später.

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

2. **Inbox (neue Fläche — Push/Triage)** — neuer `appView: 'inbox'` + `NavItem` mit
   ungelesen-Badge. Gespeist aus dem `notifications.store`. Wird auf null abgearbeitet
   („Inbox Zero"). **Gruppierung gegen Lärm** (rein client-seitig, mirrors die
   bestehende Gruppen-Logik in `NotificationCenter`):
   - **Primär nach Typ**, Priorität: `assigned` (Aktion nötig) → `mention` (du wurdest
     gerufen) → `comment` (FYI zu deinem Kram) → `completed` (FYI).
   - **`comment`/`mention` nach `ref_id` (Kunde/Aufgabe) zusammenfassen:** „Kunde
     Müller — 4 neue Kommentare (Anna, Max)" als *eine* aufklappbare Zeile statt 4.
     100 Roh-Events → ~5–8 ruhige Zeilen.
   - Klick markiert gelesen (`read_at`) + springt zum Ziel.
   Die **Glocke** (`NotificationCenter`) wird zur **Vorschau** derselben
   `notifications` (Top-12 ungelesen + „Alle ansehen →" zur Inbox-Route). Die heutige
   berechnete Mail/Follow-up/Rechnungs/Lead-Aggregation wandert raus (hat eigene
   Heimat in Mail/Akquise/Finanzen). Badge = ungelesene `notifications`; laute Zahl =
   nur `assigned`+`mention`, `comment`-FYI nicht ins Badge aufblähen.

3. **Mein Tag (umgebaute „HEUTE" — Pull/Commitment)** — `appView:'dashboard'` bleibt,
   wird umbenannt; **überall Default-Filter `assignee === ich`**:
   - KPI-Zeile bleibt workspace-weit (Umsatz, aktive Kunden); „Heute fällig" zählt
     **meine** Items.
   - „Dein nächster Zug" (`useHeuteQueue`) bekommt nur *meine* Aufgaben/Follow-ups.
   - „Mein Tagesplan" = heutige Termine + **meine** fälligen/geplanten Aufgaben.
   - Der `InboxCard`-Mail-Block fliegt hier raus (Mail hat eigene Route).
   Plus Mitglieder-Picker an der Aufgabe zum Zuweisen (`assignee`-Feld existiert).
   *Reiner Client-Filter — kein Schema-Change; entlärmt sofort, auch ohne Chat-Backend.*

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
- `src/routes/InboxRoute.tsx` + `src/components/inbox/` (gruppierte Notification-
  Liste); Glocke (`NotificationCenter`) auf Vorschau-Modus derselben Quelle umstellen.
- `src/routes/DashboardRoute.tsx` → „Mein Tag": `assignee=ich`-Filter in
  `useHeuteQueue`-Input, `dueToday` und `buildTagesplan`; abgeleiteter Selektor
  `myTodos` im `todos.store` (workspace-weites `loadAll` bleibt für Delegations-/
  Übersicht).
- `src/store/ui.store.ts` — `chatDrawerOpen` + `toggleChatDrawer` ergänzen.
- Erweiterung: `MentionPopover` um Mitglieder + Aufgaben; `NavSidebar` um Team- +
  Inbox-Eintrag (Badges); `Topbar` um den Drawer-Toggle (neben der Glocke);
  `appView`-Enum (`'team'`, `'inbox'`) + `RouteSwitch`.

## Zukunfts-Fit (Projekt-Planner + Kundenportal) — bewusst NICHT jetzt gebaut

Geprüft (Datenmodell-Agent): die aktuelle Architektur ist zu ~90% gratis future-proof.
Was den späteren Bau ermöglicht, **ohne** das heutige Modell zu überladen:

- ✅ **`ref_type='project'`** ist gratis abgedeckt (polymorpher Text-Diskriminator,
  kein FK/CHECK). Ein künftiges Projekt ist nur ein neuer Render-/String-Fall.
- ✅ **Kundennachricht im Kundenmodul** ist heute schon ausdrückbar via
  `ref_type='account'` (filtern auf `ref_id=<account>`).
- ✅ **Interne vs. externe RLS koexistieren** ohne Tabellen-Rewrite: permissive
  Policies werden **OR**-kombiniert. Externe Kunden sind *keine* `workspace_members`
  → die bestehende `is_workspace_member`-Policy gibt ihnen automatisch nichts; das
  Portal fügt später nur eine **zweite** Policy hinzu.
- ⚠️ **Einzige Vorkehrung heute:** Spalte `visibility` (s. Datenmodell). Verankert
  „internal unless marked", null Verhaltensänderung jetzt, spart später das riskante
  Nachrüsten/Backfill historischer Zeilen.
- ❌ **Später (additiver Anbau, kein Rewrite):** `project_participants`-Tabelle +
  `is_project_participant()`-Funktion; Magic-Link-Login für externe Kunden; eine
  zweite RLS-Policy `… and visibility='client'`. Externe Nutzer kommen **nie** in
  `workspace_members` (würde jeden `is_workspace_member`/`has_capability`-Pfad
  vergiften). Keine `scope/thread`-Spalten (`ref` reicht als Thread-Key).

## Build-Phasen

Ein Design, drei aufeinander aufbauende Phasen — jede für sich testbar und wertvoll.

| Phase | Inhalt | Abhängigkeit | Sofort-Wert |
|---|---|---|---|
| **1 — Mein Tag** | `DashboardRoute` auf `assignee=ich` umstellen + `myTodos`-Selektor | keine (reiner Client-Filter) | Entlärmung **ohne** Backend |
| **2 — Motor** | Migration `0019` (Tabellen, `visibility`, RLS, beide Trigger inkl. mention≠comment), Gateways/Mapper/Stores, Realtime-Subscriptions | Migration | Datenbasis + Tests |
| **3 — Oberflächen** | Team-Chat (Vollansicht + Drawer), **Inbox**-Route + Gruppierung, Glocke als Vorschau, Mention-Erweiterung (Mitglieder+Aufgaben), Sprung-Verhalten | Phase 2 | volles Erlebnis |

## Edge-Cases & Sicherheit

- **⚠️ Vor Phase 1 verifizieren:** `activities.assignee` speichert die echte
  `auth.uid()` (nicht einen Anzeigenamen) — die gesamte Personen-Filterung *und* der
  Zuweisungs-Trigger hängen daran. Falls alte lokale Zeilen Namen halten:
  einmaliger Backfill.
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
- Store-Tests: append-first-Einfügen, Keyset-Pagination, unread-count, markRead;
  `myTodos`-Selektor (nur `assignee=ich`).
- Trigger-Lärm-Tests: Kommentar an gemuteten Thread → 0 `comment`-Notification;
  erwähnter User bekommt nur `mention`, nicht zusätzlich `comment` (Dedup).
- Inbox-Gruppierung: N `comment`-Notifications am selben `ref_id` → 1 aufklappbare
  Zeile; Badge zählt nur `assigned`+`mention`.
- Mention-Parsing erweitert (Mitglieder + Aufgaben), analog
  `prefix-parser.test.ts`.

## Bewusst NICHT im Scope (YAGNI)

- Mehrere Kanäle / Themen-Kanäle / Kanal-pro-Kunde (Skalierung kommt über
  Thread-Keys + Inbox-Gruppierung, **nicht** über neue Container).
- Projekt-Planner-Modul + Kundenportal (nur via `visibility` vorbereitet, s. o.).
- `project_participants`-Tabelle, externe Rollen, `scope/thread`-Spalten.
- OS-/Desktop-Push-Benachrichtigungen (Tauri).
- Digests / Read-Cursors pro Thread / serverseitige Mute-Erzwingung
  (billige `muted_refs`-v1 reicht).
- Workload-Board pro Mitarbeiter; eigene „Von mir delegiert"-Fläche
  (gespeicherter Filter reicht).
- Read-Receipts über simples ungelesen hinaus, Reaktionen, Datei-Anhänge,
  Threads/Antworten (parent_id-Reply-Bäume).
- Hierarchische Zuweisungsrechte (flach zum Start; RBAC später).
