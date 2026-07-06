# Projekt-Aufgaben anlegen + Mitarbeiter zuweisen

## Kontext

Feedback nach dem Projektplaner-Kern-Merge (2026-07-06): das Aufgaben-Panel in der Projekt-Detail-Ansicht (`src/routes/ProjectDetailRoute.tsx`) zeigt nur bereits verknüpfte Aufgaben an — es gibt keinen UI-Weg, überhaupt eine Aufgabe an ein Projekt zu hängen. User-Wunsch: „Aufgaben dran hängen" + „diese Aufgaben kann man auch Mitarbeitern zuweisen etc., damit die das sehen".

**Wichtiger Befund aus der Recherche:** Datenmodell und Zuweisungs-Mechanik existieren bereits vollständig:
- `Todo.projectId`/`Todo.projectPhaseId` (aus der Projektplaner-Kern-Runde, Task 4) sind bereits end-to-end verdrahtet (Rust-Insert/Read, Mapper, Gateway).
- `Todo.assignee` (User-ID) + `useTodosStore().setAssignee(id, memberId)` existieren bereits aus der „Vereinheitlichtes @ + Zuweisen"-Runde (2026-06-28).
- Eine Zuweisung löst bereits automatisch eine Benachrichtigung aus (DB-Trigger, `NotificationType: 'assigned'`, siehe `InboxPanel`/`SystemMessageCard`) und macht die Aufgabe automatisch in „Mein Tag" des Zugewiesenen sichtbar (`src/lib/todos/ownership.ts::filterMine`).

**Diese Spec ist deshalb reine UI-Arbeit** — kein neues Rust/Migrations-/Gateway-/Typen-Code nötig.

## Entwurf

### A. Inline-Formular im Aufgaben-Panel

In `ProjectDetailRoute.tsx`, im dritten Panel (aktuell „✅ Aufgaben — {Phase}"), kommt unterhalb der Aufgabenliste ein kleines Inline-Formular dazu — gleiches visuelles Muster wie das bereits bestehende `NewPhaseForm` (Textfeld + Knopf, kein Modal):

- Titel-Textfeld (Pflicht).
- „Zuweisen an"-Dropdown (`<select>`, Optionen: „— Niemand —" + alle `useMembersStore().members()`), nur sichtbar/gefüllt wenn `useWorkspaceStore().isActiveWorkspaceShared()` — in Solo-Workspaces macht ein Dropdown mit nur einem Eintrag (sich selbst) keinen Mehrwert, entfällt also praktisch von selbst durch eine leere Mitgliederliste.
- „+ Aufgabe"-Knopf, `disabled` wenn Titel leer (identisch zu `NewPhaseForm`s `disabled={!name.trim()}`).

### B. Anlegen-Ablauf

Neue Aufgaben werden **immer der aktuellen Phase des Projekts zugeordnet** (`project.currentPhaseId`) — kein Phasen-Dropdown. Das passt zu der bereits bestehenden Filterung im Panel (`tasks.filter(t => t.projectPhaseId === project?.currentPhaseId)`): eine neu angelegte Aufgabe erscheint sofort sichtbar in der Liste, statt möglicherweise in einer noch nicht aktuellen Phase zu verschwinden.

Ablauf beim Klick auf „+ Aufgabe" (mirrort exakt das bestehende Muster aus `TaskComposer`/`GlobalQuickComposer`, wo `customerId` inline im `upsert`-Payload gesetzt wird und `assignee` per Folge-Aufruf):

1. `const created = await useTodosStore().upsert({ title, customerId: project.accountId, projectId: project.id, projectPhaseId: project.currentPhaseId })`
2. Falls ein Mitarbeiter gewählt wurde: `await useTodosStore().setAssignee(created.id, assigneeId)`
3. Lokale Aufgabenliste im Panel aktualisieren (erneutes `ActivitiesGateway.getByProject(selectedProjectId)`, gleicher Call wie beim Mount, statt eines separaten Cache-Patches — bleibt konsistent mit dem bereits vorhandenen Ladezustand `loadingActivities`).
4. Formularfelder zurücksetzen (Titel leeren, Dropdown auf „— Niemand —").

Falls `project.currentPhaseId` `null` ist (Projekt ganz ohne Phasen — der `phases.length === 0`-Zustand, der aktuell nur `NewPhaseForm` zeigt): das Aufgaben-Formular bleibt trotzdem sichtbar und legt eine Aufgabe mit `projectPhaseId: undefined` an (Aufgabe gehört zum Projekt, aber zu keiner bestimmten Phase — das ist ein gültiger, bereits vom Typ unterstützter Zustand, keine Sonderbehandlung nötig).

### C. Anzeige des Zuständigen in der Liste

Jede Zeile in der Aufgabenliste zeigt zusätzlich den Namen des Zugewiesenen, wenn `t.assignee` gesetzt ist:

```
Website-Texte prüfen  ·  Klara
```

`useMembersStore().nameOf(assignee)` liefert den Anzeigenamen (mit eingebautem Fallback für unbekannte/noch nicht geladene IDs). Rendering nur wenn `t.assignee` truthy — unassigned Aufgaben zeigen wie bisher nur den Titel.

### D. Mitglieder laden

`ProjectDetailRoute` lädt Mitglieder analog zu `CalendarRoute`s bestehendem Muster:

```ts
useEffect(() => { if (workspaceId && isShared) loadMembers(workspaceId) }, [workspaceId, isShared, loadMembers])
```

## Nicht im Scope

- Kein Phasen-Auswahl-Dropdown beim Anlegen (siehe Entscheidung oben — immer aktuelle Phase).
- Kein Bearbeiten/Löschen bestehender Projekt-Aufgaben aus diesem Panel (dafür existiert bereits die normale Aufgaben-Detailansicht/`TaskRow` mit `AssigneePicker`, Checkliste etc. — dieses Panel bleibt ein reines Schnell-Anlegen+Übersicht).
- Keine Fälligkeit/Priorität/Checkliste im Inline-Formular (das wäre der Modal-Ansatz, den der User nicht gewählt hat) — wer mehr Felder braucht, kann die Aufgabe danach über die normale Aufgaben-Detailansicht ergänzen.
- Kein Abhaken/Status-Umschalten direkt in diesem Panel (war schon vorher nicht möglich, bleibt unverändert außerhalb dieses Scopes).

## Akzeptanzkriterien

- Im Aufgaben-Panel der Projekt-Detail-Ansicht kann eine neue Aufgabe mit Titel angelegt werden, optional einem Mitarbeiter zugewiesen.
- Die neue Aufgabe erscheint sofort in der Liste (aktuelle Phase), inkl. Namens-Tag bei Zuweisung.
- Die Zuweisung löst die bereits bestehende Benachrichtigung aus und macht die Aufgabe für den Zugewiesenen in „Mein Tag" sichtbar — beides ohne neuen Code, da bereits vorhanden.
- `npx vitest run` und `npx tsc --noEmit` bleiben grün.
