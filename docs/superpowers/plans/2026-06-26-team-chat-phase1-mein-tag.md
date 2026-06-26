# Team-Chat — Phase 1: „Mein Tag" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die persönliche „HEUTE"-Fläche auf den eingeloggten Nutzer einschränken (`assignee = ich` **oder** unassignt), damit sie bei mehreren Mitarbeitern nicht in Lärm umkippt.

**Architecture:** Reiner Client-Filter — kein Schema-Change, kein Backend. Eine pure Ownership-Hilfsfunktion (`isMine`/`filterMine`) wird an den drei Stellen angewandt, die heute workspace-weit alle Aufgaben zeigen: die „Dein nächster Zug"-Queue (`useHeuteQueue`), „Heute fällig" und „Mein Tagesplan" (`DashboardRoute`). Phase 1 ist vollständig unabhängig von Phasen 2/3 und liefert sofort Wert.

**Tech Stack:** TypeScript (strict), React, Zustand, Vitest. Bestehendes Repo-Muster: kolokierte `*.test.ts`, Tests via `npx vitest run`, Typcheck via `npx tsc --noEmit -p tsconfig.json`.

## Global Constraints

- **Kein Schema-Change in Phase 1** — `Todo.assignee` existiert bereits (`src/types/todo.types.ts:29`).
- **Solo-Sicherheit:** Aufgaben ohne `assignee` (Solo-/Lokalbetrieb) müssen sichtbar bleiben — niemals leere „Mein Tag"-Fläche. Filter = `assignee === ich || !assignee`.
- **`tsc` muss sauber bleiben:** `npx tsc --noEmit -p tsconfig.json` ohne Fehler.
- **Bestehende Tests grün halten** (Stand: 476 Tests grün laut Projekt-Notizen).
- **UI-Texte deutsch.**
- Auth-Nutzer-ID: `useAuthStore.getState().user?.id` (Supabase-`auth.uid()`, uuid).

---

## Task 0: Pre-flight — `assignee`-Semantik verifizieren

**Kein Code.** Sicherstellen, dass `activities.assignee` (= `Todo.assignee`) eine **Auth-User-ID** speichert und keinen Anzeigenamen — die ganze Personen-Filterung hängt daran.

- [ ] **Step 1: Mapper prüfen**

Lies `src/data/todos.mapper.ts` und bestätige, dass `assignee` 1:1 als String round-trippt (kein Namens-Mapping). Erwartung: `assignee` ist roher String (User-ID oder leer).

- [ ] **Step 2: Bestandsdaten prüfen**

Falls Zugriff auf die Cloud-DB besteht, prüfe Beispielzeilen:
```sql
select distinct assignee from public.activities where type = 'task' and assignee is not null limit 20;
```
Erwartung: leere Liste **oder** uuid-Werte. Falls Anzeigenamen auftauchen → einmaliger Backfill nötig (separat behandeln, blockiert Phase 1 nicht, weil der `!assignee`-Zweig Solo/Altdaten abfängt).

- [ ] **Step 3: Ergebnis notieren**

Notiere das Ergebnis als Kommentar im PR/Commit. Kein Commit in diesem Task.

---

## Task 1: Ownership-Hilfsfunktion

**Files:**
- Create: `src/lib/todos/ownership.ts`
- Test: `src/lib/todos/ownership.test.ts`

**Interfaces:**
- Produces:
  - `isMine(todo: Pick<Todo, 'assignee'>, userId: string | undefined): boolean`
  - `filterMine<T extends Pick<Todo, 'assignee'>>(todos: T[], userId: string | undefined): T[]`

- [ ] **Step 1: Write the failing test**

`src/lib/todos/ownership.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isMine, filterMine } from './ownership'

describe('isMine', () => {
  it('task assigned to me is mine', () => {
    expect(isMine({ assignee: 'u1' }, 'u1')).toBe(true)
  })
  it('task assigned to someone else is NOT mine', () => {
    expect(isMine({ assignee: 'u2' }, 'u1')).toBe(false)
  })
  it('unassigned task is mine (solo / grab-pool)', () => {
    expect(isMine({ assignee: undefined }, 'u1')).toBe(true)
    expect(isMine({ assignee: '' }, 'u1')).toBe(true)
  })
  it('no signed-in user → nothing hidden', () => {
    expect(isMine({ assignee: 'u2' }, undefined)).toBe(true)
  })
})

describe('filterMine', () => {
  it('keeps mine + unassigned, drops others', () => {
    const todos = [{ assignee: 'u1' }, { assignee: 'u2' }, { assignee: undefined }]
    expect(filterMine(todos, 'u1')).toEqual([{ assignee: 'u1' }, { assignee: undefined }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/todos/ownership.test.ts`
Expected: FAIL — `Failed to resolve import "./ownership"` / `isMine is not a function`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/todos/ownership.ts`:
```ts
import type { Todo } from '@/types/todo.types'

/**
 * "Mein Tag"-Ownership: eine Aufgabe gehört auf meine persönliche Fläche, wenn
 * sie mir zugewiesen ist ODER unassignt ist (noch ohne Besitzer — implizit
 * "für jeden / mir zum Greifen"). Der unassignte Zweig ist für Solo-Workspaces
 * essenziell: dort tragen Composer-Aufgaben keinen assignee und würden sonst
 * aus der Ansicht verschwinden.
 */
export function isMine(todo: Pick<Todo, 'assignee'>, userId: string | undefined): boolean {
  const a = todo.assignee
  if (!a) return true        // unassignt → für alle sichtbar
  if (!userId) return true    // kein eingeloggter Nutzer (lokal/solo) → nichts verstecken
  return a === userId
}

export function filterMine<T extends Pick<Todo, 'assignee'>>(
  todos: T[],
  userId: string | undefined,
): T[] {
  return todos.filter(t => isMine(t, userId))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/todos/ownership.test.ts`
Expected: PASS (6 assertions across 2 describe-Blöcke).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: keine Ausgabe (sauber).

- [ ] **Step 6: Commit**

```bash
git add src/lib/todos/ownership.ts src/lib/todos/ownership.test.ts
git commit -m "feat(mein-tag): isMine/filterMine ownership helper"
```

---

## Task 2: „Dein nächster Zug"-Queue auf mich einschränken

**Files:**
- Modify: `src/hooks/useHeuteQueue.ts:17-28`

**Interfaces:**
- Consumes: `filterMine` (Task 1), `useAuthStore.getState().user?.id`.

- [ ] **Step 1: Imports ergänzen**

Oben in `src/hooks/useHeuteQueue.ts` zu den bestehenden Imports hinzufügen:
```ts
import { useAuthStore } from '@/store/auth.store'
import { filterMine } from '@/lib/todos/ownership'
```

- [ ] **Step 2: Queue-Input filtern**

In `useHeuteQueue.ts`, im `load`-Callback, die `todos`-Zeile (aktuell `todos: useTodosStore.getState().allTodos,`) ersetzen. Der `input`-Block beginnt bei `const input = {`:
```ts
    const myId = useAuthStore.getState().user?.id
    const input = {
      todos:          filterMine(useTodosStore.getState().allTodos, myId),
      invoices:       useFinanceStore.getState().invoices,
      emails:         useMailStore.getState().emails,
      deals:          useDealsStore.getState().deals,
      calendarEvents: useCalendarStore.getState().events,
      accounts:       useAccountsStore.getState().accounts,
      followUps:      useCrmStore.getState().allFollowUps,
      leads:          useLeadsStore.getState().leads,
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sauber.

- [ ] **Step 4: Bestehende Tests grün**

Run: `npx vitest run`
Expected: alle grün (keine Regression).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHeuteQueue.ts
git commit -m "feat(mein-tag): scope 'Dein naechster Zug' queue to my tasks"
```

---

## Task 3: „Heute fällig" + „Mein Tagesplan" auf mich einschränken

**Files:**
- Modify: `src/routes/DashboardRoute.tsx` (Import; `myTodos`-Memo; `dueToday` ~263; `TagesplanCard`-Aufruf ~431)

**Interfaces:**
- Consumes: `filterMine` (Task 1). `useAuthStore` und `useMemo` sind in `DashboardRoute.tsx` bereits importiert (`:14`, React).

- [ ] **Step 1: Import ergänzen**

In `src/routes/DashboardRoute.tsx` zu den Imports hinzufügen:
```ts
import { filterMine } from '@/lib/todos/ownership'
```

- [ ] **Step 2: `myTodos`-Memo einführen**

Direkt nach der bestehenden Zeile `const todos = useTodosStore(s => s.allTodos)` (`:158`) einfügen:
```ts
  const myUserId = useAuthStore(s => s.user?.id)
  const myTodos  = useMemo(() => filterMine(todos, myUserId), [todos, myUserId])
```
(`todos` bleibt unverändert verfügbar — die Queue-`find`-Logik bei `:185` nutzt weiter die volle Liste.)

- [ ] **Step 3: „Heute fällig" auf `myTodos`**

In der `dueToday`-`useMemo` (`:263-267`) `todos` durch `myTodos` ersetzen — sowohl im Filter als auch im Dependency-Array:
```ts
  const dueToday = useMemo(() => {
    const tasks = myTodos.filter(t => t.status !== 'done' && (t.dueDate === todayIso || (!!t.scheduledAt && t.scheduledAt.slice(0, 10) === todayIso))).length
    const fus = followUps.filter(f => f.status === 'offen' && f.dueDate <= todayIso).length
    return { tasks, fus, total: tasks + fus + events.length }
  }, [myTodos, followUps, events, todayIso])
```

- [ ] **Step 4: „Mein Tagesplan" auf `myTodos`**

Den `TagesplanCard`-Aufruf (`:431`) anpassen:
```tsx
      <TagesplanCard events={events} todos={myTodos} customers={customers} />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sauber.

- [ ] **Step 6: Bestehende Tests grün**

Run: `npx vitest run`
Expected: alle grün.

- [ ] **Step 7: Commit**

```bash
git add src/routes/DashboardRoute.tsx
git commit -m "feat(mein-tag): scope 'Heute faellig' + Tagesplan to my tasks"
```

---

## Task 4: NAV-Label „Heute" → „Mein Tag"

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx:121`

- [ ] **Step 1: Label umbenennen**

In `src/components/layout/NavSidebar.tsx:121` das `label`-Attribut ändern:
```tsx
      <NavItem icon={Home}       label="Mein Tag" active={appView === 'dashboard'}
```
(Nur den `label`-Wert ändern; `icon`, `active`, Rest unverändert lassen.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sauber.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/NavSidebar.tsx
git commit -m "feat(mein-tag): rename nav 'Heute' -> 'Mein Tag'"
```

---

## Abschluss-Verifikation Phase 1

- [ ] **Volle Test-Suite:** `npx vitest run` → alles grün (inkl. neuer `ownership.test.ts`).
- [ ] **Typecheck:** `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] **Manuell (optional, via `run`-Skill):** App starten, einloggen. „Mein Tag" zeigt eigene + unassignte Aufgaben. Im Solo-Workspace (alle Aufgaben unassignt) ist die Fläche **nicht** leer.

## Nicht in Phase 1 (kommt in Phase 2/3)

- `messages`/`notifications`-Tabellen, Trigger, `visibility` (Phase 2).
- Team-Chat, Inbox-Route, Glocke-Vorschau, Mention-Erweiterung, Sprung-Verhalten (Phase 3).
- Mitglieder-Picker zum Zuweisen an einer Aufgabe (Phase 3 — bis dahin bleibt `assignee` über bestehende Pfade gesetzt/leer).
