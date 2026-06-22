# Roles & Permissions (RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-based access (owner/admin/member + per-member capability grants) so that finances and contracts are restricted to authorized members in a shared workspace, enforced by Supabase RLS and reflected in the UI.

**Architecture:** A SQL helper `has_capability(workspace_id, cap)` (SECURITY DEFINER) is the single source of truth, used by RLS policies on `vertraege`, finance tables, and `workspace_members`. The frontend mirrors the same logic in a pure `hasCapability()` function exposed via a `useCapability()` hook for UI gating only (never a security boundary). An owner-only members-management UI writes role/capabilities through a gateway.

**Tech Stack:** Supabase (Postgres RLS, Management API for DDL), React + Zustand, TypeScript, Vitest. Supabase project `mqbjmquscjtytpjebosw`; DDL applied via Management API with a user-provided PAT (`sbp_…`) — additive/reversible changes are pre-approved.

**Spec:** `docs/superpowers/specs/2026-06-22-roles-permissions-design.md`

---

## File Structure

- **Create** `supabase/migrations/0012_capabilities.sql` — capabilities column + `has_capability()`.
- **Create** `supabase/migrations/0013_rbac_policies.sql` — RLS policy updates (vertraege, finances, workspace_members).
- **Create** `src/lib/capabilities.ts` — pure role/capability types + `hasCapability()`.
- **Create** `src/lib/capabilities.test.ts` — unit tests for the pure logic.
- **Modify** `src/store/workspace.store.ts` — `Workspace.role` adds `'admin'`, new `capabilities` field, load it, expose `useCapability`.
- **Create** `src/hooks/useCapability.ts` — hook reading active workspace membership (or co-locate in workspace.store; this plan uses a dedicated file).
- **Create** `src/data/workspace-members.gateway.ts` — `list()` + `updateMember()`.
- **Create** `src/data/workspace-members.gateway.test.ts` — routing test.
- **Create** `src/components/workspace/MembersSettings.tsx` — owner-only members UI.
- **Modify** `src/routes/CustomerRoute.tsx` — gate `finanzen` tab by `useCapability('finances')`.
- **Modify** finance/contracts entry points (nav + routes) — gate by capability. Exact files located in Task 6.

DB tasks are verified live via the Management API helper (round-trips), not unit tests — mirroring the established schema-verification pattern this branch already uses.

---

## Conventions for DB steps

Run SQL via PowerShell against the Management API. Use this helper shape (token is provided per session by the user; never write it to disk):

```powershell
$headers = @{ Authorization = "Bearer <PAT>"; "Content-Type" = "application/json" }
$uri = "https://api.supabase.com/v1/projects/mqbjmquscjtytpjebosw/database/query"
function Q($sql) { $b = @{ query = $sql } | ConvertTo-Json; Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $b }
```

Each DB task: (1) write the migration file, (2) apply it with `Q (Get-Content -Raw <file>)`, (3) verify with a follow-up query. Commit the migration file.

---

## Task 1: capabilities column + has_capability()

**Files:**
- Create: `supabase/migrations/0012_capabilities.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 0012_capabilities.sql — RBAC-Fundament: capabilities + has_capability()
-- ANGEWANDT <DATUM> via Management-API (Projekt mqbjmquscjtytpjebosw).
--
-- workspace_members.role kennt bisher 'owner'/'member'; 'admin' kommt hinzu
-- (kein Enum-Typ, role ist text — kein DDL nötig, nur Werte). capabilities[]
-- hält gezielte Freischaltungen für 'member'. has_capability() ist die einzige
-- Wahrheit für RLS; SECURITY DEFINER wie is_workspace_member (vermeidet Rekursion,
-- wenn es in workspace_members-Policies genutzt wird).

alter table public.workspace_members
  add column if not exists capabilities text[] not null default '{}';

create or replace function public.has_capability(ws_id text, cap text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id
      and m.user_id = auth.uid()::text
      and (
        m.role = 'owner'
        or (m.role = 'admin' and cap <> 'manage_members')
        or cap = any(m.capabilities)
      )
  );
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `Q (Get-Content -Raw "supabase/migrations/0012_capabilities.sql")`
Expected: no error.

- [ ] **Step 3: Verify column + function exist**

Run:
```powershell
Q "select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='workspace_members' and column_name='capabilities';" | ConvertTo-Json
Q "select proname, prosecdef from pg_proc where proname='has_capability';" | ConvertTo-Json
```
Expected: `capabilities` is `ARRAY` with default `'{}'::text[]`; `has_capability` exists with `prosecdef=true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_capabilities.sql
git commit -m "feat(db): workspace_members.capabilities + has_capability() for RBAC"
```

---

## Task 2: RLS policies (vertraege, finances, workspace_members)

**Files:**
- Create: `supabase/migrations/0013_rbac_policies.sql`

**Background (live policy names confirmed):** `vertraege` has `own data`; `invoices`/`offers` have `workspace member`; `payments` has `payments_ws`; `invoice_items` has `via invoice` (scoped by parent's created_by); `offer_items` has `via offer`; `workspace_members` has `members can view co-members` (SELECT) and `own memberships` (ALL, user_id = auth.uid() — this lets a member UPDATE their own role and must be split).

- [ ] **Step 1: Write the migration file**

```sql
-- 0013_rbac_policies.sql — RLS auf Capabilities umstellen
-- ANGEWANDT <DATUM> via Management-API (Projekt mqbjmquscjtytpjebosw).

-- ── Verträge: own data → contracts-Capability ──────────────────────────────
drop policy if exists "own data" on public.vertraege;
create policy "contracts capability" on public.vertraege
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'contracts'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'contracts'));

-- ── Finanzen: workspace member → + finances-Capability ─────────────────────
drop policy if exists "workspace member" on public.invoices;
create policy "finances capability" on public.invoices
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'));

drop policy if exists "workspace member" on public.offers;
create policy "finances capability" on public.offers
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'));

drop policy if exists "payments_ws" on public.payments;
create policy "finances capability" on public.payments
  for all
  using      (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'))
  with check (is_workspace_member(workspace_id) and has_capability(workspace_id, 'finances'));

-- Kind-Tabellen über das Elternteil scopen (workspace + finances).
drop policy if exists "via invoice" on public.invoice_items;
create policy "via invoice finances" on public.invoice_items
  for all
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_items.invoice_id
                   and is_workspace_member(i.workspace_id)
                   and has_capability(i.workspace_id, 'finances')))
  with check (exists (select 1 from public.invoices i
                 where i.id = invoice_items.invoice_id
                   and is_workspace_member(i.workspace_id)
                   and has_capability(i.workspace_id, 'finances')));

drop policy if exists "via offer" on public.offer_items;
create policy "via offer finances" on public.offer_items
  for all
  using (exists (select 1 from public.offers o
                 where o.id = offer_items.offer_id
                   and is_workspace_member(o.workspace_id)
                   and has_capability(o.workspace_id, 'finances')))
  with check (exists (select 1 from public.offers o
                 where o.id = offer_items.offer_id
                   and is_workspace_member(o.workspace_id)
                   and has_capability(o.workspace_id, 'finances')));

-- ── workspace_members: self-update-Eskalation verhindern ───────────────────
-- "own memberships" (ALL) erlaubte einem Mitglied, die EIGENE role/capabilities
-- zu ändern. Aufsplitten: self-INSERT (createWorkspace-Owner-Zeile) + self/owner-
-- DELETE (verlassen / entfernen) erlaubt; UPDATE NUR mit manage_members (Owner).
-- SELECT-Policy "members can view co-members" bleibt unverändert.
drop policy if exists "own memberships" on public.workspace_members;

create policy "self insert membership" on public.workspace_members
  for insert with check (user_id = auth.uid()::text);

create policy "leave or owner remove" on public.workspace_members
  for delete using (user_id = auth.uid()::text or has_capability(workspace_id, 'manage_members'));

create policy "owner updates members" on public.workspace_members
  for update
  using      (has_capability(workspace_id, 'manage_members'))
  with check (has_capability(workspace_id, 'manage_members'));
```

- [ ] **Step 2: Apply the migration**

Run: `Q (Get-Content -Raw "supabase/migrations/0013_rbac_policies.sql")`
Expected: no error.

- [ ] **Step 3: Verify policies replaced**

Run:
```powershell
Q "select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('vertraege','invoices','offers','payments','invoice_items','offer_items','workspace_members') order by tablename, policyname;" | ConvertTo-Json -Depth 5
```
Expected: `vertraege` → `contracts capability`; finance tables → `finances capability` / `via … finances`; `workspace_members` → `members can view co-members` (SELECT), `self insert membership` (INSERT), `leave or owner remove` (DELETE), `owner updates members` (UPDATE). No `own data` / `own memberships` / old `workspace member` / `payments_ws` / `via invoice` / `via offer`.

- [ ] **Step 4: Live RLS round-trip (capability enforcement)**

This proves the policies actually gate. Run as a single batch (Management API runs as superuser → set the JWT claim to simulate a user via `set local role` is not available; instead verify the FUNCTION logic directly against seeded rows, which is what RLS calls):

```powershell
# Seed: workspace + 3 members (owner, admin, member with {contracts})
Q @"
insert into public.workspaces (id, name, created_by, join_code) values ('__rbac_ws__','RBAC Test','__owner__','ZZZZ99') on conflict (id) do nothing;
insert into public.workspace_members (id, workspace_id, user_id, role, capabilities) values
  ('__m_o__','__rbac_ws__','__owner__','owner','{}'),
  ('__m_a__','__rbac_ws__','__admin__','admin','{}'),
  ('__m_m__','__rbac_ws__','__member__','member','{contracts}'),
  ('__m_n__','__rbac_ws__','__nobody__','member','{}')
on conflict (id) do nothing;
"@ | Out-Null

# has_capability runs auth.uid(); Management API has no auth.uid() (returns null),
# so test the underlying predicate directly with explicit uids:
Q @"
select
  (select exists(select 1 from workspace_members m where m.workspace_id='__rbac_ws__' and m.user_id='__owner__'  and (m.role='owner' or (m.role='admin' and 'finances'<>'manage_members') or 'finances'=any(m.capabilities)))) as owner_finances,
  (select exists(select 1 from workspace_members m where m.workspace_id='__rbac_ws__' and m.user_id='__admin__'  and (m.role='owner' or (m.role='admin' and 'finances'<>'manage_members') or 'finances'=any(m.capabilities)))) as admin_finances,
  (select exists(select 1 from workspace_members m where m.workspace_id='__rbac_ws__' and m.user_id='__member__' and (m.role='owner' or (m.role='admin' and 'finances'<>'manage_members') or 'finances'=any(m.capabilities)))) as member_finances,
  (select exists(select 1 from workspace_members m where m.workspace_id='__rbac_ws__' and m.user_id='__member__' and (m.role='owner' or (m.role='admin' and 'contracts'<>'manage_members') or 'contracts'=any(m.capabilities)))) as member_contracts,
  (select exists(select 1 from workspace_members m where m.workspace_id='__rbac_ws__' and m.user_id='__admin__'  and (m.role='owner' or (m.role='admin' and 'manage_members'<>'manage_members') or 'manage_members'=any(m.capabilities)))) as admin_manage;
"@ | ConvertTo-Json
```
Expected: `owner_finances=true`, `admin_finances=true`, `member_finances=false`, `member_contracts=true`, `admin_manage=false`.

- [ ] **Step 5: Clean up seed rows**

```powershell
Q "delete from public.workspace_members where workspace_id='__rbac_ws__'; delete from public.workspaces where id='__rbac_ws__';" | Out-Null
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_rbac_policies.sql
git commit -m "feat(db): RBAC RLS — contracts/finances capability gates + member self-update guard"
```

---

## Task 3: Pure capability logic (`src/lib/capabilities.ts`)

**Files:**
- Create: `src/lib/capabilities.ts`
- Test: `src/lib/capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { hasCapability, type Membership } from './capabilities'

const m = (role: Membership['role'], capabilities: Membership['capabilities'] = []): Membership => ({ role, capabilities })

describe('hasCapability', () => {
  it('lokal/solo (nicht shared): immer true, auch ohne Membership', () => {
    expect(hasCapability(null, 'finances', false)).toBe(true)
    expect(hasCapability(m('member'), 'contracts', false)).toBe(true)
  })
  it('shared ohne Membership: false', () => {
    expect(hasCapability(null, 'finances', true)).toBe(false)
  })
  it('owner: alle Capabilities inkl. manage_members', () => {
    expect(hasCapability(m('owner'), 'finances', true)).toBe(true)
    expect(hasCapability(m('owner'), 'manage_members', true)).toBe(true)
  })
  it('admin: alles außer manage_members', () => {
    expect(hasCapability(m('admin'), 'finances', true)).toBe(true)
    expect(hasCapability(m('admin'), 'contracts', true)).toBe(true)
    expect(hasCapability(m('admin'), 'manage_members', true)).toBe(false)
  })
  it('member: nur explizit freigeschaltete Capabilities', () => {
    expect(hasCapability(m('member', ['contracts']), 'contracts', true)).toBe(true)
    expect(hasCapability(m('member', ['contracts']), 'finances', true)).toBe(false)
    expect(hasCapability(m('member'), 'manage_members', true)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/capabilities.test.ts`
Expected: FAIL — `./capabilities` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/capabilities.ts
export type Role = 'owner' | 'admin' | 'member'
export type Capability = 'finances' | 'contracts' | 'manage_members'

export interface Membership {
  role: Role
  capabilities: Capability[]
}

/**
 * Spiegelt die SQL-Funktion has_capability(). NUR für UI-Gating — die echte
 * Grenze ist RLS. Lokal/solo (nicht shared) = volle Rechte (kein Aussperren).
 */
export function hasCapability(
  membership: Membership | null,
  cap: Capability,
  isShared: boolean,
): boolean {
  if (!isShared) return true
  if (!membership) return false
  if (membership.role === 'owner') return true
  if (membership.role === 'admin') return cap !== 'manage_members'
  return membership.capabilities.includes(cap)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/capabilities.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/capabilities.ts src/lib/capabilities.test.ts
git commit -m "feat(rbac): pure hasCapability() logic + tests"
```

---

## Task 4: workspace.store loads capabilities + role 'admin'

**Files:**
- Modify: `src/store/workspace.store.ts`

- [ ] **Step 1: Extend the `Workspace` interface**

Change (lines ~5-12):
```ts
import type { Role, Capability } from '@/lib/capabilities'

export interface Workspace {
  id: string
  name: string
  logo_url: string | null
  role: Role
  capabilities: Capability[]
  isShared: boolean
  join_code: string | null
}
```

- [ ] **Step 2: Load `capabilities` in `loadWorkspaces`**

In the `.select(...)` (line ~71), add `capabilities`:
```ts
.select('workspace_id, role, capabilities, workspaces(id, name, logo_url, join_code)')
```

In the `base` mapping (line ~76), add capabilities and widen role:
```ts
const base = (data ?? []).map((m: any) => ({
  id: m.workspaces.id,
  name: m.workspaces.name,
  logo_url: m.workspaces.logo_url,
  role: (m.role ?? 'member') as Role,
  capabilities: (m.capabilities ?? []) as Capability[],
  join_code: m.workspaces.join_code ?? null,
}))
```

The final `workspaces` mapping already spreads `...w`, so `capabilities` flows through. No other change needed there.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `createWorkspace`/other code constructs a `Workspace` literal without `capabilities`, fix by adding `capabilities: []` — search for object literals assigned to `Workspace`. As of this plan, only `loadWorkspaces` builds them.)

- [ ] **Step 4: Run the existing workspace tests**

Run: `npx vitest run src/store/workspace.store.test.ts`
Expected: PASS (deriveShared/join-code tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/store/workspace.store.ts
git commit -m "feat(rbac): load role+capabilities into workspace.store"
```

---

## Task 5: `useCapability` hook

**Files:**
- Create: `src/hooks/useCapability.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useCapability.ts
import { useWorkspaceStore } from '@/store/workspace.store'
import { hasCapability, type Capability } from '@/lib/capabilities'

/** UI-Gating-Hook. NICHT als Sicherheitsgrenze verwenden — das ist RLS. */
export function useCapability(cap: Capability): boolean {
  return useWorkspaceStore(s => {
    const ws = s.workspaces.find(w => w.id === s.activeWorkspaceId)
    return hasCapability(
      ws ? { role: ws.role, capabilities: ws.capabilities } : null,
      cap,
      ws?.isShared ?? false,
    )
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCapability.ts
git commit -m "feat(rbac): useCapability() UI-gating hook"
```

---

## Task 6: UI gating of finances & contracts

**Files:**
- Modify: `src/routes/CustomerRoute.tsx` (the `finanzen` tab)
- Modify: the app nav/route that exposes the Finanzen main view and the Verträge view

- [ ] **Step 1: Locate the entry points**

Run:
```bash
rg -n "finanzen|Finanzen|Verträge|vertraege|Vertrag" src/App.tsx src/routes --glob '*.tsx' | head -40
```
Note the nav items / route guards that render the finance dashboard and the Verträge view, plus the `TAB_DEFS` in `CustomerRoute.tsx`.

- [ ] **Step 2: Gate the `finanzen` tab in CustomerRoute**

In `src/routes/CustomerRoute.tsx`, import the hook and filter the tab:
```ts
import { useCapability } from '@/hooks/useCapability'
```
Inside the component:
```ts
const canFinances = useCapability('finances')
```
Where `TAB_DEFS` is mapped to render tab buttons (line ~390), skip the finance tab when not allowed:
```ts
{TAB_DEFS.filter(t => t.id !== 'finanzen' || canFinances).map(t => {
```
And in `renderPane()` (the `case 'finanzen'`), guard so a stale `activeTab` can't show it:
```ts
case 'finanzen': return canFinances ? <FinanzPane customerId={customerId} /> : null
```

- [ ] **Step 3: Gate the Finanzen main view + Verträge in nav/routes**

In the nav/route file(s) found in Step 1, wrap the finance and Verträge entries:
```ts
const canFinances = useCapability('finances')
const canContracts = useCapability('contracts')
```
Render the Finanzen nav item / route only when `canFinances`, and the Verträge entry only when `canContracts`. For a routed view that could still be reached by a persisted route, render a fallback:
```tsx
if (!canFinances) return <div className="p-8 text-sm text-[var(--fg-dim)]">Keine Berechtigung für Finanzen.</div>
```

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/CustomerRoute.tsx src/App.tsx
git commit -m "feat(rbac): gate finances tab + finances/contracts nav by capability"
```

---

## Task 7: WorkspaceMembersGateway

**Files:**
- Create: `src/data/workspace-members.gateway.ts`
- Test: `src/data/workspace-members.gateway.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      data: [{ user_id: 'u2', role: 'member', capabilities: ['contracts'] }],
      error: null,
    }),
  })
  return { supabase: { from: vi.fn(() => ({ update, select })) } }
})

import { supabase } from '@/lib/supabase'
import { WorkspaceMembersGateway } from './workspace-members.gateway'

beforeEach(() => vi.clearAllMocks())

describe('WorkspaceMembersGateway', () => {
  it('list: liest user_id/role/capabilities des Workspace', async () => {
    const rows = await WorkspaceMembersGateway.list('ws1')
    expect(supabase.from).toHaveBeenCalledWith('workspace_members')
    expect(rows).toEqual([{ userId: 'u2', role: 'member', capabilities: ['contracts'] }])
  })

  it('updateMember: schreibt role+capabilities für (workspace,user)', async () => {
    await WorkspaceMembersGateway.updateMember('ws1', 'u2', { role: 'admin', capabilities: [] })
    expect(supabase.from).toHaveBeenCalledWith('workspace_members')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/workspace-members.gateway.test.ts`
Expected: FAIL — gateway not found.

- [ ] **Step 3: Write the gateway**

```ts
// src/data/workspace-members.gateway.ts
import { supabase } from '@/lib/supabase'
import type { Role, Capability } from '@/lib/capabilities'

export interface WorkspaceMember {
  userId: string
  role: Role
  capabilities: Capability[]
}

export const WorkspaceMembersGateway = {
  async list(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, capabilities')
      .eq('workspace_id', workspaceId)
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: any) => ({
      userId: r.user_id,
      role: (r.role ?? 'member') as Role,
      capabilities: (r.capabilities ?? []) as Capability[],
    }))
  },

  async updateMember(
    workspaceId: string,
    userId: string,
    patch: { role?: Role; capabilities?: Capability[] },
  ): Promise<void> {
    const { error } = await supabase
      .from('workspace_members')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/workspace-members.gateway.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/workspace-members.gateway.ts src/data/workspace-members.gateway.test.ts
git commit -m "feat(rbac): WorkspaceMembersGateway list/updateMember"
```

---

## Task 8: Owner-only Members management UI

**Files:**
- Create: `src/components/workspace/MembersSettings.tsx`
- Modify: the workspace settings surface that already renders `JoinCodeRow` (find in Step 1)

- [ ] **Step 1: Locate the settings surface**

Run:
```bash
rg -n "JoinCodeRow|WorkspacePicker|Workspace.*[Ss]ettings" src --glob '*.tsx' | head -20
```
Pick the component that renders `JoinCodeRow` (owner-only workspace admin area). `MembersSettings` will be rendered next to it.

- [ ] **Step 2: Write the component**

```tsx
// src/components/workspace/MembersSettings.tsx
import { useEffect, useState } from 'react'
import { WorkspaceMembersGateway, type WorkspaceMember } from '@/data/workspace-members.gateway'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useCapability } from '@/hooks/useCapability'
import type { Role, Capability } from '@/lib/capabilities'
import { useAuthStore } from '@/store/auth.store'

const GRANTABLE: Capability[] = ['finances', 'contracts']

export function MembersSettings() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const canManage = useCapability('manage_members')
  const myId = useAuthStore(s => s.user?.id)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canManage || !workspaceId) return
    WorkspaceMembersGateway.list(workspaceId).then(setMembers).catch(e => setError(String(e)))
  }, [canManage, workspaceId])

  if (!canManage) return null

  async function update(userId: string, patch: { role?: Role; capabilities?: Capability[] }) {
    try {
      await WorkspaceMembersGateway.updateMember(workspaceId, userId, patch)
      setMembers(await WorkspaceMembersGateway.list(workspaceId))
    } catch (e) { setError(String(e)) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Mitglieder & Rechte</h3>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
      {members.map(m => {
        const isOwner = m.role === 'owner'
        const isSelf = m.userId === myId
        return (
          <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
              {m.userId}{isSelf ? ' (du)' : ''}
            </span>
            <select
              value={m.role}
              disabled={isOwner || isSelf}
              onChange={e => update(m.userId, { role: e.target.value as Role })}
            >
              <option value="member">Mitglied</option>
              <option value="admin">Admin</option>
              {isOwner && <option value="owner">Inhaber</option>}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              {GRANTABLE.map(cap => (
                <label key={cap} style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', opacity: m.role === 'member' ? 1 : 0.4 }}>
                  <input
                    type="checkbox"
                    disabled={m.role !== 'member'}
                    checked={m.role !== 'member' || m.capabilities.includes(cap)}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...m.capabilities, cap]
                        : m.capabilities.filter(c => c !== cap)
                      update(m.userId, { capabilities: next })
                    }}
                  />
                  {cap === 'finances' ? 'Finanzen' : 'Verträge'}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Render it in the settings surface**

In the owner workspace-admin component (from Step 1), import and render `<MembersSettings />` below `<JoinCodeRow />`.

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0; all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/MembersSettings.tsx <settings-surface-file>
git commit -m "feat(rbac): owner members & permissions management UI"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0; all tests pass.

- [ ] **Step 2: Update memory handoff**

Append to `current-focus.md`: RBAC done (roles owner/admin/member + capabilities), migrations 0012/0013 applied live, vertraege RLS moved off `own data`, finances gated, member self-update closed. Note remaining: realtime reload of `workspace_members` (currently reload on workspace switch) and role-based mail/documents still open.

- [ ] **Step 3: Manual smoke (optional, user)**

Two logins in the shared workspace (CULTERA AGENCY): owner sees Finanzen + Verträge; a fresh member does not; owner grants `contracts` to the member → member sees Verträge but not Finanzen.

---

## Notes / open follow-ups (out of scope here)
- Realtime reload of `workspace_members` so a role/capability change reflects without a workspace re-switch (add `workspace_members` to the realtime publication + a channel). Deferred — YAGNI for first cut.
- The local SQLite path has no membership concept; `useCapability` returns `true` in solo mode by design.
- `join_workspace_by_code` RPC is SECURITY DEFINER and unaffected by the `workspace_members` policy split (it inserts the joining member regardless of RLS).
