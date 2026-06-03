# Focus WorkSurface Redesign

**Goal:** Replace the narrow centered card (max-width 580px) in the Focus session center column with a full-width three-zone work surface: Hero → Body → Cockpit. The card content fills the available space, making better use of the layout.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar                                                      │
├──────────────┬──────────────────────────────┬──────────────┤
│ Left         │ ZONE 1: Hero                 │ Right        │
│ (FocusCustomer│ accent bar · priority · title│ (FocusBatch  │
│  Panel)      │ customer · due · actions     │  Sidebar)    │
│              ├──────────────────────────────┤              │
│              │ ZONE 2: Body                 │              │
│              │ (card-type-specific content) │              │
│              │ scrollable                   │              │
│              ├──────────────────────────────┤              │
│              │ ZONE 3: Cockpit (existing)   │              │
└──────────────┴──────────────────────────────┴──────────────┘
```

- Zone 1 (Hero): `flexShrink: 0` — never scrolls, always visible
- Zone 2 (Body): `flex: 1, overflowY: auto` — scrollable
- Zone 3 (Cockpit): `flexShrink: 0` — existing `FocusCockpitBar`, unchanged

---

## Architecture

### New files

| File | Responsibility |
|---|---|
| `src/components/focus/FocusWorkSurface.tsx` | Shell: renders Hero + body slot + CockpitBar. Routes to the correct body component by actionType. |
| `src/components/focus/FocusHero.tsx` | Shared Hero zone: accent bar, priority tag, customer, due date, title, action buttons (← Erledigt ✓ Überspringen →). |
| `src/components/focus/FocusBodyDefault.tsx` | Body for default tasks: 2-col grid (notes+CORRA left, checklist+activities right). |
| `src/components/focus/FocusBodyReminder.tsx` | Body for `send_reminder`: full-width dunning + email/WhatsApp composer. |
| `src/components/focus/FocusBodyInvoice.tsx` | Body for `create_invoice`: full-width invoice items + create & send flow. |
| `src/components/focus/FocusBodyFollowUp.tsx` | Body for `followup`/`reply_mail`: full-width email composer with CORRA auto-draft. |

### Modified files

| File | Change |
|---|---|
| `src/components/focus/FocusSessionView.tsx` | Center column renders `<FocusWorkSurface>` instead of individual FocusCard* components. The maxWidth 580px centered container is removed. |

### Deleted files

`FocusCardDefault.tsx`, `FocusCardReminder.tsx`, `FocusCardInvoice.tsx`, `FocusCardFollowUp.tsx` — their logic is redistributed into the corresponding FocusBody* files.

---

## Component Specs

### FocusWorkSurface

**Props:** `todo: Todo, onComplete: () => Promise<void>, onSkip: () => void, onPostpone: () => Promise<void>`

Renders:
1. `<FocusHero todo={todo} onComplete={onComplete} onSkip={onSkip} onPostpone={onPostpone} />`
2. Scrollable body area (flex: 1, overflowY: auto) containing the appropriate body component:
   - `actionType === 'send_reminder'` → `<FocusBodyReminder>`
   - `actionType === 'create_invoice'` → `<FocusBodyInvoice>`
   - `actionType === 'followup' || 'reply_mail'` → `<FocusBodyFollowUp>`
   - else → `<FocusBodyDefault>`
3. `<FocusCockpitBar customerId={todo.customerId} customerName={...} />`

---

### FocusHero

**Props:** `todo: Todo, onComplete: () => Promise<void>, onSkip: () => void, onPostpone: () => Promise<void>`

Layout: horizontal flex, no margin, no border-radius, `background: var(--bg-2)`, `border-bottom: 1px solid var(--border)`.

Content (left to right):
- **Accent bar**: 3px wide, full hero height, `border-radius: 99px`, color = priority color (`oklch(72% 0.18 25)` for p1, `oklch(70% 0.18 50)` for p2, `var(--accent)` for p3/p4). For Reminder: `var(--danger)`. For Invoice: `var(--danger)`. For FollowUp: `var(--warn)`.
- **Title block** (flex: 1):
  - Eyebrow row: priority tag pill + customer name (from `useAccountsStore`) + separator + due date in amber if set
  - Title: `font-size: 18px`, `font-weight: 700`, `letter-spacing: -0.025em`, `color: var(--fg)`
- **Action buttons** (flex-shrink: 0, gap 6px, right-aligned):
  - `← Zurück` ghost button (calls `onSkip` — navigates to prev, same behavior as arrow key)
  - `Überspringen` ghost button (calls `onSkip`)  
  - `Erledigt ✓` accent button (calls `onComplete`)

Padding: `16px 24px`. Height auto (no fixed height).

The accent bar color is derived from:
- `p1` → `oklch(72% 0.18 25)` (red)
- `p2` → `oklch(70% 0.18 50)` (orange)
- `p3` / `p4` → `var(--accent)` (green)
- `send_reminder` → `var(--danger)` (overrides priority)
- `create_invoice` → `var(--danger)`
- `followup` / `reply_mail` → `var(--warn)`

---

### FocusBodyDefault

**Props:** `todo: Todo`

Body grid: `display: grid, gridTemplateColumns: '1fr 220px', gap: 0, height: 100%`.

**Left column** (padding: 18px 20px 18px 24px, border-right: 1px solid var(--border)):
- Notes section: label "Notizen", displays `todo.notes` if set, below it a Schnellnotiz textarea (same logic as in old FocusCardDefault — creates an activity on save)
- CORRA hint: `<CorraHintBox hint={corraHint} />` (useCorraContextHint for 'general')
- Context action button: if actionConfig exists, shows the action shortcut button (same as old card)

**Right column** (padding: 16px):
- Checklist: if `todo.checklist.length > 0`, renders interactive checklist items (same as old card, using `toggleChecklist`)
- Recent activities section: label "Aktivitäten", shows last 3 activities for `todo.customerId` from `useActivitiesStore`

---

### FocusBodyReminder

**Props:** `todo: Todo, onComplete: () => Promise<void>`

Full-width, no grid. Contains the complete dunning/email/WhatsApp workflow from the old `FocusCardReminder`, including:
- Invoice + account info header (dunning level badge, amount, days overdue)
- Channel selector (E-Mail / WhatsApp)
- Subject + body editor
- CORRA draft generation button
- Send button (calls onComplete on success)

Logic is extracted verbatim from `FocusCardReminder` — no behavioral changes.

---

### FocusBodyInvoice

**Props:** `todo: Todo, onComplete: () => Promise<void>`

Full-width. Contains the complete invoice create-and-send workflow from the old `FocusCardInvoice`, including:
- Invoice items list
- Billing email field
- Create & send button

Logic extracted verbatim from `FocusCardInvoice`.

---

### FocusBodyFollowUp

**Props:** `todo: Todo, onComplete: () => Promise<void>`

Full-width. Contains the complete follow-up email composer from `FocusCardFollowUp`, including:
- Channel selector
- CORRA auto-draft on mount
- Subject + body + send button

Logic extracted verbatim from `FocusCardFollowUp`.

---

### FocusSessionView changes

In the center column (the non-CORRA branch), replace:

```tsx
// OLD
<div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', ... }}>
  <div style={{ width: '100%', maxWidth: 580 }}>
    {isReminder ? <FocusCardReminder ... />
    : isInvoice  ? <FocusCardInvoice  ... />
    : isFollowup ? <FocusCardFollowUp ... />
    :              <FocusCardDefault  ... />}
  </div>
</div>
<FocusCockpitBar ... />
```

With:

```tsx
// NEW
<FocusWorkSurface
  todo={current}
  onComplete={complete}
  onSkip={skip}
  onPostpone={postpone}
/>
```

`FocusWorkSurface` internally renders the `FocusCockpitBar`, so it is removed from `FocusSessionView`. The outer flex-column wrapper stays.

---

## Styling Notes

- All padding uses CSS vars for theming consistency — no hardcoded `#141419`-style colors
- Body components inherit the background from the center column (`#13131a` dark / `var(--bg-2)` light)
- The accent bar in `FocusHero` replaces the `borderLeft: 4px solid accentColor` that was on the old card wrapper
- The Hero has `background: var(--bg)` (slightly darker than center) to visually separate it from the scrollable body, creating a "sticky header" feel

---

## Out of Scope

- Changes to FocusCockpitBar (unchanged)
- Changes to FocusCustomerPanel or FocusBatchSidebar (unchanged)
- Changes to FocusCorraChat (unchanged — still renders when showCorra is true)
- New functionality — this is a layout/visual refactor only
