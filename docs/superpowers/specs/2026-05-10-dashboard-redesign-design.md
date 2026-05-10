# Cynera Focus — Dashboard Redesign (v2)

**Date:** 2026-05-10
**Branch:** feature/v2-redesign
**Status:** Approved

---

## Goal

Redesign the app shell to match the Dashboard#1 screenshot: lighter dark theme, red accents, proper left-nav sidebar with Profil at top, main nav in middle, and Calendar/Mail/CRM/Settings pinned to the bottom.

---

## Theme

| Token | Old Value | New Value |
|---|---|---|
| `--bg` | `#13131C` | `#1C1C1E` |
| `--bg1` | `#1A1A26` | `#242428` |
| `--bg2` | `#20202E` | `#2A2A2F` |
| `--bg3` | `#28283A` | `#323237` |
| `--bg4` | `#303044` | `#3A3A3F` |
| `--bg5` | `#38384E` | `#424247` |
| `--p` (primary) | `#7C3AED` | `#DC2626` |
| `--p2` | `#6D28D9` | `#B91C1C` |
| `--p3` | `#C4B5FD` | `#FCA5A5` |
| `--p4` | `#EDE9FE` | `#FEE2E2` |
| `--p5` | `rgba(124,58,237,0.08)` | `rgba(220,38,38,0.08)` |
| `--p6` | `rgba(124,58,237,0.14)` | `rgba(220,38,38,0.14)` |
| `--border` | `rgba(124,58,237,0.12)` | `rgba(255,255,255,0.06)` |
| `--border2` | `rgba(124,58,237,0.22)` | `rgba(255,255,255,0.10)` |
| `--border3` | `rgba(124,58,237,0.34)` | `rgba(220,38,38,0.30)` |

Light theme: unchanged (existing light palette stays).

All Tailwind `primary` references stay as-is — they resolve through CSS vars.

---

## Sidebar

The `Sidebar.tsx` is fully replaced with a navigation sidebar (`NavSidebar.tsx`). The old customer-list sidebar is removed from the app shell; customer browsing happens inside the Clients view.

### Structure (top → bottom)

```
[Drag Region]
  ✦ Cynera Focus              ← Logo row

[Profil Block]
  [Avatar]  Profil            ← Click → appView = 'profile'
            Cynera User

[Main Nav — vertical icon + label list]
  Dashboard     (◉ grid icon)
  Clients       (👤 person icon)
  Invoices      (📄 document icon)
  Tasks         (✓  check icon)
  KPIs          (📊 bar-chart icon)
  Insights      (💡 lightbulb icon)

[Spacer flex-1]

[Bottom Nav — pinned]
  Calendar      (📅)
  Mail          (✉)
  CRM           (🗂)
  Settings      (⚙)
```

Active item: red pill background (`bg-primary/10 text-primary`), left-border accent 2px red.
Inactive item: `text-[var(--text2)] hover:bg-[var(--bg1)]`.

Sidebar width: `w-56` (224px), matching screenshot proportions.

---

## AppView Store

`ui.store.ts` — extend `AppView` type:

```ts
type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'invoices' | 'tasks' | 'kpis' | 'insights'
  | 'calendar'  | 'mail'     | 'crm'   | 'settings'
```

Default view: `'dashboard'`.

`setSelectedCustomer` remains but navigates to `'clients'` instead of `'customers'`.
`'company'` view removed — absorbed into `'profile'` or `'settings'`.

---

## Dashboard Route (OverviewRoute.tsx → DashboardRoute.tsx)

Rename file; update imports in `App.tsx`.

### Layout

```
Header: "Welcome back, Cynera"   [edit icon]  [clock icon]
        "Here's what needs your attention today"

[4 Stat Cards — grid 4 cols]
  Time Today     |  This Week (€)  |  Active Clients  |  Open Tasks
  6.5h           |  €9.2K          |  24              |  12
  This week: 28h |  +18% vs last w |  Needs attn: 3   |  High prio: 5

[Two-column section]
Left (60%):  "Clients Needing Attention"  [badge count]
  → List of customers with health score circle (red gradient),
    name, Urgent/Soon badge, warning + description, arrow →
Right (40%): "Revenue This Week"
  → Line chart (red line, subtle fill), Mon–Sun x-axis
  → "Total this week  €X,XXX" below chart

[High Priority Tasks — 2-col grid]
  Task card: title, client tag, due-date badge (Today/Tomorrow/Xd), arrow →
```

Data sources:
- Stat cards: `useCustomersStore` (active count), `useTimeStore` (time today/week), `useTodosStore` (open/high-prio tasks)
- Clients needing attention: customers sorted by `healthScore` ascending, top 3
- Revenue chart: mock data (no revenue store exists yet) — 7 data points
- High priority tasks: `useTodosStore` filtered by priority=high, first 4

### Components

- `StatCard` — reusable, props: `icon, label, value, sub`
- `AttentionClientRow` — score circle + badge + description
- `RevenueChart` — SVG polyline, no external chart lib
- `TaskCard` — title + client + due badge

---

## Other Views (Placeholder)

| AppView | File | Content |
|---|---|---|
| `clients` | `ClientsRoute.tsx` | Existing customer list (migrated from old Sidebar) |
| `invoices` | `InvoicesRoute.tsx` | "Demnächst verfügbar" placeholder |
| `tasks` | `TasksRoute.tsx` | Existing todos from WorkflowPane |
| `kpis` | `KpisRoute.tsx` | Existing DashboardPane / KPI content |
| `insights` | `InsightsRoute.tsx` | "Demnächst verfügbar" placeholder |
| `calendar` | `CalendarRoute.tsx` | "Demnächst verfügbar" placeholder |
| `mail` | `MailRoute.tsx` | Existing MailRoute (unchanged) |
| `crm` | `CrmRoute.tsx` | Existing CrmPane |
| `settings` | `SettingsRoute.tsx` | Theme toggle + app info |
| `profile` | `ProfileRoute.tsx` | User profile / Privatbereich |

---

## App.tsx

```
<AppShell>
  <NavSidebar />           ← replaces <Sidebar />
  <main>
    {renderMain()}         ← switch on appView
  </main>
</AppShell>
```

`renderMain()` switches on all AppView values.

---

## Files Changed

| File | Action |
|---|---|
| `src/styles/globals.css` | Update dark theme tokens |
| `src/store/ui.store.ts` | Extend AppView type, change default |
| `src/components/layout/Sidebar.tsx` | Replace content → NavSidebar |
| `src/routes/OverviewRoute.tsx` | Major rewrite → DashboardRoute |
| `src/App.tsx` | Update imports + renderMain |
| `src/routes/ClientsRoute.tsx` | New — customer list |
| `src/routes/InvoicesRoute.tsx` | New — placeholder |
| `src/routes/TasksRoute.tsx` | New — todos |
| `src/routes/KpisRoute.tsx` | New — existing KPI content |
| `src/routes/InsightsRoute.tsx` | New — placeholder |
| `src/routes/CalendarRoute.tsx` | New — placeholder |
| `src/routes/CrmRoute.tsx` | New — existing CRM |
| `src/routes/SettingsRoute.tsx` | New — theme toggle |
| `src/routes/ProfileRoute.tsx` | New — Privatbereich |
