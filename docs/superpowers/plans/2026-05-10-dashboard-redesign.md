# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the customer-list sidebar with a proper navigation sidebar (Profil → main nav → bottom nav), update the theme to lighter-dark + red accents, and build a rich Dashboard route with stat cards, attention list, revenue chart, and high-priority task section.

**Architecture:** New `NavSidebar` replaces `Sidebar`; `AppView` type extended with all routes; each view gets its own route file. Dashboard uses only data already in Zustand stores (customers, todos not cross-aggregated — tasks show high-priority customers as action items). Revenue chart uses static mock data (no revenue store exists).

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, Zustand 4, Recharts 3, Vite, Vitest

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/styles/globals.css` |
| Modify | `tailwind.config.ts` |
| Modify | `src/store/ui.store.ts` |
| Create | `src/components/layout/NavSidebar.tsx` |
| Delete (content replaced) | `src/components/layout/Sidebar.tsx` |
| Modify | `src/App.tsx` |
| Create | `src/routes/DashboardRoute.tsx` |
| Create | `src/routes/ClientsRoute.tsx` |
| Create | `src/routes/InvoicesRoute.tsx` |
| Create | `src/routes/TasksRoute.tsx` |
| Create | `src/routes/KpisRoute.tsx` |
| Create | `src/routes/InsightsRoute.tsx` |
| Create | `src/routes/CalendarRoute.tsx` |
| Create | `src/routes/CrmRoute.tsx` |
| Create | `src/routes/SettingsRoute.tsx` |
| Create | `src/routes/ProfileRoute.tsx` |

---

## Task 1: Update Theme — CSS Variables + Tailwind Primary Color

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Update dark theme CSS variables in globals.css**

Replace the entire `[data-theme="dark"]` block (lines 56–74) with:

```css
[data-theme="dark"] {
  --bg:    #1C1C1E;
  --bg1:   #242428;
  --bg2:   #2A2A2F;
  --bg3:   #323237;
  --bg4:   #3A3A3F;
  --bg5:   #424247;
  --border:  rgba(255,255,255,0.06);
  --border2: rgba(255,255,255,0.10);
  --border3: rgba(220,38,38,0.30);
  --text:  #F2F2F7;
  --text2: #8E8E93;
  --text3: #48484A;
  --text4: #3A3A3C;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.30);
  --shadow-md: 0 4px 24px rgba(0,0,0,0.45);
  --shadow-lg: 0 8px 48px rgba(0,0,0,0.60);
  --shadow-xl: 0 16px 64px rgba(0,0,0,0.70), 0 0 0 1px rgba(220,38,38,0.10);
}
```

- [ ] **Step 2: Update selection and glow-pulse to red**

In `globals.css`, replace:
```css
::selection { background: rgba(124,58,237,0.18); }
```
with:
```css
::selection { background: rgba(220,38,38,0.18); }
```

Replace the `glow-pulse` keyframe:
```css
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(220,38,38,0.40); }
  50%       { box-shadow: 0 0 28px rgba(220,38,38,0.65); }
}
```

- [ ] **Step 3: Update Tailwind primary color**

Replace the entire `colors` block in `tailwind.config.ts`:
```ts
colors: {
  primary: {
    DEFAULT: '#DC2626',
    light: '#EF4444',
    dark: '#B91C1C',
  },
},
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css tailwind.config.ts
git commit -m "feat(theme): helles Dunkel + rote Akzente"
```

---

## Task 2: Extend AppView Type in UI Store

**Files:**
- Modify: `src/store/ui.store.ts`

- [ ] **Step 1: Replace AppView type and update defaults**

Replace lines 1–6 of `src/store/ui.store.ts` with:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'invoices' | 'tasks' | 'kpis' | 'insights'
  | 'calendar'  | 'mail'     | 'crm'   | 'settings'
```

- [ ] **Step 2: Update default appView and setSelectedCustomer**

In the store initial state, change `appView: 'customers'` to `appView: 'dashboard'`.

Change `setSelectedCustomer`:
```ts
setSelectedCustomer: (id) =>
  set({ selectedCustomerId: id, appView: 'clients' }),
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: errors only in `App.tsx` and `Sidebar.tsx` (they reference old views — fixed in later tasks).

- [ ] **Step 4: Commit**

```bash
git add src/store/ui.store.ts
git commit -m "feat(store): AppView auf 10 Routen erweitert, Default auf dashboard"
```

---

## Task 3: Build NavSidebar

**Files:**
- Create: `src/components/layout/NavSidebar.tsx`

- [ ] **Step 1: Create the NavSidebar component**

Create `src/components/layout/NavSidebar.tsx`:

```tsx
import { useUiStore, type AppView } from '@/store/ui.store'

function NavIcon({ paths }: { paths: string[] }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0"
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

const ICON_PATHS: Record<string, string[]> = {
  dashboard: [
    'M3 3h7v7H3z',
    'M14 3h7v7h-7z',
    'M14 14h7v7h-7z',
    'M3 14h7v7H3z',
  ],
  clients: [
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M23 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  invoices: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M16 13H8',
    'M16 17H8',
    'M10 9H8',
  ],
  tasks: [
    'M9 11l3 3L22 4',
    'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  ],
  kpis: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  insights: [
    'M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z',
    'M9 21h6',
    'M9 18h6',
  ],
  calendar: [
    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  ],
  mail: [
    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z',
    'M22 6l-10 7L2 6',
  ],
  crm: [
    'M4 6h16M4 12h16M4 18h16',
  ],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ],
}

const MAIN_NAV: { view: AppView; label: string; icon: string }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { view: 'clients',   label: 'Clients',   icon: 'clients' },
  { view: 'invoices',  label: 'Invoices',  icon: 'invoices' },
  { view: 'tasks',     label: 'Tasks',     icon: 'tasks' },
  { view: 'kpis',      label: 'KPIs',      icon: 'kpis' },
  { view: 'insights',  label: 'Insights',  icon: 'insights' },
]

const BOTTOM_NAV: { view: AppView; label: string; icon: string }[] = [
  { view: 'calendar', label: 'Calendar', icon: 'calendar' },
  { view: 'mail',     label: 'Mail',     icon: 'mail' },
  { view: 'crm',      label: 'CRM',      icon: 'crm' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
]

function NavItem({
  view, label, icon, active, onClick,
}: {
  view: AppView; label: string; icon: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left
        ${active
          ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
          : 'text-[var(--text2)] hover:bg-[var(--bg1)] hover:text-[var(--text)] border-l-2 border-transparent'
        }`}
    >
      <NavIcon paths={ICON_PATHS[icon] ?? []} />
      <span>{label}</span>
    </button>
  )
}

export function NavSidebar() {
  const appView = useUiStore(s => s.appView)
  const setAppView = useUiStore(s => s.setAppView)

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-hidden"
      style={{ minHeight: 0 }}
    >
      {/* Logo */}
      <div
        data-tauri-drag-region
        className="px-4 py-4 border-b border-[var(--border)] flex items-center gap-2.5"
      >
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <span className="text-sm font-bold text-[var(--text)] tracking-tight">Cynera Focus</span>
      </div>

      {/* Profil */}
      <button
        onClick={() => setAppView('profile')}
        className={`mx-3 mt-3 mb-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors border border-transparent
          ${appView === 'profile'
            ? 'bg-primary/10 border-primary/20'
            : 'hover:bg-[var(--bg1)]'
          }`}
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-primary">P</span>
        </div>
        <div className="text-left min-w-0">
          <p className={`text-sm font-semibold truncate ${appView === 'profile' ? 'text-primary' : 'text-[var(--text)]'}`}>
            Profil
          </p>
          <p className="text-xs text-[var(--text2)] truncate">Privatbereich</p>
        </div>
      </button>

      <div className="h-px mx-3 bg-[var(--border)] my-2" />

      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3 overflow-y-auto">
        {MAIN_NAV.map(item => (
          <NavItem
            key={item.view}
            view={item.view}
            label={item.label}
            icon={item.icon}
            active={appView === item.view}
            onClick={() => setAppView(item.view)}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 px-3 pb-4 pt-2 border-t border-[var(--border)]">
        {BOTTOM_NAV.map(item => (
          <NavItem
            key={item.view}
            view={item.view}
            label={item.label}
            icon={item.icon}
            active={appView === item.view}
            onClick={() => setAppView(item.view)}
          />
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors in NavSidebar.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/NavSidebar.tsx
git commit -m "feat(nav): NavSidebar — Profil, Haupt-Nav, Bottom-Nav"
```

---

## Task 4: Update App.tsx — Wire NavSidebar and All Routes

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (empty it, NavSidebar replaces it)

- [ ] **Step 1: Replace App.tsx completely**

```tsx
import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { NavSidebar } from '@/components/layout/NavSidebar'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { CommandPalette } from '@/components/CommandPalette'

import { DashboardRoute }  from '@/routes/DashboardRoute'
import { ClientsRoute }    from '@/routes/ClientsRoute'
import { CustomerRoute }   from '@/routes/CustomerRoute'
import { InvoicesRoute }   from '@/routes/InvoicesRoute'
import { TasksRoute }      from '@/routes/TasksRoute'
import { KpisRoute }       from '@/routes/KpisRoute'
import { InsightsRoute }   from '@/routes/InsightsRoute'
import { CalendarRoute }   from '@/routes/CalendarRoute'
import { MailRoute }       from '@/routes/MailRoute'
import { CrmRoute }        from '@/routes/CrmRoute'
import { SettingsRoute }   from '@/routes/SettingsRoute'
import { ProfileRoute }    from '@/routes/ProfileRoute'

export default function App() {
  const init = useCustomersStore(s => s.init)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const appView = useUiStore(s => s.appView)
  const cmdOpen = useUiStore(s => s.cmdPaletteOpen)

  useEffect(() => { init() }, [init])

  const renderMain = () => {
    if (selectedCustomerId && appView === 'clients') return <CustomerRoute customerId={selectedCustomerId} />
    switch (appView) {
      case 'dashboard':  return <DashboardRoute />
      case 'profile':    return <ProfileRoute />
      case 'clients':    return <ClientsRoute />
      case 'invoices':   return <InvoicesRoute />
      case 'tasks':      return <TasksRoute />
      case 'kpis':       return <KpisRoute />
      case 'insights':   return <InsightsRoute />
      case 'calendar':   return <CalendarRoute />
      case 'mail':       return <MailRoute />
      case 'crm':        return <CrmRoute />
      case 'settings':   return <SettingsRoute />
      default:           return <DashboardRoute />
    }
  }

  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        <NavSidebar />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            {renderMain()}
          </ErrorBoundary>
        </main>
      </div>
      {cmdOpen && <CommandPalette />}
    </AppShell>
  )
}
```

- [ ] **Step 2: Typecheck (will fail until all route files exist — that's expected)**

```bash
npm run typecheck 2>&1 | head -30
```
Expected: errors about missing route imports. That's fine — they'll be resolved in Tasks 5–9.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): App.tsx auf NavSidebar + vollständiges Route-Switching umgestellt"
```

---

## Task 5: Build DashboardRoute

**Files:**
- Create: `src/routes/DashboardRoute.tsx`

- [ ] **Step 1: Create DashboardRoute with all subcomponents**

Create `src/routes/DashboardRoute.tsx`:

```tsx
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { Customer } from '@/types/customer.types'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'

// ── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  sub: string
  warn?: boolean
}

function StatCard({ icon, label, value, sub, warn }: StatCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[var(--text2)] text-xs">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-2xl font-bold ${warn ? 'text-amber-400' : 'text-[var(--text)]'}`}>
          {value}
        </span>
      </div>
      <p className="text-xs text-[var(--text2)]">{sub}</p>
    </div>
  )
}

// ── Attention Score ───────────────────────────────────────────────────────────

function attentionScore(c: Customer): number {
  let score = 75
  if (c.priority === 'high') score -= 30
  if (c.status === 'inaktiv') score -= 20
  if (c.status === 'lead') score -= 10
  if (c.status === 'lost') score -= 40
  return Math.max(10, Math.min(99, score))
}

function scoreBadge(score: number): { label: string; cls: string } {
  if (score < 50) return { label: 'Urgent', cls: 'bg-red-500/15 text-red-400 border border-red-500/20' }
  return { label: 'Soon', cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' }
}

interface AttentionRowProps {
  customer: Customer
  onClick: () => void
}

function AttentionRow({ customer, onClick }: AttentionRowProps) {
  const score = attentionScore(customer)
  const badge = scoreBadge(score)
  const descMap: Record<string, string> = {
    inaktiv: 'Kein Kontakt seit längerem',
    lead: 'Noch nicht konvertiert',
    lost: 'Kunde verloren — Nachfassen',
    aktiv: 'Hohe Priorität gesetzt',
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[var(--bg2)] transition-colors text-left"
    >
      {/* Score circle */}
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
        style={{
          background: `conic-gradient(#DC2626 ${score * 3.6}deg, #3A3A3F ${score * 3.6}deg)`,
        }}
      >
        <div className="w-8 h-8 rounded-full bg-[var(--bg1)] flex items-center justify-center text-xs font-bold text-[var(--text)]">
          {score}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--text)] truncate">{customer.name}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-[var(--text2)] mt-0.5 flex items-center gap-1">
          <span>⚠</span>
          <span>{descMap[customer.status] ?? 'Aufmerksamkeit erforderlich'}</span>
        </p>
      </div>

      <span className="text-[var(--text2)] text-sm">→</span>
    </button>
  )
}

// ── Revenue Chart (mock data) ─────────────────────────────────────────────────

const REVENUE_DATA = [
  { day: 'Mon', value: 1200 },
  { day: 'Tue', value: 1950 },
  { day: 'Wed', value: 2100 },
  { day: 'Thu', value: 2600 },
  { day: 'Fri', value: 1800 },
  { day: 'Sat', value: 900 },
  { day: 'Sun', value: 650 },
]
const TOTAL_REVENUE = REVENUE_DATA.reduce((s, d) => s + d.value, 0)

function RevenueChart() {
  return (
    <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-4 h-full">
      <h2 className="text-sm font-semibold text-[var(--text)]">Revenue This Week</h2>
      <div className="flex-1" style={{ minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={REVENUE_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#DC2626" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: 'var(--text2)' } as React.CSSProperties}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text2)' } as React.CSSProperties}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg2)',
                border: '1px solid var(--border2)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text)',
              }}
              formatter={(v: number) => [`€${v.toLocaleString('de-DE')}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#DC2626"
              strokeWidth={2}
              fill="url(#revGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--text2)]">Total this week</p>
        <p className="text-xl font-bold text-[var(--text)] mt-0.5">
          €{TOTAL_REVENUE.toLocaleString('de-DE')}
        </p>
      </div>
    </div>
  )
}

// ── High Priority Task Card ───────────────────────────────────────────────────

function TaskCard({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text)] leading-snug flex-1">
          {customer.name} — Aufmerksamkeit erforderlich
        </p>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex-shrink-0 border border-primary/20">
          Heute
        </span>
      </div>
      {customer.company && (
        <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--bg2)] text-[var(--text2)] w-fit">
          {customer.company}
        </span>
      )}
      <p className="text-xs text-[var(--text2)] flex items-center gap-1">
        <span>→</span>
        <span>Zum Kunden</span>
      </p>
    </button>
  )
}

// ── Dashboard Route ───────────────────────────────────────────────────────────

export function DashboardRoute() {
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)

  const aktiv = customers.filter(c => c.status === 'aktiv').length
  const highPrio = customers.filter(c => c.priority === 'high')

  const attention = [...customers]
    .sort((a, b) => attentionScore(a) - attentionScore(b))
    .slice(0, 3)

  const taskItems = highPrio.slice(0, 4)

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-8 pt-7 pb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Willkommen zurück</h1>
          <p className="text-sm text-[var(--text2)] mt-1">Hier ist, was heute deine Aufmerksamkeit braucht</p>
        </div>
        <div className="flex gap-2">
          <button className="w-9 h-9 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-center text-[var(--text2)] hover:text-[var(--text)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="w-9 h-9 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-center text-[var(--text2)] hover:text-[var(--text)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-8 pb-8 flex flex-col gap-6">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon="⏱"
            label="Time Today"
            value="—"
            sub="Zeiterfassung starten"
          />
          <StatCard
            icon="€"
            label="This Week"
            value={`€${(TOTAL_REVENUE / 1000).toFixed(1)}K`}
            sub="+18% vs last week"
          />
          <StatCard
            icon="◎"
            label="Active Clients"
            value={aktiv}
            sub={`Needs attention: ${highPrio.length}`}
          />
          <StatCard
            icon="⚠"
            label="Open Tasks"
            value={highPrio.length}
            sub={`High priority: ${highPrio.length}`}
            warn={highPrio.length > 0}
          />
        </div>

        {/* Middle section */}
        <div className="grid grid-cols-5 gap-5">
          {/* Clients needing attention */}
          <div className="col-span-3 p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text)]">Clients Needing Attention</h2>
              {attention.length > 0 && (
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
                  {attention.length}
                </span>
              )}
            </div>

            {attention.length === 0 ? (
              <p className="text-sm text-[var(--text2)] text-center py-8">Alles im grünen Bereich ✓</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {attention.map(c => (
                  <AttentionRow
                    key={c.id}
                    customer={c}
                    onClick={() => setSelected(c.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Revenue chart */}
          <div className="col-span-2">
            <RevenueChart />
          </div>
        </div>

        {/* High priority tasks */}
        {taskItems.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">High Priority Tasks</h2>
              <button
                onClick={() => useUiStore.getState().setAppView('clients')}
                className="text-xs text-[var(--text2)] hover:text-primary transition-colors flex items-center gap-1"
              >
                View All <span>→</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {taskItems.map(c => (
                <TaskCard key={c.id} customer={c} onClick={() => setSelected(c.id)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: errors only for missing route files (ClientsRoute, InvoicesRoute, etc.).

- [ ] **Step 3: Commit**

```bash
git add src/routes/DashboardRoute.tsx
git commit -m "feat(dashboard): DashboardRoute — StatCards, AttentionList, RevenueChart, TaskGrid"
```

---

## Task 6: Build ClientsRoute

**Files:**
- Create: `src/routes/ClientsRoute.tsx`

- [ ] **Step 1: Create ClientsRoute**

Create `src/routes/ClientsRoute.tsx`:

```tsx
import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerModal } from '@/components/customer/CustomerModal'

const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-400',
  aktiv: 'bg-green-500/10 text-green-400',
  inaktiv: 'bg-gray-400/10 text-gray-400',
  lost: 'bg-red-500/10 text-red-400',
}
const STATUS_LABEL: Record<string, string> = {
  lead: 'Lead', aktiv: 'Aktiv', inaktiv: 'Inaktiv', lost: 'Lost',
}

export function ClientsRoute() {
  const customers = useCustomersStore(s => s.customers)
  const isLoading = useCustomersStore(s => s.isLoading)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const focusMode = useUiStore(s => s.focusMode)

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = customers
    .filter(c => focusMode ? c.priority === 'high' : true)
    .filter(c =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company ?? '').toLowerCase().includes(search.toLowerCase())
    )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)] flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-[var(--text)]">Clients</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          + Neuer Client
        </button>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-[var(--border)]">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Clients suchen…"
          className="w-full text-sm px-4 py-2 rounded-xl bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-[var(--text2)]">Lädt…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--text2)] text-sm">
              {customers.length === 0 ? 'Noch keine Clients' : 'Keine Treffer'}
            </p>
            {customers.length === 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 px-5 py-2 rounded-xl bg-primary text-white text-sm hover:bg-primary-dark"
              >
                + Ersten Client anlegen
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-2xl">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                  {c.company && <p className="text-xs text-[var(--text2)] truncate">{c.company}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? ''}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  {c.priority === 'high' && (
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/ClientsRoute.tsx
git commit -m "feat(clients): ClientsRoute — Kundenliste mit Suche"
```

---

## Task 7: Build Placeholder Routes — Invoices, Insights, Calendar

**Files:**
- Create: `src/routes/InvoicesRoute.tsx`
- Create: `src/routes/InsightsRoute.tsx`
- Create: `src/routes/CalendarRoute.tsx`

- [ ] **Step 1: Create all three placeholder routes**

Create `src/routes/InvoicesRoute.tsx`:
```tsx
export function InvoicesRoute() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <span className="text-4xl">📄</span>
      <h1 className="text-lg font-semibold text-[var(--text)]">Invoices</h1>
      <p className="text-sm text-[var(--text2)]">Demnächst verfügbar</p>
    </div>
  )
}
```

Create `src/routes/InsightsRoute.tsx`:
```tsx
export function InsightsRoute() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <span className="text-4xl">💡</span>
      <h1 className="text-lg font-semibold text-[var(--text)]">Insights</h1>
      <p className="text-sm text-[var(--text2)]">Demnächst verfügbar</p>
    </div>
  )
}
```

Create `src/routes/CalendarRoute.tsx`:
```tsx
export function CalendarRoute() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <span className="text-4xl">📅</span>
      <h1 className="text-lg font-semibold text-[var(--text)]">Calendar</h1>
      <p className="text-sm text-[var(--text2)]">Demnächst verfügbar</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/InvoicesRoute.tsx src/routes/InsightsRoute.tsx src/routes/CalendarRoute.tsx
git commit -m "feat(routes): Placeholder-Routen für Invoices, Insights, Calendar"
```

---

## Task 8: Build Tasks, KPIs, CRM, Settings, Profile Routes

**Files:**
- Create: `src/routes/TasksRoute.tsx`
- Create: `src/routes/KpisRoute.tsx`
- Create: `src/routes/CrmRoute.tsx`
- Create: `src/routes/SettingsRoute.tsx`
- Create: `src/routes/ProfileRoute.tsx`

- [ ] **Step 1: Create TasksRoute**

Create `src/routes/TasksRoute.tsx`:
```tsx
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'

export function TasksRoute() {
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const highPrio = customers.filter(c => c.priority === 'high')

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">Tasks</h1>
        <p className="text-xs text-[var(--text2)] mt-1">High-Priority Clients — {highPrio.length} Einträge</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {highPrio.length === 0 ? (
          <p className="text-sm text-[var(--text2)] text-center py-16">Keine high-priority Clients</p>
        ) : (
          <div className="flex flex-col gap-2 max-w-2xl">
            {highPrio.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-sm font-bold text-red-400 flex-shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                  {c.company && <p className="text-xs text-[var(--text2)] truncate">{c.company}</p>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium border border-red-500/20">
                  Hohe Priorität
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create KpisRoute**

Create `src/routes/KpisRoute.tsx`:
```tsx
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'

export function KpisRoute() {
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const aktiv = customers.filter(c => c.status === 'aktiv')

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">KPIs</h1>
        <p className="text-xs text-[var(--text2)] mt-1">Wähle einen Client für detaillierte KPIs</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-2 max-w-2xl">
          {aktiv.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                {c.company && <p className="text-xs text-[var(--text2)] truncate">{c.company}</p>}
              </div>
              <span className="text-xs text-[var(--text2)]">KPIs →</span>
            </button>
          ))}
          {aktiv.length === 0 && (
            <p className="text-sm text-[var(--text2)] text-center py-16">Keine aktiven Clients</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create CrmRoute**

Create `src/routes/CrmRoute.tsx`:
```tsx
import { CrmPane } from '@/components/crm/CrmPane'
import { useCustomersStore } from '@/store/customers.store'

export function CrmRoute() {
  const customers = useCustomersStore(s => s.customers)
  const first = customers[0]

  if (!first) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--text2)]">Keine Clients vorhanden</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">CRM</h1>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <CrmPane customerId={first.id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create SettingsRoute**

Create `src/routes/SettingsRoute.tsx`:
```tsx
import { useUiStore } from '@/store/ui.store'

export function SettingsRoute() {
  const theme = useUiStore(s => s.theme)
  const toggleTheme = useUiStore(s => s.toggleTheme)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">Settings</h1>
      </div>
      <div className="flex-1 overflow-auto p-6 max-w-lg">
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Theme</p>
              <p className="text-xs text-[var(--text2)] mt-0.5">
                {theme === 'dark' ? 'Dunkel' : 'Hell'}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--bg3)] transition-colors"
            >
              {theme === 'dark' ? '☀ Hell' : '🌙 Dunkel'}
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
            <p className="text-sm font-medium text-[var(--text)]">Cynera Focus</p>
            <p className="text-xs text-[var(--text2)] mt-0.5">Version 2.0.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create ProfileRoute**

Create `src/routes/ProfileRoute.tsx`:
```tsx
export function ProfileRoute() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">Profil</h1>
        <p className="text-xs text-[var(--text2)] mt-1">Dein Privatbereich</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-3xl font-bold text-primary">P</span>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-[var(--text)]">Cynera User</p>
          <p className="text-sm text-[var(--text2)] mt-0.5">Privatbereich — demnächst verfügbar</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/TasksRoute.tsx src/routes/KpisRoute.tsx src/routes/CrmRoute.tsx src/routes/SettingsRoute.tsx src/routes/ProfileRoute.tsx
git commit -m "feat(routes): Tasks, KPIs, CRM, Settings, Profile Routen"
```

---

## Task 9: Clean Up Old Sidebar + CommandPalette Check

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Verify: `src/components/CommandPalette.tsx`

- [ ] **Step 1: Check what still imports Sidebar**

```bash
grep -r "from.*Sidebar" src/ --include="*.tsx" --include="*.ts"
```
Expected: only App.tsx (which now imports NavSidebar, not Sidebar).

- [ ] **Step 2: Delete the old Sidebar.tsx**

The file `src/components/layout/Sidebar.tsx` is no longer imported anywhere. Delete it:

```bash
rm src/components/layout/Sidebar.tsx
```

- [ ] **Step 3: Verify CommandPalette is still wired (it uses setCmdPaletteOpen)**

Check `src/components/CommandPalette.tsx` still compiles:

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: alte Sidebar.tsx entfernen"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 2: Run existing tests**

```bash
npm run test:run
```
Expected: all existing tests pass (service/store tests are not affected by UI changes).

- [ ] **Step 3: Start dev server and verify visually**

```bash
npm run dev
```

Check:
- [ ] Dark theme renders with `#1C1C1E` background (not deep purple-dark)
- [ ] All nav items have red active state
- [ ] NavSidebar shows: Profil at top → Dashboard/Clients/Invoices/Tasks/KPIs/Insights → Calendar/Mail/CRM/Settings pinned bottom
- [ ] Dashboard shows 4 stat cards, attention list, revenue chart, task grid
- [ ] Clicking a client in Dashboard navigates to ClientsRoute → then CustomerRoute detail
- [ ] Mail/CRM routes load existing content

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: visuelle Korrekturen nach Dev-Server-Test"
```
