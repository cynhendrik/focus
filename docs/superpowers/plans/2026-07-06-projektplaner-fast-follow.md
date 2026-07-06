# Projektplaner-Kern Fast-Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two Important gaps found in the final whole-branch review of `feat/projektplaner-kern`: no UI path to create a project (feature unreachable), and no Supabase cloud schema (shared workspaces would break).

**Architecture:** Task A adds a `NewProjectModal` component (mirrors the existing `DealModal` pattern) wired to a new button in `ProjectsOverviewRoute`. Task B adds a Supabase migration file (committed, not auto-applied) plus a small fix to the existing `projectToRow` cloud mapper so cloud inserts don't violate NOT-NULL constraints once the migration is applied.

**Tech Stack:** React/TypeScript (Zustand store, already built), Rust/Tauri (unchanged in this plan), Postgres/Supabase SQL (new).

## Global Constraints

- Follow `src/components/pipeline/DealModal.tsx`'s established modal conventions exactly: `useDialogFocus(true, onClose)` for focus trapping, `className="mock-input"` for text inputs, `btn-primary`/`btn-secondary` for the footer buttons, inline `saveError` state with a visible error banner (no silent failures).
- `setSelectedProjectId`/`setAppView` remain two separate calls at the call site (established convention from Task 6/7/8 — do not bundle).
- The Supabase migration file must be committed but is explicitly NOT applied to the live database by any step in this plan — mark it with the same "NICHT automatisch anwenden" header comment convention used in `supabase/migrations/0025_prepared_items.sql`.
- `projectToRow`'s fix must only affect the insert case (new project, no existing `status`) — the update path (`setStatus`/`advancePhase` already write `status` explicitly via their own gateway methods) must not be touched.
- `npx tsc --noEmit` and `npx vitest run` (893 pre-existing tests + any new ones from this plan) must stay green after every task.

---

### Task A: `NewProjectModal` — creation UI + trigger wiring

**Files:**
- Create: `src/components/projects/NewProjectModal.tsx`
- Modify: `src/routes/ProjectsOverviewRoute.tsx`

**Interfaces:**
- Consumes: `useProjectsStore` (`upsert`, `createPhase`), `useCustomersStore` (`customers`), `useUiStore` (`setSelectedProjectId`, `setAppView`), `useWorkspaceStore` (`activeWorkspaceId`), `useDialogFocus` (from `@/components/ui/Sheet`), `UpsertProjectPayload`/`Project` (from `@/types/project.types`).
- Produces: `NewProjectModal` component with props `{ presetCustomerId?: string; onClose: () => void }` — the `presetCustomerId` prop exists for a future entry point from a customer's own page (not wired anywhere in this task, but included now so the component doesn't need a breaking signature change later).

- [ ] **Step 1: Create `src/components/projects/NewProjectModal.tsx`**

```tsx
import { useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useDialogFocus } from '@/components/ui/Sheet'

interface Props {
  presetCustomerId?: string
  onClose: () => void
}

export function NewProjectModal({ presetCustomerId, onClose }: Props) {
  const upsert = useProjectsStore(s => s.upsert)
  const createPhase = useProjectsStore(s => s.createPhase)
  const customers = useCustomersStore(s => s.customers)
  const setSelectedProjectId = useUiStore(s => s.setSelectedProjectId)
  const setAppView = useUiStore(s => s.setAppView)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [customerId, setCustomerId] = useState(presetCustomerId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [firstPhaseName, setFirstPhaseName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const lockedCustomer = presetCustomerId ? customers.find(c => c.id === presetCustomerId) : null
  const canSave = title.trim() !== '' && customerId !== '' && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      const project = await upsert({
        workspaceId,
        accountId: customerId,
        title: title.trim(),
        description: description.trim() || undefined,
      })
      if (firstPhaseName.trim()) {
        await createPhase({ projectId: project.id, name: firstPhaseName.trim() })
      }
      setSelectedProjectId(project.id)
      setAppView('project_detail')
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const dialogRef = useDialogFocus(true, onClose)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Neues Projekt"
        tabIndex={-1}
        style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 440, maxWidth: '90vw' }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Neues Projekt</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Kunde *</label>
            {lockedCustomer ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{lockedCustomer.name}</div>
              </div>
            ) : (
              <select className="mock-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">— Kunden auswählen —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` · ${c.company}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Titel *</label>
            <input
              className="mock-input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Website Relaunch" autoFocus={!lockedCustomer}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Beschreibung</label>
            <textarea
              className="mock-input" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional" rows={2} style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Erste Phase</label>
            <input
              className="mock-input" value={firstPhaseName} onChange={e => setFirstPhaseName(e.target.value)}
              placeholder="z.B. Konzeption (optional, kann auch später angelegt werden)"
            />
          </div>
        </div>

        {saveError && (
          <div style={{
            marginTop: 16, padding: '8px 12px', borderRadius: 8,
            background: 'oklch(72% 0.18 25 / 0.12)', border: '1px solid oklch(72% 0.18 25 / 0.4)',
            color: 'oklch(72% 0.18 25)', fontSize: 12, lineHeight: 1.4,
          }}>
            Speichern fehlgeschlagen: {saveError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }}>Abbrechen</button>
          <button onClick={handleSave} disabled={!canSave} className="btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
            {saving ? 'Wird angelegt…' : 'Projekt anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire the trigger button + modal state into `src/routes/ProjectsOverviewRoute.tsx`**

Add the import at the top, alongside the existing imports:

```typescript
import { useState } from 'react'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
```

(Note: `useState` is a new import — `ProjectsOverviewRoute.tsx` currently only imports `useEffect, useMemo` from `'react'`; merge it into that existing import line instead of adding a second one: `import { useEffect, useMemo, useState } from 'react'`.)

Inside the `ProjectsOverviewRoute` function body, add a modal-visibility state near the top (after the existing store hooks, before the `useEffect`):

```typescript
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
```

Replace the header block:

```tsx
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 650, margin: '0 0 5px', letterSpacing: '-0.01em' }}>
          Alle Projekte
        </h1>
        <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 14 }}>
          {projects.length} Projekt{projects.length === 1 ? '' : 'e'} insgesamt — {active.length} aktiv, {paused.length} pausiert.
        </p>
      </div>
```

with:

```tsx
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 650, margin: '0 0 5px', letterSpacing: '-0.01em' }}>
            Alle Projekte
          </h1>
          <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 14 }}>
            {projects.length} Projekt{projects.length === 1 ? '' : 'e'} insgesamt — {active.length} aktiv, {paused.length} pausiert.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowNewProjectModal(true)}>
          + Neues Projekt
        </button>
      </div>
```

Replace the empty-state block:

```tsx
      {projects.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '48px 20px', color: 'var(--fg-dim)', textAlign: 'center',
        }}>
          <FolderKanban size={32} />
          <div>Noch keine Projekte angelegt.</div>
        </div>
      ) : (
```

with (adds a direct CTA in the empty state too, so a first-time user isn't left guessing that the header button is the only way in):

```tsx
      {projects.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '48px 20px', color: 'var(--fg-dim)', textAlign: 'center',
        }}>
          <FolderKanban size={32} />
          <div>Noch keine Projekte angelegt.</div>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setShowNewProjectModal(true)}>
            + Neues Projekt
          </button>
        </div>
      ) : (
```

Finally, add the modal render right before the closing `</div>` of the component's root return (after the `Bucket`/empty-state `{...}` block, still inside the root `<div className="main-inner" ...>`):

```tsx
      {showNewProjectModal && <NewProjectModal onClose={() => setShowNewProjectModal(false)} />}
    </div>
  )
}
```

(This replaces the current final two lines of the file, `    </div>\n  )\n}`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all pre-existing tests pass, no regressions. No new test file for this task — `NewProjectModal` is a thin UI composition over already-tested store methods (`upsert`/`createPhase`), directly analogous to `DealModal` having no dedicated test file either.

- [ ] **Step 5: Manual smoke test**

If you can launch and interact with the running desktop app: click "+ Neues Projekt", fill in a customer and title, save, confirm you land on the new project's detail page with the stepper showing the phase if one was entered. If you cannot run/click through the app in your environment, say so explicitly in your report.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/NewProjectModal.tsx src/routes/ProjectsOverviewRoute.tsx
git commit -m "feat(projects): NewProjectModal -- Projekt anlegen aus der Uebersicht

Schliesst die im Final-Review gefundene Erreichbarkeits-Luecke: bisher
gab es keinen UI-Weg, ein Projekt anzulegen. Modal folgt dem DealModal-
Muster, legt optional gleich eine erste Phase mit an und navigiert
direkt in die neue Projekt-Detail-Ansicht."
```

---

### Task B: Supabase cloud schema migration + `projectToRow` insert fix

**Files:**
- Create: `supabase/migrations/0026_projects.sql`
- Modify: `src/data/projects.mapper.ts`
- Modify: `src/data/projects.mapper.test.ts`

**Interfaces:**
- Consumes: nothing new from Task A (independent).
- Produces: nothing consumed by a later task — this closes the cloud-parity gap flagged in the final review.

- [ ] **Step 1: Create `supabase/migrations/0026_projects.sql`**

```sql
-- NICHT automatisch anwenden -- manuell via Management-API einspielen.
-- Cloud-Gegenstueck zu SQLite-Migration v37 (src-tauri/src/db/migrations.rs).

create table if not exists public.projects (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active',
  current_phase_id text,
  created_at text not null default (now())::text,
  updated_at text not null default (now())::text,
  completed_at text
);

create table if not exists public.project_phases (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null,
  order_index integer not null,
  created_at text not null default (now())::text
);

create index if not exists idx_projects_ws on public.projects(workspace_id);
create index if not exists idx_project_phases_project on public.project_phases(project_id);

alter table public.projects enable row level security;
alter table public.project_phases enable row level security;

create policy "workspace member" on public.projects
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

-- project_phases hat keine eigene workspace_id-Spalte -- Policy geht ueber den Join zum Projekt.
create policy "workspace member via project" on public.project_phases
  for all using (
    exists (select 1 from public.projects p where p.id = project_phases.project_id and is_workspace_member(p.workspace_id))
  ) with check (
    exists (select 1 from public.projects p where p.id = project_phases.project_id and is_workspace_member(p.workspace_id))
  );

alter table public.activities add column if not exists project_id text references public.projects(id);
```

- [ ] **Step 2: Fix `projectToRow` in `src/data/projects.mapper.ts` to set `created_at`/`status` on insert**

Change the function signature and body from:

```typescript
export function projectToRow(
  p: { workspaceId: string; accountId: string; title: string; description?: string },
  ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    account_id: p.accountId,
    title: p.title,
    description: p.description ?? null,
    updated_at: ctx.now,
  }
}
```

to:

```typescript
export function projectToRow(
  p: { workspaceId: string; accountId: string; title: string; description?: string },
  ctx: { id: string; now: string; isNew: boolean },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: ctx.id,
    workspace_id: p.workspaceId,
    account_id: p.accountId,
    title: p.title,
    description: p.description ?? null,
    updated_at: ctx.now,
  }
  if (ctx.isNew) {
    row.created_at = ctx.now
    row.status = 'active'
  }
  return row
}
```

**Why `isNew` instead of always writing `created_at`/`status`:** the cloud `ProjectsGateway.upsert` (Task 3, `src/data/projects.gateway.ts`) is the same code path for both creating a new project and editing an existing one's title/description. Always emitting `status: 'active'` would silently un-pause or un-complete a project every time its title is edited via the cloud path — a real regression this fix must not introduce. Only the insert case may set `status`/`created_at`.

- [ ] **Step 3: Update the call site in `src/data/projects.gateway.ts`**

Find the cloud branch of `ProjectsGateway.upsert` — it calls `projectToRow(payload, { id, now })`. Change the call to pass `isNew: !payload.id` (an upsert payload without an `id` is always a create; one with an `id` is always an edit of an existing row — this matches the same `payload.id` presence check the local/Rust path already uses to distinguish insert vs. update). Read the current call site first to get the exact surrounding code before editing, since this plan was written without direct sight of that function's current line numbers — apply the `isNew: !payload.id` argument addition precisely where `projectToRow` is invoked, without altering any other logic in `upsert`.

- [ ] **Step 4: Update `src/data/projects.mapper.test.ts`**

Replace the existing `projectToRow` describe block:

```typescript
describe('projectToRow', () => {
  it('maps camelCase to snake_case, description optional, writes updated_at from ctx.now', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch' },
      { id: 'p1', now: '2026-01-03T00:00:00Z' },
    )
    expect(row).toEqual({
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch', description: null,
      updated_at: '2026-01-03T00:00:00Z',
    })
  })
})
```

with:

```typescript
describe('projectToRow', () => {
  it('maps camelCase to snake_case, description optional, writes updated_at from ctx.now', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch' },
      { id: 'p1', now: '2026-01-03T00:00:00Z', isNew: false },
    )
    expect(row).toEqual({
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch', description: null,
      updated_at: '2026-01-03T00:00:00Z',
    })
  })

  it('sets created_at and status=active only when isNew is true', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch' },
      { id: 'p1', now: '2026-01-03T00:00:00Z', isNew: true },
    )
    expect(row).toEqual({
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch', description: null,
      updated_at: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z', status: 'active',
    })
  })

  it('does not overwrite status when isNew is false (editing an existing cloud project)', () => {
    const row = projectToRow(
      { workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch (renamed)' },
      { id: 'p1', now: '2026-01-04T00:00:00Z', isNew: false },
    )
    expect(row.status).toBeUndefined()
    expect(row.created_at).toBeUndefined()
  })
})
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (893 pre-existing + 2 new in `projects.mapper.test.ts` = 895), no regressions.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0026_projects.sql src/data/projects.mapper.ts src/data/projects.gateway.ts src/data/projects.mapper.test.ts
git commit -m "fix(projects): Supabase-Migration fuer Cloud-Schema + projectToRow-Insert-Fix

0026_projects.sql (committet, NICHT automatisch angewendet) legt projects/
project_phases + RLS an und ergaenzt activities.project_id -- schliesst die
im Final-Review gefundene Luecke, dass geteilte Workspaces mit 'table does
not exist' scheitern wuerden. projectToRow setzt created_at/status jetzt
nur beim echten Insert (isNew), nicht bei jedem Edit -- verhindert, dass
ein Titel-Edit ueber die Cloud ein pausiertes/abgeschlossenes Projekt
stillschweigend auf 'active' zuruecksetzen wuerde."
```

---

## Final Steps

After both tasks are complete and reviewed: dispatch a final reviewer over the combined diff of both tasks (smaller scope than the original 8-task review — a standard-capability model is sufficient here, not necessarily the most capable one, given the limited surface area), then proceed to `superpowers:finishing-a-development-branch` for the whole `feat/projektplaner-kern` branch (which now includes both the original 8 tasks and this fast-follow).
