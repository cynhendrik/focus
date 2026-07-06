# Projekt-Detail: Phase löschen + Notiz hinzufügen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two of three user-reported gaps in the project detail view: no way to delete a phase, no way to add a note. (The third — moodboard image upload — is explicitly out of scope, pending a separate architecture decision.)

**Architecture:** Both additions are pure UI wiring on top of already-existing, already-tested store/gateway methods (`useProjectsStore().deletePhase`, `useActivitiesStore().create`). No new Rust, migration, or type code.

**Tech Stack:** React/TypeScript, Zustand stores (all pre-existing).

## Global Constraints

- Phase deletion: the CURRENT phase never gets a delete affordance in the UI (the backend already rejects it) — only non-current phases show the delete icon.
- Two-click inline confirm for phase deletion, matching `src/components/pipeline/DealModal.tsx`'s established pattern (not a separate modal).
- A failed phase-delete attempt must surface a visible error message — no silent failure.
- Note creation follows `src/components/pipeline/ActivityModal.tsx`'s established `useActivitiesStore().create(...)` payload shape (`workspaceId`, `createdBy: user?.email ?? 'user'`, `accountId`, `customerId`, `type: 'note'`, `body`).
- `npx tsc --noEmit` and `npx vitest run` (901 pre-existing) must stay green after every task.

---

### Task 1: Phase löschen — `Stepper` bekommt Lösch-Icon + Zwei-Klick-Bestätigung

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `useProjectsStore().deletePhase(id: string, projectId: string): Promise<void>` (pre-existing, throws on failure — e.g. attempting to delete the current phase).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Add the `Trash2` import**

Change the `lucide-react`... actually this file has no `lucide-react` import yet for icons used directly in `ProjectDetailRoute.tsx` (icons are only used inside imported shared components). Add a new import line right after the existing type-only imports, before the mention-system imports:

```typescript
import { Trash2 } from 'lucide-react'
```

- [ ] **Step 2: Rewrite `Stepper` to accept an `onDeletePhase` callback and render a delete affordance per non-current phase**

Replace the entire `Stepper` function:

```tsx
function Stepper({ phases, currentPhaseId }: {
  phases: { id: string; name: string; orderIndex: number }[]
  currentPhaseId: string | null
}) {
  const currentIndex = phases.findIndex(p => p.id === currentPhaseId)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22,
      padding: '28px 34px 22px', marginBottom: 28,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phases.length || 1}, 1fr)`, position: 'relative' }}>
        {phases.map((phase, i) => {
          const state = currentIndex < 0 ? 'upcoming' : i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'upcoming'
          return (
            <div key={phase.id} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
              <div style={{
                width: state === 'now' ? 52 : 44, height: state === 'now' ? 52 : 44, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: state === 'now' ? 18 : 16, fontWeight: 700,
                border: state === 'upcoming' ? '2px solid var(--border-strong)' : 'none',
                background: state === 'done' ? 'var(--ok)' : state === 'now' ? 'var(--accent-gradient)' : 'var(--surface-2)',
                color: state === 'done' ? 'var(--bg)' : state === 'now' ? '#2a1208' : 'var(--fg-dim)',
                boxShadow: state === 'now' ? '0 0 0 6px var(--accent-soft)' : 'none',
              }}>
                {state === 'done' ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 14, fontWeight: 650, color: state === 'now' ? 'var(--accent-text)' : 'var(--fg)' }}>
                {phase.name}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

to:

```tsx
function Stepper({ phases, currentPhaseId, onDeletePhase }: {
  phases: { id: string; name: string; orderIndex: number }[]
  currentPhaseId: string | null
  onDeletePhase: (phaseId: string) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const currentIndex = phases.findIndex(p => p.id === currentPhaseId)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22,
      padding: '28px 34px 22px', marginBottom: 28,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phases.length || 1}, 1fr)`, position: 'relative' }}>
        {phases.map((phase, i) => {
          const state = currentIndex < 0 ? 'upcoming' : i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'upcoming'
          const isCurrent = phase.id === currentPhaseId
          return (
            <div key={phase.id} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
              <div style={{
                width: state === 'now' ? 52 : 44, height: state === 'now' ? 52 : 44, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: state === 'now' ? 18 : 16, fontWeight: 700,
                border: state === 'upcoming' ? '2px solid var(--border-strong)' : 'none',
                background: state === 'done' ? 'var(--ok)' : state === 'now' ? 'var(--accent-gradient)' : 'var(--surface-2)',
                color: state === 'done' ? 'var(--bg)' : state === 'now' ? '#2a1208' : 'var(--fg-dim)',
                boxShadow: state === 'now' ? '0 0 0 6px var(--accent-soft)' : 'none',
              }}>
                {state === 'done' ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 14, fontWeight: 650, color: state === 'now' ? 'var(--accent-text)' : 'var(--fg)' }}>
                {phase.name}
              </div>
              {!isCurrent && (
                confirmId === phase.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { onDeletePhase(phase.id); setConfirmId(null) }}
                      style={{ fontSize: 10.5, color: 'oklch(72% 0.18 25)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 650 }}
                    >
                      Wirklich löschen
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      style={{ fontSize: 10.5, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(phase.id)} title="Phase löschen"
                    style={{ display: 'flex', alignItems: 'center', color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Trash2 size={11} />
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire `deletePhase` + an error state into `ProjectDetailRoute`**

Find the store-hooks block:

```typescript
  const createPhase = useProjectsStore(s => s.createPhase)
```

and add directly below it:

```typescript
  const deletePhase = useProjectsStore(s => s.deletePhase)
```

Find the `handleCreateTask` function (placed after the `if (!project) return` guard) and add a sibling function directly below it:

```typescript
  const [phaseError, setPhaseError] = useState<string | null>(null)

  const handleDeletePhase = async (phaseId: string) => {
    setPhaseError(null)
    try {
      await deletePhase(phaseId, project.id)
    } catch (err) {
      setPhaseError(err instanceof Error ? err.message : String(err))
    }
  }
```

(Note: `useState` is already imported at the top of the file via the mention-system work in a prior round — no new React import needed.)

- [ ] **Step 4: Pass `onDeletePhase` to `Stepper` and render the error message**

Find:

```tsx
      {phases.length === 0 ? (
        <NewPhaseForm onCreate={name => createPhase({ projectId: project.id, name })} />
      ) : (
        <>
          <Stepper phases={phases} currentPhaseId={project.currentPhaseId} />
          <NewPhaseForm onCreate={name => createPhase({ projectId: project.id, name })} />
        </>
      )}
```

and replace with:

```tsx
      {phaseError && (
        <div style={{ fontSize: 12, color: 'oklch(72% 0.18 25)', marginBottom: 12 }}>
          Phase konnte nicht gelöscht werden: {phaseError}
        </div>
      )}

      {phases.length === 0 ? (
        <NewPhaseForm onCreate={name => createPhase({ projectId: project.id, name })} />
      ) : (
        <>
          <Stepper phases={phases} currentPhaseId={project.currentPhaseId} onDeletePhase={handleDeletePhase} />
          <NewPhaseForm onCreate={name => createPhase({ projectId: project.id, name })} />
        </>
      )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (901 pre-existing, no new test file needed for this task — matches the established convention that this route's UI compositions have no dedicated test file), no regressions.

- [ ] **Step 7: Manual smoke test**

If you can launch and interact with the running desktop app: open a project with 2+ phases, confirm the current phase has no delete icon, confirm a non-current phase's delete icon requires two clicks (icon → "Wirklich löschen"/"Abbrechen" → confirm removes it from the stepper). If you cannot run/click through the app in your environment, say so explicitly in your report.

- [ ] **Step 8: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): Phase loeschen -- Zwei-Klick-Icon im Stepper

Nutzt das bereits bestehende useProjectsStore().deletePhase (blockt
serverseitig das Loeschen der aktuellen Phase). UI zeigt das Loesch-Icon
deshalb erst gar nicht bei der aktuellen Phase, statt einen Fehler zu
produzieren. Fehlgeschlagene Versuche (z.B. Race in geteilten Workspaces)
zeigen eine sichtbare Fehlermeldung."
```

---

### Task 2: Notiz hinzufügen — Inline-Formular im Notizen-Panel

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `useActivitiesStore().create(payload: CreateActivityPayload): Promise<void>` (pre-existing), `useAuthStore` (pre-existing).
- Produces: nothing consumed by a later task — final task in this plan.

- [ ] **Step 1: Add the new imports**

Add these two import lines alongside the existing ones (after the `Trash2` import added in Task 1):

```typescript
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
```

- [ ] **Step 2: Add the `NewNoteForm` component**

Directly below `NewTaskForm`'s closing `}` and before `export function ProjectDetailRoute() {`, add:

```tsx
function NewNoteForm({ onCreate }: { onCreate: (body: string) => void }) {
  const [body, setBody] = useState('')

  const submit = () => {
    if (!body.trim()) return
    onCreate(body.trim())
    setBody('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
    }}>
      <textarea
        className="mock-input" value={body} onChange={e => setBody(e.target.value)}
        placeholder="Neue Notiz" rows={2} style={{ fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <button
        className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
        disabled={!body.trim()}
        onClick={submit}
      >
        + Notiz
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Wire `createActivity` + `handleCreateNote` into `ProjectDetailRoute`**

Find the store-hooks block (after Task 1's `deletePhase` line):

```typescript
  const deletePhase = useProjectsStore(s => s.deletePhase)
```

and add directly below it:

```typescript
  const createActivity = useActivitiesStore(s => s.create)
  const userEmail = useAuthStore(s => s.user?.email ?? 'user')
```

Find `handleDeletePhase` (added in Task 1) and add a sibling function directly below it:

```typescript
  const handleCreateNote = async (body: string) => {
    await createActivity({
      workspaceId, createdBy: userEmail, accountId: project.accountId,
      customerId: project.accountId, projectId: project.id, type: 'note', body,
    })
    await refreshActivities(project.id)
  }
```

- [ ] **Step 4: Mount `NewNoteForm` in the notes panel**

Find:

```tsx
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>📝 Notizen &amp; Konzeption</div>
          {loadingActivities ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
          ) : notes.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Noch keine Notizen.</div>
          ) : (
            notes.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{n.body}</div>
              </div>
            ))
          )}
        </div>
```

and replace with:

```tsx
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>📝 Notizen &amp; Konzeption</div>
          {loadingActivities ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
          ) : notes.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Noch keine Notizen.</div>
          ) : (
            notes.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{n.body}</div>
              </div>
            ))
          )}
          <NewNoteForm onCreate={handleCreateNote} />
        </div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (901 pre-existing, no new tests added in this task), no regressions.

- [ ] **Step 7: Manual smoke test**

If you can launch and interact with the running desktop app: open a project, type a multi-line note into "Neue Notiz", click "+ Notiz", confirm it appears immediately at the top of the notes list. If you cannot run/click through the app in your environment, say so explicitly in your report.

- [ ] **Step 8: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): Notiz hinzufuegen -- Inline-Formular im Notizen-Panel

Nutzt useActivitiesStore().create mit type:'note' + projectId (bereits
end-to-end funktionsfaehig aus der Projektplaner-Kern-Runde). Gleiches
Payload-Muster wie das bestehende ActivityModal fuer Kunden-Notizen."
```

---

## Final Steps

After both tasks are complete and reviewed: dispatch a task reviewer (standard-capability model given the small, well-scoped changes), then proceed to `superpowers:finishing-a-development-branch` for `feat/projekt-phase-loeschen-notizen`.
