# Vereinheitlichtes `@` (Mitglieder + Kunden) + Zuweisen beim Anlegen — Design-Spec

**Datum:** 2026-06-28
**Branch-Kontext:** `feature/erechnung-2026-06-21` (baut auf Team-Chat + members.store + activities-Assignment auf)
**Status:** Design freigegeben (3-Agenten-Review + User-Entscheidung „Option a"), bereit für Plan

## Problem / Ziel

`@` bedeutet heute Verschiedenes: im **Task-/Quick-Capture-Composer** = **Kunde** (verknüpft die Aufgabe mit einem Kunden); im **Team-Chat** = **Mitglied/Aufgabe**. Im Task-Composer kann man **niemandem per `@` zuweisen** — Zuweisung geht nur nachträglich über den aufgeklappten `TaskRow` → „Zuständig"-Picker (4 Klicks). Quick Capture: `@KundeX` geht, aber **kein Mitarbeiter zuweisbar**.

**Ziel:** `@` im Task-/Quick-Capture-Composer bietet **beides**, gruppiert — **Mitglieder oben, Trennlinie, dann Kunden**. Mitglied wählen → **Zuweisung** (löst Inbox-Benachrichtigung + Sprung aus); Kunde wählen → **Verknüpfung** (wie bisher). So heißt `@` app-weit „verweise auf jemanden/etwas", die Gruppe sagt, was passiert.

## Getroffene Entscheidungen

| Frage | Entscheidung |
|---|---|
| `@` im Task-Composer | **Mitglieder + Kunden**, gruppiert (Mitglieder oben → Linie → Kunden). |
| Mitglied-Pick | setzt **assignee** der Aufgabe (Zuweisung beim Anlegen). |
| Kunde-Pick | setzt **customerId** (wie bisher). |
| Mehrere | **Ein** Assignee (letzter Mitglied-Pick gewinnt); Kundenverknüpfung wie bisher (eine). |
| Tipp-Fallback (ohne Pick) | Mitglied-Zuweisung **erfordert Pick** aus dem Popover (kein stilles Fuzzy-Zuweisen). Kunden-Tipp-Fallback bleibt wie heute (GlobalQuickComposer). |
| Backend | Zuweisungs-Trigger feuert künftig **AFTER INSERT OR UPDATE** (Zuweisung beim Anlegen benachrichtigt). |
| Geltungsbereich | `TaskComposer` + `GlobalQuickComposer` (Task-Modus). `ColumnQuickAdd` (Board-Spalte) unverändert (kein `@` dort). |
| YAGNI (nicht bauen) | eigenes `#`-Zeichen, Mehrfach-Zuweisung, `@Aufgabe` im Task-Composer, ColumnQuickAdd-`@`. |

## Bestands-Fakten (3-Agenten-Review 2026-06-28)

- `TaskComposer` (`src/components/tasks/TaskComposer.tsx`) + `GlobalQuickComposer` (`src/components/global/GlobalQuickComposer.tsx`) nutzen `MentionPopover` (kunden-only, Header „Kunde") + `prefix-parser.ts` (`parseTaskText` resolved Marker → `customerId`). Beide teilen nur `extractMentionQuery`.
- Marker-Form überall `@Vorname`. GlobalQuickComposer hat zusätzlich einen **Tipp-Fallback** (`resolveMention`, Fuzzy auf Kunden ohne Pick); TaskComposer nicht.
- Kontext-Auto-Link: TaskComposer bekommt `customerId`-Prop (gewinnt über `@`); GlobalQuickComposer pinnt aktiven Kunden **nur** wenn `appView==='clients'` (sonst kein Pin → `@Kunde` ist der einzige Weg). `@` schlägt Pin.
- `AssigneePicker` (`src/components/team/AssigneePicker.tsx`) nur im aufgeklappten `TaskRow:231`; liest `useMembersStore`. `todos.store.setAssignee` → `upsert({...,assignee})`. `todoToCreatePayload` akzeptiert bereits `assignee` — wird aber von keinem Composer beim Anlegen gesetzt.
- Chat-Popover `ChatMentionPopover` (`src/components/team/ChatMentionPopover.tsx`) rendert bereits **gruppiert** (Mitglieder/Aufgaben mit Gruppen-Headern) — Vorlage für die Task-Variante.
- **Trigger-Lücke:** `tg_task_assignment_fanout` (`supabase/migrations/0019_team_chat.sql`) ist `AFTER UPDATE` → eine Zuweisung **beim INSERT** erzeugt KEINE Benachrichtigung.

## Design

### 1. Gemeinsames Mention-Modell (Task-Seite)
Tagged Union analog `ChatMentionCandidate`:
`TaskMentionCandidate = { kind: 'member' | 'customer'; id: string; name: string; sub?: string }`.
Builder: Mitglieder aus `useMembersStore.members()` (kind `'member'`, `sub`=E-Mail) **zuerst**, dann Kunden aus `accounts.filter(!isPrivate)` (kind `'customer'`, `sub`=Branche). Marker = `@Vorname` (Mitglied) bzw. `@Vorname`/Kundenname (Kunde).

### 2. Gruppiertes Popover (Mitglieder oben → Linie → Kunden)
Ein gruppiertes Popover (Vorlage `ChatMentionPopover`): Gruppen-Header **„Mitglieder"** zuerst, **Trennlinie**, dann **„Kunden"**. Tastatur-Navigation/Enter wie gehabt. Ersetzt `MentionPopover` (kunden-only) in beiden Task-Composern. (Implementierung: generalisiertes `MentionPopover` mit Gruppen ODER neues `TaskMentionPopover` — Plan entscheidet; der Chat bleibt unberührt.)

### 3. Auflösung & Draft
- Beide Composer tracken gepickte Marker mit `kind`+`id` (wie ChatComposer `markers`).
- `prefix-parser` / Draft: `TaskDraft` bekommt `assigneeId?: string`. Beim Submit: Mitglieder-Marker (noch im Text) → `assigneeId` (letzter gewinnt); Kunden-Marker → `customerId` (wie bisher).
- Mitglied-Tipp-Fallback gibt es NICHT (Pick erforderlich); Kunden-Fallback unverändert.

### 4. Persistenz beim Anlegen
`upsert({ ..., customerId: effectiveCustomerId, assignee: draft.assigneeId })` in beiden Composern. `todoToCreatePayload` reicht `assignee` durch (existiert). Bestehender „Zuständig"-Picker im TaskRow bleibt zusätzlich.

### 5. Backend — Trigger auf INSERT erweitern (Migration 0023)
`tg_task_assignment_fanout` neu als **`AFTER INSERT OR UPDATE ON public.activities`**, `TG_OP`-sicher: bei INSERT gibt es kein `OLD` → die „assignee geändert"-Bedingung als `(TG_OP='INSERT' AND new.assignee IS NOT NULL) OR (TG_OP='UPDATE' AND new.assignee IS DISTINCT FROM old.assignee AND new.assignee IS NOT NULL)` formulieren; ebenso der `task_completed`-Zweig nur für UPDATE. Self-Assign-Guard (`new.assignee <> auth.uid()`) bleibt. Live anwenden (Controller, PAT) + verifizieren.

### 6. Namensgleichheit (die „Überschneidung")
Gelöst durch die **zwei sichtbaren Gruppen** + Pick-basierte Auflösung (Marker trägt `kind`+`id`, keine Namens-Neuauflösung). Gleichnamige Person/Kunde sind getrennt wählbar.

## Edge-Cases
- **Solo/lokal:** Zuweisung schreibt `assignee` lokal, aber kein Trigger/Benachrichtigung (kein Team) — akzeptiert.
- **Marker nach Pick gelöscht:** zählt nicht (nur im Text vorhandene Marker wirken) — wie ChatComposer.
- **Kein Mitglied geladen** (Solo): Popover zeigt nur Kunden.

## Tests
- `buildTaskMentionCandidates` (Mitglieder vor Kunden, kind korrekt).
- Parser/Draft: Mitglied-Marker → `assigneeId`, Kunde-Marker → `customerId`, beide gleichzeitig.
- Composer: Member-Pick beim Submit → `upsert` mit `assignee`; Customer-Pick → `customerId`.
- SQL/Trigger: INSERT mit `assignee≠creator` → genau 1 System-Message + 1 `assigned`-Notification; INSERT self-assign → 0 Notifications; UPDATE-Verhalten unverändert.

## Bewusst NICHT im Scope
`#`-Sigil, Mehrfach-Zuweisung, `@Aufgabe` im Task-Composer, ColumnQuickAdd-`@`, Auto-Pin auf Nicht-CRM-Ansichten, Chat-Composer-Änderungen.
