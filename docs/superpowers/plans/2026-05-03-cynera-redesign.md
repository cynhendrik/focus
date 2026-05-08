# Cynera Next-Gen UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark-crimson visual theme with a soft-purple glassmorphism design system and add a global Übersicht home screen.

**Architecture:** CSS token replacement provides the purple foundation; targeted component surgery adds glassmorphism (`backdrop-filter` + semi-transparent backgrounds) to the 6 highest-impact surfaces; `UebersichtPane` replaces the `Welcome` screen with a full home dashboard. No store logic changes, no CSS module migration.

**Tech Stack:** React 18, framer-motion v11, Zustand v4, Vitest v2 + @testing-library/react, Plus Jakarta Sans

---

### Task 1: Replace Design Tokens in globals.css

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Replace the `:root` token block**

In `src/styles/globals.css`, replace the entire `:root { ... }` block (lines 5–41) with:

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

  /* Legacy aliases for untouched components */
  --r:      var(--r-md);
  --shadow: var(--shadow-lg);
  --shadow-p: 0 0 60px rgba(124,58,237,0.20);
}
```

- [ ] **Step 2: Replace the `[data-theme="light"]` block**

Replace the entire `[data-theme="light"] { ... }` block (lines 43–70) with:

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
  --shadow: var(--shadow-lg);
  --shadow-p: 0 0 40px rgba(124,58,237,0.16);
}
```

- [ ] **Step 3: Update light-theme scrollbar, selection, and glow-pulse-light keyframe**

Replace (lines 72–80):

```css
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(120,0,26,0.14); }
[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(120,0,26,0.26); }
[data-theme="light"] ::selection { background: rgba(120,0,26,0.16); }

@keyframes glow-pulse-light {
  0%, 100% { box-shadow: 0 0 12px rgba(120,0,26,0.28), 0 0 24px rgba(120,0,26,0.12); }
  50%       { box-shadow: 0 0 22px rgba(120,0,26,0.50), 0 0 44px rgba(120,0,26,0.22); }
}
[data-theme="light"] .welcome-icon { animation: glow-pulse-light 3s ease-in-out infinite !important; }
```

With:

```css
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.14); }
[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.26); }
[data-theme="light"] ::selection { background: rgba(124,58,237,0.16); }

@keyframes glow-pulse-light {
  0%, 100% { box-shadow: 0 0 12px rgba(124,58,237,0.30), 0 0 24px rgba(124,58,237,0.12); }
  50%       { box-shadow: 0 0 22px rgba(124,58,237,0.50), 0 0 44px rgba(124,58,237,0.22); }
}
[data-theme="light"] .welcome-icon { animation: glow-pulse-light 3s ease-in-out infinite !important; }
```

- [ ] **Step 4: Update `::selection` and `@keyframes glow-pulse`**

Replace (lines 111 and 116–119):

```css
::selection { background: rgba(200,30,50,0.28); }
```
→
```css
::selection { background: rgba(124,58,237,0.28); }
```

Replace:

```css
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(200,30,50,0.45), 0 0 24px rgba(200,30,50,0.20); }
  50%       { box-shadow: 0 0 22px rgba(200,30,50,0.70), 0 0 44px rgba(200,30,50,0.35); }
}
```

With:

```css
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(124,58,237,0.50), 0 0 32px rgba(124,58,237,0.22); }
  50%       { box-shadow: 0 0 28px rgba(124,58,237,0.75), 0 0 56px rgba(124,58,237,0.38); }
}
```

- [ ] **Step 5: Run existing tests**

```
npx vitest run
```

Expected: 5 existing store tests pass (CSS changes don't affect store logic).

- [ ] **Step 6: Commit**

```
git add src/styles/globals.css
git commit -m "feat: replace design tokens with soft purple system"
```

---

### Task 2: Sidebar — Glass Surface & Purple Accents

**Files:**
- Modify: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Add glassmorphism to the `<aside>` element**

In `Sidebar.jsx`, find the `<aside style={{...}}>` (around line 89). Replace its style object:

```jsx
/* old */
<aside style={{
  width: 264, flexShrink: 0, height: "100%",
  display: "flex", flexDirection: "column",
  background: "var(--bg1)",
  borderRight: "1px solid var(--border)",
}}>
```

```jsx
/* new */
<aside style={{
  width: 264, flexShrink: 0, height: "100%",
  display: "flex", flexDirection: "column",
  background: "rgba(17,17,21,0.85)",
  backdropFilter: "blur(20px) saturate(1.4)",
  WebkitBackdropFilter: "blur(20px) saturate(1.4)",
  boxShadow: "1px 0 0 rgba(124,58,237,0.08), 4px 0 24px rgba(0,0,0,0.4)",
}}>
```

- [ ] **Step 2: Update add-button hover/leave colors**

Find the add-button's `onMouseEnter`/`onMouseLeave` (around line 115). Replace:

```jsx
onMouseEnter={(e) => {
  e.currentTarget.style.background = "var(--p6)";
  e.currentTarget.style.borderColor = "rgba(200,30,50,0.4)";
  e.currentTarget.style.color = "var(--p3)";
  e.currentTarget.style.boxShadow = "0 0 12px rgba(200,30,50,0.25)";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.background = "var(--bg3)";
  e.currentTarget.style.borderColor = "var(--border2)";
  e.currentTarget.style.color = "var(--text3)";
  e.currentTarget.style.boxShadow = "none";
}}
```

With:

```jsx
onMouseEnter={(e) => {
  e.currentTarget.style.background = "var(--p6)";
  e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)";
  e.currentTarget.style.color = "var(--p3)";
  e.currentTarget.style.boxShadow = "0 0 12px rgba(124,58,237,0.25)";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.background = "var(--bg3)";
  e.currentTarget.style.borderColor = "var(--border2)";
  e.currentTarget.style.color = "var(--text3)";
  e.currentTarget.style.boxShadow = "none";
}}
```

- [ ] **Step 3: Update FieldRow input focus ring (inside Sidebar)**

In `FieldRow` (around line 28), replace:

```jsx
onFocus={(e) => { e.target.style.borderColor = "rgba(200,30,50,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(200,30,50,0.1)"; }}
onBlur={(e) => { e.target.style.borderColor = "var(--border2)"; e.target.style.boxShadow = "none"; }}
```

With:

```jsx
onFocus={(e) => { e.target.style.borderColor = "rgba(124,58,237,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; }}
onBlur={(e) => { e.target.style.borderColor = "var(--border2)"; e.target.style.boxShadow = "none"; }}
```

- [ ] **Step 4: Update CustomerItem — active border, both glow gradients, badge**

In the `CustomerItem` function (around line 298), make four targeted replacements:

**Active border** (around line 314):
```jsx
border: `1px solid ${active ? "rgba(200,30,50,0.18)" : "transparent"}`,
```
→
```jsx
border: `1px solid ${active ? "rgba(124,58,237,0.18)" : "transparent"}`,
```

**Active right-edge glow** (around line 326):
```jsx
background: "linear-gradient(to left, rgba(200,30,50,0.5) 0%, rgba(200,30,50,0.0) 100%)",
```
→
```jsx
background: "linear-gradient(to left, rgba(124,58,237,0.45) 0%, rgba(124,58,237,0.0) 100%)",
```

**Hover right-edge glow** (around line 340):
```jsx
background: "linear-gradient(to left, rgba(200,30,50,0.12) 0%, transparent 100%)",
```
→
```jsx
background: "linear-gradient(to left, rgba(124,58,237,0.12) 0%, transparent 100%)",
```

**Active badge** (around line 377):
```jsx
background: active ? "rgba(200,30,50,0.3)" : "var(--bg4)",
```
→
```jsx
background: active ? "rgba(124,58,237,0.3)" : "var(--bg4)",
```

- [ ] **Step 5: Update "Anlegen" button glow in the Add-Customer modal**

In the modal button inside `<Modal open={addOpen}>` (around line 268), replace:

```jsx
boxShadow: "0 0 16px rgba(200,30,50,0.3)",
```
→
```jsx
boxShadow: "0 0 16px rgba(124,58,237,0.3)",
```

And its hover/leave handlers:

```jsx
onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p2)"; e.currentTarget.style.boxShadow = "0 0 28px rgba(200,30,50,0.55)"; }}
onMouseLeave={(e) => { e.currentTarget.style.background = "var(--p)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(200,30,50,0.3)"; }}
```
→
```jsx
onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p2)"; e.currentTarget.style.boxShadow = "0 0 28px rgba(124,58,237,0.55)"; }}
onMouseLeave={(e) => { e.currentTarget.style.background = "var(--p)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(124,58,237,0.3)"; }}
```

- [ ] **Step 6: Run tests**

```
npx vitest run
```

Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```
git add src/components/layout/Sidebar.jsx
git commit -m "feat: sidebar glass surface and purple accents"
```

---

### Task 3: CustomerNav — Glass Tab Bar

**Files:**
- Modify: `src/components/layout/CustomerNav.jsx`

- [ ] **Step 1: Add glassmorphism background to `<nav>`**

In `CustomerNav.jsx`, find the `<nav style={{...}}>` (around line 45). Replace its style:

```jsx
/* old */
<nav
  style={{
    height: 46,
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg1)",
    flexShrink: 0,
    gap: 2,
  }}
>
```

```jsx
/* new */
<nav
  style={{
    height: 46,
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    borderBottom: "1px solid var(--border)",
    background: "rgba(17,17,21,0.70)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    flexShrink: 0,
    gap: 2,
  }}
>
```

- [ ] **Step 2: Update active pill gradient and border to purple**

In the `NavItem` function (around line 107), find the `motion.div` with `layoutId="customer-nav-pill"`. Replace its style:

```jsx
/* old */
style={{
  position: "absolute",
  inset: 0,
  borderRadius: "var(--r-md)",
  background:
    "linear-gradient(90deg, rgba(200,30,50,0.18) 0%, rgba(200,30,50,0.05) 100%)",
  borderLeft: "2px solid rgba(200,30,50,0.7)",
}}
```

```jsx
/* new */
style={{
  position: "absolute",
  inset: 0,
  borderRadius: "var(--r-md)",
  background: "linear-gradient(90deg, rgba(124,58,237,0.18) 0%, rgba(124,58,237,0.05) 100%)",
  borderLeft: "2px solid rgba(124,58,237,0.7)",
  boxShadow: "inset 0 0 12px rgba(124,58,237,0.08)",
}}
```

- [ ] **Step 3: Run tests**

```
npx vitest run
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```
git add src/components/layout/CustomerNav.jsx
git commit -m "feat: customer nav glass bar and purple active pill"
```

---

### Task 4: TopBar — Fix Hardcoded Focus Color

**Files:**
- Modify: `src/components/layout/TopBar.jsx`

- [ ] **Step 1: Replace crimson focus color in FieldRow**

In `TopBar.jsx`, find the `FieldRow` component's input `onFocus` handler (line 18). Replace:

```jsx
onFocus={e => e.target.style.borderColor = "rgba(200,30,50,0.45)"}
onBlur={e => e.target.style.borderColor = "var(--border2)"}
```

With:

```jsx
onFocus={(e) => { e.target.style.borderColor = "rgba(124,58,237,0.45)"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.10)"; }}
onBlur={(e) => { e.target.style.borderColor = "var(--border2)"; e.target.style.boxShadow = "none"; }}
```

- [ ] **Step 2: Run tests**

```
npx vitest run
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```
git add src/components/layout/TopBar.jsx
git commit -m "fix: topbar input focus ring updated to purple"
```

---

### Task 5: Modal — Glass Surface

**Files:**
- Modify: `src/components/ui/Modal.jsx`

- [ ] **Step 1: Update overlay backdrop**

In `Modal.jsx`, find the overlay `motion.div` (line 14). Its current style:

```jsx
style={{
  position: "fixed", inset: 0, zIndex: 500,
  background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
}}
```

Replace with:

```jsx
style={{
  position: "fixed", inset: 0, zIndex: 500,
  background: "rgba(0,0,0,0.70)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
}}
```

- [ ] **Step 2: Update inner panel to glass**

In `Modal.jsx`, find the inner panel `motion.div` (line 26). Its current style:

```jsx
style={{
  width: "100%", maxWidth,
  background: "var(--bg2)", border: "1px solid var(--border2)",
  borderRadius: "var(--r-xl)", padding: 24,
  boxShadow: "var(--shadow), var(--shadow-p)",
}}
```

Replace with:

```jsx
style={{
  width: "100%", maxWidth,
  background: "rgba(12,12,15,0.92)",
  backdropFilter: "blur(32px)",
  WebkitBackdropFilter: "blur(32px)",
  border: "1px solid rgba(124,58,237,0.14)",
  borderRadius: "var(--r-xl)", padding: 24,
  boxShadow: "var(--shadow-xl)",
}}
```

- [ ] **Step 3: Run tests**

```
npx vitest run
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```
git add src/components/ui/Modal.jsx
git commit -m "feat: modal glass surface with purple border"
```

---

### Task 6: CommandPalette — Glass Panel

**Files:**
- Modify: `src/components/CommandPalette.jsx`

- [ ] **Step 1: Add glass effect to the panel**

In `CommandPalette.jsx`, find the inner panel `motion.div` (around line 145). Its current style is on one line:

```jsx
style={{ width: 560, background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow), var(--shadow-p)", overflow: "hidden" }}
```

Replace with:

```jsx
style={{
  width: 560,
  background: "rgba(17,17,21,0.94)",
  backdropFilter: "blur(32px)",
  WebkitBackdropFilter: "blur(32px)",
  border: "1px solid var(--border2)",
  borderRadius: "var(--r-xl)",
  boxShadow: "var(--shadow-xl)",
  overflow: "hidden",
}}
```

- [ ] **Step 2: Replace hardcoded crimson action icon border**

In the `renderSection` function (around line 114), find this border line inside the icon div:

```jsx
border: `1px solid ${item.type === "action" && item.id !== "export" ? "rgba(200,30,50,0.2)" : "var(--border)"}`,
```

Replace with:

```jsx
border: `1px solid ${item.type === "action" && item.id !== "export" ? "rgba(124,58,237,0.2)" : "var(--border)"}`,
```

- [ ] **Step 3: Run tests**

```
npx vitest run
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```
git add src/components/CommandPalette.jsx
git commit -m "feat: command palette glass panel and purple action icons"
```

---

### Task 7: Toast — Glass Surface

**Files:**
- Modify: `src/components/ui/Toast.jsx`

- [ ] **Step 1: Add glassmorphism to toast card**

In `Toast.jsx`, find the toast `motion.div` (line 26). Its current style:

```jsx
style={{
  background: "var(--bg3)", border: `1px solid ${t.type === "error" ? "rgba(239,68,68,0.3)" : t.type === "success" ? "rgba(34,197,94,0.25)" : "var(--border2)"}`,
  borderRadius: "var(--r-lg)", padding: "10px 16px",
  fontSize: 12, color: "var(--text2)",
  boxShadow: "var(--shadow)",
  display: "flex", alignItems: "center", gap: 8,
}}
```

Replace with:

```jsx
style={{
  background: "rgba(17,17,21,0.90)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: `1px solid ${t.type === "error" ? "rgba(239,68,68,0.3)" : t.type === "success" ? "rgba(34,197,94,0.25)" : "var(--border2)"}`,
  borderRadius: "var(--r-lg)", padding: "10px 16px",
  fontSize: 12, color: "var(--text2)",
  boxShadow: "var(--shadow-md)",
  display: "flex", alignItems: "center", gap: 8,
}}
```

- [ ] **Step 2: Run tests**

```
npx vitest run
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```
git add src/components/ui/Toast.jsx
git commit -m "feat: toast glass surface"
```

---

### Task 8: App.jsx — Ambient Glow & Button Colors

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update ambient glow to purple and add second glow**

In `App.jsx`, find the single ambient glow `<div>` (around line 249):

```jsx
<div style={{
  position: "fixed", top: -280, left: "50%", transform: "translateX(-50%)",
  width: 900, height: 600,
  background: "radial-gradient(ellipse, rgba(200,30,50,0.05) 0%, transparent 68%)",
  pointerEvents: "none", zIndex: 0,
}} />
```

Replace with two divs:

```jsx
<div style={{
  position: "fixed", top: -280, left: "50%", transform: "translateX(-50%)",
  width: 900, height: 600,
  background: "radial-gradient(ellipse, rgba(124,58,237,0.06) 0%, transparent 68%)",
  pointerEvents: "none", zIndex: 0,
}} />
<div style={{
  position: "fixed", bottom: -200, left: -100,
  width: 600, height: 400,
  background: "radial-gradient(ellipse, rgba(124,58,237,0.03) 0%, transparent 68%)",
  pointerEvents: "none", zIndex: 0,
}} />
```

- [ ] **Step 2: Update Welcome logo gradient and glow**

In the `Welcome` component (around line 35), find the logo icon `motion.div`. Replace its `background` and `boxShadow` inline values:

```jsx
/* old */
background: "linear-gradient(135deg, #78001A 0%, #3a000c 100%)",
...
boxShadow: "0 0 0 1px rgba(200,30,50,0.3), 0 8px 32px rgba(200,30,50,0.35), 0 0 60px rgba(200,30,50,0.15)",
```

```jsx
/* new */
background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)",
...
boxShadow: "0 0 0 1px rgba(124,58,237,0.3), 0 8px 32px rgba(124,58,237,0.35), 0 0 60px rgba(124,58,237,0.15)",
```

- [ ] **Step 3: Update Welcome "Ersten Kunden anlegen" button glow**

Still in the `Welcome` component (around line 66), replace all three crimson rgba references on the primary button:

Initial `boxShadow`:
```jsx
boxShadow: "0 0 0 1px rgba(200,30,50,0.4), 0 4px 20px rgba(200,30,50,0.3)",
```
→
```jsx
boxShadow: "0 0 0 1px rgba(124,58,237,0.4), 0 4px 20px rgba(124,58,237,0.3)",
```

`onMouseEnter`:
```jsx
e.currentTarget.style.boxShadow = "0 0 0 1px rgba(200,30,50,0.5), 0 4px 28px rgba(200,30,50,0.5)";
```
→
```jsx
e.currentTarget.style.boxShadow = "0 0 0 1px rgba(124,58,237,0.5), 0 4px 28px rgba(124,58,237,0.5)";
```

`onMouseLeave`:
```jsx
e.currentTarget.style.boxShadow = "0 0 0 1px rgba(200,30,50,0.4), 0 4px 20px rgba(200,30,50,0.3)";
```
→
```jsx
e.currentTarget.style.boxShadow = "0 0 0 1px rgba(124,58,237,0.4), 0 4px 20px rgba(124,58,237,0.3)";
```

- [ ] **Step 4: Update WorkflowTabBar active badge color**

In `WorkflowTabBar` (around line 172), find the badge `motion.span`. Replace:

```jsx
background: active ? "rgba(200,30,50,0.28)" : "var(--bg4)",
```
→
```jsx
background: active ? "rgba(124,58,237,0.28)" : "var(--bg4)",
```

- [ ] **Step 5: Run tests**

```
npx vitest run
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```
git add src/App.jsx
git commit -m "feat: purple ambient glow, updated Welcome logo and button glows"
```

---

### Task 9: UebersichtPane — Build with TDD

**Files:**
- Create: `src/components/uebersicht/UebersichtPane.jsx`
- Create: `src/test/components/UebersichtPane.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/components/UebersichtPane.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../store', () => ({
  useStore: vi.fn(),
}))

import { UebersichtPane, buildActivityEvents } from '../../components/uebersicht/UebersichtPane'
import { useStore } from '../../store'

// ── buildActivityEvents (pure function, no React needed) ─────────────────────

describe('buildActivityEvents', () => {
  it('returns events sorted newest first', () => {
    const older = '2024-01-01T00:00:00.000Z'
    const newer = '2024-06-01T00:00:00.000Z'
    const customers = [{ id: 'c1', name: 'Max', createdAt: older }]
    const todos = [{ id: 't1', customerId: 'c1', createdAt: newer }]
    const result = buildActivityEvents(customers, todos, [], [], [])
    expect(result[0].createdAt).toBe(newer)
    expect(result[1].createdAt).toBe(older)
  })

  it('limits output to 8 events', () => {
    const customers = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, name: `K${i}`, createdAt: new Date(Date.now() - i * 1000).toISOString(),
    }))
    const result = buildActivityEvents(customers, [], [], [], [])
    expect(result).toHaveLength(8)
  })

  it('attaches customer name and correct label to a todo event', () => {
    const customers = [{ id: 'c1', name: 'Erika', createdAt: '2024-01-01T00:00:00.000Z' }]
    const todos = [{ id: 't1', customerId: 'c1', createdAt: '2024-06-01T00:00:00.000Z' }]
    const result = buildActivityEvents(customers, todos, [], [], [])
    const todoEvent = result.find((e) => e.type === 'todo')
    expect(todoEvent.customerName).toBe('Erika')
    expect(todoEvent.label).toBe('To-Do erstellt')
  })

  it('uses fallback name for unknown customerId', () => {
    const todos = [{ id: 't1', customerId: 'unknown', createdAt: '2024-06-01T00:00:00.000Z' }]
    const result = buildActivityEvents([], todos, [], [], [])
    expect(result[0].customerName).toBe('—')
  })
})

// ── UebersichtPane (React component) ─────────────────────────────────────────

describe('UebersichtPane', () => {
  const makeState = (overrides = {}) => ({
    customers: [],
    todos: [],
    notes: [],
    kpis: [],
    uploadedFiles: [],
    selectCustomer: vi.fn(),
    ...overrides,
  })

  beforeEach(() => {
    useStore.mockImplementation((selector) => selector(makeState()))
  })

  it('renders without crashing with empty state', () => {
    render(<UebersichtPane />)
    expect(screen.getByText(/Übersicht/i)).toBeInTheDocument()
  })

  it('shows count of open (incomplete) todos only', () => {
    useStore.mockImplementation((selector) =>
      selector(makeState({
        customers: [{ id: 'c1', name: 'Max', company: '', createdAt: new Date().toISOString() }],
        todos: [
          { id: 't1', customerId: 'c1', text: 'Task offen', completed: false, createdAt: new Date().toISOString() },
          { id: 't2', customerId: 'c1', text: 'Task fertig', completed: true, createdAt: new Date().toISOString() },
        ],
      }))
    )
    render(<UebersichtPane />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows customer first name in the strip', () => {
    useStore.mockImplementation((selector) =>
      selector(makeState({
        customers: [{ id: 'c1', name: 'Erika Müller', company: '', createdAt: new Date().toISOString() }],
      }))
    )
    render(<UebersichtPane />)
    expect(screen.getByText('Erika')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```
npx vitest run src/test/components/UebersichtPane.test.jsx
```

Expected: FAIL — `Cannot find module '../../components/uebersicht/UebersichtPane'`

- [ ] **Step 3: Create stub exports so tests can import**

Create `src/components/uebersicht/UebersichtPane.jsx`:

```jsx
export function buildActivityEvents() {
  return []
}

export function UebersichtPane() {
  return <div>Übersicht</div>
}
```

- [ ] **Step 4: Run tests — verify partial state**

```
npx vitest run src/test/components/UebersichtPane.test.jsx
```

Expected: `renders without crashing` PASS; `buildActivityEvents` tests FAIL (returns `[]`); other component tests FAIL (count/name not in DOM).

- [ ] **Step 5: Implement `buildActivityEvents`**

Replace the stub function in `UebersichtPane.jsx`:

```jsx
export function buildActivityEvents(customers, todos, notes, kpis, uploadedFiles) {
  const findName = (customerId) =>
    customers.find((c) => c.id === customerId)?.name ?? '—'

  const events = [
    ...customers.map((c) => ({
      type: 'customer', label: 'Kunde angelegt',
      customerId: c.id, customerName: c.name, createdAt: c.createdAt,
    })),
    ...todos.map((t) => ({
      type: 'todo', label: 'To-Do erstellt',
      customerId: t.customerId, customerName: findName(t.customerId), createdAt: t.createdAt,
    })),
    ...notes.map((n) => ({
      type: 'note', label: 'Notiz erstellt',
      customerId: n.customerId, customerName: findName(n.customerId), createdAt: n.createdAt,
    })),
    ...kpis.map((k) => ({
      type: 'kpi', label: 'KPI hinzugefügt',
      customerId: k.customerId, customerName: findName(k.customerId), createdAt: k.createdAt,
    })),
    ...uploadedFiles.map((f) => ({
      type: 'file', label: 'Datei hochgeladen',
      customerId: f.customerId, customerName: findName(f.customerId), createdAt: f.createdAt,
    })),
  ]
  return events
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8)
}

export function UebersichtPane() {
  return <div>Übersicht</div>
}
```

- [ ] **Step 6: Run tests — verify buildActivityEvents tests pass**

```
npx vitest run src/test/components/UebersichtPane.test.jsx
```

Expected: 4 `buildActivityEvents` tests PASS. Component tests still fail (stub returns no count/name).

- [ ] **Step 7: Replace the full file with the complete component**

Replace the entire `src/components/uebersicht/UebersichtPane.jsx` with:

```jsx
import { motion } from 'framer-motion'
import { useStore } from '../../store'
import { Avatar } from '../ui/Avatar'
import { timeAgo } from '../../utils/helpers'

export function buildActivityEvents(customers, todos, notes, kpis, uploadedFiles) {
  const findName = (customerId) =>
    customers.find((c) => c.id === customerId)?.name ?? '—'

  const events = [
    ...customers.map((c) => ({
      type: 'customer', label: 'Kunde angelegt',
      customerId: c.id, customerName: c.name, createdAt: c.createdAt,
    })),
    ...todos.map((t) => ({
      type: 'todo', label: 'To-Do erstellt',
      customerId: t.customerId, customerName: findName(t.customerId), createdAt: t.createdAt,
    })),
    ...notes.map((n) => ({
      type: 'note', label: 'Notiz erstellt',
      customerId: n.customerId, customerName: findName(n.customerId), createdAt: n.createdAt,
    })),
    ...kpis.map((k) => ({
      type: 'kpi', label: 'KPI hinzugefügt',
      customerId: k.customerId, customerName: findName(k.customerId), createdAt: k.createdAt,
    })),
    ...uploadedFiles.map((f) => ({
      type: 'file', label: 'Datei hochgeladen',
      customerId: f.customerId, customerName: findName(f.customerId), createdAt: f.createdAt,
    })),
  ]
  return events
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8)
}

const ICONS = {
  customer: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  todo:     <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  note:     <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>,
  kpi:      <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
  file:     <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>,
}

const ease = [0.22, 1, 0.36, 1]

const glassCard = {
  background: 'rgba(17,17,21,0.70)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(124,58,237,0.10)',
  borderRadius: 'var(--r-xl)',
  padding: '20px',
  boxShadow: '0 8px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(124,58,237,0.10)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

function CardHeader({ label, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text4)' }}>
        {label}
      </span>
      <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--p3)' }}>
        {icon}
      </div>
    </div>
  )
}

export function UebersichtPane() {
  const customers    = useStore((s) => s.customers)
  const todos        = useStore((s) => s.todos)
  const notes        = useStore((s) => s.notes)
  const kpis         = useStore((s) => s.kpis)
  const uploadedFiles = useStore((s) => s.uploadedFiles)
  const selectCustomer = useStore((s) => s.selectCustomer)

  const openTodos = todos.filter((t) => !t.completed)

  const activityEvents = buildActivityEvents(customers, todos, notes, kpis, uploadedFiles)

  const topKpis = [...kpis]
    .filter((k) => k.value !== undefined && k.value !== null && k.value !== '')
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 3)
    .map((k) => ({ ...k, customerName: customers.find((c) => c.id === k.customerId)?.name ?? '—' }))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 900 }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease }}
          style={{ marginBottom: 32 }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>
            Übersicht
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>{greeting} · {dateStr}</p>
        </motion.div>

        {/* Card row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* Offene To-Dos */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06, ease }}
            whileHover={{ y: -2, transition: { duration: 0.22, ease } }}
            style={glassCard}
          >
            <CardHeader label="Offene To-Dos" icon={<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.04em', color: openTodos.length > 0 ? 'var(--text)' : 'var(--text4)', lineHeight: 1 }}>
              {openTodos.length}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {openTodos.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text4)' }}>Alles erledigt ✓</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {openTodos.slice(0, 5).map((t) => {
                    const c = customers.find((x) => x.id === t.customerId)
                    return (
                      <div key={t.id} onClick={() => c && selectCustomer(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: c ? 'pointer' : 'default' }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--p3)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</span>
                        {c && <span style={{ fontSize: 10, color: 'var(--text4)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>{c.name.split(' ')[0]}</span>}
                      </div>
                    )
                  })}
                  {openTodos.length > 5 && <span style={{ fontSize: 11, color: 'var(--text4)' }}>+ {openTodos.length - 5} weitere</span>}
                </div>
              )}
            </div>
          </motion.div>

          {/* Letzte Aktivität */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.10, ease }}
            whileHover={{ y: -2, transition: { duration: 0.22, ease } }}
            style={glassCard}
          >
            <CardHeader label="Letzte Aktivität" icon={<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
            {activityEvents.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text4)' }}>Noch keine Aktivität</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activityEvents.map((ev, i) => (
                  <div key={i} onClick={() => ev.customerId && selectCustomer(ev.customerId)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: ev.customerId ? 'pointer' : 'default' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 7, background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--p3)', flexShrink: 0, marginTop: 1 }}>
                      {ICONS[ev.type]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.label}{ev.customerName !== '—' && <span style={{ color: 'var(--text3)' }}> · {ev.customerName}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text4)' }}>{timeAgo(ev.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* KPI Highlights */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.14, ease }}
            whileHover={{ y: -2, transition: { duration: 0.22, ease } }}
            style={glassCard}
          >
            <CardHeader label="KPI Highlights" icon={<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>} />
            {topKpis.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text4)' }}>Noch keine KPIs</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topKpis.map((k) => (
                  <div key={k.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{k.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--p3)', flexShrink: 0 }}>{k.value}{k.unit ? ` ${k.unit}` : ''}</span>
                    </div>
                    <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, var(--p) 0%, var(--p2) 100%)', width: `${Math.min(100, (Number(k.value) / Number(topKpis[0].value)) * 100)}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 3 }}>{k.customerName}</div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Kunden strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18, ease }}
          style={{ ...glassCard, flexDirection: 'row', alignItems: 'center', padding: '16px 20px', gap: 16 }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text4)', flexShrink: 0 }}>
            Kunden
          </span>
          <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 2 }}>
            {customers.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text4)' }}>Noch keine Kunden</span>
            ) : (
              customers.map((c) => (
                <motion.div
                  key={c.id}
                  onClick={() => selectCustomer(c.id)}
                  whileHover={{ y: -2, transition: { duration: 0.15 } }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}
                >
                  <Avatar name={c.name} id={c.id} size={32} radius={10} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', maxWidth: 56, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name.split(' ')[0]}
                  </span>
                </motion.div>
              ))
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => document.dispatchEvent(new CustomEvent('openAddCustomer'))}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 0 16px rgba(124,58,237,0.30)', transition: 'background 0.15s, box-shadow 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p2)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(124,58,237,0.55)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--p)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(124,58,237,0.30)'; }}
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
            </svg>
            Neuer Kunde
          </motion.button>
        </motion.div>

      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run all tests**

```
npx vitest run
```

Expected: 9 tests pass (5 store + 4 `buildActivityEvents` + 3 `UebersichtPane` component = 12 total — wait: 5 existing + 4 buildActivityEvents + 3 UebersichtPane = 12).

- [ ] **Step 9: Commit**

```
git add src/components/uebersicht/UebersichtPane.jsx src/test/components/UebersichtPane.test.jsx
git commit -m "feat: add UebersichtPane with activity events, todos, and kpi highlights"
```

---

### Task 10: App.jsx — Swap Welcome for UebersichtPane

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the import**

At the top of `src/App.jsx`, after the existing import block, add:

```jsx
import { UebersichtPane } from "./components/uebersicht/UebersichtPane";
```

- [ ] **Step 2: Replace the Welcome render with UebersichtPane**

In the `App` return (around line 262), find:

```jsx
{!hasCustomer ? (
  <Welcome onAdd={() => document.dispatchEvent(new CustomEvent("openAddCustomer"))} />
) : (
```

Replace with:

```jsx
{!hasCustomer ? (
  <UebersichtPane />
) : (
```

- [ ] **Step 3: Delete the Welcome function component**

Delete the entire `Welcome` function (lines 19–98 in the original file). It is fully replaced by `UebersichtPane` and no longer referenced anywhere.

- [ ] **Step 4: Run all tests**

```
npx vitest run
```

Expected: 12 tests pass (0 failures).

- [ ] **Step 5: Commit**

```
git add src/App.jsx
git commit -m "feat: replace Welcome screen with UebersichtPane home dashboard"
```

---

## Self-Review

**Spec coverage:**
- ✅ Section 2 (tokens) → Task 1
- ✅ Section 3 (Z-stack / depth) → backdropFilter values in Tasks 2, 3, 5, 6, 7
- ✅ Section 4.1 (App shell ambient glow) → Task 8 Step 1
- ✅ Section 4.2 (Sidebar glass) → Task 2
- ✅ Section 4.3 (TopBar token swap) → Task 1 tokens + Task 4 hardcoded fix
- ✅ Section 4.4 (CustomerNav glass) → Task 3
- ✅ Section 4.5 (WorkflowTabBar badge) → Task 8 Step 4
- ✅ Section 5.1 (Welcome logo & button) → Task 8 Steps 2–3
- ✅ Section 5.2 (CustomerItem glow) → Task 2 Step 4
- ✅ Section 5.3 (Modal glass) → Task 5
- ✅ Section 5.4 (CommandPalette glass) → Task 6
- ✅ Section 5.5 (Toast glass) → Task 7
- ✅ Section 6 (UebersichtPane) → Tasks 9–10

**No placeholders, no TBDs.** All code is fully written out.

**Type consistency:** `buildActivityEvents` exported in Task 9 Step 7 matches the signature used in tests (Step 1) and in the component itself. `selectCustomer` is read from store as `s.selectCustomer` and called as `selectCustomer(id)` — consistent with store definition.
