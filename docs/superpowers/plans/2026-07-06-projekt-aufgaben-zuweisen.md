# Projekt-Aufgaben anlegen + Mitarbeiter zuweisen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline "+ Aufgabe" form to the tasks panel in `ProjectDetailRoute.tsx` so a project's tasks can actually be created (not just displayed), optionally assigned to a team member, with the assignee's name shown in the list.

**Architecture:** Pure UI addition to one existing route file. All backing data model, gateway, and assignment plumbing (`Todo.projectId`/`projectPhaseId`/`assignee`, `useTodosStore().upsert`/`setAssignee`, the assignment notification trigger, and the `Mein Tag`/`filterMine` surfacing) already exist from prior rounds — no new Rust, migration, gateway, or type code.

**Tech Stack:** React/TypeScript, Zustand stores (`useTodosStore`, `useMembersStore`, `useWorkspaceStore`, `useProjectsStore` — all pre-existing).

## Global Constraints

- New tasks are always created against `project.currentPhaseId` — no phase picker in the UI (per spec decision).
- Follow the existing `NewPhaseForm` component in the same file as the visual/structural template for the new inline form (plain inputs, `mock-input` class, `btn-primary` button, no modal).
- Member loading follows the exact guard pattern already used in `src/routes/CalendarRoute.tsx`: only load members when the active workspace is shared (`useWorkspaceStore(s => s.isActiveWorkspaceShared())`).
- No new test file — this route's existing UI additions (`NewPhaseForm`, the Task 8 stepper) have no dedicated test file either; verification is the full regression suite (`npx vitest run`, `npx tsc --noEmit`).

---

### Task 1: Inline task-creation form + assignee display in `ProjectDetailRoute.tsx`

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `useTodosStore` (`upsert`, `setAssignee` — both pre-existing, `src/store/todos.store.ts`), `useMembersStore` (`members()`, `load`, `nameOf` — pre-existing, `src/store/members.store.ts`), `useWorkspaceStore` (`activeWorkspaceId`, `isActiveWorkspaceShared()` — pre-existing), `MemberProfile` type (`src/types/profile.types.ts`).
- Produces: nothing consumed by a later task — this is a self-contained UI change.

- [ ] **Step 1: Add the new imports**

At the top of `src/routes/ProjectDetailRoute.tsx`, change:

```typescript
import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useUiStore } from '@/store/ui.store'
import { useCustomersStore } from '@/store/customers.store'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { activityToTodo } from '@/data/todos.mapper'
import type { Activity } from '@/types/pipeline.types'
import type { Todo } from '@/types/todo.types'
```

to:

```typescript
import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useUiStore } from '@/store/ui.store'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useMembersStore } from '@/store/members.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { activityToTodo } from '@/data/todos.mapper'
import type { Activity } from '@/types/pipeline.types'
import type { Todo } from '@/types/todo.types'
import type { MemberProfile } from '@/types/profile.types'
```

- [ ] **Step 2: Add the `NewTaskForm` component**

Directly below the existing `NewPhaseForm` function (after its closing `}` and before `export function ProjectDetailRoute() {`), add:

```tsx
function NewTaskForm({ members, onCreate }: {
  members: MemberProfile[]
  onCreate: (title: string, assigneeId: string | undefined) => void
}) {
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')

  const submit = () => {
    if (!title.trim()) return
    onCreate(title.trim(), assigneeId || undefined)
    setTitle('')
    setAssigneeId('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
    }}>
      <input
        className="mock-input" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Neue Aufgabe" style={{ fontSize: 13 }}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
      />
      {members.length > 0 && (
        <select
          className="mock-input" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
          style={{ fontSize: 12 }}
        >
          <option value="">— Niemand —</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.displayName}</option>
          ))}
        </select>
      )}
      <button
        className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
        disabled={!title.trim()}
        onClick={submit}
      >
        + Aufgabe
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Extract a reusable `refreshActivities` function and wire up store hooks**

Inside `ProjectDetailRoute`, change the store-hooks block from:

```typescript
  const customers = useCustomersStore(s => s.customers)

  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const activeProjectIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedProjectId) return
    activeProjectIdRef.current = selectedProjectId
    loadPhases(selectedProjectId)
    setLoadingActivities(true)
    ActivitiesGateway.getByProject(selectedProjectId)
      .then(fetched => {
        if (activeProjectIdRef.current === selectedProjectId) setActivities(fetched)
      })
      .finally(() => {
        if (activeProjectIdRef.current === selectedProjectId) setLoadingActivities(false)
      })
  }, [selectedProjectId, loadPhases])
```

to:

```typescript
  const customers = useCustomersStore(s => s.customers)
  const upsertTodo = useTodosStore(s => s.upsert)
  const setTodoAssignee = useTodosStore(s => s.setAssignee)
  const members = useMembersStore(s => s.members())
  const loadMembers = useMembersStore(s => s.load)
  const nameOf = useMembersStore(s => s.nameOf)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const activeProjectIdRef = useRef<string | null>(null)

  const refreshActivities = (projectId: string) =>
    ActivitiesGateway.getByProject(projectId).then(fetched => {
      if (activeProjectIdRef.current === projectId) setActivities(fetched)
    })

  useEffect(() => {
    if (!selectedProjectId) return
    activeProjectIdRef.current = selectedProjectId
    loadPhases(selectedProjectId)
    setLoadingActivities(true)
    refreshActivities(selectedProjectId).finally(() => {
      if (activeProjectIdRef.current === selectedProjectId) setLoadingActivities(false)
    })
  }, [selectedProjectId, loadPhases])

  useEffect(() => {
    if (workspaceId && isShared) loadMembers(workspaceId)
  }, [workspaceId, isShared, loadMembers])
```

**Why `refreshActivities` takes `projectId` as a parameter instead of closing over `selectedProjectId`:** it's called both from the mount/switch effect (where `selectedProjectId` is freshly captured in the effect's own closure) and later from `handleCreateTask` (Step 4, defined further down in the component) — passing it explicitly keeps the function's behavior identical in both call sites without relying on which render's closure captured it.

- [ ] **Step 4: Add `handleCreateTask`, placed after the `if (!project) return` guard**

Find:

```typescript
  const isLastPhase = phases.length > 0 && phases[phases.length - 1]?.id === project.currentPhaseId
  const canPause = project.status !== 'completed'
```

and add directly below it:

```typescript
  const handleCreateTask = async (title: string, assigneeId: string | undefined) => {
    const created = await upsertTodo({
      title,
      customerId: project.accountId,
      projectId: project.id,
      projectPhaseId: project.currentPhaseId ?? undefined,
    })
    if (assigneeId) await setTodoAssignee(created.id, assigneeId)
    await refreshActivities(project.id)
  }
```

(This is placed after the early-return guard so `project` is narrowed to non-null by TypeScript — matches how `isLastPhase`/`canPause` already rely on the same narrowing.)

- [ ] **Step 5: Show the assignee's name next to assigned tasks, and mount `NewTaskForm`**

Change the tasks panel from:

```tsx
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>
            ✅ Aufgaben{currentPhase ? ` — ${currentPhase.name}` : ''}
          </div>
          {loadingActivities ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
          ) : tasksInCurrentPhase.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine Aufgaben in dieser Phase.</div>
          ) : (
            tasksInCurrentPhase.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: t.status === 'done' ? 'var(--fg-dim)' : 'var(--fg)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                  {t.title}
                </span>
              </div>
            ))
          )}
        </div>
```

to:

```tsx
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>
            ✅ Aufgaben{currentPhase ? ` — ${currentPhase.name}` : ''}
          </div>
          {loadingActivities ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
          ) : tasksInCurrentPhase.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine Aufgaben in dieser Phase.</div>
          ) : (
            tasksInCurrentPhase.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: t.status === 'done' ? 'var(--fg-dim)' : 'var(--fg)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                  {t.title}
                  {t.assignee && (
                    <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}> · {nameOf(t.assignee)}</span>
                  )}
                </span>
              </div>
            ))
          )}
          <NewTaskForm members={members} onCreate={handleCreateTask} />
        </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (895 pre-existing, no new tests added in this task), no regressions.

- [ ] **Step 8: Manual smoke test**

If you can launch and interact with the running desktop app: open a project with at least one phase, type a title into "Neue Aufgabe", optionally pick a team member (only visible in a shared workspace with other members), click "+ Aufgabe", confirm the task appears in the list immediately with the assignee's name shown if one was picked. If you cannot run/click through the app in your environment, say so explicitly in your report.

- [ ] **Step 9: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): Aufgabe im Projekt anlegen + Mitarbeiter zuweisen

Inline-Formular im Aufgaben-Panel (Muster: bestehendes NewPhaseForm),
legt die Aufgabe immer in der aktuellen Phase des Projekts an. Nutzt
ausschliesslich bereits bestehende Bausteine (Todo.projectId/projectPhaseId
aus der Projektplaner-Kern-Runde, setAssignee + Benachrichtigung aus der
Vereinheitlichtes-@-Runde) -- keine neue Datenschicht noetig. Zugewiesene
Aufgaben zeigen den Namen des Zustaendigen direkt in der Liste."
```

---

## Final Steps

After the task is complete and reviewed: dispatch a task reviewer (standard-capability model is sufficient given the small, single-file scope), then proceed to `superpowers:finishing-a-development-branch` for `feat/projekt-aufgaben-zuweisen`.
