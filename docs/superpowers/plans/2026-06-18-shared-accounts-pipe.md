# Shared Accounts Data Pipe — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In einem *geteilten* Workspace liest/schreibt die App die `accounts`-Tabelle (Leads) direkt gegen Supabase und empfängt fremde Änderungen per Realtime — sodass „A legt einen Lead an, B sieht ihn in Sekunden ohne Reload".

**Architecture:** Ein Workspace-Modus-Flag (`isShared`, abgeleitet aus der Mitgliederzahl) entscheidet pro Datenzugriff: **solo** → bestehender `invoke(...)`-Pfad gegen lokale SQLite; **shared** → `supabase.from('accounts')…`. Der `leads.store` ruft künftig ein `AccountsGateway`, das diese Entscheidung kapselt. Ein `useWorkspaceRealtime`-Hook abonniert `postgres_changes` auf `accounts` und spielt Events in den Store. RLS für `accounts` existiert bereits (`supabase/migrations/0001_enable_rls.sql`).

**Tech Stack:** React + Zustand + TypeScript, `@supabase/supabase-js` (Realtime + PostgREST), Tauri `invoke` (lokaler Pfad), Vitest.

**Scope-Hinweis:** Dieser Plan liefert nur den Daten-Pfad. Für die *Verifikation zu zweit* wird das zweite Mitglied vorübergehend manuell in Supabase (`workspace_members`) eingetragen. Der echte **Beitritts-Code**, **Nutzerprofile** und **Attribution-Badges** sind Plan 2 (`2026-06-18-shared-accounts-onboarding.md`, folgt).

**Referenz-Spec:** `docs/superpowers/specs/2026-06-18-shared-workspace-accounts-pilot-design.md`

---

## File Structure

- **Modify** `src/store/workspace.store.ts` — `isShared` an `Workspace`; Mitgliederzahl beim `loadWorkspaces` ermitteln; Selektoren `getActiveWorkspaceId()` / `isActiveWorkspaceShared()`.
- **Create** `src/data/accounts.mapper.ts` — reine Konvertierung Supabase-`accounts`-Row ↔ `Lead` / `UpsertLeadPayload`.
- **Create** `src/data/accounts.mapper.test.ts`.
- **Create** `src/data/accounts.gateway.ts` — `AccountsGateway` mit `getLeads / upsertLead / convertToClient / deleteAccount / updateStage`, Routing solo/shared.
- **Create** `src/data/accounts.gateway.test.ts`.
- **Modify** `src/store/leads.store.ts` — Aufrufe von `LeadsService` durch `AccountsGateway` ersetzen.
- **Create** `src/core/sync/useWorkspaceRealtime.ts` — Realtime-Subscription auf `accounts`.
- **Modify** `src/App.tsx` — `useWorkspaceRealtime()` neben `useSyncBridge()` einhängen.

Akkounts-Spalten (snake_case, aus `src-tauri/src/db/lead.rs:70-75`): `id, workspace_id, created_by, name, email, phone, account_type, lead_status, lead_source, lead_source_detail, engagement_score, re_engage_date, converted_at, pipeline_stage, company_name, linkedin_url, last_activity_at, next_follow_up_at, created_at, updated_at`.

---

## Task 1: Workspace-Modus `isShared`

**Files:**
- Modify: `src/store/workspace.store.ts`
- Test: `src/store/workspace.store.test.ts` (Create)

- [ ] **Step 1: Failing test für die Mitglieder-Zähl-Logik**

Die Ableitung wird als reine Hilfsfunktion `deriveShared` getestet (kein Netz).

```ts
// src/store/workspace.store.test.ts
import { describe, it, expect } from 'vitest'
import { deriveShared } from './workspace.store'

describe('deriveShared', () => {
  it('markiert Workspaces mit >1 Mitglied als shared', () => {
    const memberRows = [
      { workspace_id: 'a' }, { workspace_id: 'a' }, // a: 2 Mitglieder
      { workspace_id: 'b' },                        // b: 1 Mitglied
    ]
    const result = deriveShared(['a', 'b'], memberRows)
    expect(result).toEqual({ a: true, b: false })
  })

  it('Workspace ohne Mitglieder-Rows ist nicht shared', () => {
    expect(deriveShared(['x'], [])).toEqual({ x: false })
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npx vitest run src/store/workspace.store.test.ts`
Expected: FAIL — `deriveShared is not a function` / kein Export.

- [ ] **Step 3: `deriveShared` + `isShared` implementieren**

In `src/store/workspace.store.ts`:

`Workspace`-Interface erweitern:
```ts
export interface Workspace {
  id: string
  name: string
  logo_url: string | null
  role: 'owner' | 'member'
  isShared: boolean
}
```

Reine Hilfsfunktion (oben im Modul, exportiert):
```ts
/** Pro Workspace true, wenn mehr als ein Mitglied existiert. */
export function deriveShared(
  ids: string[],
  memberRows: { workspace_id: string }[],
): Record<string, boolean> {
  const counts = new Map<string, number>()
  for (const r of memberRows) counts.set(r.workspace_id, (counts.get(r.workspace_id) ?? 0) + 1)
  const out: Record<string, boolean> = {}
  for (const id of ids) out[id] = (counts.get(id) ?? 0) > 1
  return out
}
```

`loadWorkspaces` so erweitern, dass nach dem Mappen die Mitgliederzahl der eigenen Workspaces geladen und `isShared` gesetzt wird:
```ts
loadWorkspaces: async () => {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name, logo_url)')
  if (error) throw error

  const base = (data ?? []).map((m: any) => ({
    id: m.workspaces.id,
    name: m.workspaces.name,
    logo_url: m.workspaces.logo_url,
    role: m.role as 'owner' | 'member',
  }))

  const ids = base.map(w => w.id)
  let sharedMap: Record<string, boolean> = {}
  if (ids.length > 0) {
    const { data: members } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .in('workspace_id', ids)
    sharedMap = deriveShared(ids, members ?? [])
  }

  const workspaces: Workspace[] = base.map(w => ({ ...w, isShared: sharedMap[w.id] ?? false }))
  set({ workspaces })

  const { activeWorkspaceId } = get()
  if (workspaces.length === 1 && !activeWorkspaceId) {
    set({ activeWorkspaceId: workspaces[0].id })
  }
},
```

Zwei Selektoren am Ende des Store-Objekts ergänzen (für Gateway/Realtime, nicht-reaktiv nutzbar via `getState()`):
```ts
getActiveWorkspaceId: () => get().activeWorkspaceId,
isActiveWorkspaceShared: () => {
  const { workspaces, activeWorkspaceId } = get()
  return workspaces.find(w => w.id === activeWorkspaceId)?.isShared ?? false
},
```
…und beide in `WorkspaceState` deklarieren:
```ts
getActiveWorkspaceId: () => string | null
isActiveWorkspaceShared: () => boolean
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npx vitest run src/store/workspace.store.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (ggf. Stellen anpassen, die `Workspace` ohne `isShared` literal konstruieren).

- [ ] **Step 6: Commit**

```bash
git add src/store/workspace.store.ts src/store/workspace.store.test.ts
git commit -m "feat(workspace): derive isShared from member count"
```

---

## Task 2: Accounts-Mapper (Row ↔ Lead)

**Files:**
- Create: `src/data/accounts.mapper.ts`
- Test: `src/data/accounts.mapper.test.ts`

- [ ] **Step 1: Failing test (Round-Trip + Feldnamen)**

```ts
// src/data/accounts.mapper.test.ts
import { describe, it, expect } from 'vitest'
import { accountRowToLead, leadPayloadToAccountRow } from './accounts.mapper'

const row = {
  id: 'l1', workspace_id: 'ws1', created_by: 'u1', name: 'Max',
  email: 'max@x.de', phone: null, account_type: 'lead',
  lead_status: 'neu', lead_source: 'manual', lead_source_detail: null,
  engagement_score: 0, re_engage_date: null, converted_at: null,
  pipeline_stage: 'inbox', company_name: null, linkedin_url: null,
  last_activity_at: null, next_follow_up_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
}

describe('accounts.mapper', () => {
  it('accountRowToLead mappt snake_case → camelCase', () => {
    const lead = accountRowToLead(row)
    expect(lead.workspaceId).toBe('ws1')
    expect(lead.accountType).toBe('lead')
    expect(lead.pipelineStage).toBe('inbox')
    expect(lead.leadSourceDetail).toBeNull()
    expect(lead.engagementScore).toBe(0)
    expect(lead.updatedAt).toBe('2026-01-02T00:00:00Z')
  })

  it('leadPayloadToAccountRow setzt account_type=lead, created_by und defaults', () => {
    const r = leadPayloadToAccountRow(
      { workspaceId: 'ws1', name: 'Max', leadSource: 'manual' },
      { id: 'l1', createdBy: 'u1', now: '2026-01-03T00:00:00Z' },
    )
    expect(r.id).toBe('l1')
    expect(r.account_type).toBe('lead')
    expect(r.created_by).toBe('u1')
    expect(r.workspace_id).toBe('ws1')
    expect(r.lead_status).toBe('neu')        // default
    expect(r.pipeline_stage).toBe('inbox')   // default
    expect(r.updated_at).toBe('2026-01-03T00:00:00Z')
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npx vitest run src/data/accounts.mapper.test.ts`
Expected: FAIL — Modul/Funktionen existieren nicht.

- [ ] **Step 3: Mapper implementieren**

```ts
// src/data/accounts.mapper.ts
import type { Lead, UpsertLeadPayload } from '@/types/lead.types'

/** Supabase-`accounts`-Zeile (account_type='lead') → Lead-Domänentyp. */
export function accountRowToLead(r: any): Lead {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    accountType: 'lead',
    pipelineStage: r.pipeline_stage ?? 'inbox',
    leadStatus: r.lead_status ?? 'neu',
    leadSource: r.lead_source,
    leadSourceDetail: r.lead_source_detail ?? null,
    companyName: r.company_name ?? null,
    linkedinUrl: r.linkedin_url ?? null,
    lastActivityAt: r.last_activity_at ?? null,
    nextFollowUpAt: r.next_follow_up_at ?? null,
    engagementScore: r.engagement_score ?? 0,
    reEngageDate: r.re_engage_date ?? null,
    convertedAt: r.converted_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** UpsertLeadPayload → `accounts`-Row für `supabase.from('accounts').upsert(...)`. */
export function leadPayloadToAccountRow(
  p: UpsertLeadPayload,
  ctx: { id: string; createdBy: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    created_by: ctx.createdBy,
    name: p.name,
    email: p.email ?? null,
    phone: p.phone ?? null,
    account_type: 'lead',
    lead_status: p.leadStatus ?? 'neu',
    lead_source: p.leadSource,
    lead_source_detail: p.leadSourceDetail ?? null,
    pipeline_stage: p.pipelineStage ?? 'inbox',
    company_name: p.companyName ?? null,
    linkedin_url: p.linkedinUrl ?? null,
    re_engage_date: p.reEngageDate ?? null,
    updated_at: ctx.now,
  }
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npx vitest run src/data/accounts.mapper.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/accounts.mapper.ts src/data/accounts.mapper.test.ts
git commit -m "feat(data): accounts row<->lead mapper"
```

---

## Task 3: AccountsGateway (Routing solo/shared)

**Files:**
- Create: `src/data/accounts.gateway.ts`
- Test: `src/data/accounts.gateway.test.ts`

- [ ] **Step 1: Failing test — Routing-Verzweigung**

Getestet wird nur die *Entscheidung* (solo → `LeadsService`, shared → `supabase`), mit gemockten Abhängigkeiten.

```ts
// src/data/accounts.gateway.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/leads.service', () => ({
  LeadsService: { getAll: vi.fn(), upsert: vi.fn(), convertToClient: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: { getState: vi.fn() },
}))
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1' } }) },
}))

const supaChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
}
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => supaChain) },
}))

import { LeadsService } from '@/services/leads.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { AccountsGateway } from './accounts.gateway'

describe('AccountsGateway routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getLeads (solo) ruft LeadsService.getAll', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspaceId: 'ws1', isActiveWorkspaceShared: () => false,
    } as any)
    vi.mocked(LeadsService.getAll).mockResolvedValueOnce([])
    await AccountsGateway.getLeads('ws1')
    expect(LeadsService.getAll).toHaveBeenCalledWith('ws1')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('getLeads (shared) liest aus supabase.accounts', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspaceId: 'ws1', isActiveWorkspaceShared: () => true,
    } as any)
    await AccountsGateway.getLeads('ws1')
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(LeadsService.getAll).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npx vitest run src/data/accounts.gateway.test.ts`
Expected: FAIL — `AccountsGateway` existiert nicht.

- [ ] **Step 3: Gateway implementieren**

```ts
// src/data/accounts.gateway.ts
import { supabase } from '@/lib/supabase'
import { LeadsService } from '@/services/leads.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { accountRowToLead, leadPayloadToAccountRow } from './accounts.mapper'
import type { Lead, UpsertLeadPayload, PipelineStage } from '@/types/lead.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function uid(): string {
  return useAuthStore.getState().user?.id ?? ''
}

export const AccountsGateway = {
  async getLeads(workspaceId: string): Promise<Lead[]> {
    if (!shared()) return LeadsService.getAll(workspaceId)
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('account_type', 'lead')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(accountRowToLead)
  },

  async upsertLead(payload: UpsertLeadPayload): Promise<Lead> {
    if (!shared()) return LeadsService.upsert(payload)
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = leadPayloadToAccountRow(payload, { id, createdBy: uid(), now })
    const { data, error } = await supabase
      .from('accounts')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single()
    if (error) throw error
    return accountRowToLead(data)
  },

  async convertToClient(id: string): Promise<void> {
    if (!shared()) { await LeadsService.convertToClient(id); return }
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('accounts')
      .update({ account_type: 'client', lead_status: null, converted_at: now, updated_at: now })
      .eq('id', id)
    if (error) throw error
  },

  async deleteAccount(id: string, workspaceId: string): Promise<void> {
    if (!shared()) { await LeadsService.deleteLead(id, workspaceId); return }
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) throw error
  },

  async updateStage(id: string, stage: PipelineStage): Promise<Lead> {
    if (!shared()) return LeadsService.updateStage(id, stage)
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('accounts')
      .update({ pipeline_stage: stage, updated_at: now })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return accountRowToLead(data)
  },
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npx vitest run src/data/accounts.gateway.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/accounts.gateway.ts src/data/accounts.gateway.test.ts
git commit -m "feat(data): AccountsGateway routes leads solo/shared"
```

---

## Task 4: `leads.store` auf das Gateway umstellen

**Files:**
- Modify: `src/store/leads.store.ts`

- [ ] **Step 1: Import ergänzen, Service-Aufrufe ersetzen**

Oben:
```ts
import { AccountsGateway } from '@/data/accounts.gateway'
```

Ersetzungen (Verhalten/Signaturen bleiben identisch, nur die Quelle wechselt):
- `load`: `LeadsService.getAll(workspaceId)` → `AccountsGateway.getLeads(workspaceId)`
- `upsert`: `LeadsService.upsert(payload)` → `AccountsGateway.upsertLead(payload)`
- `convertToClient`: `LeadsService.convertToClient(id)` → `AccountsGateway.convertToClient(id)`
- `deleteLead`: `LeadsService.deleteLead(id, workspaceId)` → `AccountsGateway.deleteAccount(id, workspaceId)`
- `updateStage`: `LeadsService.updateStage(id, stage)` → `AccountsGateway.updateStage(id, stage)`
- In `convertToDeal` bleibt der lokale Pfad vorerst unverändert (`LeadsService.convertToClient(id)` → `AccountsGateway.convertToClient(id)` ersetzen, Rest unangetastet — Deals sind nicht Teil dieses Plans).

`bulkUpdate` und `syncPending` bleiben auf `LeadsService` (kein Shared-Pfad in Phase 1; sie werden im Solo-Betrieb genutzt). `LeadsService`-Import bleibt erhalten.

- [ ] **Step 2: Bestehende Leads-Tests + Typecheck laufen lassen**

Run: `npx vitest run src/store && npx tsc --noEmit`
Expected: PASS / keine Typfehler.

- [ ] **Step 3: Commit**

```bash
git add src/store/leads.store.ts
git commit -m "refactor(leads): route store through AccountsGateway"
```

---

## Task 5: Realtime-Hook für `accounts`

**Files:**
- Create: `src/core/sync/useWorkspaceRealtime.ts`

- [ ] **Step 1: Hook implementieren**

Der Hook abonniert `accounts` nur, wenn der aktive Workspace shared ist. Bei Lead-Events wird der `leads.store` direkt über `setState` aktualisiert (keine neue Store-Methode nötig). Wechselt ein Account auf `account_type='client'` oder wird gelöscht, fliegt er aus der Leads-Liste.

```ts
// src/core/sync/useWorkspaceRealtime.ts
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useLeadsStore } from '@/store/leads.store'
import { accountRowToLead } from '@/data/accounts.mapper'
import { log } from '@/lib/logger'

export function useWorkspaceRealtime() {
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const workspaces        = useWorkspaceStore(s => s.workspaces)
  const isShared = workspaces.find(w => w.id === activeWorkspaceId)?.isShared ?? false

  useEffect(() => {
    if (!activeWorkspaceId || !isShared) return

    const channel = supabase
      .channel(`ws-accounts-${activeWorkspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `workspace_id=eq.${activeWorkspaceId}` },
        (payload) => {
          const newRow: any = payload.new
          const oldRow: any = payload.old
          // Entfernen: gelöscht ODER kein Lead mehr (z. B. zu 'client' konvertiert).
          if (payload.eventType === 'DELETE' || (newRow && newRow.account_type !== 'lead')) {
            const goneId = newRow?.id ?? oldRow?.id
            if (goneId) useLeadsStore.setState(s => ({ leads: s.leads.filter(l => l.id !== goneId) }))
            return
          }
          if (newRow && newRow.account_type === 'lead') {
            const lead = accountRowToLead(newRow)
            useLeadsStore.setState(s => {
              const exists = s.leads.some(l => l.id === lead.id)
              return {
                leads: exists ? s.leads.map(l => l.id === lead.id ? lead : l) : [lead, ...s.leads],
              }
            })
          }
        },
      )
      .subscribe((status) => log.info('Realtime accounts channel', { status }))

    return () => { supabase.removeChannel(channel) }
  }, [activeWorkspaceId, isShared])
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/core/sync/useWorkspaceRealtime.ts
git commit -m "feat(sync): realtime subscription for shared accounts"
```

---

## Task 6: Hook einhängen + Verifikation zu zweit

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Hook mounten**

Import neben dem bestehenden Sync-Import:
```ts
import { useWorkspaceRealtime } from '@/core/sync/useWorkspaceRealtime'
```
Direkt nach `useSyncBridge()` (aktuell `src/App.tsx:203`):
```ts
useSyncBridge()
useWorkspaceRealtime()
```

- [ ] **Step 2: Typecheck + volle Testsuite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: keine Typfehler; alle Tests grün.

- [ ] **Step 3: Realtime im Supabase-Projekt aktivieren (einmalig)**

Sicherstellen, dass `accounts` zur Realtime-Publication gehört. Im Supabase SQL-Editor:
```sql
alter publication supabase_realtime add table public.accounts;
```
(Idempotent prüfen: `select * from pg_publication_tables where pubname='supabase_realtime';`)

- [ ] **Step 4: Test-Mitgliedschaft anlegen (temporär, bis Plan 2 den Beitritts-Code liefert)**

Zweiten Test-Account in Supabase Auth anlegen, dessen `user_id` ermitteln, dann im SQL-Editor:
```sql
insert into public.workspace_members (workspace_id, user_id, role)
values ('<WORKSPACE_ID_DES_OWNERS>', '<USER_ID_DES_MITARBEITERS>', 'member');
```
Dadurch hat der Workspace 2 Mitglieder → `isShared` wird beim nächsten `loadWorkspaces` true.

- [ ] **Step 5: Manuelle Zwei-Sessions-Verifikation**

1. App als Owner starten (`npm run tauri dev`), in den geteilten Workspace gehen, Leads-Liste öffnen.
2. Zweite Session als Mitarbeiter (anderer Rechner/Account) — gleicher Workspace, Leads-Liste.
3. Owner legt einen Lead an → erscheint beim Mitarbeiter **in Sekunden ohne Reload**.
4. Mitarbeiter macht den Lead über „Zu Kunde" zum Kunden → verschwindet bei **beiden** aus der Leads-Liste.
5. Solo-Gegenprobe: Workspace mit nur einem Mitglied verhält sich unverändert (lokaler Pfad, offline nutzbar).

Erwartung: Schritte 3–5 erfüllt. Falls nicht: Browser-/WebView-Konsole auf den Channel-`status` (`SUBSCRIBED`) und PostgREST-Fehler prüfen.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(sync): mount useWorkspaceRealtime"
```

---

## Self-Review-Notiz (Plan-Autor)

- **Spec-Abdeckung:** Dieser Plan deckt aus der Spec ab: Workspace-Modus (Komp. 1), Gateway (Komp. 2), Mapper (Komp. 3), Realtime (Komp. 4) — beschränkt auf `accounts`/Leads. **Bewusst NICHT hier:** Beitritts-Code (Komp. 7), Profile (Komp. 5), Badges/Attribution (Komp. 6), Zuweisung/Heute (Komp. 10), Finanz-Sichtbarkeit (Komp. 11), übrige Kunden-Tabs. → eigene Folge-Pläne.
- **Offline (Komp. 9):** in Phase 1 nur „Reads brauchen Netz" implizit (Shared-Reads gehen gegen Supabase). Schreib-Pufferung via `sync_queue` im Shared-Modus ist **nicht** Teil dieses Plans und wird in einem Folgeplan adressiert.
- **Annahme zu prüfen bei Ausführung:** Supabase-`accounts`-Spaltennamen entsprechen dem lokalen SQLite-Schema (siehe `lead.rs`). Falls das echte Supabase-Schema abweicht, Mapper (Task 2) anpassen — die Mapper-Tests fangen Feldnamen-Fehler nicht gegen die echte DB, daher die manuelle Verifikation in Task 6.
