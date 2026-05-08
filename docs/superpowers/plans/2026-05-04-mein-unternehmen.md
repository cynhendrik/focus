# Mein Unternehmen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Mein Unternehmen" workspace management interface accessible via a building icon in the Sidebar footer, with four sub-pages: Unternehmensprofil, Module, CRM-Einstellungen, Workspace.

**Architecture:** New `companyView` UI state drives routing in App.jsx. A dedicated `companySlice.js` holds `companyProfile`, `modules`, `crmSettings`, `workspaceName`, `workspaceCreatedAt`. CustomerHeader reads `modules` to filter visible tabs globally.

**Tech Stack:** React 18, Zustand 4 (persist), Framer Motion 11, Vitest, Plus Jakarta Sans

---

### Task 1: Company Store Slice

**Files:**
- Create: `src/store/companySlice.js`
- Create: `src/test/store/companySlice.test.js`
- Modify: `src/store/index.js`

- [ ] **Step 1: Create `src/store/companySlice.js`**

```js
const now = () => new Date().toISOString()

export const createCompanySlice = (set, get) => ({
  companyProfile: { name: '', industry: '', teamSize: '', targetType: '', description: '' },
  modules: {
    crm: true, workflow: true, socialMedia: true,
    deals: false, followUps: false, healthScore: true, aiInsights: false,
  },
  crmSettings: {
    statuses: ['Lead', 'Aktiv', 'Inaktiv', 'Lost'],
    priorities: ['Low', 'Medium', 'High'],
    tags: [],
    followUpEnabled: false,
    followUpDays: 3,
  },
  companyView: null,
  workspaceName: 'Mein Workspace',
  workspaceCreatedAt: now(),

  setCompanyView:    (view) => set(s => ({ ...s, companyView: view })),
  setCompanyProfile: (data) => set(s => ({ ...s, companyProfile: { ...s.companyProfile, ...data } })),
  setModule:         (key, value) => set(s => ({ ...s, modules: { ...s.modules, [key]: value } })),
  updateCrmSettings: (data) => set(s => ({ ...s, crmSettings: { ...s.crmSettings, ...data } })),
  setWorkspaceName:  (name) => set(s => ({ ...s, workspaceName: name })),
})
```

- [ ] **Step 2: Create `src/test/store/companySlice.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { createCompanySlice } from '../../store/companySlice'

function makeSlice() {
  let state = {}
  const set = (updater) => { state = typeof updater === 'function' ? updater(state) : { ...state, ...updater } }
  const get = () => state
  const slice = createCompanySlice(set, get)
  state = { ...slice }
  return { get, slice }
}

describe('createCompanySlice', () => {
  it('initializes companyProfile with empty strings', () => {
    const { get } = makeSlice()
    expect(get().companyProfile.name).toBe('')
    expect(get().companyProfile.industry).toBe('')
  })

  it('setCompanyProfile merges without overwriting other fields', () => {
    const { get, slice } = makeSlice()
    slice.setCompanyProfile({ name: 'Muster GmbH' })
    expect(get().companyProfile.name).toBe('Muster GmbH')
    expect(get().companyProfile.description).toBe('')
  })

  it('setModule toggles workflow off', () => {
    const { get, slice } = makeSlice()
    expect(get().modules.workflow).toBe(true)
    slice.setModule('workflow', false)
    expect(get().modules.workflow).toBe(false)
  })

  it('setModule enables deals', () => {
    const { get, slice } = makeSlice()
    expect(get().modules.deals).toBe(false)
    slice.setModule('deals', true)
    expect(get().modules.deals).toBe(true)
  })

  it('updateCrmSettings replaces statuses list', () => {
    const { get, slice } = makeSlice()
    slice.updateCrmSettings({ statuses: ['Lead', 'Aktiv', 'Geschlossen'] })
    expect(get().crmSettings.statuses).toEqual(['Lead', 'Aktiv', 'Geschlossen'])
    expect(get().crmSettings.followUpEnabled).toBe(false)
  })

  it('updateCrmSettings adds a tag', () => {
    const { get, slice } = makeSlice()
    slice.updateCrmSettings({ tags: ['Premium'] })
    expect(get().crmSettings.tags).toContain('Premium')
  })

  it('setCompanyView changes active view', () => {
    const { get, slice } = makeSlice()
    expect(get().companyView).toBeNull()
    slice.setCompanyView('profil')
    expect(get().companyView).toBe('profil')
  })

  it('setWorkspaceName updates name', () => {
    const { get, slice } = makeSlice()
    slice.setWorkspaceName('Meine Agentur')
    expect(get().workspaceName).toBe('Meine Agentur')
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL (slice not used in index yet, but slice itself should pass)**

```
npx vitest run src/test/store/companySlice.test.js
```
Expected: all 8 tests PASS (slice is standalone)

- [ ] **Step 4: Add company state + actions to `src/store/index.js`**

In the state block (after `instagramCache: []`), add:
```js
// ── Company ───────────────────────────────────────────────────
companyProfile: { name: '', industry: '', teamSize: '', targetType: '', description: '' },
modules: {
  crm: true, workflow: true, socialMedia: true,
  deals: false, followUps: false, healthScore: true, aiInsights: false,
},
crmSettings: {
  statuses: ['Lead', 'Aktiv', 'Inaktiv', 'Lost'],
  priorities: ['Low', 'Medium', 'High'],
  tags: [],
  followUpEnabled: false,
  followUpDays: 3,
},
companyView: null,
workspaceName: 'Mein Workspace',
workspaceCreatedAt: new Date().toISOString(),
```

In the UI actions block (after `setHasSeenIntro`), add:
```js
setCompanyView:    (view) => set({ companyView: view }),
setCompanyProfile: (data) => set((s) => ({ companyProfile: { ...s.companyProfile, ...data } })),
setModule:         (key, value) => set((s) => ({ modules: { ...s.modules, [key]: value } })),
updateCrmSettings: (data) => set((s) => ({ crmSettings: { ...s.crmSettings, ...data } })),
setWorkspaceName:  (name) => set({ workspaceName: name }),
```

Update `selectCustomer` to reset `companyView`:
```js
selectCustomer: (id) => set({ selectedId: id, selectedNoteId: null, customerView: "workflow", companyView: null }),
```

In `partialize`, add these fields:
```js
companyProfile:      s.companyProfile,
modules:             s.modules,
crmSettings:         s.crmSettings,
workspaceName:       s.workspaceName,
workspaceCreatedAt:  s.workspaceCreatedAt,
```
Note: do NOT persist `companyView` (session-only).

- [ ] **Step 5: Verify build**

```
npx vite build --mode development 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 6: Commit**

```
git add src/store/companySlice.js src/store/index.js src/test/store/companySlice.test.js
git commit -m "feat: add company/module/crm state to store"
```

---

### Task 2: Sidebar Building Icon

**Files:**
- Modify: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Add store hooks and building icon button**

In `Sidebar`, add to the store hooks:
```js
const companyView    = useStore(s => s.companyView)
const setCompanyView = useStore(s => s.setCompanyView)
```

In the Footer `<div>` (the one with `display: 'flex', gap: 6`), add a third button after the existing two:
```jsx
<button
  onClick={() => setCompanyView(companyView ? null : 'profil')}
  title="Mein Unternehmen"
  style={{
    ...iconBtn,
    color: companyView !== null ? 'var(--p)' : 'var(--text3)',
    borderColor: companyView !== null ? 'var(--border3)' : 'var(--border)',
    background: companyView !== null ? 'var(--p5)' : 'transparent',
  }}
  onMouseEnter={e => { if (!companyView) { e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' } }}
  onMouseLeave={e => { if (!companyView) { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
>
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
  </svg>
</button>
```

- [ ] **Step 2: Verify build**

```
npx vite build --mode development 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```
git add src/components/layout/Sidebar.jsx
git commit -m "feat: add Mein Unternehmen building icon to sidebar footer"
```

---

### Task 3: App.jsx — Routing + Status Field

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add MeinUnternehmen import and companyView routing**

At the top of `App.jsx`, add import (file created in Task 4 — add import now, component created next):
```js
import { MeinUnternehmen } from './components/company/MeinUnternehmen'
```

In the `App` function, add store hooks:
```js
const companyView = useStore(s => s.companyView)
const crmStatuses = useStore(s => s.crmSettings.statuses)
```

Replace the `AnimatePresence` children logic. Find this pattern:
```jsx
{!hasCustomer ? (
  <motion.div key="overview" ...>
    <ClientOverview onNewClient={openNewClient} />
  </motion.div>
) : (
  <motion.div key={selectedId} ...>
    <CustomerView customerId={selectedId} />
  </motion.div>
)}
```

Replace with:
```jsx
{companyView !== null ? (
  <motion.div
    key="company"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18 }}
    style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
  >
    <MeinUnternehmen />
  </motion.div>
) : !hasCustomer ? (
  <motion.div
    key="overview"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18 }}
    style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
  >
    <ClientOverview onNewClient={openNewClient} />
  </motion.div>
) : (
  <motion.div
    key={selectedId}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18 }}
    style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
  >
    <CustomerView customerId={selectedId} />
  </motion.div>
)}
```

- [ ] **Step 2: Add Status field to customer add form**

In the `form` initial state, ensure status defaults to first CRM status. Update the `useState` initialization:
```js
const crmStatuses = useStore(s => s.crmSettings.statuses)
const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', category: '', status: 'Aktiv' })
```

After the Kategorie `FieldRow`, add a status select inside the Modal:
```jsx
<div style={{ marginBottom: 14 }}>
  <label style={{
    display: 'block', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--text3)', marginBottom: 6,
  }}>Status</label>
  <select
    value={form.status}
    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
    style={{
      width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)',
      background: 'var(--bg2)', border: '1px solid var(--border2)',
      color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
      outline: 'none',
    }}
  >
    {crmStatuses.map(s => <option key={s} value={s}>{s}</option>)}
  </select>
</div>
```

- [ ] **Step 3: Verify build (MeinUnternehmen not yet created — expect error, that's fine)**

Skip build check here. Proceed to Task 4.

- [ ] **Step 4: Commit (after Task 4 makes it buildable)**

Will be committed together with Task 4.

---

### Task 4: MeinUnternehmen Wrapper

**Files:**
- Create: `src/components/company/MeinUnternehmen.jsx`

- [ ] **Step 1: Create `src/components/company/MeinUnternehmen.jsx`**

```jsx
import { useStore } from '../../store'
import { UnternehmensProfil } from './UnternehmensProfil'
import { ModuleManager } from './ModuleManager'
import { CrmSettings } from './CrmSettings'
import { WorkspaceInfo } from './WorkspaceInfo'

const NAV_ITEMS = [
  {
    id: 'profil', label: 'Unternehmensprofil',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>,
  },
  {
    id: 'module', label: 'Module',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>,
  },
  {
    id: 'crm', label: 'CRM-Einstellungen',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  },
  {
    id: 'workspace', label: 'Workspace',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>,
  },
]

export function MeinUnternehmen() {
  const companyView    = useStore(s => s.companyView)
  const setCompanyView = useStore(s => s.setCompanyView)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', flex: 1 }}>
      {/* Sub-Nav */}
      <div style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg1)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '28px 10px 20px',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--text3)', padding: '0 10px', marginBottom: 14,
        }}>
          Mein Unternehmen
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = companyView === item.id
            return (
              <button
                key={item.id}
                onClick={() => setCompanyView(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 10px', borderRadius: 'var(--r-md)',
                  border: `1px solid ${active ? 'var(--border3)' : 'transparent'}`,
                  background: active ? 'var(--p5)' : 'transparent',
                  color: active ? 'var(--p)' : 'var(--text2)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s', textAlign: 'left', width: '100%',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        {companyView === 'profil'    && <UnternehmensProfil />}
        {companyView === 'module'    && <ModuleManager />}
        {companyView === 'crm'       && <CrmSettings />}
        {companyView === 'workspace' && <WorkspaceInfo />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create placeholder stubs for the four sub-pages (so build passes before Tasks 5–8)**

Create `src/components/company/UnternehmensProfil.jsx`:
```jsx
export function UnternehmensProfil() {
  return <div style={{ padding: 32 }}><h2>Unternehmensprofil</h2></div>
}
```

Create `src/components/company/ModuleManager.jsx`:
```jsx
export function ModuleManager() {
  return <div style={{ padding: 32 }}><h2>Module</h2></div>
}
```

Create `src/components/company/CrmSettings.jsx`:
```jsx
export function CrmSettings() {
  return <div style={{ padding: 32 }}><h2>CRM-Einstellungen</h2></div>
}
```

Create `src/components/company/WorkspaceInfo.jsx`:
```jsx
export function WorkspaceInfo() {
  return <div style={{ padding: 32 }}><h2>Workspace</h2></div>
}
```

- [ ] **Step 3: Verify build**

```
npx vite build --mode development 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

```
git add src/components/company/ src/App.jsx
git commit -m "feat: MeinUnternehmen wrapper, sub-nav, App routing"
```

---

### Task 5: UnternehmensProfil Page

**Files:**
- Modify: `src/components/company/UnternehmensProfil.jsx`

- [ ] **Step 1: Replace stub with full implementation**

```jsx
import { useState } from 'react'
import { useStore } from '../../store'

const INDUSTRIES  = ['Agentur', 'Coaching', 'E-Commerce', 'SaaS', 'Handwerk', 'Sonstiges']
const TEAM_SIZES  = ['1', '2–5', '6–15', '16–50', '50+']
const TARGET_TYPES = ['Agentur', 'Coach', 'Creator', 'Dienstleister', 'Vertrieb', 'Sonstiges']

export function UnternehmensProfil() {
  const companyProfile    = useStore(s => s.companyProfile)
  const setCompanyProfile = useStore(s => s.setCompanyProfile)
  const [form, setForm]   = useState(companyProfile)
  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)',
    background: 'var(--bg2)', border: '1px solid var(--border2)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
  }
  const labelStyle = {
    display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6,
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>Unternehmensprofil</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Grundlegende Informationen über dein Unternehmen</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 32, alignItems: 'start' }}>
        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Unternehmensname</label>
            <input value={form.name} onChange={e => update('name', e.target.value)}
              placeholder="z.B. Muster GmbH" style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--border2)'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Branche</label>
              <select value={form.industry} onChange={e => update('industry', e.target.value)} style={inputStyle}>
                <option value="">Auswählen…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Teamgröße</label>
              <select value={form.teamSize} onChange={e => update('teamSize', e.target.value)} style={inputStyle}>
                <option value="">Auswählen…</option>
                {TEAM_SIZES.map(t => <option key={t} value={t}>{t} Personen</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Zieltyp</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TARGET_TYPES.map(type => {
                const active = form.targetType === type
                return (
                  <button key={type} onClick={() => update('targetType', active ? '' : type)} style={{
                    padding: '6px 16px', borderRadius: 'var(--r-pill)',
                    border: `1px solid ${active ? 'var(--border3)' : 'var(--border2)'}`,
                    background: active ? 'var(--p5)' : 'transparent',
                    color: active ? 'var(--p)' : 'var(--text2)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>{type}</button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Beschreibung / Mission</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)}
              placeholder="Was macht dein Unternehmen besonders?" rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--border2)'} />
          </div>

          <button onClick={() => setCompanyProfile(form)} style={{
            alignSelf: 'flex-start', padding: '10px 24px', borderRadius: 'var(--r-md)',
            background: 'var(--p)', border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
          >Speichern</button>
        </div>

        {/* Preview */}
        <div style={{
          background: 'var(--bg1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: '24px', position: 'sticky', top: 0,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 16 }}>Vorschau</div>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="22" height="22" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8, minHeight: 28 }}>
            {form.name || <span style={{ color: 'var(--text4)', fontWeight: 400 }}>Unternehmensname</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {form.industry   && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 500 }}>{form.industry}</span>}
            {form.targetType && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--p5)', color: 'var(--p)', fontWeight: 600 }}>{form.targetType}</span>}
            {form.teamSize   && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--bg3)', color: 'var(--text3)', fontWeight: 500 }}>{form.teamSize} Personen</span>}
          </div>
          {form.description
            ? <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.65 }}>{form.description}</p>
            : <p style={{ fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Noch keine Beschreibung…</p>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```
npx vite build --mode development 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```
git add src/components/company/UnternehmensProfil.jsx
git commit -m "feat: Unternehmensprofil page with form and preview card"
```

---

### Task 6: ModuleManager + CustomerHeader Dynamic Tabs

**Files:**
- Modify: `src/components/company/ModuleManager.jsx`
- Modify: `src/components/customer/CustomerHeader.jsx`

- [ ] **Step 1: Replace ModuleManager stub**

```jsx
import { useStore } from '../../store'

const MODULE_DEFS = [
  { key: 'crm',         label: 'CRM',             required: true,  description: 'Kundenverwaltung, Kontakte und Aktivitäten — das Herzstück von Cynera.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg> },
  { key: 'workflow',    label: 'Workflow',         required: false, description: 'To-Dos, Notizen und Aufgabenverwaltung für jeden Kunden.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4"/></svg> },
  { key: 'socialMedia', label: 'Social Media',     required: false, description: 'Instagram-Analyse, Reels-Tracking und Reporting.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg> },
  { key: 'deals',       label: 'Deals / Pipeline', required: false, description: 'Vertriebspipeline und Deal-Tracking. (Coming soon)',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg> },
  { key: 'followUps',   label: 'Follow-Ups',       required: false, description: 'Automatische Erinnerungen und Follow-Up-Planung. (Coming soon)',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
  { key: 'healthScore', label: 'Health Score',     required: false, description: 'Kundengesundheit, Performance-Monitoring und Score-Tracking.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
  { key: 'aiInsights',  label: 'AI Insights',      required: false, description: 'KI-gestützte Kundenanalysen und Empfehlungen. (Coming soon)',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg> },
]

function Toggle({ on, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!on)} style={{
      width: 44, height: 24, borderRadius: 99, padding: '0 3px',
      background: on ? 'var(--p)' : 'var(--bg4)',
      border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', transition: 'background 0.2s', flexShrink: 0,
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transform: on ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

export function ModuleManager() {
  const modules   = useStore(s => s.modules)
  const setModule = useStore(s => s.setModule)

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>Module</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Aktiviere oder deaktiviere Funktionen für deinen Workspace</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {MODULE_DEFS.map(mod => {
          const active = modules[mod.key]
          return (
            <div key={mod.key} style={{
              background: 'var(--bg1)', border: `1px solid ${active ? 'var(--border3)' : 'var(--border)'}`,
              borderRadius: 'var(--r-lg)', padding: '20px',
              display: 'flex', gap: 16, alignItems: 'flex-start',
              opacity: !active && !mod.required ? 0.65 : 1,
              transition: 'opacity 0.2s, border-color 0.2s',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: active ? 'var(--p5)' : 'var(--bg3)',
                border: `1px solid ${active ? 'var(--border3)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: active ? 'var(--p)' : 'var(--text3)', transition: 'all 0.2s',
              }}>{mod.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{mod.label}</span>
                  {mod.required
                    ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--p5)', color: 'var(--p)', fontWeight: 600 }}>Immer aktiv</span>
                    : <Toggle on={active} onChange={v => setModule(mod.key, v)} />}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.55, margin: 0 }}>{mod.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `CustomerHeader.jsx` for dynamic tabs**

Replace the `const TABS = [...]` constant and the function signature with:

```jsx
import { useStore } from '../../store'
import { Avatar } from '../ui/Avatar'
import { healthColor, timeAgo } from '../../utils/helpers'

const ALL_TABS = [
  { id: 'dashboard',     label: 'Dashboard',     moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg> },
  { id: 'workflow',      label: 'Workflow',       moduleKey: 'workflow',    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
  { id: 'ablage',        label: 'Ablage',         moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"/></svg> },
  { id: 'kommunikation', label: 'Kommunikation',  moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> },
  { id: 'historie',      label: 'Historie',       moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { id: 'health',        label: 'Health',         moduleKey: 'healthScore', icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
  { id: 'social',        label: 'Social Media',   moduleKey: 'socialMedia', icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg> },
]

export function CustomerHeader({ customer, healthScore, activeTab, onTabChange }) {
  const modules = useStore(s => s.modules)
  const score   = healthScore?.score
  const color   = healthColor(score)
  const tabs    = ALL_TABS.filter(t => t.moduleKey === null || modules[t.moduleKey])
  // rest of the function body unchanged — just replace `TABS` with `tabs` in the map
```

In the tab bar `{TABS.map(...)}` change to `{tabs.map(...)}`.

- [ ] **Step 3: Verify build**

```
npx vite build --mode development 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

```
git add src/components/company/ModuleManager.jsx src/components/customer/CustomerHeader.jsx
git commit -m "feat: ModuleManager page, dynamic CustomerHeader tabs"
```

---

### Task 7: CrmSettings Page

**Files:**
- Modify: `src/components/company/CrmSettings.jsx`

- [ ] **Step 1: Replace stub with full implementation**

```jsx
import { useState } from 'react'
import { useStore } from '../../store'

function ChipList({ items, onAdd, onRemove, addPlaceholder, addLabel }) {
  const [input, setInput] = useState('')
  const handleAdd = () => {
    const val = input.trim()
    if (!val || items.includes(val)) return
    onAdd(val); setInput('')
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, minHeight: 32 }}>
        {items.map(item => (
          <span key={item} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 99,
            background: 'var(--bg3)', border: '1px solid var(--border)',
            fontSize: 12, fontWeight: 500, color: 'var(--text2)',
          }}>
            {item}
            <button onClick={() => onRemove(item)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text4)', fontSize: 14, lineHeight: 1, padding: 0,
              display: 'flex', alignItems: 'center',
            }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text4)'}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={addPlaceholder}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
          onBlur={e => e.target.style.borderColor = 'var(--border2)'}
        />
        <button onClick={handleAdd} style={{
          padding: '8px 14px', borderRadius: 'var(--r-md)',
          background: 'var(--p5)', border: '1px solid var(--border3)',
          color: 'var(--p)', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>{addLabel}</button>
      </div>
    </div>
  )
}

export function CrmSettings() {
  const crmSettings      = useStore(s => s.crmSettings)
  const updateCrmSettings = useStore(s => s.updateCrmSettings)

  const addStatus    = v => updateCrmSettings({ statuses: [...crmSettings.statuses, v] })
  const removeStatus = v => updateCrmSettings({ statuses: crmSettings.statuses.filter(s => s !== v) })
  const addTag       = v => updateCrmSettings({ tags: [...crmSettings.tags, v] })
  const removeTag    = v => updateCrmSettings({ tags: crmSettings.tags.filter(t => t !== v) })

  const cardStyle = {
    background: 'var(--bg1)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)', padding: '22px',
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>CRM-Einstellungen</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Passe das CRM an deinen Workflow an</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Status</div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>Erscheinen als Dropdown beim Anlegen von Kunden.</p>
          <ChipList items={crmSettings.statuses} onAdd={addStatus} onRemove={removeStatus} addPlaceholder="Neuer Status…" addLabel="+ Status" />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Tags</div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>Kunden-Tags zur Kategorisierung und Filterung.</p>
          <ChipList items={crmSettings.tags} onAdd={addTag} onRemove={removeTag} addPlaceholder="Neuer Tag…" addLabel="+ Tag" />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Follow-Ups</div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>Automatische Erinnerungen nach dem letzten Kundenkontakt.</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>Aktivieren</span>
            <button onClick={() => updateCrmSettings({ followUpEnabled: !crmSettings.followUpEnabled })} style={{
              width: 44, height: 24, borderRadius: 99, padding: '0 3px',
              background: crmSettings.followUpEnabled ? 'var(--p)' : 'var(--bg4)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background 0.2s',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transform: crmSettings.followUpEnabled ? 'translateX(20px)' : 'translateX(0)',
                transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
          {crmSettings.followUpEnabled && (
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Standard-Zeitraum</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" min={1} max={365} value={crmSettings.followUpDays}
                  onChange={e => updateCrmSettings({ followUpDays: Math.max(1, Number(e.target.value)) })}
                  style={{ width: 70, padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>Tage</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```
npx vite build --mode development 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```
git add src/components/company/CrmSettings.jsx
git commit -m "feat: CRM-Einstellungen page with status/tag chips and follow-up toggle"
```

---

### Task 8: WorkspaceInfo Page

**Files:**
- Modify: `src/components/company/WorkspaceInfo.jsx`

- [ ] **Step 1: Replace stub with full implementation**

```jsx
import { useState } from 'react'
import { useStore } from '../../store'

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 22px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export function WorkspaceInfo() {
  const workspaceName      = useStore(s => s.workspaceName)
  const workspaceCreatedAt = useStore(s => s.workspaceCreatedAt)
  const setWorkspaceName   = useStore(s => s.setWorkspaceName)
  const customers          = useStore(s => s.customers)
  const modules            = useStore(s => s.modules)

  const [editing,   setEditing]   = useState(false)
  const [nameInput, setNameInput] = useState(workspaceName)

  const activeModules = Object.values(modules).filter(Boolean).length

  const storageKb = (() => {
    try {
      let total = 0
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          total += (localStorage[key].length + key.length) * 2
        }
      }
      return Math.round(total / 1024)
    } catch { return '—' }
  })()

  const createdDate = workspaceCreatedAt
    ? new Date(workspaceCreatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  const handleSave = () => {
    if (nameInput.trim()) setWorkspaceName(nameInput.trim())
    setEditing(false)
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>Workspace</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Technische Informationen und Konfiguration</p>
      </div>

      {/* Name card */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '22px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 8 }}>Workspace-Name</div>
          {editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
                autoFocus
                style={{ padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid rgba(124,58,237,0.5)', color: 'var(--text)', fontSize: 18, fontWeight: 700, fontFamily: 'inherit', outline: 'none', letterSpacing: '-0.02em' }} />
              <button onClick={handleSave} style={{ padding: '8px 16px', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Speichern</button>
              <button onClick={() => setEditing(false)} style={{ padding: '8px 14px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
            </div>
          ) : (
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>{workspaceName}</div>
          )}
        </div>
        {!editing && (
          <button onClick={() => { setNameInput(workspaceName); setEditing(true) }} style={{
            padding: '8px 16px', borderRadius: 'var(--r-md)',
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            color: 'var(--text2)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', flexShrink: 0,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--p5)'; e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
          >Umbenennen</button>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard label="Erstellt am" value={createdDate} />
        <StatCard label="Kunden" value={customers.length} sub="gesamt" />
        <StatCard label="Aktive Module" value={activeModules} sub={`von ${Object.keys(modules).length} verfügbar`} />
        <StatCard label="Speicherverbrauch" value={`${storageKb} KB`} sub="localStorage" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all store tests**

```
npx vitest run src/test/store/
```
Expected: all tests PASS

- [ ] **Step 3: Final build check**

```
npx vite build --mode development 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 4: Final commit**

```
git add src/components/company/WorkspaceInfo.jsx
git commit -m "feat: WorkspaceInfo page with stats and rename"
```
