# LEVERAGE Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second app mode "LEVERAGE" (Sales CRM) alongside FOCUS, with its own sidebar, Heute-cockpit, full Lead detail view and mail filtering — while removing all sales views from FOCUS.

**Architecture:** Third `AppMode` value (`'leverage'`) reusing the existing `'private'` mode pattern. LEVERAGE gets its own sidebar nav, its own Heute dashboard route, and a full Lead detail view (like CustomerRoute but scoped to leads). No new DB tables — activities on leads already work via `account_id`. Mail is filtered per mode.

**Tech Stack:** React, Zustand (`ui.store`), Tauri invoke, existing `NavSidebar`, `AppShell`, `RouteSwitch`, `LeadsRoute`, `PipelineRoute`, `MailRoute`

---

## File Map

| File | Change |
|---|---|
| `src/store/ui.store.ts` | Add `'leverage'` to `AppMode`, add `enterLeverage` / `leaveLeverage` actions, add `AppView` entries for leverage routes |
| `src/components/layout/NavSidebar.tsx` | Add FOCUS/LEVERAGE mode switcher in brand area; remove Sales section from FOCUS nav; add LEVERAGE nav branch |
| `src/components/layout/AppShell.tsx` | Handle leverage mode `data-mode` attribute if needed |
| `src/App.tsx` | Load leverage data (leads, pipeline) when mode is leverage |
| `src/routes/LeverageHeuteRoute.tsx` | **NEW** — Heute cockpit for LEVERAGE |
| `src/routes/LeverageLeadRoute.tsx` | **NEW** — Lead detail view (Activities, Mails, Notes, Stage) |
| `src/routes/LeverageMailRoute.tsx` | **NEW** — Mail filtered to leads + unmatched senders |
| `src/components/layout/RouteSwitch.tsx` | No change needed |
| `src/App.tsx` (RouteSwitch cases) | Add leverage route cases |

---

## Task 1: Extend AppMode + ui.store

**Files:**
- Modify: `src/store/ui.store.ts`

- [ ] **Step 1: Add `'leverage'` to AppMode and new AppView entries**

```typescript
// In ui.store.ts

export type AppMode = 'business' | 'private' | 'leverage'

export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'akquise'   | 'invoices'
  | 'settings'  | 'integrations'
  | 'posteingang' | 'zeitmanagement'
  | 'pipeline'  | 'calendar'  | 'mail' | 'followups' | 'leads'
  | 'journal'   | 'focus'     | 'corra'
  | 'notes'     | 'inbox'     | 'sales'
  // LEVERAGE views
  | 'leverage_heute'
  | 'leverage_leads'
  | 'leverage_pipeline'
  | 'leverage_mail'
  | 'leverage_lead_detail'
```

- [ ] **Step 2: Add `enterLeverage` / `leaveLeverage` actions to UiState interface**

```typescript
// In UiState interface, add:
enterLeverage: () => void
leaveLeverage: () => void

// selectedLeverageLeadId for the lead detail view
selectedLeverageLeadId: string | null
setSelectedLeverageLeadId: (id: string | null) => void
```

- [ ] **Step 3: Implement the actions in the store**

```typescript
// Default state additions:
selectedLeverageLeadId: null,

enterLeverage: () => set({ appMode: 'leverage', appView: 'leverage_heute' }),
leaveLeverage: () => set({ appMode: 'business', appView: 'dashboard' }),
setSelectedLeverageLeadId: (id) => set({ selectedLeverageLeadId: id }),
```

- [ ] **Step 4: Persist `appMode` already in partialize — verify it's there, no change needed**

- [ ] **Step 5: Run `npx tsc --noEmit` — expect 0 errors**

---

## Task 2: Mode Switcher + NavSidebar Refactor

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`

- [ ] **Step 1: Add mode switcher component inside NavSidebar**

The brand area gets a pill switcher below the logo:

```tsx
// Below the sidebar-brand div, add:
<div style={{
  display: 'flex', gap: 4, padding: '0 10px 10px',
  flexShrink: 0,
}}>
  {[
    { mode: 'business' as AppMode, label: 'FOCUS' },
    { mode: 'leverage' as AppMode, label: 'LEVERAGE' },
  ].map(({ mode, label }) => (
    <button
      key={mode}
      onClick={() => mode === 'leverage' ? enterLeverage() : leaveLeverage()}
      style={{
        flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 10,
        fontWeight: 800, letterSpacing: '0.06em', cursor: 'pointer',
        border: '1px solid',
        background: appMode === mode ? 'var(--accent)' : 'transparent',
        borderColor: appMode === mode ? 'var(--accent)' : 'var(--border)',
        color: appMode === mode ? 'var(--accent-ink)' : 'var(--fg-dim)',
        transition: 'all 140ms',
      }}
    >
      {collapsed ? label[0] : label}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Add `appMode`, `enterLeverage`, `leaveLeverage` to NavSidebar subscriptions**

```tsx
const appMode       = useUiStore(s => s.appMode)
const enterLeverage = useUiStore(s => s.enterLeverage)
const leaveLeverage = useUiStore(s => s.leaveLeverage)
```

- [ ] **Step 3: Remove Sales section from FOCUS nav (wrap in `appMode === 'business'` check)**

```tsx
// BEFORE: always shown when mod('crm')
// AFTER: only in business mode
{mod('crm') && appMode === 'business' && (
  <>
    {!collapsed && <SectionLabel>Sales</SectionLabel>}
    <NavItem ... /> {/* Leads */}
    <NavItem ... /> {/* Follow-ups */}
    <NavItem ... /> {/* Pipeline */}
  </>
)}
```

- [ ] **Step 4: Add LEVERAGE nav branch**

```tsx
{appMode === 'leverage' && (
  <>
    {!collapsed && <SectionLabel>Leverage</SectionLabel>}
    <NavItem icon={Home}        label="Heute"    
      active={appView === 'leverage_heute'}
      onClick={() => setAppView('leverage_heute')} />
    <NavItem icon={Target}      label="Leads"    
      active={appView === 'leverage_leads' || appView === 'leverage_lead_detail'}
      onClick={() => setAppView('leverage_leads')} 
      badge={newLeadsCount || undefined} />
    <NavItem icon={TrendingUp}  label="Pipeline" 
      active={appView === 'leverage_pipeline'}
      onClick={() => setAppView('leverage_pipeline')}
      badge={openDealCount || undefined} />
    <NavItem icon={Mail}        label="Mail"     
      active={appView === 'leverage_mail'}
      onClick={() => setAppView('leverage_mail')}
      badge={unreadMails || undefined} />
  </>
)}
```

- [ ] **Step 5: Also hide Mail/Kalender from FOCUS when in leverage mode (they show in leverage nav)**

- [ ] **Step 6: `npx tsc --noEmit` — 0 errors**

---

## Task 3: App.tsx — Route Cases + Data Loading

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add leverage route cases to the RouteSwitch**

Find the existing route switch (the big if/else or switch on `appView`) and add:

```tsx
case 'leverage_heute':    return <LeverageHeuteRoute />
case 'leverage_leads':    return <LeadsRoute />          // reuse existing
case 'leverage_pipeline': return <PipelineRoute />       // reuse existing  
case 'leverage_mail':     return <LeverageMailRoute />
case 'leverage_lead_detail': return <LeverageLeadRoute />
```

- [ ] **Step 2: Verify leads + pipeline data still loads (already loaded via syncLeads/loadLeads on workspace init — no change needed)**

- [ ] **Step 3: `npx tsc --noEmit` — 0 errors**

---

## Task 4: LeverageHeuteRoute — Sales Cockpit

**Files:**
- Create: `src/routes/LeverageHeuteRoute.tsx`

This is the LEVERAGE "Heute" dashboard. Four card sections.

- [ ] **Step 1: Create the file with imports and data hooks**

```tsx
import { useMemo } from 'react'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useUiStore } from '@/store/ui.store'

export function LeverageHeuteRoute() {
  const allLeads      = useLeadsStore(s => s.leads)
  const emails        = useMailStore(s => s.emails)
  const allFollowUps  = useCrmStore(s => s.allFollowUps)
  const setAppView    = useUiStore(s => s.setAppView)
  const setLeadId     = useUiStore(s => s.setSelectedLeverageLeadId)

  const today = new Date().toLocaleDateString('sv')

  // 1. Follow-ups due today or overdue
  const dueFollowUps = useMemo(() =>
    allFollowUps.filter(f => f.status === 'offen' && f.dueDate <= today),
    [allFollowUps, today]
  )

  // 2. Re-engage leads due today or overdue
  const reEngageDue = useMemo(() =>
    allLeads.filter(l => l.reEngageDate && l.reEngageDate <= today),
    [allLeads, today]
  )

  // 3. New unmatched emails (no customerId) = potential leads
  const unmatchedMails = useMemo(() =>
    emails.filter(e => !e.customerId && !e.isRead),
    [emails]
  )

  // 4. Cold leads — no activity for > 7 days, not in re-engage queue
  const coldLeads = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString()
    return allLeads.filter(l =>
      !l.reEngageDate &&
      l.lastActivityAt &&
      l.lastActivityAt < cutoffStr
    )
  }, [allLeads])

  // ...render below
}
```

- [ ] **Step 2: Render the four-card layout**

```tsx
return (
  <div className="main-inner" style={{ padding: '28px 28px 0', overflowY: 'auto' }}>
    <div className="greeting" style={{ marginBottom: 28 }}>
      <h1 className="greeting-title">Leverage<em>.</em></h1>
      <div className="greeting-sub">
        <span>Dein Sales-Cockpit für heute</span>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 900 }}>
      
      {/* Card 1: Fällige Follow-Ups */}
      <HeuteCard
        title="Follow-Ups heute"
        count={dueFollowUps.length}
        accent={dueFollowUps.length > 0 ? '#f87171' : undefined}
        empty="Keine fälligen Follow-Ups"
      >
        {dueFollowUps.slice(0, 5).map(f => (
          <HeuteRow key={f.id} label={f.title} sub={f.dueDate} urgent={f.dueDate < today} />
        ))}
      </HeuteCard>

      {/* Card 2: Neue Eingänge */}
      <HeuteCard
        title="Neue Eingänge"
        count={unmatchedMails.length}
        accent={unmatchedMails.length > 0 ? 'var(--accent)' : undefined}
        empty="Keine unbekannten Absender"
        action={{ label: 'Mail öffnen', onClick: () => setAppView('leverage_mail') }}
      >
        {unmatchedMails.slice(0, 5).map(m => (
          <HeuteRow key={m.id} label={m.fromName || m.fromAddr} sub={m.subject || '(ohne Betreff)'} />
        ))}
      </HeuteCard>

      {/* Card 3: Re-Engage fällig */}
      <HeuteCard
        title="Re-Engage fällig"
        count={reEngageDue.length}
        accent={reEngageDue.length > 0 ? '#fbbf24' : undefined}
        empty="Kein Re-Engage fällig"
      >
        {reEngageDue.slice(0, 5).map(l => (
          <HeuteRow
            key={l.id} label={l.name} sub={l.email ?? ''}
            onClick={() => { setLeadId(l.id); setAppView('leverage_lead_detail') }}
          />
        ))}
      </HeuteCard>

      {/* Card 4: Kalt-Warnungen */}
      <HeuteCard
        title="Werden kalt"
        count={coldLeads.length}
        accent={coldLeads.length > 0 ? '#fb923c' : undefined}
        empty="Alle Leads aktiv"
      >
        {coldLeads.slice(0, 5).map(l => (
          <HeuteRow
            key={l.id} label={l.name} sub={`Keine Aktivität seit ${Math.floor((Date.now() - new Date(l.lastActivityAt!).getTime()) / 86_400_000)} Tagen`}
            onClick={() => { setLeadId(l.id); setAppView('leverage_lead_detail') }}
          />
        ))}
      </HeuteCard>

    </div>
  </div>
)
```

- [ ] **Step 3: Add `HeuteCard` and `HeuteRow` sub-components in the same file**

```tsx
function HeuteCard({ title, count, accent, empty, children, action }: {
  title: string
  count: number
  accent?: string
  empty: string
  children?: React.ReactNode
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '18px 20px',
      borderTop: accent ? `3px solid ${accent}` : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-dim)' }}>
          {title}
        </span>
        <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)', color: accent ?? 'var(--fg-muted)' }}>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '8px 0' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {children}
        </div>
      )}
      {action && count > 0 && (
        <button onClick={action.onClick} className="btn-ghost"
          style={{ marginTop: 10, fontSize: 11, padding: '4px 0', width: '100%' }}>
          {action.label} →
        </button>
      )}
    </div>
  )
}

function HeuteRow({ label, sub, urgent, onClick }: {
  label: string; sub: string; urgent?: boolean; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 8px', borderRadius: 8, cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 1,
        background: 'transparent', transition: 'background 100ms',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: urgent ? '#f87171' : 'var(--fg)' }}>
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>{sub}</span>
    </div>
  )
}
```

- [ ] **Step 4: `npx tsc --noEmit` — 0 errors**

---

## Task 5: LeverageMailRoute — Filtered Mail View

**Files:**
- Create: `src/routes/LeverageMailRoute.tsx`

- [ ] **Step 1: Create filtered mail view**

This reuses the existing `MailRoute` logic but filters to show only:
- Emails where `customerId` matches a **lead** (not a client)
- Emails where `customerId` is null (unmatched = potential leads)

```tsx
import { useMemo } from 'react'
import { useMailStore } from '@/store/mail.store'
import { useLeadsStore } from '@/store/leads.store'
import { Inbox, UserPlus } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'

export function LeverageMailRoute() {
  const emails    = useMailStore(s => s.emails)
  const leads     = useLeadsStore(s => s.leads)
  const upsert    = useLeadsStore(s => s.upsert)
  const workspace = /* useWorkspaceStore */ 

  const leadIds = useMemo(() => new Set(leads.map(l => l.id)), [leads])

  const sections = useMemo(() => {
    const leadMails      = emails.filter(e => e.customerId && leadIds.has(e.customerId))
    const unmatchedMails = emails.filter(e => !e.customerId)
    return { leadMails, unmatchedMails }
  }, [emails, leadIds])

  // Render two-section list: Lead Mails + Unbekannte Absender
  // "Lead erstellen" button on unmatched rows
}
```

- [ ] **Step 2: Add "Lead aus Mail erstellen" quick action on unmatched rows**

Each unmatched email gets a `+` button that calls:
```typescript
upsert({
  workspaceId,
  name: mail.fromName || mail.fromAddr,
  email: mail.fromAddr,
  leadSource: 'inbox',
  leadStatus: 'neu',
})
```

- [ ] **Step 3: `npx tsc --noEmit` — 0 errors**

---

## Task 6: LeverageLeadRoute — Lead Detail View

**Files:**
- Create: `src/routes/LeverageLeadRoute.tsx`

This is the centerpiece of LEVERAGE — a lead profile with tabs.

- [ ] **Step 1: Create tab structure (4 tabs)**

```tsx
type LeadTab = 'uebersicht' | 'aktivitaeten' | 'mails' | 'notizen'

export function LeverageLeadRoute() {
  const leadId    = useUiStore(s => s.selectedLeverageLeadId)
  const leads     = useLeadsStore(s => s.leads)
  const setAppView = useUiStore(s => s.setAppView)

  const lead = leads.find(l => l.id === leadId)
  const [tab, setTab] = useState<LeadTab>('uebersicht')

  if (!lead) {
    // Redirect back to leads list
    useEffect(() => setAppView('leverage_leads'), [])
    return null
  }

  // Tab bar + content
}
```

- [ ] **Step 2: Übersicht tab — lead KPIs**

Show: Name, Email, Phone, Source, Pipeline Stage (editable), Re-engage date, Created date. Simple card layout matching CockpitPane style.

- [ ] **Step 3: Aktivitäten tab — create + list activities for this lead**

Reuse existing `ActivitiesService.create()` with `accountId: lead.id`. Activities already work for any `account_id` in the DB — this is the same table.

List shows follow-ups, calls, notes as a timeline.

- [ ] **Step 4: Mails tab — emails matching this lead's email address**

```tsx
const leadMails = emails.filter(e =>
  e.fromAddr === lead.email || e.toAddr === lead.email
)
```

Display as a list (same style as existing mail list).

- [ ] **Step 5: Notizen tab**

Simple textarea that saves via `upsert_lead` with a `notes` field — OR reuse the existing notes system (`upsert_note` with `account_id = lead.id`).

Check if the `notes` table accepts any `account_id` (it should since it's generic). If yes, reuse `NoteService`.

- [ ] **Step 6: Back button → `setAppView('leverage_leads')`**

- [ ] **Step 7: `npx tsc --noEmit` — 0 errors**

---

## Task 7: Lead Card — Re-Engage Chip

**Files:**
- Modify: `src/routes/LeadsRoute.tsx`

Leads with a `reEngageDate` currently disappear from the board. Instead, show them IN the board with a visible chip so the 7d vs 30d distinction is clear.

- [ ] **Step 1: Remove the `reEngageDate == null` filter from `boardLeads`**

```typescript
// BEFORE:
const boardLeads = useMemo(
  () => allLeads.filter(l => l.reEngageDate == null),
  [allLeads],
)

// AFTER: all leads on board, filter out converted/lost
const boardLeads = useMemo(
  () => allLeads,
  [allLeads],
)
```

- [ ] **Step 2: Add re-engage chip to `LeadCard`**

In the card's bottom row, add alongside the source badge:

```tsx
{lead.reEngageDate && (
  <span style={{
    fontSize: 10, padding: '1px 7px', borderRadius: 99, fontWeight: 700,
    background: dayColor(lead.reEngageDate) === '#f87171'
      ? 'rgba(248,113,113,0.12)'
      : dayColor(lead.reEngageDate) === '#fbbf24'
      ? 'rgba(251,191,36,0.12)'
      : 'rgba(74,222,128,0.10)',
    color: dayColor(lead.reEngageDate),
  }}>
    ⟳ {relDays(lead.reEngageDate)}
  </span>
)}
```

- [ ] **Step 3: `npx tsc --noEmit` — 0 errors**

---

## Task 8: Final Cleanup

- [ ] Remove `followups` view from FOCUS nav if it was left behind
- [ ] Ensure `akquise` view is not shown in FOCUS nav (move to LEVERAGE or hide)
- [ ] Verify that navigating FOCUS→LEVERAGE→FOCUS preserves state
- [ ] Test: creating a lead in LEVERAGE → converting → appears in FOCUS Kunden
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Commit: `feat(leverage): add LEVERAGE sales mode with Heute cockpit, Lead detail, filtered mail`

---

## What stays in FOCUS (unchanged)
- Dashboard Heute
- Kunden
- Finanzen (Rechnungen, Angebote)
- Zeitmanagement
- Mail (client-filtered — `customerId` matches a client)
- Kalender
- Notizen
- KORA
- Einstellungen
- Private Raum

## What moves to / lives in LEVERAGE only
- Leads board
- Pipeline
- Follow-ups
- Mail (lead + unmatched)
- Leverage Heute cockpit
- Lead detail view
