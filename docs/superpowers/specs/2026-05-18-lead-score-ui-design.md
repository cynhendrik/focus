# Lead Score UI — Sub-Projekt D

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Visualize the Rules Engine `lead_score` and `score_factors` in the UI — replacing the frontend-computed Health Score with a real, data-driven Lead Score Card, and adding a score badge to the client list sidebar.

**Architecture:** Three-layer change: (1) pipe `leadScore`/`scoreFactors` through the Customer type and service, (2) replace the Health Score widget in `DashboardPane` with a new Lead Score Card (ring + breakdown bars), (3) add a compact score badge to each client row in `ClientsRoute`.

**Tech Stack:** React + TypeScript, Tailwind, CSS vars, Zustand (customers.store), existing `Customer` type

---

## Design Philosophy

Minimal but lively. Emotional but clean. The score number is the hero — big, colored, immediately readable. The breakdown is the supporting cast — quiet, scannable, no noise.

---

## 1. Data Layer

### 1.1 `src/types/customer.types.ts`

Add to `Customer` interface (read-only, not in `UpsertCustomerPayload`):

```ts
leadScore: number           // 0–100, computed by Rules Engine
scoreFactors: Record<string, number>  // e.g. { "strong_interest": 20, "qualified_meeting": 25 }
```

`leadScore` defaults to `0` and `scoreFactors` defaults to `{}` when no rules have fired yet.

### 1.2 `src/services/customer.service.ts`

In `accountToCustomer()`, add:

```ts
leadScore:    a.leadScore,
scoreFactors: a.scoreFactors,
```

These fields are already present on the `Account` type and the Rust backend. This change is the only bridge needed.

---

## 2. Lead Score Card (`DashboardPane`)

### 2.1 Placement

Replaces the existing Health Score card (first card in Row 1, `grid grid-cols-3`). The `computeHealthScore` function and all related logic is removed.

### 2.2 Score Ring

SVG donut ring, identical structure to the old Health Score ring:

- **Stroke color** by score range:
  - 0–39: `#ef4444` (Cold)
  - 40–69: `#f59e0b` (Warm)
  - 70–100: `#D0FC69` (Hot — primary accent)
- **Center:** large bold score number in the same color
- **Below number:** label "Cold" / "Warm" / "Hot" in `text-[10px]` uppercase, same color

### 2.3 Right-side Meta

Next to the ring:
- `text-[10px] text-[var(--text2)] uppercase tracking-wide` → "Lead Score"
- `text-xs font-semibold text-[var(--text)]` → score label again ("Hot" etc.)
- `text-[10px] text-[var(--text2)] opacity-60` → "Rules Engine"

### 2.4 Score Breakdown (horizontal bars)

Rendered directly below the ring section inside the same card, separated by a thin `border-t border-[var(--border)]`.

**Empty state:** if `scoreFactors` is `{}` or `leadScore === 0`:
```
"Noch keine Aktivität"  (text-xs text-[var(--text2)])
```

**Each factor row:**
```
[Label]          [━━━━━░░░]   [+25]
```

- **Label:** rule key prettified — `snake_case` → `Title Case`. E.g. `qualified_meeting` → `Qualified Meeting`
- **Bar:** `bg-primary/30` track, `bg-primary` (or range color) fill, width = `(points / leadScore) * 100%`
- **Points:** `+{n}` in `text-xs font-medium`, same range color
- Rows sorted descending by points value
- Max 6 rows shown (clip the rest silently — no "show more")

### 2.5 Card height

The Lead Score card will be taller than the other two KPI cards (Letzte Interaktion, Nächste Aktion). This is intentional — it anchors Row 1 visually.

---

## 3. Client List Score Badge (`ClientsRoute`)

### 3.1 Placement

In each client list button (`filtered.map`), the badge sits in the second line replacing (or sitting alongside) the `relativeTime` text:

```
[Avatar]  [Name                    ]
          [2 days ago         [60] ]
                              ^^^^
                              badge
```

### 3.2 Badge design

```tsx
<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
  style={{ background: scoreColor + '22', color: scoreColor }}>
  {score}
</span>
```

Color mapping (same 3-step logic):
- 0–39: `#ef4444`
- 40–69: `#f59e0b`
- 70–100: `#D0FC69`

**Hidden when `leadScore === 0`** — no badge for cold/untouched leads to avoid noise.

---

## 4. Helper: `scoreColor(score: number)`

Shared pure function used by both DashboardPane and ClientsRoute:

```ts
function scoreColor(score: number): string {
  if (score >= 70) return '#D0FC69'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}
```

Defined locally in each file (no shared utility file — YAGNI).

---

## 5. Label Prettifier

```ts
function prettyFactor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
```

Defined locally in `DashboardPane`.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `src/types/customer.types.ts` | Add `leadScore`, `scoreFactors` to `Customer` |
| `src/services/customer.service.ts` | Map fields in `accountToCustomer()` |
| `src/components/customer/tabs/DashboardPane.tsx` | Replace Health Score card with Lead Score Card |
| `src/routes/ClientsRoute.tsx` | Add score badge to client list rows |

No new files. No new stores. No new Rust changes needed.

---

## 7. Out of Scope

- Editing or resetting the lead score manually
- Animating the ring on value change (future enhancement)
- Score history / trend chart
- Score shown in ClientOverview dashboard (future)
- CRM route integration
