# Sales-Modul Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sales toggle to the module system so the entire Sales section (Leads, Pipeline, Smart Lists, Follow-Ups) can be hidden from the navigation.

**Architecture:** Three-file change — extend the existing `CompanyModules` type, register the label in the existing Settings toggle grid, then guard the Sales nav section behind the flag with a redirect effect.

**Tech Stack:** TypeScript, React, Zustand (`useCompanyStore`)

---

## Context for the implementer

Cynera Focus is a Tauri desktop app. Navigation is in `NavSidebar.tsx`; the current view is controlled by `useUiStore`. Company settings (including modules) are loaded into `useCompanyStore` at startup and persisted via a Tauri command. `CompanyModules` is stored as JSON in the `modules` column of `company_settings` — adding a new optional field requires zero DB/Rust changes.

The app has no frontend test suite. Verification = `npx tsc --noEmit` (TypeScript clean) + visual check.

---

### Task 1: Type + Settings label

**Files:**
- Modify: `src/types/company.types.ts`
- Modify: `src/routes/SettingsRoute.tsx`

- [ ] **Step 1: Add `sales` to `CompanyModules`**

Open `src/types/company.types.ts`. The current interface is:

```ts
export interface CompanyModules {
  crm?: boolean
  mail?: boolean
  instagram?: boolean
  focusAi?: boolean
  zeiterfassung?: boolean
}
```

Replace it with:

```ts
export interface CompanyModules {
  sales?: boolean
  crm?: boolean
  mail?: boolean
  instagram?: boolean
  focusAi?: boolean
  zeiterfassung?: boolean
}
```

- [ ] **Step 2: Register the label in Settings**

Open `src/routes/SettingsRoute.tsx`. The current `MODULE_LABELS` constant is:

```ts
const MODULE_LABELS: Record<keyof CompanyModules, string> = {
  crm: 'CRM', mail: 'Mail-Client', instagram: 'Instagram',
  focusAi: 'FOCUS AI', zeiterfassung: 'Zeiterfassung',
}
```

Replace it with (Sales first so it appears at the top of the toggle grid):

```ts
const MODULE_LABELS: Record<keyof CompanyModules, string> = {
  sales: 'Sales',
  crm: 'CRM', mail: 'Mail-Client', instagram: 'Instagram',
  focusAi: 'FOCUS AI', zeiterfassung: 'Zeiterfassung',
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/types/company.types.ts src/routes/SettingsRoute.tsx
git commit -m "feat(modules): add sales toggle to CompanyModules + Settings"
```

---

### Task 2: NavSidebar — hide Sales + redirect

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`

- [ ] **Step 1: Add `useEffect` to imports + read `modules` from the store**

Open `src/components/layout/NavSidebar.tsx`. The first line currently reads:

```ts
import { useState } from 'react'
```

Change it to:

```ts
import { useState, useEffect } from 'react'
```

Then inside the `NavSidebar` function, after the existing store selectors, add:

```ts
const modules = useCompanyStore(s => s.modules)
```

The line should sit alongside the existing `const isAdmin = useCompanyStore(s => s.isAdmin)` line.

- [ ] **Step 2: Add redirect effect**

Directly after the `const [expanded, setExpanded]` state declaration, add:

```ts
const SALES_VIEWS = new Set(['leads', 'pipeline', 'smartlists', 'followups'] as const)

useEffect(() => {
  if (modules.sales === false && SALES_VIEWS.has(appView as 'leads' | 'pipeline' | 'smartlists' | 'followups')) {
    setAppView('dashboard')
  }
}, [modules.sales, appView, setAppView])
```

`useEffect` is already imported at the top of the file.

- [ ] **Step 3: Guard the Sales section**

Find the current Sales section in the JSX. It currently looks like:

```tsx
<SidebarSection label="Sales" expanded={expanded.sales} onToggle={() => toggle('sales')} />
{expanded.sales && (
  <>
    <SidebarNavItem icon={Target}     label="Leads"       active={appView === 'leads'}      onClick={() => setAppView('leads')}      kbd="N" badge={newLeadsCount || undefined} />
    <SidebarNavItem icon={TrendingUp} label="Pipeline"    active={appView === 'pipeline'}   onClick={() => setAppView('pipeline')}   kbd="P" badge={openDealCount || undefined} />
    <SidebarNavItem icon={ListFilter} label="Smart Lists" active={appView === 'smartlists'} onClick={() => setAppView('smartlists')} kbd="L" />
    <SidebarNavItem icon={Bell}       label="Follow-Ups"  active={appView === 'followups'}  onClick={() => setAppView('followups')}  kbd="U" badge={followupCount || undefined} />
  </>
)}
```

Wrap the entire block in a `modules.sales !== false` guard:

```tsx
{modules.sales !== false && (
  <>
    <SidebarSection label="Sales" expanded={expanded.sales} onToggle={() => toggle('sales')} />
    {expanded.sales && (
      <>
        <SidebarNavItem icon={Target}     label="Leads"       active={appView === 'leads'}      onClick={() => setAppView('leads')}      kbd="N" badge={newLeadsCount || undefined} />
        <SidebarNavItem icon={TrendingUp} label="Pipeline"    active={appView === 'pipeline'}   onClick={() => setAppView('pipeline')}   kbd="P" badge={openDealCount || undefined} />
        <SidebarNavItem icon={ListFilter} label="Smart Lists" active={appView === 'smartlists'} onClick={() => setAppView('smartlists')} kbd="L" />
        <SidebarNavItem icon={Bell}       label="Follow-Ups"  active={appView === 'followups'}  onClick={() => setAppView('followups')}  kbd="U" badge={followupCount || undefined} />
      </>
    )}
  </>
)}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/NavSidebar.tsx
git commit -m "feat(nav): hide Sales section when modules.sales is false"
```
