# Cynera v2 UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the glass-morphism + oklch design system from `C:\Users\hendr\Desktop\src\` to the Cynera Focus Tauri+React app — pixel-accurate CSS classes, new grid layout, new Topbar, restyled NavSidebar, and restyled routes — while preserving all existing store logic, TypeScript types, and business functionality.

**Architecture:** Hybrid Tailwind + named CSS classes. Keep Tailwind utilities where they exist in sub-components not restyled in this sprint. Add named component classes (`.glass`, `.card`, `.btn-primary`, `.sidebar`, `.nav-item`, `.topbar`, etc.) from the reference design system into `globals.css`. The app shell switches from `flex` div to CSS Grid (`240px 1fr`) via the `.app` class. A new sticky `Topbar` component sits inside `<main class="main">` for the glass search pill + quick actions.

**Tech Stack:** Tauri v2 · React 18 · TypeScript · Tailwind CSS 3 · Zustand · Vite · oklch CSS color space · Geist variable font (local TTF) · Lucide React icons

---

### Task 1: Design System Foundation — globals.css + fonts + tailwind

**Files:**
- Modify: `src/styles/globals.css` (complete rewrite)
- Modify: `tailwind.config.ts` (add Geist to fontFamily.sans)
- Create: `public/fonts/Geist-VariableFont_wght.ttf` (copy from Desktop)
- Create: `public/fonts/Geist-Italic-VariableFont_wght.ttf` (copy from Desktop)
- Create: `public/fonts/GeistMono-VariableFont_wght.ttf` (copy from Desktop)
- Create: `public/fonts/GeistMono-Italic-VariableFont_wght.ttf` (copy from Desktop)

- [ ] **Step 1: Copy font files from Desktop to `public/fonts/`**

Run (PowerShell from repo root):
```powershell
New-Item -ItemType Directory -Force public/fonts
Copy-Item "C:\Users\hendr\Desktop\Geist-VariableFont_wght.ttf" public/fonts/
Copy-Item "C:\Users\hendr\Desktop\Geist-Italic-VariableFont_wght.ttf" public/fonts/
Copy-Item "C:\Users\hendr\Desktop\GeistMono-VariableFont_wght.ttf" public/fonts/
Copy-Item "C:\Users\hendr\Desktop\GeistMono-Italic-VariableFont_wght.ttf" public/fonts/
```

Expected: `public/fonts/` contains 4 `.ttf` files.

- [ ] **Step 2: Rewrite `src/styles/globals.css`**

Replace the entire file content with:

```css
@font-face {
  font-family: "Geist";
  src: url("/fonts/Geist-VariableFont_wght.ttf") format("truetype");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Geist";
  src: url("/fonts/Geist-Italic-VariableFont_wght.ttf") format("truetype");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Geist Mono";
  src: url("/fonts/GeistMono-VariableFont_wght.ttf") format("truetype");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Geist Mono";
  src: url("/fonts/GeistMono-Italic-VariableFont_wght.ttf") format("truetype");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ========== Design Tokens ========== */

:root {
  --bg: oklch(13% 0.005 270);
  --bg-2: oklch(15% 0.006 270);
  --surface: oklch(18% 0.006 270);
  --surface-2: oklch(22% 0.008 270);
  --surface-3: oklch(26% 0.009 270);
  --border: oklch(30% 0.01 270);
  --border-strong: oklch(40% 0.012 270);
  --fg: oklch(98% 0 0);
  --fg-2: oklch(82% 0.005 270);
  --fg-muted: oklch(64% 0.008 270);
  --fg-dim: oklch(46% 0.008 270);
  --accent: oklch(92% 0.2 125);
  --accent-2: oklch(86% 0.21 125);
  --accent-soft: oklch(92% 0.2 125 / 0.14);
  --accent-glow: oklch(92% 0.2 125 / 0.5);
  --accent-ink: oklch(15% 0 0);
  --danger: oklch(72% 0.18 25);
  --warn: oklch(82% 0.16 70);
  --ok: oklch(82% 0.18 155);
  --info: oklch(78% 0.13 235);

  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius: 16px;
  --radius-lg: 22px;
  --radius-xl: 28px;

  --shadow-1: 0 1px 0 0 oklch(100% 0 0 / 0.04) inset, 0 0 0 1px oklch(100% 0 0 / 0.05);
  --shadow-2: 0 30px 60px -25px oklch(0% 0 0 / 0.7), 0 0 0 1px oklch(100% 0 0 / 0.04);
  --shadow-glass: 0 1px 0 0 oklch(100% 0 0 / 0.06) inset, 0 0 0 1px oklch(100% 0 0 / 0.08), 0 30px 80px -20px oklch(0% 0 0 / 0.6);

  --density-pad: 22px;
  --density-gap: 16px;
  --density-card: 18px;

  --font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", "JetBrains Mono", monospace;
  --font-display: "Geist", ui-sans-serif, system-ui, sans-serif;

  /* Backwards-compat aliases — old variable names used in unrewritten components */
  --text: var(--fg);
  --text2: var(--fg-muted);
  --text3: var(--fg-dim);
  --bg1: var(--surface);
  --bg2: var(--surface-2);
  --bg3: var(--surface-3);
  --p: var(--accent);
  --p2: var(--accent-2);
  --p3: var(--accent-soft);
  --border2: var(--border-strong);
  --green: var(--ok);
  --red: var(--danger);
  --amber: var(--warn);
}

[data-density="compact"] {
  --density-pad: 14px;
  --density-gap: 10px;
  --density-card: 12px;
}

[data-theme="light"] {
  --bg: oklch(98% 0.003 90);
  --bg-2: oklch(96% 0.004 90);
  --surface: oklch(100% 0 0);
  --surface-2: oklch(97% 0.004 90);
  --surface-3: oklch(94% 0.005 90);
  --border: oklch(89% 0.005 90);
  --border-strong: oklch(80% 0.006 90);
  --fg: oklch(18% 0.005 270);
  --fg-2: oklch(28% 0.006 270);
  --fg-muted: oklch(46% 0.008 270);
  --fg-dim: oklch(60% 0.008 270);
  --shadow-glass: 0 1px 0 0 oklch(100% 0 0 / 0.9) inset, 0 0 0 1px oklch(0% 0 0 / 0.06), 0 30px 80px -20px oklch(0% 0 0 / 0.18);
  --shadow-2: 0 30px 60px -25px oklch(0% 0 0 / 0.25), 0 0 0 1px oklch(0% 0 0 / 0.04);
  --text: var(--fg);
  --text2: var(--fg-muted);
  --text3: var(--fg-dim);
  --bg1: var(--surface);
  --bg2: var(--surface-2);
  --bg3: var(--surface-3);
}

/* ========== Base ========== */

* { box-sizing: border-box; }

html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  font-feature-settings: "ss01", "cv11", "ss03";
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  letter-spacing: -0.01em;
}

body { min-height: 100vh; overflow: hidden; }
#root { height: 100vh; }

button {
  font-family: inherit; color: inherit; background: transparent;
  border: none; cursor: pointer; padding: 0;
  font-size: inherit; letter-spacing: inherit;
}
input, textarea { font-family: inherit; color: inherit; letter-spacing: inherit; }
input:focus, textarea:focus, button:focus { outline: none; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: oklch(100% 0 0 / 0.08); border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: oklch(100% 0 0 / 0.14); }

.mono {
  font-family: var(--font-mono);
  font-feature-settings: "ss01", "ss02", "zero";
  letter-spacing: 0;
}

/* ========== Layout ========== */

.app {
  display: grid;
  grid-template-columns: 240px 1fr;
  height: 100vh;
  background:
    radial-gradient(1200px 600px at 80% -10%, oklch(92% 0.2 125 / 0.06), transparent 60%),
    radial-gradient(900px 500px at -10% 100%, oklch(78% 0.13 235 / 0.05), transparent 60%),
    var(--bg);
  transition: grid-template-columns 280ms cubic-bezier(.2,.7,.1,1);
}

.main {
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
}

.main-inner {
  padding: 32px 48px 80px;
  max-width: 1380px;
  margin: 0 auto;
}

[data-density="compact"] .main-inner { padding: 24px 32px 64px; }

/* ========== Sidebar ========== */

.sidebar {
  display: flex;
  flex-direction: column;
  padding: 18px 14px;
  gap: 6px;
  border-right: 1px solid var(--border);
  background: linear-gradient(180deg, oklch(100% 0 0 / 0.015), transparent 30%);
  position: relative;
  z-index: 10;
}

.sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 8px 8px 18px; }
.sidebar-brand-logo {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sidebar-brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.sidebar-brand-text strong { font-size: 14.5px; font-weight: 600; letter-spacing: -0.02em; }
.sidebar-brand-text span { font-size: 10.5px; color: var(--fg-dim); font-family: var(--font-mono); letter-spacing: 0.04em; margin-top: 2px; }

.sidebar-section {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-dim);
  padding: 14px 10px 6px;
}

.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 10px;
  font-size: 13.5px; color: var(--fg-2);
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease;
  position: relative; user-select: none;
}
.nav-item:hover { background: oklch(100% 0 0 / 0.04); color: var(--fg); }
.nav-item[data-active="true"] { background: var(--surface-2); color: var(--fg); box-shadow: var(--shadow-1); }
.nav-item[data-active="true"]::before {
  content: ""; position: absolute; left: -14px; top: 50%;
  transform: translateY(-50%); width: 3px; height: 18px;
  background: var(--accent); border-radius: 0 4px 4px 0;
}
.nav-item .nav-kbd {
  margin-left: auto; font-family: var(--font-mono); font-size: 10px;
  color: var(--fg-dim); padding: 1px 5px; border-radius: 4px;
  background: oklch(100% 0 0 / 0.04);
}
.nav-item .nav-badge {
  margin-left: auto; font-family: var(--font-mono); font-size: 10px;
  font-weight: 600; color: var(--accent-ink); background: var(--accent);
  padding: 1px 6px; border-radius: 99px;
}

.sidebar-user {
  margin-top: auto; display: flex; align-items: center; gap: 10px;
  padding: 10px; border-radius: 12px;
  background: var(--surface); border: 1px solid var(--border);
  cursor: pointer; transition: background 180ms ease;
}
.sidebar-user:hover { background: var(--surface-2); }
.sidebar-user-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), oklch(80% 0.16 165));
  color: var(--accent-ink); font-weight: 700; font-size: 12px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sidebar-user-text { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
.sidebar-user-text strong { font-size: 13px; font-weight: 600; }
.sidebar-user-text span { font-size: 11px; color: var(--fg-muted); }

/* ========== Topbar ========== */

.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 12px;
  padding: 18px 48px 14px;
  background: linear-gradient(180deg, var(--bg) 60%, oklch(0% 0 0 / 0) 100%);
}
[data-density="compact"] .topbar { padding: 14px 32px 12px; }

.glass {
  background: oklch(100% 0 0 / 0.04);
  border: 1px solid oklch(100% 0 0 / 0.08);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  box-shadow: var(--shadow-glass);
}
[data-theme="light"] .glass { background: oklch(100% 0 0 / 0.65); border: 1px solid oklch(0% 0 0 / 0.06); }

.search-pill {
  flex: 1; display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 99px;
  font-size: 13px; color: var(--fg-muted); cursor: text;
  transition: background 180ms ease;
}
.search-pill:hover { background: oklch(100% 0 0 / 0.06); }
.search-pill .kbd {
  margin-left: auto; font-family: var(--font-mono); font-size: 10.5px;
  padding: 2px 6px; border-radius: 5px;
  background: oklch(100% 0 0 / 0.06); border: 1px solid oklch(100% 0 0 / 0.08);
  color: var(--fg-muted);
}

.icon-btn {
  width: 38px; height: 38px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 12px; color: var(--fg-2);
  cursor: pointer; transition: all 180ms ease;
}
.icon-btn:hover { color: var(--fg); transform: translateY(-1px); }

.btn-primary {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; border-radius: 99px;
  background: var(--accent); color: var(--accent-ink);
  font-weight: 600; font-size: 13px; cursor: pointer;
  transition: transform 180ms ease, box-shadow 220ms ease;
  box-shadow: 0 6px 20px -8px var(--accent-glow), 0 0 0 1px oklch(0% 0 0 / 0.1);
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 30px -10px var(--accent-glow); }
.btn-primary:active { transform: translateY(0); }

.btn-ghost {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 99px;
  color: var(--fg-2); font-weight: 500; font-size: 13px; cursor: pointer;
  transition: all 180ms ease;
  background: oklch(100% 0 0 / 0.04); border: 1px solid oklch(100% 0 0 / 0.06);
}
.btn-ghost:hover { background: oklch(100% 0 0 / 0.08); color: var(--fg); }

/* ========== Tabs (glass pill with sliding indicator) ========== */

.tabs {
  display: inline-flex; padding: 5px; border-radius: 99px;
  gap: 2px; position: relative;
}
.tab {
  position: relative; padding: 7px 14px; border-radius: 99px;
  font-size: 12.5px; font-weight: 500; color: var(--fg-muted);
  cursor: pointer; transition: color 180ms ease;
  z-index: 1; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
}
.tab[data-active="true"] { color: var(--fg); }
.tab-indicator {
  position: absolute; top: 5px; bottom: 5px;
  background: oklch(100% 0 0 / 0.08); border-radius: 99px;
  transition: left 320ms cubic-bezier(.2,.7,.1,1), width 320ms cubic-bezier(.2,.7,.1,1);
  z-index: 0;
}

/* ========== Cards ========== */

.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: var(--density-card);
  transition: background 200ms ease, border-color 200ms ease, transform 200ms ease;
}
.card-hover { cursor: pointer; }
.card-hover:hover { background: var(--surface-2); border-color: var(--border-strong); transform: translateY(-1px); }
.card-title { font-size: 14.5px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
.card-label {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-dim);
}

/* ========== Greeting hero ========== */

.greeting {
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-bottom: 28px; gap: 24px;
}
.greeting-title {
  font-family: var(--font-display);
  font-size: clamp(48px, 6vw, 88px); font-weight: 600;
  letter-spacing: -0.045em; line-height: 0.92; margin: 0;
}
.greeting-title em { font-style: normal; color: var(--fg-dim); font-weight: 500; }
.greeting-sub {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted);
  display: flex; flex-direction: column; gap: 4px; text-align: right;
}
.greeting-sub strong { color: var(--accent); font-weight: 500; }

/* ========== Priority Cards ========== */

.priorities { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 32px; }

.prio-card {
  position: relative; border-radius: var(--radius-lg);
  padding: 20px 22px 22px; min-height: 220px;
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border);
  cursor: pointer; overflow: hidden;
  transition: transform 280ms cubic-bezier(.2,.7,.1,1), border-color 240ms ease, background 240ms ease;
  animation: card-in 600ms cubic-bezier(.2,.7,.1,1) both;
}
.prio-card:nth-child(1) { animation-delay: 60ms; }
.prio-card:nth-child(2) { animation-delay: 130ms; }
.prio-card:nth-child(3) { animation-delay: 200ms; }
.prio-card:hover { transform: translateY(-3px); border-color: var(--border-strong); }
.prio-card[data-tone="hero"] {
  background: linear-gradient(155deg, var(--accent) 0%, var(--accent-2) 100%);
  color: var(--accent-ink); border-color: transparent;
  box-shadow: 0 20px 50px -20px var(--accent-glow);
}
.prio-card[data-tone="hero"] .prio-num,
.prio-card[data-tone="hero"] .prio-meta,
.prio-card[data-tone="hero"] .prio-foot { color: oklch(15% 0 0 / 0.7); }
.prio-num {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.18em;
  color: var(--fg-dim); margin-bottom: 16px;
  display: flex; align-items: center; gap: 8px;
}
.prio-num::after { content: ""; flex: 1; height: 1px; background: currentColor; opacity: 0.18; }
.prio-title { font-size: 22px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.15; margin: 0 0 8px; }
.prio-meta { font-size: 13px; color: var(--fg-muted); margin: 0 0 16px; line-height: 1.4; }
.prio-foot {
  margin-top: auto; display: flex; align-items: center; justify-content: space-between;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--fg-muted);
}
.prio-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 99px;
  background: oklch(100% 0 0 / 0.08); font-weight: 500;
}
.prio-card[data-tone="hero"] .prio-chip { background: oklch(0% 0 0 / 0.12); }

@keyframes card-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ========== Generic grids ========== */

.row   { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px; }
.row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.row-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }

/* ========== Now card / pulse ========== */

.now-card { display: flex; flex-direction: column; gap: 14px; height: 100%; }
.now-meeting {
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px 16px; border-radius: var(--radius);
  background: var(--surface-2); border: 1px solid var(--border);
}
.now-time {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--accent); letter-spacing: 0.08em;
  display: flex; align-items: center; gap: 6px;
}
.now-time .pulse {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 0 0 var(--accent-glow);
  animation: pulse 1.6s infinite;
}
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 var(--accent-glow); }
  70%  { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.stat-row { display: flex; align-items: baseline; gap: 8px; }
.stat-value { font-size: 28px; font-weight: 600; letter-spacing: -0.03em; }
.stat-trend { font-family: var(--font-mono); font-size: 11px; color: var(--ok); }
.stat-trend.down { color: var(--danger); }

/* ========== Timeline ========== */

.timeline { display: flex; flex-direction: column; gap: 2px; padding-top: 4px; position: relative; }
.tl-row {
  display: grid; grid-template-columns: 64px 1fr auto;
  align-items: center; gap: 14px; padding: 10px 4px;
  border-radius: 10px; cursor: pointer;
  transition: background 180ms ease; position: relative;
}
.tl-row:hover { background: oklch(100% 0 0 / 0.03); }
.tl-time { font-family: var(--font-mono); font-size: 11.5px; color: var(--fg-muted); letter-spacing: 0.04em; }
.tl-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tl-title { font-size: 13.5px; font-weight: 500; }
.tl-sub { font-size: 11.5px; color: var(--fg-dim); }
.tl-pill {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
  padding: 3px 7px; border-radius: 99px;
  background: oklch(100% 0 0 / 0.05); color: var(--fg-muted);
  text-transform: uppercase;
}
.tl-pill[data-tone="accent"] { background: var(--accent-soft); color: var(--accent); }
.tl-pill[data-tone="now"]    { background: var(--accent); color: var(--accent-ink); }
.tl-pill[data-tone="warn"]   { background: oklch(82% 0.16 70 / 0.18); color: var(--warn); }
.tl-bar { position: absolute; left: 64px; top: 0; bottom: 0; width: 1px; background: var(--border); }
.tl-dot {
  position: absolute; left: 64px; top: 50%;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--surface); border: 1px solid var(--border-strong);
  transform: translate(-3.5px, -50%);
}
.tl-row[data-now="true"] .tl-dot { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

/* ========== Client list rows ========== */

.client-row {
  display: grid; grid-template-columns: 32px 1fr auto auto;
  align-items: center; gap: 14px; padding: 10px 12px;
  border-radius: 12px; cursor: pointer; transition: background 180ms ease;
}
.client-row:hover { background: oklch(100% 0 0 / 0.03); }
.client-row[data-active="true"] { background: var(--surface-2); box-shadow: var(--shadow-1); }
.avatar {
  width: 30px; height: 30px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--fg);
  border: 1px solid var(--border); background: var(--surface-2);
  font-family: var(--font-mono); letter-spacing: 0; flex-shrink: 0;
}
.client-name { font-size: 13.5px; font-weight: 500; }
.client-meta { font-size: 11.5px; color: var(--fg-dim); margin-top: 2px; }

/* ========== Section header ========== */

.section-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; margin: 28px 0 14px;
}
.section-head h2 {
  font-size: 17px; font-weight: 600; letter-spacing: -0.02em;
  margin: 0; display: flex; align-items: center; gap: 10px;
}
.section-head h2 .count {
  font-family: var(--font-mono); font-size: 11px; color: var(--fg-dim);
  font-weight: 500; letter-spacing: 0.06em;
  background: oklch(100% 0 0 / 0.04); padding: 2px 7px; border-radius: 99px;
}

/* ========== Chips ========== */

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 99px;
  background: oklch(100% 0 0 / 0.05); color: var(--fg-muted); white-space: nowrap;
}
.chip[data-tone="ok"]     { background: oklch(82% 0.18 155 / 0.16); color: var(--ok); }
.chip[data-tone="warn"]   { background: oklch(82% 0.16 70 / 0.16); color: var(--warn); }
.chip[data-tone="bad"]    { background: oklch(72% 0.18 25 / 0.16); color: var(--danger); }
.chip[data-tone="info"]   { background: oklch(78% 0.13 235 / 0.16); color: var(--info); }
.chip[data-tone="accent"] { background: var(--accent-soft); color: var(--accent); }

/* ========== Empty state ========== */

.empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center;
  padding: 60px 40px; color: var(--fg-muted); gap: 6px;
}

/* ========== Command Palette ========== */

.command-backdrop {
  position: fixed; inset: 0;
  background: oklch(0% 0 0 / 0.55);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  z-index: 100; display: flex; align-items: flex-start;
  justify-content: center; padding-top: 14vh;
  animation: fade-in 180ms ease;
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
.command {
  width: min(640px, 90vw); border-radius: 20px;
  overflow: hidden; animation: pop-in 240ms cubic-bezier(.2,.7,.1,1);
}
@keyframes pop-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.command-input {
  width: 100%; padding: 18px 22px; font-size: 17px;
  background: transparent; border: none; color: var(--fg);
  border-bottom: 1px solid var(--border);
}
.command-input::placeholder { color: var(--fg-dim); }
.command-list { padding: 8px; max-height: 50vh; overflow-y: auto; }
.command-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px;
  border-radius: 10px; cursor: pointer; font-size: 13.5px;
  color: var(--fg-2); transition: background 120ms ease;
}
.command-item[data-selected="true"] { background: var(--accent-soft); color: var(--accent); }
.command-item[data-selected="true"] .cmd-kbd { background: var(--accent-soft); color: var(--accent); }
.command-item:hover { background: oklch(100% 0 0 / 0.04); }
.command-group {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-dim); padding: 10px 12px 4px;
}
.cmd-kbd {
  margin-left: auto; font-family: var(--font-mono); font-size: 10.5px;
  padding: 2px 6px; border-radius: 5px;
  background: oklch(100% 0 0 / 0.06); color: var(--fg-muted);
}

/* ========== Toast ========== */

.toast-host {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  z-index: 200; display: flex; flex-direction: column;
  gap: 8px; align-items: center; pointer-events: none;
}
.toast {
  pointer-events: auto; padding: 10px 16px; border-radius: 99px;
  font-size: 13px; display: inline-flex; align-items: center; gap: 8px;
  animation: toast-in 280ms cubic-bezier(.2,.7,.1,1),
             toast-out 280ms cubic-bezier(.2,.7,.1,1) forwards 2.4s;
}
@keyframes toast-in  { from { opacity: 0; transform: translateY(8px); }  to { opacity: 1; transform: translateY(0); } }
@keyframes toast-out { from { opacity: 1; transform: translateY(0); }     to { opacity: 0; transform: translateY(8px); } }

/* ========== Detail head (CustomerRoute) ========== */

.detail-head { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.detail-head .back {
  width: 38px; height: 38px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface); border: 1px solid var(--border);
  cursor: pointer; transition: all 180ms ease;
}
.detail-head .back:hover { background: var(--surface-2); transform: translateX(-2px); }
.detail-head h1 { font-size: 38px; font-weight: 600; letter-spacing: -0.03em; margin: 0; line-height: 1; }
.detail-head .sub {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em;
  color: var(--fg-muted); text-transform: uppercase; margin-top: 6px;
}

/* ========== Mail ========== */

.mail-list { display: flex; flex-direction: column; gap: 2px; }
.mail-item {
  display: grid; grid-template-columns: 8px 32px 1fr auto;
  align-items: center; gap: 12px; padding: 12px; border-radius: 12px;
  cursor: pointer; transition: background 180ms ease;
}
.mail-item:hover { background: oklch(100% 0 0 / 0.04); }
.mail-item[data-unread="true"] .mail-from,
.mail-item[data-unread="true"] .mail-subj { font-weight: 600; color: var(--fg); }
.mail-dot { width: 6px; height: 6px; border-radius: 50%; background: transparent; }
.mail-item[data-unread="true"] .mail-dot { background: var(--accent); }
.mail-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mail-from { font-size: 13px; color: var(--fg-2); }
.mail-subj { font-size: 12.5px; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-time { font-family: var(--font-mono); font-size: 11px; color: var(--fg-dim); }

/* ========== Finance ========== */

.invoice-row {
  display: grid; grid-template-columns: 1fr 1fr 100px 90px 80px;
  align-items: center; gap: 14px; padding: 12px 14px;
  border-radius: 12px; cursor: pointer; transition: background 180ms ease;
  font-size: 13px; border-bottom: 1px solid var(--border);
}
.invoice-row:hover { background: oklch(100% 0 0 / 0.03); }
.invoice-row:last-child { border-bottom: none; }
.invoice-amount { font-family: var(--font-mono); font-weight: 600; text-align: right; }

.bar { display: flex; align-items: flex-end; height: 100px; gap: 6px; padding-top: 8px; }
.bar-col {
  flex: 1; background: linear-gradient(180deg, var(--accent), oklch(80% 0.18 125));
  border-radius: 4px 4px 2px 2px; position: relative; min-height: 6px;
  transition: opacity 200ms ease;
}
.bar-col:hover { opacity: 0.85; }
.bar-col[data-dim="true"] { background: oklch(100% 0 0 / 0.1); }

/* ========== Clients layout (split panel) ========== */

.clients-layout {
  display: grid; grid-template-columns: 340px 1fr;
  gap: 36px; padding: 14px 48px 80px;
  max-width: 1620px; margin: 0 auto; align-items: flex-start;
}
[data-density="compact"] .clients-layout { padding: 10px 32px 64px; gap: 24px; }

.clients-panel { position: sticky; top: 80px; display: flex; flex-direction: column; gap: 6px; }
.clients-panel-head { padding: 0 4px 12px; }
.clients-panel-head h2 {
  font-family: var(--font-display); font-size: 32px; font-weight: 600;
  letter-spacing: -0.03em; margin: 0 0 14px; line-height: 1;
}
.client-search {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-radius: 12px; background: var(--surface); border: 1px solid var(--border);
  font-size: 13px; color: var(--fg-muted);
  transition: border-color 180ms ease, background 180ms ease;
}
.client-search:focus-within { border-color: var(--accent); background: var(--surface-2); }
.client-search input {
  background: transparent; border: none; flex: 1; font-size: 13px;
  color: var(--fg); min-width: 0;
}
.client-search input::placeholder { color: var(--fg-dim); }

.client-tile-overview {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-radius: 16px;
  background: var(--accent); color: var(--accent-ink);
  margin: 14px 0 10px; cursor: pointer;
  border: 1px solid transparent;
  transition: transform 180ms ease, background 180ms ease;
}
.client-tile-overview:hover { transform: translateY(-1px); }
.client-tile-overview[data-active="false"] { background: var(--surface); color: var(--fg); border-color: var(--border); }
.client-tile-overview[data-active="false"]:hover { background: var(--surface-2); }
.client-tile-overview-icon {
  width: 34px; height: 34px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  background: oklch(0% 0 0 / 0.12); flex-shrink: 0;
}
.client-tile-overview[data-active="false"] .client-tile-overview-icon {
  background: var(--surface-2); border: 1px solid var(--border);
}
.client-tile-overview-text { display: flex; flex-direction: column; line-height: 1.1; min-width: 0; }
.client-tile-overview-text strong { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.client-tile-overview-text span { font-size: 11.5px; opacity: 0.7; margin-top: 4px; }

.clients-list {
  display: flex; flex-direction: column; gap: 4px;
  max-height: calc(100vh - 320px); overflow-y: auto; padding-right: 4px;
}

.client-tile {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  border-radius: 14px; background: var(--surface); border: 1px solid var(--border);
  cursor: pointer;
  transition: transform 180ms ease, background 180ms ease, border-color 180ms ease;
}
.client-tile:hover { background: var(--surface-2); transform: translateY(-1px); }
.client-tile[data-active="true"] {
  background: var(--surface-2); border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.client-tile-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-2); border: 1px solid var(--border-strong);
  font-family: var(--font-mono); font-size: 11px; font-weight: 600; flex-shrink: 0;
}
.client-tile-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.client-tile-body strong { font-size: 13.5px; font-weight: 600; letter-spacing: -0.01em; }
.client-tile-body span { font-size: 11.5px; color: var(--fg-muted); margin-top: 3px; }
.client-tile-meta { margin-left: auto; }
.client-content { min-width: 0; }

/* ========== Client Overview content ========== */

.client-overview-head { margin-bottom: 22px; }
.client-overview-head h1 {
  font-family: var(--font-display);
  font-size: clamp(40px, 4.8vw, 56px); font-weight: 600;
  letter-spacing: -0.04em; line-height: 1; margin: 0 0 10px;
}
.client-overview-head .sub { font-size: 14px; color: var(--fg-muted); }

.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
.stat-tile {
  padding: 22px; border-radius: var(--radius-lg);
  background: var(--surface); border: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 12px; min-height: 130px;
  transition: transform 180ms ease, border-color 180ms ease; position: relative;
}
.stat-tile:hover { transform: translateY(-1px); border-color: var(--border-strong); }
.stat-tile .label { font-size: 13px; color: var(--fg-muted); }
.stat-tile .value {
  font-family: var(--font-display); font-size: 56px; font-weight: 600;
  letter-spacing: -0.04em; line-height: 0.95; margin-top: auto;
}
.stat-tile[data-tone="warn"] .value { color: var(--warn); }
.stat-tile[data-tone="bad"] .value  { color: var(--danger); }
.stat-tile[data-tone="ok"] .value   { color: var(--ok); }

.overview-split { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; margin-bottom: 20px; }
.overview-block {
  padding: 22px; border-radius: var(--radius-lg);
  background: var(--surface); border: 1px solid var(--border); min-height: 360px;
}
.overview-block h3 {
  font-size: 16px; font-weight: 600; letter-spacing: -0.02em;
  margin: 0 0 16px; display: flex; align-items: center; gap: 10px;
}

.heute-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 14px; border-radius: 14px;
  background: var(--surface-2); border-left: 3px solid var(--accent);
  margin-bottom: 8px; cursor: pointer;
  transition: background 180ms ease, transform 180ms ease;
}
.heute-item:hover { background: var(--surface-3); transform: translateX(2px); }
.heute-item .top { display: flex; align-items: center; gap: 8px; }
.heute-item .top strong { font-size: 14px; font-weight: 600; }
.heute-item .top .time-pill {
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.04em;
  padding: 2px 7px; border-radius: 99px;
  background: oklch(100% 0 0 / 0.08); color: var(--fg-muted);
}
.heute-item .top .time-pill[data-tone="urgent"] { background: var(--accent-soft); color: var(--accent); }
.heute-item .top .time-pill[data-tone="asap"]   { background: oklch(72% 0.18 25 / 0.18); color: var(--danger); }
.heute-item .desc { font-size: 12.5px; color: var(--fg-muted); }

.attn-item {
  display: grid; grid-template-columns: 36px 1fr auto;
  align-items: center; gap: 12px; padding: 12px 14px;
  border-radius: 14px; background: var(--surface-2);
  margin-bottom: 8px; cursor: pointer;
  transition: background 180ms ease, transform 180ms ease;
}
.attn-item:hover { background: var(--surface-3); transform: translateY(-1px); }
.attn-score {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 12px; font-weight: 600;
  border: 1.5px solid var(--border-strong); color: var(--fg-2);
}
.attn-score[data-tone="warn"] { color: var(--warn); border-color: var(--warn); }
.attn-score[data-tone="bad"]  { color: var(--danger); border-color: var(--danger); }
.attn-body strong { font-size: 14px; font-weight: 600; display: block; }
.attn-body span   { font-size: 12px; color: var(--fg-muted); margin-top: 2px; display: block; }

.deadlines-block { padding: 22px; border-radius: var(--radius-lg); background: var(--surface); border: 1px solid var(--border); }
.deadlines-grid  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
.deadline-card {
  padding: 16px 18px; background: var(--surface-2); border-radius: 16px;
  border: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px;
  cursor: pointer; transition: transform 180ms ease, border-color 180ms ease;
}
.deadline-card:hover { transform: translateY(-2px); border-color: var(--border-strong); }
.deadline-card .pill {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 4px 9px; border-radius: 99px;
  background: oklch(100% 0 0 / 0.06); color: var(--fg-muted);
}
.deadline-card .pill[data-tone="today"]   { background: var(--accent-soft); color: var(--accent); }
.deadline-card .pill[data-tone="overdue"] { background: oklch(72% 0.18 25 / 0.16); color: var(--danger); }
.deadline-card h4   { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
.deadline-card .meta { font-size: 12px; color: var(--fg-muted); }

/* ========== Kanban (Tasks) ========== */

.kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; align-items: flex-start; }
.kanban-col {
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px; border-radius: var(--radius-lg);
  background: var(--surface); border: 1px solid var(--border);
}
.kanban-col-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 4px 8px;
}
.task-card {
  padding: 12px; background: var(--surface-2); border-radius: 12px;
  border: 1px solid var(--border); cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease;
}
.task-card:hover { transform: translateY(-1px); border-color: var(--border-strong); }
```

- [ ] **Step 3: Update `tailwind.config.ts`** — add Geist to fontFamily

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#D0FC69',
          light: '#DFFE8A',
          dark: '#BCED4F',
        },
      },
      fontFamily: {
        sans: ['"Geist"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 4: Verify build compiles without errors**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css tailwind.config.ts public/fonts/
git commit -m "feat(design): oklch design system, Geist font, CSS component classes"
```

---

### Task 2: App Layout + Topbar + NavSidebar

**Files:**
- Create: `src/components/layout/Topbar.tsx`
- Modify: `src/components/layout/NavSidebar.tsx` (rewrite with `.sidebar` classes)
- Modify: `src/App.tsx` (switch outer div from `flex` to `.app` CSS grid, add `<Topbar />`)

- [ ] **Step 1: Create `src/components/layout/Topbar.tsx`**

```tsx
import type { ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'
import { Sun, Bell, Plus, Search } from 'lucide-react'

export function Topbar({ children }: { children?: ReactNode }) {
  const setCmdPaletteOpen = useUiStore(s => s.setCmdPaletteOpen)
  const toggleTheme       = useUiStore(s => s.toggleTheme)

  return (
    <div className="topbar">
      <div
        className="search-pill glass"
        onClick={() => setCmdPaletteOpen(true)}
        role="button"
        tabIndex={0}
      >
        <Search size={15} />
        <span>Suche oder springe zu…</span>
        <span className="kbd">⌘ K</span>
      </div>
      {children}
      <button className="icon-btn glass" onClick={toggleTheme} title="Theme wechseln">
        <Sun size={16} />
      </button>
      <button className="icon-btn glass" title="Benachrichtigungen">
        <Bell size={16} />
      </button>
      <button className="btn-primary" onClick={() => setCmdPaletteOpen(true)}>
        <Plus size={14} /> Neu
        <span className="mono" style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>⌘N</span>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `src/components/layout/NavSidebar.tsx`**

```tsx
import { useUiStore, type AppView } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import {
  LayoutDashboard, Users, FileText, CheckSquare,
  Calendar, Mail, Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function SidebarNavItem({
  icon: Ic, label, active, onClick, badge, kbd,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; kbd?: string
}) {
  return (
    <div className="nav-item" data-active={String(active)} onClick={onClick}>
      <Ic size={17} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
      {kbd && !badge ? <span className="nav-kbd">{kbd}</span> : null}
    </div>
  )
}

export function NavSidebar() {
  const appView   = useUiStore(s => s.appView)
  const setAppView = useUiStore(s => s.setAppView)
  const user      = useAuthStore(s => s.user)

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'CY'
  const displayName = user?.email?.split('@')[0] ?? 'User'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" data-tauri-drag-region>
        <div className="sidebar-brand-logo">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <path
              d="M58 18c-5 1-9 5-10 10-1 6 2 11 7 14 6 3 13 1 17-4 4-6 3-14-3-19-3-2-7-2-11-1Zm-22 38c-5 1-9 6-10 11-1 6 3 12 9 14 7 2 14-2 17-9 2-7-2-15-9-17-2-1-5-1-7 1Z"
              fill="oklch(15% 0 0)"
            />
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <strong>Focus</strong>
          <span>CYNERA · 2026</span>
        </div>
      </div>

      <div className="sidebar-section">Workspace</div>
      <SidebarNavItem icon={LayoutDashboard} label="Dashboard" active={appView === 'dashboard'} onClick={() => setAppView('dashboard')} kbd="H" />
      <SidebarNavItem icon={Users}           label="Clients"   active={appView === 'clients'}   onClick={() => setAppView('clients')}   kbd="C" />
      <SidebarNavItem icon={FileText}        label="Finanzen"  active={appView === 'invoices'}  onClick={() => setAppView('invoices')}  kbd="F" />
      <SidebarNavItem icon={CheckSquare}     label="Tasks"     active={appView === 'tasks'}     onClick={() => setAppView('tasks')}     kbd="T" />

      <div className="sidebar-section">Inbox</div>
      <SidebarNavItem icon={Calendar} label="Calendar" active={appView === 'calendar'} onClick={() => setAppView('calendar')} kbd="K" />
      <SidebarNavItem icon={Mail}     label="Mail"     active={appView === 'mail'}     onClick={() => setAppView('mail')}     kbd="M" />

      <div style={{ flex: 1 }} />

      <SidebarNavItem icon={Settings} label="Settings" active={appView === 'settings'} onClick={() => setAppView('settings')} />

      <div className="sidebar-user" onClick={() => setAppView('profile')}>
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-text">
          <strong>{displayName}</strong>
          <span>Cynera Focus</span>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Update `src/App.tsx`** — switch layout div to `.app` grid and add `<Topbar />`

Change the `return` statement. Import `Topbar` at the top:

```tsx
import { Topbar } from '@/components/layout/Topbar'
```

Replace the return block (keep all existing imports and logic above it intact):

```tsx
  return (
    <AppShell>
      <div className="app">
        <NavSidebar />
        <main className="main">
          <Topbar />
          <ErrorBoundary>
            {renderMain()}
          </ErrorBoundary>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
    </AppShell>
  )
```

- [ ] **Step 4: Verify the app starts without runtime errors**

Run: `npm run dev`
Expected: App renders with new sidebar (glass logo, sections, user card) and sticky topbar (search pill, bell, +Neu button). No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Topbar.tsx src/components/layout/NavSidebar.tsx src/App.tsx
git commit -m "feat(layout): new CSS-grid app shell, Topbar, redesigned NavSidebar"
```

---

### Task 3: DashboardRoute (Heute view)

**Files:**
- Modify: `src/routes/DashboardRoute.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite `src/routes/DashboardRoute.tsx`**

```tsx
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import type { Customer } from '@/types/customer.types'

const AGENDA = [
  { time: '09:00', title: 'Q2 Strategy Call',         sub: 'GreenLeaf Organic · Video', pill: 'JETZT', tone: 'now',    now: true  },
  { time: '10:00', title: 'Brand Guidelines Review',   sub: 'TechCorp · Zoom',           pill: 'CALL',  tone: 'accent', now: false },
  { time: '12:00', title: 'Mittagspause',              sub: '',                           pill: '',      tone: '',       now: false },
  { time: '14:00', title: 'Website Deployment',        sub: 'PixelStudio',               pill: 'DEPLOY', tone: 'warn', now: false },
  { time: '16:00', title: 'Daily Standup',             sub: 'Intern',                    pill: 'INTERN', tone: '',     now: false },
]

const DAYS    = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']

function attentionScore(c: Customer): number {
  let score = 75
  if (c.priority === 'high')    score -= 30
  if (c.status  === 'inaktiv')  score -= 20
  if (c.status  === 'lead')     score -= 10
  if (c.status  === 'lost')     score -= 40
  return Math.max(10, Math.min(99, score))
}

function StatCard({ label, value, trend, hint, trendColor }: {
  label: string; value: string; trend: string; hint: string; trendColor: string
}) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="card-label">{label}</span>
        <span className="mono" style={{ fontSize: 11, color: trendColor }}>{trend}</span>
      </div>
      <div className="stat-row">
        <span className="stat-value">{value}</span>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>{hint}</span>
    </div>
  )
}

export function DashboardRoute() {
  const customers  = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const user       = useAuthStore(s => s.user)

  const now         = new Date()
  const dateStr     = `${DAYS[now.getDay()]} · ${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
  const firstName   = user?.email?.split('@')[0] ?? 'User'

  const aktiv       = customers.filter(c => c.status === 'aktiv').length
  const highPrio    = customers.filter(c => c.priority === 'high')
  const attnClients = [...customers].sort((a, b) => attentionScore(a) - attentionScore(b)).slice(0, 3)
  const prioCards   = highPrio.slice(0, 3)

  return (
    <div className="main-inner">
      {/* Greeting */}
      <div className="greeting">
        <h1 className="greeting-title">
          Guten Morgen,<br /><em>{firstName}.</em>
        </h1>
        <div className="greeting-sub">
          <span>{dateStr}</span>
          <span><strong>{highPrio.length} Clients</strong> brauchen Aufmerksamkeit</span>
          <span>Health Score Ø <strong>72</strong></span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="row-4">
        <StatCard label="Aktive Clients"  value={String(aktiv)}          trend="+2"  hint="Diese Woche"    trendColor="var(--ok)"   />
        <StatCard label="Offene Tasks"    value={String(highPrio.length)} trend={highPrio.length > 3 ? "↑" : "↓"} hint="High Priority" trendColor={highPrio.length > 3 ? "var(--warn)" : "var(--ok)"} />
        <StatCard label="Outstanding €"   value="21.8k"                  trend="+8.4k" hint="2 überfällig" trendColor="var(--warn)"  />
        <StatCard label="Wochenfokus"     value="68%"                    trend="+12%" hint="Fokus-Sessions" trendColor="var(--ok)"   />
      </div>

      {/* Priority Cards */}
      {prioCards.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 0 }}>
            <h2>Drei Dinge heute <span className="count">{String(prioCards.length).padStart(2, '0')}</span></h2>
          </div>
          <div className="priorities">
            {prioCards.map((c, i) => (
              <div
                key={c.id}
                className="prio-card"
                data-tone={i === 0 ? 'hero' : ''}
                onClick={() => setSelected(c.id)}
              >
                <div className="prio-num">0{i + 1}</div>
                <h3 className="prio-title">{c.name}</h3>
                <p className="prio-meta">{c.company ?? 'Aufmerksamkeit erforderlich'}</p>
                <div className="prio-foot">
                  <span className="prio-chip">{c.status === 'lead' ? 'Lead' : c.status === 'aktiv' ? 'Aktiv' : 'Inaktiv'}</span>
                  <span>Score {attentionScore(c)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Row: Tagesplan + Aufmerksamkeit */}
      <div className="row">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Tagesplan</h2>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{AGENDA.length} EVENTS</span>
          </div>
          <div className="timeline">
            <div className="tl-bar" />
            {AGENDA.map((a, i) => (
              <div key={i} className="tl-row" data-now={String(a.now)}>
                <span className="tl-time">{a.time}</span>
                <div className="tl-dot" />
                <div className="tl-body" style={{ paddingLeft: 14 }}>
                  <span className="tl-title">{a.title}</span>
                  {a.sub && <span className="tl-sub">{a.sub}</span>}
                </div>
                {a.pill && <span className="tl-pill" data-tone={a.tone}>{a.pill}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Benötigt Aufmerksamkeit</h2>
            {attnClients.length > 0 && <span className="chip" data-tone="bad">{attnClients.length} clients</span>}
          </div>
          {attnClients.length === 0 ? (
            <p className="empty" style={{ padding: '24px 0' }}>Alles im grünen Bereich ✓</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {attnClients.map(c => (
                <div key={c.id} className="client-row" onClick={() => setSelected(c.id)}>
                  <div className="avatar">
                    {c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="client-name">{c.name}</div>
                    <div className="client-meta">{c.company ?? c.status}</div>
                  </div>
                  <span className="chip" data-tone={attentionScore(c) < 50 ? 'bad' : 'warn'}>
                    Score {attentionScore(c)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify DashboardRoute renders correctly**

Run: `npm run dev` → navigate to Dashboard
Expected: Large greeting, 4 stat cards in row-4, 3 priority prio-cards (first one accent/green hero), timeline agenda, attention list. All using new design classes.

- [ ] **Step 3: Commit**

```bash
git add src/routes/DashboardRoute.tsx
git commit -m "feat(dashboard): redesign with greeting, prio-cards, timeline, attention list"
```

---

### Task 4: ClientsRoute — split panel redesign

**Files:**
- Modify: `src/routes/ClientsRoute.tsx` (rewrite layout + list + overview)

- [ ] **Step 1: Rewrite `src/routes/ClientsRoute.tsx`**

Keep all imports for `useCustomersStore`, `useUiStore`, `CustomerModal`, `CustomerRoute`, `Customer`. Replace the component body:

```tsx
import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { CustomerRoute } from './CustomerRoute'
import type { Customer } from '@/types/customer.types'
import { Search } from 'lucide-react'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

function attentionScore(c: Customer): number {
  let score = 75
  if (c.priority === 'high')   score -= 30
  if (c.status  === 'inaktiv') score -= 20
  if (c.status  === 'lead')    score -= 10
  if (c.status  === 'lost')    score -= 40
  return Math.max(10, Math.min(99, score))
}

function ClientOverviewContent({ customers, onOpen }: { customers: Customer[]; onOpen: (id: string) => void }) {
  const highPrio    = customers.filter(c => c.priority === 'high')
  const needAttn    = customers.filter(c => c.priority === 'high' || c.status === 'inaktiv')
  const aktiv       = customers.filter(c => c.status === 'aktiv')
  const attnSorted  = [...needAttn].sort((a, b) => attentionScore(a) - attentionScore(b)).slice(0, 4)

  const deadlines = [
    { pill: 'Heute',     tone: 'today',   title: 'Brand Guidelines Review',  meta: 'TechCorp · 10:00'  },
    { pill: 'Heute',     tone: 'today',   title: 'Website Deployment',       meta: 'PixelStudio · 14:00' },
    { pill: 'Überfällig', tone: 'overdue', title: 'Budget Discussion',       meta: 'Sunrise Coffee · ASAP' },
  ]

  return (
    <>
      <div className="client-overview-head">
        <h1>Client Overview</h1>
        <div className="sub">Deine wichtigsten Prioritäten auf einen Blick</div>
      </div>

      <div className="stat-grid">
        {[
          { label: 'Gesamt Clients',             value: customers.length,   tone: ''     },
          { label: 'Benötigen Aufmerksamkeit',   value: needAttn.length,    tone: 'warn' },
          { label: 'Urgent Follow-Ups',           value: highPrio.length,    tone: 'warn' },
          { label: 'Aktive Clients',              value: aktiv.length,       tone: ''     },
        ].map(s => (
          <div key={s.label} className="stat-tile" data-tone={s.tone}>
            <span className="label">{s.label}</span>
            <span className="value">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="overview-split">
        <div className="overview-block">
          <h3>Heute wichtig</h3>
          {highPrio.slice(0, 4).map(c => (
            <div key={c.id} className="heute-item" onClick={() => onOpen(c.id)}>
              <div className="top">
                <strong>{c.name}</strong>
                <span className="time-pill" data-tone="">Aufmerksamkeit</span>
              </div>
              <div className="desc">{c.company ?? c.status}</div>
            </div>
          ))}
        </div>
        <div className="overview-block">
          <h3>Clients benötigen Aufmerksamkeit</h3>
          {attnSorted.map(c => (
            <div key={c.id} className="attn-item" onClick={() => onOpen(c.id)}>
              <div className="attn-score" data-tone={attentionScore(c) > 50 ? 'warn' : 'bad'}>
                {attentionScore(c)}
              </div>
              <div className="attn-body">
                <strong>{c.name}</strong>
                <span>{c.company ?? c.status}</span>
              </div>
              <span className="chip" data-tone="bad">urgent</span>
            </div>
          ))}
        </div>
      </div>

      <div className="deadlines-block">
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          Upcoming Deadlines
        </h3>
        <div className="deadlines-grid">
          {deadlines.map((d, i) => (
            <div key={i} className="deadline-card">
              <span className="pill" data-tone={d.tone}>{d.pill}</span>
              <h4>{d.title}</h4>
              <span className="meta">{d.meta}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function ClientsRoute() {
  const customers          = useCustomersStore(s => s.customers)
  const isLoading          = useCustomersStore(s => s.isLoading)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const setSelected        = useUiStore(s => s.setSelectedCustomer)

  const [search, setSearch]     = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="clients-layout">
      {/* Left panel — sticky list */}
      <aside className="clients-panel">
        <div className="clients-panel-head">
          <h2>Clients</h2>
          <div className="client-search">
            <Search size={14} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
            />
          </div>
        </div>

        <div
          className="client-tile-overview"
          data-active={String(!selectedCustomerId)}
          onClick={() => setSelected(null)}
        >
          <div className="client-tile-overview-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1.5"/>
              <rect x="14" y="3" width="7" height="5" rx="1.5"/>
              <rect x="14" y="12" width="7" height="9" rx="1.5"/>
              <rect x="3" y="16" width="7" height="5" rx="1.5"/>
            </svg>
          </div>
          <div className="client-tile-overview-text">
            <strong>Overview Dashboard</strong>
            <span>Alle Clients im Überblick</span>
          </div>
        </div>

        <div className="clients-list">
          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '8px 4px' }}>Lädt…</p>
          ) : (
            filtered.map(c => (
              <div
                key={c.id}
                className="client-tile"
                data-active={String(selectedCustomerId === c.id)}
                onClick={() => setSelected(c.id)}
              >
                <div className="client-tile-avatar">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="client-tile-body">
                  <strong>{c.name}</strong>
                  <span>{relativeTime(c.updatedAt)}</span>
                </div>
                {c.leadScore > 0 && (
                  <span className="client-tile-meta">
                    <span className="chip">{c.leadScore}</span>
                  </span>
                )}
              </div>
            ))
          )}
          {!isLoading && filtered.length === 0 && customers.length === 0 && (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, marginTop: 8, justifyContent: 'center' }}
              onClick={() => setShowModal(true)}
            >
              + Ersten Client anlegen
            </button>
          )}
        </div>
      </aside>

      {/* Right content */}
      <div className="client-content">
        {selectedCustomerId
          ? <CustomerRoute customerId={selectedCustomerId} />
          : <ClientOverviewContent customers={customers} onOpen={setSelected} />
        }
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Verify ClientsRoute renders correctly**

Run: `npm run dev` → navigate to Clients
Expected: 340px sticky left panel with client tiles + overview button. Right side shows overview with stat-grid, overview-split, deadlines. Clicking a client tile shows `CustomerRoute`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/ClientsRoute.tsx
git commit -m "feat(clients): split-panel layout with client tiles and overview dashboard"
```

---

### Task 5: InvoicesRoute (Finance view)

**Files:**
- Modify: `src/routes/InvoicesRoute.tsx` (implement full Finance view)

- [ ] **Step 1: Rewrite `src/routes/InvoicesRoute.tsx`**

```tsx
const INVOICES = [
  { id: 'INV-2026-041', client: 'TechCorp GmbH',     amount: 12400, due: '15.05.26', status: 'Ausstehend', paid: false },
  { id: 'INV-2026-040', client: 'PixelStudio',        amount: 3800,  due: '10.05.26', status: 'Bezahlt',    paid: true  },
  { id: 'INV-2026-039', client: 'GreenLeaf Organic',  amount: 8200,  due: '01.05.26', status: 'Überfällig', paid: false },
  { id: 'INV-2026-038', client: 'Sunrise Coffee',     amount: 4600,  due: '28.04.26', status: 'Bezahlt',    paid: true  },
  { id: 'INV-2026-037', client: 'WebAgency Berlin',   amount: 9100,  due: '20.04.26', status: 'Bezahlt',    paid: true  },
  { id: 'INV-2026-036', client: 'StartupXY',          amount: 2200,  due: '30.05.26', status: 'Entwurf',    paid: false },
]

const MONTH_DATA = [12, 18, 22, 15, 28, 32, 24, 38, 42, 35, 48, 52]

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k €'
  return n.toLocaleString('de-DE') + ' €'
}

function statusTone(status: string): string {
  if (status === 'Überfällig') return 'bad'
  if (status === 'Bezahlt')    return 'ok'
  if (status === 'Entwurf')    return ''
  return 'warn'
}

export function InvoicesRoute() {
  const total       = INVOICES.reduce((s, i) => s + i.amount, 0)
  const paid        = INVOICES.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
  const outstanding = total - paid
  const overdue     = INVOICES.filter(i => i.status === 'Überfällig').reduce((s, i) => s + i.amount, 0)
  const maxMonth    = Math.max(...MONTH_DATA)

  return (
    <div className="main-inner">
      <div className="greeting">
        <h1 className="greeting-title">Finance<em>.</em></h1>
        <div className="greeting-sub">
          <span>Mai 2026 · KW 20</span>
          <span>MTD <strong>{fmt(paid)}</strong></span>
        </div>
      </div>

      <div className="row-4">
        {[
          { label: 'Eingegangen',  value: fmt(paid),        sub: 'Diesen Monat',  color: 'var(--ok)'    },
          { label: 'Offen',        value: fmt(outstanding), sub: '3 Rechnungen',  color: 'var(--fg)'    },
          { label: 'Überfällig',   value: fmt(overdue),     sub: '1 Rechnung',    color: 'var(--danger)'},
          { label: 'Forecast Q2',  value: '142k €',         sub: '+12% vs Q1',    color: 'var(--accent)'},
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 18 }}>
            <span className="card-label">{s.label}</span>
            <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.04em', marginTop: 8, color: s.color, fontFamily: 'var(--font-mono)' }}>
              {s.value}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="row">
        {/* Revenue bar chart */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Umsatz · 12 Monate</h2>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>+24% YoY</span>
          </div>
          <div className="bar" style={{ height: 140 }}>
            {MONTH_DATA.map((v, i) => (
              <div key={i} className="bar-col" data-dim={String(i < 6)}
                   style={{ height: `${(v / maxMonth * 100)}%` }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            <span>JUN '25</span><span>SEP</span><span>DEZ</span><span>MRZ</span><span>MAI '26</span>
          </div>
        </div>

        {/* Cash Aging */}
        <div className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Cash-Aging</h2>
          {[
            { label: 'Nicht fällig', val: 23000, pct: 60, tone: 'ok'   },
            { label: '1–14 Tage',    val: 8200,  pct: 22, tone: ''     },
            { label: '15–30 Tage',   val: 4400,  pct: 12, tone: 'warn' },
            { label: '30+ Tage',     val: 3600,  pct: 6,  tone: 'bad'  },
          ].map((b, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span>{b.label}</span>
                <span className="mono">{fmt(b.val)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'oklch(100% 0 0 / 0.05)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${b.pct}%`,
                  background: b.tone === 'bad' ? 'var(--danger)' : b.tone === 'warn' ? 'var(--warn)' : b.tone === 'ok' ? 'var(--ok)' : 'var(--accent)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-head">
        <h2>Rechnungen <span className="count">{INVOICES.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost">Status</button>
          <button className="btn-ghost">Export</button>
          <button className="btn-primary">+ Rechnung</button>
        </div>
      </div>

      <div className="card" style={{ padding: 8 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 100px 90px 80px',
          gap: 14, padding: '12px 14px',
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          letterSpacing: '0.1em', color: 'var(--fg-dim)',
          textTransform: 'uppercase', borderBottom: '1px solid var(--border)',
        }}>
          <span>Rechnung</span><span>Client</span>
          <span style={{ textAlign: 'right' }}>Betrag</span>
          <span>Fällig</span>
          <span style={{ textAlign: 'right' }}>Status</span>
        </div>
        {INVOICES.map(inv => (
          <div key={inv.id} className="invoice-row">
            <span>{inv.id}</span>
            <span style={{ color: 'var(--fg-2)' }}>{inv.client}</span>
            <span className="invoice-amount">{fmt(inv.amount)}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{inv.due}</span>
            <span style={{ textAlign: 'right' }}>
              <span className="chip" data-tone={statusTone(inv.status)}>{inv.status}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify Finance route renders**

Run: `npm run dev` → navigate to Finanzen
Expected: Greeting "Finance.", 4 stat cards, 2-col row (bar chart + aging), invoice table with status chips.

- [ ] **Step 3: Commit**

```bash
git add src/routes/InvoicesRoute.tsx
git commit -m "feat(finance): redesign with bar chart, aging, invoice table"
```

---

### Task 6: TasksRoute — Kanban using useFocusStore

**Files:**
- Modify: `src/routes/TasksRoute.tsx` (rewrite with kanban layout, remove FocusArea delegation)

- [ ] **Step 1: Rewrite `src/routes/TasksRoute.tsx`**

```tsx
import { useFocusStore } from '@/store/focus.store'
import type { FocusBucket, FocusTodo } from '@/types/focus.types'

const BUCKETS: { id: FocusBucket; label: string }[] = [
  { id: 'today',     label: 'Heute'       },
  { id: 'tomorrow',  label: 'Morgen'      },
  { id: 'this_week', label: 'Diese Woche' },
  { id: 'later',     label: 'Später'      },
]

function TaskCard({ todo, onRemove }: { todo: FocusTodo; onRemove: (id: string) => void }) {
  return (
    <div className="task-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <strong style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{todo.title}</strong>
        <button
          onClick={() => onRemove(todo.id)}
          style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8, flexShrink: 0, opacity: 0, transition: 'opacity 180ms' }}
          className="task-delete"
        >
          ✕
        </button>
      </div>
      {todo.customer && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{todo.customer}</div>
      )}
      {todo.notes && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4, lineHeight: 1.4 }}>{todo.notes}</div>
      )}
    </div>
  )
}

export function TasksRoute() {
  const todos  = useFocusStore(s => s.todos)
  const add    = useFocusStore(s => s.add)
  const remove = useFocusStore(s => s.remove)

  return (
    <div className="main-inner">
      <div className="greeting">
        <h1 className="greeting-title">Tasks<em>.</em></h1>
        <div className="greeting-sub">
          <span>{todos.length} aktiv · {todos.filter(t => t.when === 'today').length} heute</span>
          <span>Fokus heute <strong>2h 15m</strong></span>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>Alle Tasks</h2>
        <button className="btn-primary" onClick={() => add({ title: 'Neue Task', when: 'today' })}>
          + Neue Task
        </button>
      </div>

      <div className="kanban">
        {BUCKETS.map(b => {
          const items = todos.filter(t => t.when === b.id)
          return (
            <div key={b.id} className="kanban-col">
              <div className="kanban-col-head">
                <span className="card-label">{b.label}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{items.length}</span>
              </div>
              {items.map(t => (
                <TaskCard key={t.id} todo={t} onRemove={remove} />
              ))}
              {items.length === 0 && (
                <div style={{ padding: '12px 4px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center' }}>
                  Keine Tasks
                </div>
              )}
            </div>
          )
        })}
      </div>

      <style>{`.task-card:hover .task-delete { opacity: 1 !important; }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Verify TasksRoute renders**

Run: `npm run dev` → navigate to Tasks
Expected: Greeting "Tasks.", 4 kanban columns (Heute / Morgen / Diese Woche / Später) with task cards from `useFocusStore`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/TasksRoute.tsx
git commit -m "feat(tasks): kanban redesign using useFocusStore, 4 columns"
```

---

### Task 7: MailRoute — restyle keeping all IMAP logic

**Files:**
- Modify: `src/routes/MailRoute.tsx` (restyle outer layout; keep all store/IMAP/AccountSetupForm logic intact)

The MailRoute has a 3-panel layout with complex IMAP state. This task only restyles the outermost structural wrappers and the mail-list items. Do NOT touch `useMailStore`, `useCustomersStore`, `AccountSetupForm`, or any sync/IMAP logic.

- [ ] **Step 1: Read the current `src/routes/MailRoute.tsx` to understand its structure**

Use the Read tool on `src/routes/MailRoute.tsx` to see the current render output.

- [ ] **Step 2: Restyle the MailRoute layout**

In the MailRoute return value:
1. Replace the outer wrapper `<div className="flex h-full ...">` with `<div className="main-inner" style={{ paddingBottom: 24 }}>`.
2. Add a greeting section at the top:
   ```tsx
   <div className="greeting" style={{ marginBottom: 18 }}>
     <h1 className="greeting-title">Mail<em>.</em></h1>
     <div className="greeting-sub">
       <span>Posteingang</span>
       <span>Sync aktiv</span>
     </div>
   </div>
   ```
3. Replace any remaining outer `bg-[var(--bg1)]` panels for the mail list with `className="card"` and `style={{ padding: 8, overflowY: 'auto' }}`.
4. In the mail list items, replace Tailwind classes with the `.mail-item` pattern:
   ```tsx
   <div className="mail-item" data-unread={String(!msg.isRead)}>
     <span className="mail-dot" />
     <div className="avatar">{senderInitial}</div>
     <div className="mail-body">
       <div className="mail-from">{senderName}</div>
       <div className="mail-subj">{subject}</div>
     </div>
     <span className="mail-time">{time}</span>
   </div>
   ```
5. Apply new class names while keeping all prop drilling, store hooks, and event handlers unchanged.

- [ ] **Step 3: Verify MailRoute renders and IMAP sync still works**

Run: `npm run dev` → navigate to Mail
Expected: Greeting "Mail.", left card panel shows mail items with `.mail-item` design (mail-dot, avatar, mail-from, mail-subj). Account setup form still opens if no accounts configured.

- [ ] **Step 4: Commit**

```bash
git add src/routes/MailRoute.tsx
git commit -m "feat(mail): restyle with greeting and mail-item design system"
```

---

### Task 8: CalendarRoute — week view

**Files:**
- Modify: `src/routes/CalendarRoute.tsx` (implement week grid, replacing placeholder)

- [ ] **Step 1: Rewrite `src/routes/CalendarRoute.tsx`**

```tsx
const DAYS  = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DATES = ['18', '19', '20', '21', '22', '23', '24']
const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i)

const EVENTS = [
  { day: 0, start: 9,  end: 10, title: 'Q2 Strategy Call',         client: 'GreenLeaf',  tone: 'accent' },
  { day: 0, start: 10, end: 11, title: 'Brand Guidelines Review',   client: 'TechCorp',   tone: 'accent' },
  { day: 1, start: 14, end: 15, title: 'Website Deployment',        client: 'PixelStudio', tone: 'warn'  },
  { day: 2, start: 11, end: 12, title: 'Kick-off Meeting',          client: 'StartupXY',  tone: ''       },
  { day: 3, start: 15, end: 16, title: 'Rechnung Q1 besprechen',    client: 'BigCo',      tone: ''       },
  { day: 4, start: 9,  end: 10, title: 'Weekly Sync',               client: 'Intern',     tone: ''       },
]

function eventBg(tone: string) {
  if (tone === 'accent') return 'var(--accent)'
  if (tone === 'warn')   return 'oklch(82% 0.16 70 / 0.18)'
  return 'var(--surface-2)'
}
function eventFg(tone: string) {
  if (tone === 'accent') return 'var(--accent-ink)'
  if (tone === 'warn')   return 'var(--warn)'
  return 'var(--fg)'
}
function eventBorder(tone: string) {
  if (tone === 'accent') return 'transparent'
  if (tone === 'warn')   return 'oklch(82% 0.16 70 / 0.4)'
  return 'var(--border-strong)'
}

export function CalendarRoute() {
  return (
    <div className="main-inner">
      <div className="greeting" style={{ marginBottom: 18 }}>
        <h1 className="greeting-title">Calendar<em>.</em></h1>
        <div className="greeting-sub">
          <span>KW 20 · 18.–24. Mai</span>
          <span>13 Termine · 2 Konflikte</span>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>Diese Woche</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost">← Zurück</button>
          <button className="btn-ghost">Heute</button>
          <button className="btn-ghost">Weiter →</button>
          <button className="btn-primary">+ Event</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          <div />
          {DAYS.map((d, i) => (
            <div key={d} style={{ padding: '14px 12px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>{d.toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4, color: i === 0 ? 'var(--accent)' : 'var(--fg)' }}>{DATES[i]}</div>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: 56, paddingRight: 12, paddingTop: 4, textAlign: 'right' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{String(h).padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>
          {DAYS.map((_d, col) => (
            <div key={col} style={{ borderLeft: '1px solid var(--border)', position: 'relative', minHeight: HOURS.length * 56 }}>
              {HOURS.map((_, hi) => (
                <div key={hi} style={{ height: 56, borderBottom: hi < HOURS.length - 1 ? '1px solid oklch(100% 0 0 / 0.025)' : 'none' }} />
              ))}
              {EVENTS.filter(e => e.day === col).map((e, ei) => (
                <div key={ei} style={{
                  position: 'absolute', left: 4, right: 4,
                  top: (e.start - 8) * 56 + 2,
                  height: (e.end - e.start) * 56 - 4,
                  background: eventBg(e.tone), color: eventFg(e.tone),
                  padding: '6px 10px', borderRadius: 8,
                  border: `1px solid ${eventBorder(e.tone)}`,
                  fontSize: 11.5, lineHeight: 1.3,
                  overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 180ms ease',
                }}
                onMouseEnter={ev => (ev.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'}
                onMouseLeave={ev => (ev.currentTarget as HTMLDivElement).style.transform = ''}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{e.title}</div>
                  <div style={{ opacity: 0.7, fontSize: 10.5 }}>{e.client}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify CalendarRoute renders**

Run: `npm run dev` → navigate to Calendar
Expected: Greeting "Calendar.", 7-column week grid (Mo–So), hour rows 08–18, colored events in correct slots.

- [ ] **Step 3: Commit**

```bash
git add src/routes/CalendarRoute.tsx
git commit -m "feat(calendar): week-view grid with mock events"
```

---

### Task 9: CustomerRoute + CommandPalette — restyle

**Files:**
- Modify: `src/routes/CustomerRoute.tsx` (restyle header + tabs with sliding indicator)
- Modify: `src/components/CommandPalette.tsx` (restyle to `.command-backdrop` + `.command.glass` classes)

- [ ] **Step 1: Read `src/routes/CustomerRoute.tsx` fully**

Use the Read tool on the full file to see the existing render output (the summary had first 80 lines).

- [ ] **Step 2: Restyle CustomerRoute header and tabs**

In `CustomerRoute`, replace the existing header/tab section with the `.detail-head` pattern + glass tabs with JS sliding indicator:

```tsx
import { useRef, useState, useLayoutEffect } from 'react'
import { ChevronLeft, Phone, Mail as MailIcon, Plus } from 'lucide-react'

// Add this inside CustomerRoute, before the return:
const tabsRef = useRef<HTMLDivElement>(null)
const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 })

useLayoutEffect(() => {
  const el = tabsRef.current
  if (!el) return
  const active = el.querySelector(`[data-active="true"]`) as HTMLElement | null
  if (!active) return
  const rect = active.getBoundingClientRect()
  const parentRect = el.getBoundingClientRect()
  setIndicator({ left: rect.left - parentRect.left, width: rect.width, opacity: 1 })
}, [activeTab])
```

Replace the header JSX with:
```tsx
<div className="detail-head">
  <button className="back" onClick={() => setSelected(null)}>
    <ChevronLeft size={16} />
  </button>
  <div className="avatar" style={{ width: 56, height: 56, borderRadius: 16, fontSize: 18 }}>
    {customer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
  </div>
  <div style={{ flex: 1 }}>
    <h1>{customer.name}</h1>
    <div className="sub">Letzte Aktivität: {relativeTime(customer.updatedAt)} · {customer.status} · Score {customer.leadScore}</div>
  </div>
  <button className="btn-ghost"><Phone size={13} /> Anrufen</button>
  <button className="btn-ghost"><MailIcon size={13} /> Mail</button>
  <button className="btn-primary" onClick={() => setShowEdit(true)}>
    <Plus size={13} /> Neue Aktion
  </button>
</div>
```

Replace the tabs section with:
```tsx
<div style={{ marginBottom: 22 }}>
  <div className="tabs glass" ref={tabsRef}>
    <div
      className="tab-indicator"
      style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
    />
    {TABS.map(t => (
      <div
        key={t.id}
        className="tab"
        data-active={String(activeTab === t.id)}
        onClick={() => setTab(t.id)}
      >
        <TabIcon id={t.id} />
        {t.label}
      </div>
    ))}
  </div>
</div>
```

Keep all existing tab pane rendering (`DashboardPane`, `WorkflowPane`, etc.) and all store loading `useEffect` calls unchanged.

- [ ] **Step 3: Read `src/components/CommandPalette.tsx` to understand current structure**

Use the Read tool.

- [ ] **Step 4: Restyle CommandPalette**

In `CommandPalette.tsx`, replace the wrapper divs with the new design classes:
- Outer backdrop: use `className="command-backdrop"` (clicking calls `onClose`)
- Inner container: use `className="command glass"` (stops propagation)
- Input: use `className="command-input"`
- List container: use `className="command-list"`
- Group headers: use `className="command-group"`
- Items: use `className="command-item"` with `data-selected={String(isSelected)}`
- Keep all existing keyboard navigation, search filtering, and route jump logic unchanged.

- [ ] **Step 5: Verify CustomerRoute and CommandPalette**

Run: `npm run dev`
- Navigate to Clients → click a client → check header and sliding glass tabs
- Open Command Palette (⌘K) → check glassmorphic overlay, search, keyboard nav

Expected: `.detail-head` with back button + avatar + name + sub. Glass tabs with animated indicator. Command palette has dark frosted glass backdrop + pop-in animation.

- [ ] **Step 6: Commit**

```bash
git add src/routes/CustomerRoute.tsx src/components/CommandPalette.tsx
git commit -m "feat(customer): detail-head + glass tabs with sliding indicator; restyle CommandPalette"
```

---

## Self-Review

**Spec coverage check:**
- Task 1 ✅ oklch design tokens, Geist font, all component CSS classes, compat aliases
- Task 2 ✅ CSS grid app shell, new Topbar (search pill, icon buttons, +Neu), new NavSidebar (brand, sections, user card)
- Task 3 ✅ DashboardRoute — greeting, stat cards, prio-cards (hero + normal), timeline, attention list
- Task 4 ✅ ClientsRoute — `.clients-layout` 340px sticky panel, client tiles, overview with stat-grid + overview-split + deadlines
- Task 5 ✅ InvoicesRoute — greeting, 4 stat cards, bar chart, cash-aging, invoice table with status chips
- Task 6 ✅ TasksRoute — 4-column kanban using `useFocusStore`
- Task 7 ✅ MailRoute — restyle keeping IMAP logic intact
- Task 8 ✅ CalendarRoute — week grid with mock events
- Task 9 ✅ CustomerRoute detail-head + glass tabs; CommandPalette restyled

**Compat aliases verified:** `--text`, `--text2`, `--text3`, `--bg1`, `--bg2`, `--bg3`, `--p`, `--p2`, `--p3`, `--border2`, `--green`, `--red`, `--amber` are all aliased in both dark and light themes — sub-components not restyled in this sprint (DashboardPane, WorkflowPane, etc.) continue to work.

**Type consistency:** `attentionScore(c: Customer)` defined in Tasks 3 and 4 independently (no shared import needed since each route is self-contained). `FocusBucket` and `FocusTodo` from `@/types/focus.types` used correctly in Task 6. `data-active` and `data-now` attributes use `String(bool)` (not JSX bool) to match CSS attribute selectors.
