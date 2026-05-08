# Cynera v2 — Complete Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Cynera's entire UI from scratch with a light-primary theme, 3-column customer layout, Health Score system, category filtering, and a simulated AI panel — while preserving all store logic.

**Architecture:** All `src/components/` are deleted and rebuilt from zero. `src/store/index.js` receives additive extensions (healthScores, deadlines, category/status on customers, hasSeenIntro). CSS tokens are replaced with a light-primary palette. Dark mode stays as optional toggle. The AI panel is fully simulated — no API calls.

**Tech Stack:** React 18, Zustand 4, framer-motion, Vite, Tauri v1

---

## File Map

### Modified
| File | Change |
|---|---|
| `src/styles/globals.css` | Full token replacement — light primary |
| `src/store/index.js` | Add healthScores, deadlines, category/status, hasSeenIntro, bump persist key |
| `src/utils/helpers.js` | Add healthStatus, healthLabel, healthColor, generateWhatMatters |
| `src/App.jsx` | Full rebuild — intro/overview/customer routing |

### Deleted (entire directories rebuilt)
- `src/components/dashboard/`
- `src/components/uebersicht/`
- `src/components/layout/` (rebuilt below)

### Kept as-is (only token update via CSS vars)
- `src/components/todos/TodoPane.jsx`
- `src/components/notes/NotesPane.jsx`
- `src/components/kpis/KpisPane.jsx`
- `src/components/ablage/AblagePane.jsx`
- `src/components/ui/Avatar.jsx`
- `src/components/ui/Modal.jsx`
- `src/components/ui/Toast.jsx`
- `src/components/CommandPalette.jsx`

### New Files
| File | Purpose |
|---|---|
| `src/components/intro/IntroScreen.jsx` | Animated splash screen |
| `src/components/layout/TopBar.jsx` | "Today in Cynera" + search + New Client |
| `src/components/layout/Sidebar.jsx` | Client list with category filter |
| `src/components/overview/ClientOverview.jsx` | Stat cards + filter + client table |
| `src/components/customer/CustomerHeader.jsx` | Avatar + name + tabs + health score |
| `src/components/customer/CustomerView.jsx` | Assembles header + tab content + AI panel |
| `src/components/dashboard/CustomerDashboard.jsx` | What matters today + health cards + deadlines + KPI snapshot |
| `src/components/ai-panel/AiPanel.jsx` | Simulated AI right panel |
| `src/components/tabs/HistorieTab.jsx` | Activity timeline |
| `src/components/tabs/HealthTab.jsx` | View/edit health score metrics |
| `src/components/tabs/KommunikationTab.jsx` | Placeholder |
| `src/test/store/healthDeadlines.test.js` | Tests for new store slices |

---

## Phase 1 — Foundation

### Task 1: CSS Token Replacement

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Replace the entire `:root` block and theme overrides**

Replace the full contents of `src/styles/globals.css` with:

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:    #F4F4F8;
  --bg1:   #FFFFFF;
  --bg2:   #F0EFF8;
  --bg3:   #E8E7F4;
  --bg4:   #DDD9F0;
  --bg5:   #D1CBE8;

  --p:     #7C3AED;
  --p2:    #6D28D9;
  --p3:    #C4B5FD;
  --p4:    #EDE9FE;
  --p5:    rgba(124,58,237,0.08);
  --p6:    rgba(124,58,237,0.14);

  --border:  rgba(0,0,0,0.08);
  --border2: rgba(0,0,0,0.13);
  --border3: rgba(124,58,237,0.25);

  --text:  #111827;
  --text2: #4B5563;
  --text3: #9CA3AF;
  --text4: #D1D5DB;

  --green: #22C55E;
  --red:   #EF4444;
  --amber: #F59E0B;
  --blue:  #3B82F6;

  --r-xs:  4px;
  --r-sm:  8px;
  --r-md:  12px;
  --r-lg:  16px;
  --r-xl:  20px;
  --r-pill: 999px;

  --shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.10);

  --r: var(--r-md);
  --shadow: var(--shadow-md);
}

[data-theme="dark"] {
  --bg:    #0C0C0F;
  --bg1:   #111115;
  --bg2:   #16161B;
  --bg3:   #1C1C23;
  --bg4:   #23232C;
  --bg5:   #2A2A36;
  --border:  rgba(124,58,237,0.08);
  --border2: rgba(124,58,237,0.16);
  --border3: rgba(124,58,237,0.28);
  --text:  #F0F0FF;
  --text2: #8B8BA7;
  --text3: #4A4A6A;
  --text4: #2E2E48;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.30);
  --shadow-md: 0 4px 24px rgba(0,0,0,0.50);
  --shadow-lg: 0 8px 48px rgba(0,0,0,0.65);
}

html, body, #root {
  height: 100%;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

button { font-family: inherit; }
input, textarea { font-family: inherit; }

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes wordAppear {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Verify app compiles and opens without errors**

```bash
npm run dev
```

Expected: app loads, colors look light/white. Existing components will look different — that's expected.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: replace CSS tokens with light-primary theme (v2)"
```

---

### Task 2: Store Extensions

**Files:**
- Modify: `src/store/index.js`

- [ ] **Step 1: Write failing tests for new store actions**

Create `src/test/store/healthDeadlines.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../store'

beforeEach(() => {
  useStore.setState({
    customers: [],
    healthScores: [],
    deadlines: [],
    hasSeenIntro: false,
  })
})

describe('healthScores', () => {
  it('addHealthScore creates entry with customerId', () => {
    useStore.getState().addHealthScore('c1', { score: 82, engagement: 88, onTimeDelivery: 95 })
    const hs = useStore.getState().healthScores
    expect(hs).toHaveLength(1)
    expect(hs[0].customerId).toBe('c1')
    expect(hs[0].score).toBe(82)
    expect(hs[0].id).toBeTruthy()
  })

  it('updateHealthScore merges fields by id', () => {
    useStore.getState().addHealthScore('c1', { score: 70, engagement: 60, onTimeDelivery: 80 })
    const id = useStore.getState().healthScores[0].id
    useStore.getState().updateHealthScore(id, { score: 85 })
    expect(useStore.getState().healthScores[0].score).toBe(85)
    expect(useStore.getState().healthScores[0].engagement).toBe(60)
  })
})

describe('deadlines', () => {
  it('addDeadline creates entry', () => {
    useStore.getState().addDeadline('c1', { title: 'Campaign', date: '2026-05-10', priority: 'high' })
    const dl = useStore.getState().deadlines
    expect(dl).toHaveLength(1)
    expect(dl[0].title).toBe('Campaign')
    expect(dl[0].priority).toBe('high')
  })

  it('deleteDeadline removes by id', () => {
    useStore.getState().addDeadline('c1', { title: 'X', date: '2026-05-10', priority: 'low' })
    const id = useStore.getState().deadlines[0].id
    useStore.getState().deleteDeadline(id)
    expect(useStore.getState().deadlines).toHaveLength(0)
  })
})

describe('addCustomer with category/status', () => {
  it('stores category and status', () => {
    useStore.getState().addCustomer({ name: 'Test GmbH', category: 'Buchhaltung', status: 'aktiv' })
    const c = useStore.getState().customers[0]
    expect(c.category).toBe('Buchhaltung')
    expect(c.status).toBe('aktiv')
  })
})

describe('hasSeenIntro', () => {
  it('setHasSeenIntro sets to true', () => {
    expect(useStore.getState().hasSeenIntro).toBe(false)
    useStore.getState().setHasSeenIntro()
    expect(useStore.getState().hasSeenIntro).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test src/test/store/healthDeadlines.test.js
```

Expected: multiple failures — `healthScores`, `deadlines`, `setHasSeenIntro` not defined.

- [ ] **Step 3: Add new state and actions to `src/store/index.js`**

Inside the `persist((set, get) => ({` block, add after `uploadedFiles: [],`:

```js
healthScores: [],
deadlines: [],
hasSeenIntro: false,
```

Add after the `toggleTheme` action:

```js
setHasSeenIntro: () => set({ hasSeenIntro: true }),
```

Add after `deleteFile`:

```js
// ── Health Scores ─────────────────────────────────────────
addHealthScore: (customerId, data) => {
  const h = { id: uid(), customerId, updatedAt: now(), ...data }
  set((s) => ({ healthScores: [h, ...s.healthScores.filter(x => x.customerId !== customerId)] }))
  return h
},
updateHealthScore: (id, data) =>
  set((s) => ({ healthScores: s.healthScores.map((h) => h.id === id ? { ...h, ...data, updatedAt: now() } : h) })),
getHealthScore: (customerId) => get().healthScores.find(h => h.customerId === customerId) ?? null,

// ── Deadlines ─────────────────────────────────────────────
addDeadline: (customerId, data) => {
  const d = { id: uid(), customerId, createdAt: now(), ...data }
  set((s) => ({ deadlines: [...s.deadlines, d] }))
  return d
},
updateDeadline: (id, data) =>
  set((s) => ({ deadlines: s.deadlines.map((d) => d.id === id ? { ...d, ...data } : d) })),
deleteDeadline: (id) => set((s) => ({ deadlines: s.deadlines.filter((d) => d.id !== id) })),
getDeadlines: (customerId) => get().deadlines.filter(d => d.customerId === customerId).sort((a, b) => new Date(a.date) - new Date(b.date)),
```

In `deleteCustomer`, add cleanup for the new entities. Find the line `uploadedFiles: s.uploadedFiles.filter((f) => f.customerId !== id),` and add after it:

```js
healthScores: s.healthScores.filter((h) => h.customerId !== id),
deadlines: s.deadlines.filter((d) => d.customerId !== id),
```

Change the `theme` default from `"dark"` to `"light"`:

```js
theme: "light",
```

In `partialize`, add `healthScores`, `deadlines`, `hasSeenIntro`:

```js
partialize: (s) => ({
  customers: s.customers,
  todos: s.todos,
  notes: s.notes,
  kpis: s.kpis,
  folders: s.folders,
  uploadedFiles: s.uploadedFiles,
  healthScores: s.healthScores,
  deadlines: s.deadlines,
  selectedId: s.selectedId,
  activeTab: s.activeTab,
  theme: s.theme,
  hasSeenIntro: s.hasSeenIntro,
}),
```

Change persist key to `"cynera-os-v4"`:

```js
name: "cynera-os-v4",
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test src/test/store/healthDeadlines.test.js
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.js src/test/store/healthDeadlines.test.js
git commit -m "feat: add healthScores, deadlines, category/status, hasSeenIntro to store"
```

---

### Task 3: Helper Functions + Delete Old Components

**Files:**
- Modify: `src/utils/helpers.js`
- Delete: `src/components/dashboard/`, `src/components/uebersicht/`, `src/components/layout/`

- [ ] **Step 1: Add health helpers to `src/utils/helpers.js`**

Append to the end of the file:

```js
export function healthStatus(score) {
  if (score == null) return 'unknown'
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'warning'
  return 'at-risk'
}

export function healthLabel(score) {
  if (score == null) return '—'
  if (score >= 80) return 'Healthy'
  if (score >= 60) return 'Warning'
  return 'At Risk'
}

export function healthColor(score) {
  if (score == null) return 'var(--text3)'
  if (score >= 80) return 'var(--green)'
  if (score >= 60) return 'var(--amber)'
  return 'var(--red)'
}

export function generateWhatMatters(customer, healthScore, openTodos, deadlines) {
  const parts = []
  if (healthScore) {
    if (healthScore.score >= 80)
      parts.push(`${customer.name} zeigt starke Performance mit einem Health Score von ${healthScore.score}.`)
    else if (healthScore.score >= 60)
      parts.push(`${customer.name} hat Verbesserungspotenzial — Health Score bei ${healthScore.score}.`)
    else
      parts.push(`${customer.name} benötigt sofortige Aufmerksamkeit — Health Score bei ${healthScore.score}.`)
  }
  const highPrio = openTodos.filter(t => t.prio === 'high')
  if (openTodos.length > 0)
    parts.push(`${openTodos.length} offene Aufgabe${openTodos.length !== 1 ? 'n' : ''}${highPrio.length ? `, ${highPrio.length} mit hoher Priorität` : ''}.`)
  const urgent = deadlines.filter(d => {
    const days = Math.ceil((new Date(d.date) - new Date()) / 86400000)
    return days >= 0 && days <= 7
  })
  if (urgent.length > 0)
    parts.push(`${urgent.length} Deadline${urgent.length !== 1 ? 's' : ''} in den nächsten 7 Tagen.`)
  return parts.join(' ') || `Alles im Griff bei ${customer.name}. Kein sofortiger Handlungsbedarf.`
}
```

- [ ] **Step 2: Delete old component directories**

```bash
rm -rf src/components/dashboard src/components/uebersicht src/components/layout
```

- [ ] **Step 3: Recreate the layout directory (empty, components added in next tasks)**

```bash
mkdir -p src/components/layout src/components/intro src/components/overview src/components/customer src/components/dashboard src/components/ai-panel src/components/tabs
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add health/deadline helpers, clear old layout components"
```

---

## Phase 2 — App Shell

### Task 4: TopBar

**Files:**
- Create: `src/components/layout/TopBar.jsx`

- [ ] **Step 1: Create TopBar**

```jsx
export function TopBar({ onNewClient }) {
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div style={{
      height: 64, display: 'flex', alignItems: 'center',
      padding: '0 32px', background: 'var(--bg1)',
      borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 16,
    }}>
      <div style={{ minWidth: 160 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Today in Cynera
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{dateStr}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 480,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-pill)', padding: '8px 16px',
        }}>
          <svg width="13" height="13" fill="none" stroke="var(--text3)" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            placeholder="Search..."
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', flex: 1 }}
          />
        </div>
      </div>

      <button
        onClick={onNewClient}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 20px', borderRadius: 'var(--r-pill)',
          background: 'var(--p)', border: 'none', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          letterSpacing: '-0.01em', flexShrink: 0,
          boxShadow: '0 2px 12px rgba(124,58,237,0.25)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
      >
        <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
        </svg>
        + New Client
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/TopBar.jsx
git commit -m "feat: add TopBar component"
```

---

### Task 5: Sidebar

**Files:**
- Create: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Create Sidebar**

```jsx
import { useState } from 'react'
import { useStore } from '../../store'
import { Avatar } from '../ui/Avatar'

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'
  return (
    <button
      onClick={onToggle}
      style={{
        width: 48, height: 24, borderRadius: 99, padding: '0 3px',
        background: isDark ? 'var(--bg4)' : 'var(--bg3)',
        border: '1px solid var(--border2)', cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: isDark ? '#6D28D9' : 'var(--p)',
        transform: isDark ? 'translateX(0)' : 'translateX(24px)',
        transition: 'transform 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10,
      }}>
        {isDark ? '☾' : '☀'}
      </div>
    </button>
  )
}

export function Sidebar({ onNewClient }) {
  const customers    = useStore(s => s.customers)
  const todos        = useStore(s => s.todos)
  const selectedId   = useStore(s => s.selectedId)
  const selectCustomer = useStore(s => s.selectCustomer)
  const theme        = useStore(s => s.theme)
  const toggleTheme  = useStore(s => s.toggleTheme)

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('Alle')

  const categories = ['Alle', ...new Set(customers.map(c => c.category).filter(Boolean))]

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q)
    const matchCat = catFilter === 'Alle' || c.category === catFilter
    return matchSearch && matchCat
  })

  return (
    <aside style={{
      width: 264, flexShrink: 0, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg1)', borderRight: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 12px', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text)' }}>CYNERA </span>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--p)' }}>CLIENTS</span>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 12, fontFamily: 'inherit',
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(124,58,237,0.4)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
        />
      </div>

      {/* Category filter */}
      <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
          Kategorie
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              style={{
                padding: '3px 10px', borderRadius: 'var(--r-pill)',
                border: `1px solid ${catFilter === cat ? 'var(--border3)' : 'var(--border)'}`,
                background: catFilter === cat ? 'var(--p5)' : 'transparent',
                color: catFilter === cat ? 'var(--p)' : 'var(--text3)',
                fontSize: 11, fontWeight: catFilter === cat ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* New Client */}
      <div style={{ padding: '0 12px 14px', flexShrink: 0 }}>
        <button
          onClick={onNewClient}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 'var(--r-md)',
            background: 'var(--p)', border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
          </svg>
          + New Client
        </button>
      </div>

      {/* Section label */}
      <div style={{ padding: '0 20px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', flexShrink: 0 }}>
        Clients · {customers.length}
      </div>

      {/* Client list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 12px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text3)', fontSize: 12 }}>
            Keine Kunden
          </div>
        )}
        {filtered.map(c => {
          const openTasks = todos.filter(t => t.customerId === c.id && !t.completed).length
          const active = c.id === selectedId
          return (
            <div
              key={c.id}
              onClick={() => selectCustomer(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 'var(--r-md)',
                cursor: 'pointer', marginBottom: 2,
                background: active ? 'var(--p5)' : 'transparent',
                border: `1px solid ${active ? 'var(--border3)' : 'transparent'}`,
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Avatar name={c.name} id={c.id} size={32} radius={10} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </div>
                {c.category && (
                  <div style={{ fontSize: 10, color: 'var(--p)', marginTop: 1, fontWeight: 500 }}>{c.category}</div>
                )}
                {!c.category && c.company && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{c.company}</div>
                )}
              </div>
              {openTasks > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: active ? 'var(--p6)' : 'var(--bg3)',
                  color: active ? 'var(--p)' : 'var(--text3)',
                  padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                }}>
                  {openTasks}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => selectCustomer(null)}
            title="Zur Übersicht"
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
            </svg>
          </button>
          <button
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </button>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Sidebar.jsx
git commit -m "feat: add Sidebar with category filter and theme toggle"
```

---

### Task 6: App.jsx Rebuild

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Rewrite App.jsx**

Replace the entire file with:

```jsx
import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/layout/Sidebar'
import { IntroScreen } from './components/intro/IntroScreen'
import { ClientOverview } from './components/overview/ClientOverview'
import { CustomerView } from './components/customer/CustomerView'
import { Modal } from './components/ui/Modal'
import { ToastProvider } from './components/ui/Toast'

const isTauri = () => typeof window !== 'undefined' && window.__TAURI__

function FieldRow({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
        {label}
      </label>
      <input
        {...props}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)',
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          ...props.style,
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border2)'}
      />
    </div>
  )
}

export default function App() {
  const selectedId     = useStore(s => s.selectedId)
  const customers      = useStore(s => s.customers)
  const theme          = useStore(s => s.theme)
  const hasSeenIntro   = useStore(s => s.hasSeenIntro)
  const setHasSeenIntro = useStore(s => s.setHasSeenIntro)
  const addCustomer    = useStore(s => s.addCustomer)
  const selectCustomer = useStore(s => s.selectCustomer)

  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', category: '', status: 'aktiv' })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const hasCustomer = !!customers.find(c => c.id === selectedId)

  const handleAdd = useCallback(() => {
    if (!form.name.trim()) return
    addCustomer(form)
    setForm({ name: '', company: '', email: '', phone: '', category: '', status: 'aktiv' })
    setAddOpen(false)
  }, [form, addCustomer])

  const openNewClient = useCallback(() => setAddOpen(true), [])

  if (!hasSeenIntro) {
    return (
      <ToastProvider>
        <IntroScreen onEnter={setHasSeenIntro} />
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
        <TopBar onNewClient={openNewClient} />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar onNewClient={openNewClient} />
          <AnimatePresence mode="wait">
            {!hasCustomer ? (
              <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ flex: 1, overflow: 'hidden' }}>
                <ClientOverview onNewClient={openNewClient} />
              </motion.div>
            ) : (
              <motion.div key={selectedId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                <CustomerView customerId={selectedId} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Neuer Kunde">
          <FieldRow label="Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Max Mustermann" autoFocus onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <FieldRow label="Firma" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Muster GmbH" />
          <FieldRow label="Kategorie" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="z.B. Buchhaltung" />
          <FieldRow label="E-Mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="max@firma.de" type="email" />
          <FieldRow label="Telefon" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+49 123 456789" style={{ marginBottom: 4 }} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={handleAdd} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}>
              Anlegen
            </button>
            <button onClick={() => setAddOpen(false)} style={{ padding: '10px 16px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Abbrechen
            </button>
          </div>
        </Modal>
      </div>
    </ToastProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rebuild App.jsx with intro/overview/customer routing"
```

---

## Phase 3 — Screens

### Task 7: IntroScreen

**Files:**
- Create: `src/components/intro/IntroScreen.jsx`

- [ ] **Step 1: Create IntroScreen with word-by-word animation**

```jsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const TITLE_WORDS = ['If', 'we', 'build,', 'we', 'build', 'to', 'win']

export function IntroScreen({ onEnter }) {
  const [visibleWords, setVisibleWords] = useState(0)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    if (visibleWords < TITLE_WORDS.length) {
      const t = setTimeout(() => setVisibleWords(v => v + 1), 120)
      return () => clearTimeout(t)
    } else {
      const t = setTimeout(() => setShowContent(true), 200)
      return () => clearTimeout(t)
    }
  }, [visibleWords])

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', gap: 28, padding: 32,
      userSelect: 'none',
    }}>
      {/* Animated title */}
      <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--p)', textAlign: 'center', lineHeight: 1.15 }}>
        {TITLE_WORDS.map((word, i) => (
          <AnimatePresence key={i}>
            {i < visibleWords && (
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'inline-block', marginRight: 10 }}
              >
                {word}
              </motion.span>
            )}
          </AnimatePresence>
        ))}
      </h1>

      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
          >
            {/* Greeting badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 'var(--r-pill)',
              background: 'var(--bg1)', border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)', fontSize: 14, color: 'var(--text)', fontWeight: 500,
            }}>
              <span style={{ color: 'var(--p)', fontSize: 16 }}>✦</span>
              Hello, User
            </div>

            {/* Subtitle */}
            <p style={{ fontSize: 14, color: 'var(--text3)', textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
              Welcome to <span style={{ color: 'var(--p)', fontWeight: 600 }}>Cynera</span> — your command center for client success.
            </p>

            {/* CTA button */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onEnter}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 36px', borderRadius: 'var(--r-pill)',
                background: 'var(--p)', border: 'none', color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '-0.01em', marginTop: 8,
                boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
              }}
            >
              Let's Work
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help button */}
      <div style={{ position: 'fixed', bottom: 24, right: 24 }}>
        <button style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--bg1)', border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: 'var(--text3)', fontWeight: 700,
        }}>?</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/intro/IntroScreen.jsx
git commit -m "feat: add IntroScreen with word-by-word animation"
```

---

### Task 8: ClientOverview

**Files:**
- Create: `src/components/overview/ClientOverview.jsx`

- [ ] **Step 1: Create ClientOverview**

```jsx
import { useMemo, useState } from 'react'
import { useStore } from '../../store'
import { Avatar } from '../ui/Avatar'
import { healthLabel, healthColor, healthStatus, timeAgo } from '../../utils/helpers'

function StatCard({ label, value, sub, icon, color }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ value, color }) {
  return (
    <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export function ClientOverview({ onNewClient }) {
  const customers    = useStore(s => s.customers)
  const healthScores = useStore(s => s.healthScores)
  const selectCustomer = useStore(s => s.selectCustomer)

  const [healthFilter, setHealthFilter] = useState('Alle')
  const [catFilter, setCatFilter]       = useState('Alle')

  const getHS = id => healthScores.find(h => h.customerId === id)

  const categories = ['Alle', ...new Set(customers.map(c => c.category).filter(Boolean))]

  const filtered = useMemo(() => customers.filter(c => {
    const hs = getHS(c.id)
    const status = hs ? healthStatus(hs.score) : 'unknown'
    const matchHealth =
      healthFilter === 'Alle' ? true :
      healthFilter === 'Healthy' ? status === 'healthy' :
      healthFilter === 'Warning' ? status === 'warning' :
      healthFilter === 'At Risk' ? status === 'at-risk' : true
    const matchCat = catFilter === 'Alle' || c.category === catFilter
    return matchHealth && matchCat
  }), [customers, healthScores, healthFilter, catFilter])

  const avgScore = useMemo(() => {
    const scores = customers.map(c => getHS(c.id)?.score).filter(s => s != null)
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  }, [customers, healthScores])

  const healthyCount  = customers.filter(c => { const s = getHS(c.id)?.score; return s != null && s >= 80 }).length
  const atRiskCount   = customers.filter(c => { const s = getHS(c.id)?.score; return s != null && s < 60 }).length

  const catStats = useMemo(() => {
    return categories.filter(c => c !== 'Alle').map(cat => {
      const group = customers.filter(c => c.category === cat)
      const scores = group.map(c => getHS(c.id)?.score).filter(s => s != null)
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      return { cat, count: group.length, avg }
    })
  }, [customers, healthScores, categories])

  const chipStyle = (active) => ({
    padding: '5px 14px', borderRadius: 'var(--r-pill)', fontSize: 12,
    border: `1px solid ${active ? 'var(--p3)' : 'var(--border)'}`,
    background: active ? 'var(--p5)' : 'transparent',
    color: active ? 'var(--p)' : 'var(--text3)',
    fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Heading */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>Client Overview</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Manage your complete client portfolio</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <svg width="13" height="13" fill="none" stroke="var(--text3)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Filter:</span>
          {['Alle', 'Healthy', 'Warning', 'At Risk'].map(f => (
            <button key={f} onClick={() => setHealthFilter(f)} style={chipStyle(healthFilter === f)}>
              {f === 'Healthy' ? '✓ Healthy (80+)' : f === 'Warning' ? '⚠ Warning (60-79)' : f === 'At Risk' ? '⚠ At Risk (<60)' : f}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          {categories.filter(c => c !== 'Alle').map(cat => (
            <button key={cat} onClick={() => setCatFilter(catFilter === cat ? 'Alle' : cat)} style={chipStyle(catFilter === cat)}>{cat}</button>
          ))}
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Clients" value={customers.length} sub={`${filtered.length} showing`}
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
            color="var(--blue)" />
          <StatCard label="Avg Health Score" value={avgScore != null ? `${avgScore}%` : '—'} sub={avgScore != null ? '+5% from last month' : 'Noch keine Scores'}
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
            color="var(--green)" />
          <StatCard label="Healthy Clients" value={healthyCount} sub="80+ health score"
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>}
            color="var(--green)" />
          <StatCard label="At Risk" value={atRiskCount} sub="Needs attention"
            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
            color="var(--red)" />
        </div>

        {/* Category breakdown */}
        {catStats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(catStats.length, 3)}, 1fr)`, gap: 16, marginBottom: 24 }}>
            {catStats.map(({ cat, count, avg }) => (
              <div key={cat} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{cat}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{count}</span>
                </div>
                <ProgressBar value={avg ?? 0} color={healthColor(avg)} />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{avg != null ? `${avg}% Ø` : 'Kein Score'}</div>
              </div>
            ))}
          </div>
        )}

        {/* Client table */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Client List</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>({filtered.length} clients)</span>
          </div>
          <div>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 1fr', padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
              {['Client', 'Category', 'Health Score', 'Status', 'Last Activity'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>{h}</span>
              ))}
            </div>
            {filtered.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Keine Kunden gefunden
              </div>
            )}
            {filtered.map((c, i) => {
              const hs = getHS(c.id)
              const score = hs?.score
              const color = healthColor(score)
              const label = healthLabel(score)
              return (
                <div
                  key={c.id}
                  onClick={() => selectCustomer(c.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 1fr',
                    padding: '14px 24px', cursor: 'pointer',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={c.name} id={c.id} size={28} radius={8} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {c.category ? (
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 500 }}>{c.category}</span>
                    ) : <span style={{ color: 'var(--text4)', fontSize: 12 }}>—</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {score != null ? (
                      <>
                        <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', maxWidth: 80 }}>
                          <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 24 }}>{score}</span>
                      </>
                    ) : <span style={{ color: 'var(--text4)', fontSize: 12 }}>—</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {score != null ? (
                      <span style={{ fontSize: 12, fontWeight: 500, color }}>{label}</span>
                    ) : <span style={{ color: 'var(--text4)', fontSize: 12 }}>—</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{timeAgo(c.updatedAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/overview/ClientOverview.jsx
git commit -m "feat: add ClientOverview with stat cards, filters, and client table"
```

---

## Phase 4 — Customer View

### Task 9: CustomerHeader + CustomerView Shell

**Files:**
- Create: `src/components/customer/CustomerHeader.jsx`
- Create: `src/components/customer/CustomerView.jsx`

- [ ] **Step 1: Create CustomerHeader**

```jsx
import { useStore } from '../../store'
import { Avatar } from '../ui/Avatar'
import { healthColor } from '../../utils/helpers'

const TABS = [
  { id: 'dashboard',      label: 'Dashboard',      icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg> },
  { id: 'workflow',       label: 'Workflow',        icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
  { id: 'ablage',         label: 'Ablage',          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"/></svg> },
  { id: 'kommunikation',  label: 'Kommunikation',   icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> },
  { id: 'historie',       label: 'Historie',        icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { id: 'health',         label: 'Health',          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
]

export function CustomerHeader({ customer, healthScore, activeTab, onTabChange }) {
  const score = healthScore?.score
  const color = healthColor(score)

  return (
    <div style={{ background: 'var(--bg1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {/* Customer info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 32px 16px' }}>
        <Avatar name={customer.name} id={customer.id} size={64} radius={16} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 6 }}>
            {customer.name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {customer.category && (
              <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 'var(--r-pill)', background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 500 }}>
                {customer.category}
              </span>
            )}
            <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 'var(--r-pill)', background: 'rgba(34,197,94,0.10)', color: 'var(--green)', fontWeight: 600 }}>
              {customer.status === 'inaktiv' ? 'Inaktiv' : 'Aktiv'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              Letzte Aktivität: {customer.updatedAt ? (() => { const diff = Date.now() - new Date(customer.updatedAt); const h = Math.floor(diff / 3600000); return h < 24 ? `vor ${h} Std.` : `vor ${Math.floor(h/24)} Tag${Math.floor(h/24) !== 1 ? 'en' : ''}` })() : '—'}
            </span>
          </div>
        </div>
        {score != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--text)', lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', marginTop: 2 }}>Health Score</div>
            <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 2 }}>↑ +6</div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '0 24px' }}>
        {TABS.map(tab => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 'var(--r-md) var(--r-md) 0 0',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: active ? 600 : 400,
                background: active ? 'var(--p)' : 'transparent',
                color: active ? '#fff' : 'var(--text3)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)' }}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create CustomerView shell**

```jsx
import { useState } from 'react'
import { useStore } from '../../store'
import { CustomerHeader } from './CustomerHeader'
import { CustomerDashboard } from '../dashboard/CustomerDashboard'
import { AiPanel } from '../ai-panel/AiPanel'
import { TodoPane } from '../todos/TodoPane'
import { NotesPane } from '../notes/NotesPane'
import { KpisPane } from '../kpis/KpisPane'
import { AblagePane } from '../ablage/AblagePane'
import { KommunikationTab } from '../tabs/KommunikationTab'
import { HistorieTab } from '../tabs/HistorieTab'
import { HealthTab } from '../tabs/HealthTab'

export function CustomerView({ customerId }) {
  const customers    = useStore(s => s.customers)
  const healthScores = useStore(s => s.healthScores)
  const customer     = customers.find(c => c.id === customerId)
  const healthScore  = healthScores.find(h => h.customerId === customerId) ?? null

  const [activeTab, setActiveTab] = useState('dashboard')

  if (!customer) return null

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':     return <CustomerDashboard customerId={customerId} />
      case 'workflow':      return (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TodoPane customerId={customerId} />
        </div>
      )
      case 'ablage':        return <AblagePane customerId={customerId} />
      case 'kommunikation': return <KommunikationTab />
      case 'historie':      return <HistorieTab customerId={customerId} />
      case 'health':        return <HealthTab customerId={customerId} />
      default:              return null
    }
  }

  const showAiPanel = activeTab === 'dashboard'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      <CustomerHeader
        customer={customer}
        healthScore={healthScore}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderTab()}
        </div>
        {showAiPanel && (
          <AiPanel customerId={customerId} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/
git commit -m "feat: add CustomerHeader with tabs and CustomerView shell"
```

---

### Task 10: CustomerDashboard

**Files:**
- Create: `src/components/dashboard/CustomerDashboard.jsx`

- [ ] **Step 1: Create CustomerDashboard**

```jsx
import { useMemo } from 'react'
import { useStore } from '../../store'
import { healthColor, healthLabel, generateWhatMatters, fmtDate } from '../../utils/helpers'

function ProgressBar({ value, color }) {
  return (
    <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ height: '100%', width: `${Math.min(100, value ?? 0)}%`, background: color, borderRadius: 99 }} />
    </div>
  )
}

const PRIORITY_COLORS = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--text3)' }

export function CustomerDashboard({ customerId }) {
  const customers    = useStore(s => s.customers)
  const todos        = useStore(s => s.todos)
  const kpis         = useStore(s => s.kpis)
  const healthScores = useStore(s => s.healthScores)
  const deadlines    = useStore(s => s.deadlines)

  const customer    = customers.find(c => c.id === customerId)
  const healthScore = healthScores.find(h => h.customerId === customerId) ?? null
  const openTodos   = useMemo(() => todos.filter(t => t.customerId === customerId && !t.completed), [todos, customerId])
  const myDeadlines = useMemo(() => deadlines.filter(d => d.customerId === customerId).sort((a, b) => new Date(a.date) - new Date(b.date)), [deadlines, customerId])
  const myKpis      = useMemo(() => kpis.filter(k => k.customerId === customerId).slice(-2), [kpis, customerId])

  const whatMatters = useMemo(() => customer ? generateWhatMatters(customer, healthScore, openTodos, myDeadlines) : '', [customer, healthScore, openTodos, myDeadlines])

  if (!customer) return null

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* What matters today */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        borderRadius: 'var(--r-xl)', padding: '22px 24px', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>✦</span>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>What matters today</span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.65, opacity: 0.92 }}>{whatMatters}</p>
      </div>

      {/* Client Health */}
      {healthScore && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Client Health</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Health Score', value: healthScore.score, badge: healthLabel(healthScore.score), color: healthColor(healthScore.score) },
              { label: 'Engagement', value: healthScore.engagement != null ? `${healthScore.engagement}%` : '—', badge: healthScore.engagement != null ? '+15%' : null, color: 'var(--p)' },
              { label: 'On-Time Delivery', value: healthScore.onTimeDelivery != null ? `${healthScore.onTimeDelivery}%` : '—', badge: healthScore.onTimeDelivery != null ? `${healthScore.onTimeDelivery}%` : null, color: 'var(--green)' },
            ].map(({ label, value, badge, color }) => (
              <div key={label} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
                  {badge && <span style={{ fontSize: 11, fontWeight: 600, color }}>{badge}</span>}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
                <ProgressBar value={typeof value === 'number' ? value : parseInt(value) || 0} color={color} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Upcoming Deadlines */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Upcoming Deadlines</h3>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            {myDeadlines.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Keine Deadlines</div>
            ) : myDeadlines.map((d, i) => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: i < myDeadlines.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(d.date)}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: `${PRIORITY_COLORS[d.priority]}18`, color: PRIORITY_COLORS[d.priority] }}>
                  {d.priority}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* KPI Snapshot */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>KPI Snapshot</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myKpis.length === 0 ? (
              <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Keine KPIs</div>
            ) : myKpis.map(k => (
              <div key={k.id} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <svg width="12" height="12" fill="none" stroke="var(--p)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{k.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600, marginLeft: 'auto' }}>↗ Neu</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>
                  {k.value}{k.unit ? ` ${k.unit}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/CustomerDashboard.jsx
git commit -m "feat: add CustomerDashboard with health cards, deadlines, KPI snapshot"
```

---

### Task 11: AI Panel

**Files:**
- Create: `src/components/ai-panel/AiPanel.jsx`

- [ ] **Step 1: Create AiPanel (simulated)**

```jsx
import { useMemo } from 'react'
import { useStore } from '../../store'
import { healthLabel, healthColor, generateWhatMatters } from '../../utils/helpers'

function QuickAction({ label, icon, content }) {
  return (
    <details style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', fontWeight: 500, cursor: 'pointer', listStyle: 'none', padding: '4px 0' }}>
        {icon}{label}
      </summary>
      <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, marginTop: 6, paddingLeft: 20 }}>{content}</p>
    </details>
  )
}

export function AiPanel({ customerId }) {
  const customers    = useStore(s => s.customers)
  const todos        = useStore(s => s.todos)
  const healthScores = useStore(s => s.healthScores)
  const deadlines    = useStore(s => s.deadlines)

  const customer    = customers.find(c => c.id === customerId)
  const healthScore = healthScores.find(h => h.customerId === customerId) ?? null
  const openTodos   = useMemo(() => todos.filter(t => t.customerId === customerId && !t.completed), [todos, customerId])
  const myDeadlines = useMemo(() => deadlines.filter(d => d.customerId === customerId), [deadlines, customerId])

  const analysisText = useMemo(() => {
    if (!healthScore) return `Noch kein Health Score für ${customer?.name ?? 'diesen Kunden'} hinterlegt.`
    const trend = healthScore.score >= 75 ? 'in den letzten 7 Tagen um 6 Punkte gestiegen' : 'leicht gesunken'
    return `Health Score ist ${trend}. ${healthScore.engagement != null ? `Engagement bei ${healthScore.engagement}%.` : ''}`
  }, [healthScore, customer])

  const risks = useMemo(() => {
    const r = []
    if (healthScore && healthScore.engagement != null && healthScore.engagement < 70) r.push({ text: `Engagement down ${100 - healthScore.engagement}%`, sub: 'Last 2 weeks vs average' })
    if (openTodos.filter(t => t.prio === 'high').length > 0) r.push({ text: `${openTodos.filter(t => t.prio === 'high').length} high-priority tasks open`, sub: 'Action required' })
    return r
  }, [healthScore, openTodos])

  const opportunities = useMemo(() => {
    const o = []
    if (healthScore && healthScore.score >= 80) o.push({ text: 'Upsell opportunity', sub: 'Strong engagement metrics' })
    if (myDeadlines.length > 0) o.push({ text: 'Upcoming milestone', sub: myDeadlines[0]?.title ?? '' })
    return o
  }, [healthScore, myDeadlines])

  if (!customer) return null

  return (
    <div style={{
      width: 280, flexShrink: 0, height: '100%', overflowY: 'auto',
      background: 'var(--bg1)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {/* AI analysis card */}
      <div style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)', padding: '16px', margin: '16px', borderRadius: 'var(--r-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ color: '#fff', fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Ich habe etwas für dich analysiert</span>
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>{analysisText}</p>
      </div>

      {/* Quick actions */}
      <div style={{ padding: '0 16px 16px' }}>
        <QuickAction
          label="Health Score erklären"
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4m0 4h.01"/></svg>}
          content={healthScore ? `Der Health Score von ${healthScore.score} berechnet sich aus Engagement, pünktlicher Lieferung und Aktivitätsdichte. ${healthLabel(healthScore.score)} bedeutet: stabile Zusammenarbeit.` : 'Noch kein Health Score vorhanden. Gehe zu Health-Tab um einen einzutragen.'}
        />
        <QuickAction
          label="Größtes Risiko?"
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>}
          content={risks.length > 0 ? risks.map(r => r.text).join('. ') + '.' : 'Keine kritischen Risiken erkannt. Weiter so!'}
        />
        <QuickAction
          label="Nächste Schritte?"
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>}
          content={openTodos.length > 0 ? `Priorität: "${openTodos[0].text}". Danach Check-in-Call einplanen.` : 'Alle Tasks erledigt. Check-in-Call für nächste Woche planen.'}
        />
      </div>

      {/* Focus tasks */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Focus</span>
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>What's next for {customer.name.split(' ')[0]}</span>
        </div>
        {openTodos.slice(0, 5).map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--border2)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{t.text}</span>
            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: t.prio === 'high' ? 'var(--red)' : t.prio === 'mid' ? 'var(--amber)' : 'var(--text4)' }} />
          </div>
        ))}
        {openTodos.length === 0 && <p style={{ fontSize: 12, color: 'var(--text3)' }}>Keine offenen Aufgaben</p>}
      </div>

      {/* Cynera Focus AI */}
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ color: 'var(--p)', fontSize: 12 }}>✦</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Cynera Focus AI</span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>System Overview</span>
          {[
            healthScore ? `Health score trending ${healthScore.score >= 75 ? 'up' : 'down'} ${Math.abs((healthScore.score ?? 0) - 75)}%` : 'No health score yet',
            `${openTodos.length} open task${openTodos.length !== 1 ? 's' : ''}`,
            myDeadlines.length > 0 ? `${myDeadlines.length} upcoming deadline${myDeadlines.length !== 1 ? 's' : ''}` : 'No deadlines set',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ color: 'var(--p)', fontSize: 10, marginTop: 1 }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>

        {risks.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Risks & Alerts</span>
            {risks.map((r, i) => (
              <div key={i} style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>{r.text}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.sub}</div>
              </div>
            ))}
          </div>
        )}

        {opportunities.length > 0 && (
          <div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Opportunities</span>
            {opportunities.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                <svg width="11" height="11" fill="none" stroke="var(--green)" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>{o.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{o.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-panel/AiPanel.jsx
git commit -m "feat: add simulated AiPanel with analysis, quick actions, focus tasks"
```

---

## Phase 5 — Remaining Tabs

### Task 12: HistorieTab + KommunikationTab + HealthTab

**Files:**
- Create: `src/components/tabs/HistorieTab.jsx`
- Create: `src/components/tabs/KommunikationTab.jsx`
- Create: `src/components/tabs/HealthTab.jsx`

- [ ] **Step 1: Create HistorieTab**

```jsx
import { useMemo } from 'react'
import { useStore } from '../../store'
import { timeAgo } from '../../utils/helpers'

const EVENT_ICONS = {
  todo:     <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  note:     <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>,
  kpi:      <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
  file:     <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>,
  deadline: <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
}

export function HistorieTab({ customerId }) {
  const todos         = useStore(s => s.todos)
  const notes         = useStore(s => s.notes)
  const kpis          = useStore(s => s.kpis)
  const uploadedFiles = useStore(s => s.uploadedFiles)
  const deadlines     = useStore(s => s.deadlines)

  const events = useMemo(() => {
    return [
      ...todos.filter(t => t.customerId === customerId).map(t => ({ type: 'todo', label: 'To-Do erstellt', detail: t.text, date: t.createdAt })),
      ...notes.filter(n => n.customerId === customerId).map(n => ({ type: 'note', label: 'Notiz erstellt', detail: n.title, date: n.createdAt })),
      ...kpis.filter(k => k.customerId === customerId).map(k => ({ type: 'kpi', label: 'KPI hinzugefügt', detail: `${k.name}: ${k.value}${k.unit ? ' ' + k.unit : ''}`, date: k.createdAt })),
      ...uploadedFiles.filter(f => f.customerId === customerId).map(f => ({ type: 'file', label: 'Datei hochgeladen', detail: f.name, date: f.createdAt })),
      ...deadlines.filter(d => d.customerId === customerId).map(d => ({ type: 'deadline', label: 'Deadline angelegt', detail: d.title, date: d.createdAt })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [todos, notes, kpis, uploadedFiles, deadlines, customerId])

  return (
    <div style={{ padding: '28px 32px' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Aktivitätsverlauf</h3>
      {events.length === 0 ? (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Noch keine Aktivitäten</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {events.map((ev, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: 20, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--p)', zIndex: 1 }}>
                  {EVENT_ICONS[ev.type]}
                </div>
                {i < events.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
              </div>
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{ev.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{ev.detail}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{timeAgo(ev.date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create KommunikationTab**

```jsx
export function KommunikationTab() {
  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text3)' }}>
      <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.3 }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
      <p style={{ fontSize: 14, fontWeight: 500 }}>Kommunikation</p>
      <p style={{ fontSize: 12 }}>Coming soon — E-Mail- und Nachrichtenverlauf</p>
    </div>
  )
}
```

- [ ] **Step 3: Create HealthTab**

```jsx
import { useState } from 'react'
import { useStore } from '../../store'
import { healthLabel, healthColor } from '../../utils/helpers'

function MetricInput({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          type="range" min={0} max={100} value={value ?? 0}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--p)' }}
        />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', minWidth: 36, textAlign: 'right' }}>{value ?? '—'}</span>
      </div>
    </div>
  )
}

export function HealthTab({ customerId }) {
  const healthScores    = useStore(s => s.healthScores)
  const addHealthScore  = useStore(s => s.addHealthScore)
  const updateHealthScore = useStore(s => s.updateHealthScore)

  const existing = healthScores.find(h => h.customerId === customerId)

  const [score, setScore]           = useState(existing?.score ?? 75)
  const [engagement, setEngagement] = useState(existing?.engagement ?? 80)
  const [onTime, setOnTime]         = useState(existing?.onTimeDelivery ?? 90)
  const [saved, setSaved]           = useState(false)

  const handleSave = () => {
    const data = { score, engagement, onTimeDelivery: onTime }
    if (existing) updateHealthScore(existing.id, data)
    else addHealthScore(customerId, data)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 520 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Health Score</h3>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>Metriken manuell setzen. KI-Berechnung folgt in einem späteren Update.</p>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '24px' }}>
        {/* Score display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, padding: '16px 20px', borderRadius: 'var(--r-lg)', background: 'var(--bg2)' }}>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.05em', color: healthColor(score), lineHeight: 1 }}>{score}</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>Health Score</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: healthColor(score), marginTop: 2 }}>{healthLabel(score)}</div>
          </div>
        </div>

        <MetricInput label="Health Score (0–100)" value={score} onChange={setScore} />
        <MetricInput label="Engagement %" value={engagement} onChange={setEngagement} />
        <MetricInput label="On-Time Delivery %" value={onTime} onChange={setOnTime} />

        <button
          onClick={handleSave}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 'var(--r-md)',
            background: saved ? 'var(--green)' : 'var(--p)', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.2s',
          }}
        >
          {saved ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/
git commit -m "feat: add HistorieTab, KommunikationTab placeholder, HealthTab with sliders"
```

---

### Task 13: Final Wiring — Verify and Fix Imports

- [ ] **Step 1: Start dev server and check for import errors**

```bash
npm run dev
```

Check browser console for missing module errors. Common issues to fix:
- `IntroScreen` not found → verify path `src/components/intro/IntroScreen.jsx`
- `CustomerView` not found → verify path `src/components/customer/CustomerView.jsx`
- `TodoPane` import in `CustomerView` → keep using existing `src/components/todos/TodoPane.jsx`

- [ ] **Step 2: Test the full flow manually**

1. Open app → IntroScreen should appear with animated title
2. Click "Let's Work" → ClientOverview should appear
3. Add a client (+ New Client in TopBar or Sidebar) → CustomerView should open
4. Click each tab (Dashboard, Workflow, Ablage, Kommunikation, Historie, Health)
5. Go to Health tab, set scores, save → Dashboard should show health cards
6. Go to Overview (grid icon in sidebar footer) → ClientOverview should show client in table with health score

- [ ] **Step 3: Fix any layout issues**

If the CustomerView content area is too narrow or too wide, adjust the `maxWidth` or padding values. The AI panel is 280px fixed, the main content takes the rest.

- [ ] **Step 4: Run all tests**

```bash
npm run test
```

Expected: all existing tests pass plus new healthDeadlines tests pass.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Cynera v2 redesign — light theme, health system, AI panel"
```
