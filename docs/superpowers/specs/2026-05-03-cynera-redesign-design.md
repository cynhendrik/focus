# Cynera — Next-Generation UI Redesign Spec
**Date:** 2026-05-03  
**Branch:** feature/hybrid-upgrade  
**Approach:** Option C — CSS token retheme + surgical component surgery on high-impact surfaces

---

## 1. Goals

Redesign Cynera's visual layer to achieve a futuristic, floating, cinematic interface inspired by Apple's design language — calmer, more fluid, more premium. The app logic, store, and routing are unchanged.

---

## 2. Design Tokens (`src/styles/globals.css`)

Replace the entire `:root` block and light-theme override with the following token set.

### 2.1 Dark Theme (primary)

```css
:root {
  /* Base surfaces */
  --bg:    #0C0C0F;
  --bg1:   #111115;
  --bg2:   #16161B;
  --bg3:   #1C1C23;
  --bg4:   #23232C;
  --bg5:   #2A2A36;

  /* Accent: Soft Purple */
  --p:     #7C3AED;
  --p2:    #9D5FFF;
  --p3:    #C4B5FD;
  --p4:    #EDE9FE;
  --p5:    rgba(124,58,237,0.08);
  --p6:    rgba(124,58,237,0.16);

  /* Borders */
  --border:  rgba(124,58,237,0.08);
  --border2: rgba(124,58,237,0.16);
  --border3: rgba(124,58,237,0.28);

  /* Text */
  --text:  #F0F0FF;
  --text2: #8B8BA7;
  --text3: #4A4A6A;
  --text4: #2E2E48;

  /* Semantic */
  --green: #22C55E;
  --red:   #EF4444;
  --amber: #F59E0B;
  --blue:  #3B82F6;

  /* Radius */
  --r-xs:  6px;
  --r-sm:  8px;
  --r-md:  12px;
  --r-lg:  16px;
  --r-xl:  20px;
  --r-2xl: 28px;

  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
  --shadow-lg: 0 8px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(124,58,237,0.10);
  --shadow-xl: 0 16px 64px rgba(0,0,0,0.80), 0 0 0 1px rgba(124,58,237,0.14), 0 0 80px rgba(124,58,237,0.06);

  /* Legacy aliases kept for untouched components */
  --r:      var(--r-md);
  --shadow: var(--shadow-lg);
  --shadow-p: 0 0 60px rgba(124,58,237,0.20);
}
```

### 2.2 Light Theme (secondary)

```css
[data-theme="light"] {
  --bg:    #F7F7FB;
  --bg1:   #FFFFFF;
  --bg2:   #FFFFFF;
  --bg3:   #F0EFF8;
  --bg4:   #E8E7F4;
  --bg5:   #DDD9F0;

  --border:  rgba(124,58,237,0.09);
  --border2: rgba(124,58,237,0.16);
  --border3: rgba(124,58,237,0.28);

  --p:     #7C3AED;
  --p2:    #6D28D9;
  --p3:    #7C3AED;
  --p4:    #6D28D9;
  --p5:    rgba(124,58,237,0.07);
  --p6:    rgba(124,58,237,0.13);

  --text:  #1A1A2E;
  --text2: #4A4A6A;
  --text3: #8B8BA7;
  --text4: #C4B5FD;

  --shadow-sm: 0 2px 8px rgba(124,58,237,0.06);
  --shadow-md: 0 4px 20px rgba(124,58,237,0.08), 0 1px 4px rgba(124,58,237,0.04);
  --shadow-lg: 0 8px 40px rgba(124,58,237,0.10), 0 0 0 1px rgba(124,58,237,0.07);
  --shadow-xl: 0 16px 56px rgba(124,58,237,0.12), 0 0 0 1px rgba(124,58,237,0.10);
  --shadow-p: 0 0 40px rgba(124,58,237,0.16);
}
```

### 2.3 Keyframe Animations (added/updated)

```css
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(124,58,237,0.50), 0 0 32px rgba(124,58,237,0.22); }
  50%       { box-shadow: 0 0 28px rgba(124,58,237,0.75), 0 0 56px rgba(124,58,237,0.38); }
}

@keyframes glow-pulse-light {
  0%, 100% { box-shadow: 0 0 12px rgba(124,58,237,0.30), 0 0 24px rgba(124,58,237,0.12); }
  50%       { box-shadow: 0 0 22px rgba(124,58,237,0.50), 0 0 44px rgba(124,58,237,0.22); }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-4px); }
}
```

---

## 3. Depth / Z-Stack System

| Layer | Z-index | Usage | backdrop-filter |
|-------|---------|-------|-----------------|
| Z1    | 0       | Base canvas | none |
| Z2    | 1       | Sidebar, main panels | blur(20px) |
| Z3    | 10      | Floating cards, tab bars | blur(12px) |
| Z4    | 100     | Modals, command palette | blur(32px) |
| Z5    | 200     | Toasts, tooltips | blur(8px) |

---

## 4. Layout Changes

### 4.1 App Shell (`App.jsx`)

- Ambient glow: change from crimson radial to purple: `rgba(124,58,237,0.06)`
- Add a second subtle ambient glow in the bottom-left corner at 3% opacity for depth
- Background stays `var(--bg)` — no change needed beyond token swap

### 4.2 Sidebar (`Sidebar.jsx`) — surgical rewrite

Visual changes:
- Remove hard `borderRight`. Replace with: `boxShadow: "1px 0 0 rgba(124,58,237,0.08), 4px 0 24px rgba(0,0,0,0.4)"`
- Background: `background: "rgba(17,17,21,0.85)"` + `backdropFilter: "blur(20px) saturate(1.4)"`
- Logo: replace crimson gradient with purple: `linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)`
- Search bar: add `backdropFilter: "blur(8px)"`, inner glow on focus `0 0 0 3px rgba(124,58,237,0.15)`
- `CustomerItem` active state: replace crimson glow with purple glow on right edge
- Active item border: `rgba(124,58,237,0.20)`
- Pending badge: accent purple when active

### 4.3 TopBar (`TopBar.jsx`) — token swap only

Color references updated via token change; no structural changes needed.

### 4.4 CustomerNav (`CustomerNav.jsx`) — surgical rewrite

- Tab bar background: `rgba(17,17,21,0.7)` with `backdropFilter: "blur(12px)"`
- Active tab pill: replace crimson with purple glow (`boxShadow: "0 0 12px rgba(124,58,237,0.4)"`)
- Bottom border: `rgba(124,58,237,0.08)` via token

### 4.5 WorkflowTabBar (`App.jsx`) — token swap

Pill background and badge colors update automatically via tokens.

---

## 5. Component Surgery

### 5.1 Welcome Screen (`App.jsx` — `Welcome` component)

- Logo icon: change to purple gradient `linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)`
- Glow animation: updated keyframes (section 2.3)
- Tagline: keep "Your clients, organized."
- Primary button: purple accent with `boxShadow: "0 0 0 1px rgba(124,58,237,0.4), 0 4px 20px rgba(124,58,237,0.3)"`

### 5.2 Sidebar CustomerItem — active glow

Replace the crimson right-edge gradient with:
```
background: "linear-gradient(to left, rgba(124,58,237,0.45) 0%, rgba(124,58,237,0.0) 100%)"
```

### 5.3 Modal (`Modal.jsx`)

- Background: `rgba(12,12,15,0.92)` + `backdropFilter: "blur(32px)"`
- Border: `rgba(124,58,237,0.14)`
- Shadow: `var(--shadow-xl)`
- Input focus ring: purple `rgba(124,58,237,0.15)`

### 5.4 CommandPalette (`CommandPalette.jsx`)

- Overlay backdrop: `blur(16px)` + dim
- Panel: `rgba(17,17,21,0.94)` + `backdropFilter: "blur(32px)"` + `var(--shadow-xl)`
- Input focus accent: purple border
- Selected item: purple left accent bar

### 5.5 Toast (`Toast.jsx`)

- Background: `rgba(17,17,21,0.90)` + `backdropFilter: "blur(8px)"`
- Border: `rgba(124,58,237,0.16)`

---

## 6. New Screen: Übersicht (Global Home)

### 6.1 Navigation

Add `"uebersicht"` as a top-level view in the store (`customerView` or a separate `globalView` state). The sidebar gets a home icon button above the customer list — clicking it clears `selectedId` and shows the Übersicht instead of the Welcome screen.

Alternatively: if no customer is selected, show Übersicht (replace the current Welcome component with a full home screen).

**Decision:** Replace `Welcome` with `Uebersicht`. The "add first customer" CTA moves inside Übersicht when the list is empty.

### 6.2 Layout

Three-column floating card grid on a centered `max-width: 900px` canvas:

```
┌─────────────────────────────────────────────────┐
│  Guten Morgen, Cynera                           │ ← greeting + date
│                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────┐ │
│  │ Offene To-Dos│  │ Letzte Aktivität│ │ KPIs  │ │
│  │  count + list│  │  timeline feed │ │ top 3 │ │
│  └──────────────┘  └──────────────┘  └───────┘ │
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │ Alle Kunden · quick-select strip            ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### 6.3 Cards

Each card:
- `background: rgba(17,17,21,0.70)` + `backdropFilter: "blur(12px)"`
- `border: 1px solid rgba(124,58,237,0.10)`
- `borderRadius: var(--r-xl)`
- `boxShadow: var(--shadow-lg)`
- Hover: lift `translateY(-2px)` + border brightens to `rgba(124,58,237,0.20)`
- `transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s`

**Card 1 — Offene To-Dos:**
- Total open count as large number
- List of up to 5 todos with customer name chip
- Click navigates to that customer's Workflow > Todos

**Card 2 — Letzte Aktivität:**
- Timeline of recent actions synthesized from `createdAt` timestamps on: customers, todos, notes, kpis, uploadedFiles
- Events: "Kunde angelegt", "To-Do erstellt", "Notiz erstellt", "KPI hinzugefügt", "Datei hochgeladen"
- Note: `todos` has no `completedAt` — "todo completed" events are not possible without a store change; omit from scope
- All events merged and sorted descending by `createdAt`; most recent 8 shown
- Each row: icon + action text + customer name + relative time

**Card 3 — KPI Highlights:**
- Top 3 KPIs by value across all customers
- Mini sparkline bars (CSS only, no chart lib)
- Customer attribution below each

**Bottom strip — Kunden:**
- Horizontal scrollable row of customer avatars with name below
- Click selects customer
- "＋ Neuer Kunde" button at end

### 6.4 File: `src/components/uebersicht/UebersichtPane.jsx`

New file. No new store state needed — reads from existing `todos`, `notes`, `kpis`, `customers`, `uploadedFiles`.

---

## 7. Motion System

All existing framer-motion transitions updated to use consistent easing:
```js
const ease = [0.22, 1, 0.36, 1]; // spring-like cubic bezier
const duration = { fast: 0.15, normal: 0.22, slow: 0.35 };
```

Hover-lift on interactive cards:
```js
whileHover={{ y: -2, transition: { duration: 0.22, ease } }}
whileTap={{ scale: 0.98 }}
```

Page transitions (existing AnimatePresence blocks):
- `initial: { opacity: 0, y: 8 }` → `animate: { opacity: 1, y: 0 }` — unchanged, already good

---

## 8. Spacing System (8pt grid)

| Token name | Value | Usage |
|-----------|-------|-------|
| space-1 | 4px | tight gaps |
| space-2 | 8px | component internal |
| space-3 | 12px | compact padding |
| space-4 | 16px | standard padding |
| space-5 | 20px | panel padding |
| space-6 | 24px | section gaps |
| space-8 | 32px | large section gaps |
| space-10 | 40px | screen margins |

Not adding CSS custom properties for these — the existing inline style values already conform. No change needed.

---

## 9. Files Touched

| File | Change type |
|------|------------|
| `src/styles/globals.css` | Full token replacement |
| `src/App.jsx` | Ambient glow color, Welcome → Übersicht swap, button colors |
| `src/components/layout/Sidebar.jsx` | Glass surface, purple accents, glow |
| `src/components/layout/CustomerNav.jsx` | Glass tab bar, purple pill |
| `src/components/layout/TopBar.jsx` | Token swap (auto via CSS vars) |
| `src/components/ui/Modal.jsx` | Glass surface, purple focus ring |
| `src/components/CommandPalette.jsx` | Glass panel, blur overlay |
| `src/components/ui/Toast.jsx` | Glass surface |
| `src/components/uebersicht/UebersichtPane.jsx` | **New file** |

Files **not touched:** TodoPane, NotesPane, KpisPane, AblagePane, DashboardPane, Avatar, EmptyState, PrioritySideboard, TitleBar, store files.

---

## 10. Out of Scope

- No CSS Module migration
- No new chart libraries
- No changes to store logic, data model, or Tauri config
- No font change (Plus Jakarta Sans stays)
- No bottom navigation (desktop app, not mobile)
- No parallax scroll (Tauri window, no scroll surface at the app level)
