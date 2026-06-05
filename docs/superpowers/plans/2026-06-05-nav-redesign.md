# Nav-Redesign & Deutsch-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Navigation auf 7 Items reduzieren (kein Sections-Label), alles auf Deutsch, Akquise-Route (Leads+Pipeline+Follow-ups vereint), Posteingang-Route (Mail+Kalender vereint), CORRA per ⌘K überall erreichbar, Heute ohne Workspace/Sales-Tabs.

**Architecture:** Additive Strategie — neue Routes (AkquiseRoute, PosteingangRoute) werden als Wrapper über bestehenden Routes gebaut. Alte AppView-Werte ('leads', 'pipeline', 'followups', 'mail', 'calendar') werden per Redirect auf neue Views umgeleitet, keine bestehenden Routes werden gelöscht. NavSidebar wird komplett neu geschrieben. DashboardView-Tabs entfallen, Heute zeigt direkt die CORRA-Queue.

**Tech Stack:** React 18, Zustand (ui.store), Lucide Icons, Inline Styles, TipTap (unverändert), Framer Motion (unverändert).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/store/ui.store.ts` | Modify | 'akquise' + 'posteingang' zu AppView hinzufügen |
| `src/routes/AkquiseRoute.tsx` | Create | Wrapper: Leads + Pipeline + Wiedervorlagen als Tabs |
| `src/routes/PosteingangRoute.tsx` | Create | Wrapper: Mails + Kalender als Tabs |
| `src/components/layout/NavSidebar.tsx` | Modify | Komplett neu: 7 Items, kein Sections-Label, alles Deutsch |
| `src/App.tsx` | Modify | Neue Cases, CORRA ⌘K, Redirects für alte Views |
| `src/routes/DashboardRoute.tsx` | Modify | DashboardTabs (Workspace/Sales) entfernen, Header vereinfachen |
| `src/routes/CustomerRoute.tsx` | Modify | 'Tasks' → 'Aufgaben' in TAB_DEFS |

---

## Task 1: ui.store.ts — AppView erweitern

**Files:**
- Modify: `src/store/ui.store.ts`

- [ ] **Step 1: AppView Typ erweitern**

In `src/store/ui.store.ts` die `AppView`-Typdefinition (Zeile 88–94) ersetzen:

```typescript
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'akquise'  | 'invoices'
  | 'settings'  | 'integrations'
  | 'posteingang'
  | 'pipeline'  | 'calendar' | 'mail' | 'followups' | 'leads'
  | 'journal'   | 'focus'    | 'corra'
  | 'notes'     | 'inbox'    | 'sales'
```

- [ ] **Step 2: DashboardView Typ vereinfachen**

`DashboardView` wird nicht mehr gebraucht — die Workspace/Sales-Tabs in Heute fallen weg. Den Typ lassen wir stehen (breaking-change vermeiden), setzen ihn aber auf einen einzigen Wert. Zeile 27 ändern:

```typescript
/** @deprecated Tabs entfernt — Heute zeigt direkt die Queue */
export type DashboardView = 'workspace' | 'sales'
```

- [ ] **Step 3: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "ui.store" | head -10
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/store/ui.store.ts
git commit -m "feat(nav): AppView um 'akquise' + 'posteingang' erweitern"
```

---

## Task 2: AkquiseRoute — Leads + Pipeline + Wiedervorlagen

**Files:**
- Create: `src/routes/AkquiseRoute.tsx`

- [ ] **Step 1: Datei erstellen**

```tsx
// src/routes/AkquiseRoute.tsx
import { useState } from 'react'
import { Target, TrendingUp, Reply } from 'lucide-react'
import { LeadsRoute }            from './LeadsRoute'
import { PipelineRoute }         from './PipelineRoute'
import { FollowupsDashboardRoute } from './FollowupsDashboardRoute'
import { useLeadsStore }  from '@/store/leads.store'
import { useDealsStore }  from '@/store/deals.store'
import { useActivitiesStore } from '@/store/activities.store'

type AkquiseTab = 'leads' | 'pipeline' | 'wiedervorlagen'

const TABS: { id: AkquiseTab; label: string; icon: typeof Target }[] = [
  { id: 'leads',          label: 'Leads',          icon: Target     },
  { id: 'pipeline',       label: 'Pipeline',       icon: TrendingUp },
  { id: 'wiedervorlagen', label: 'Wiedervorlagen', icon: Reply      },
]

export function AkquiseRoute() {
  const [tab, setTab] = useState<AkquiseTab>('leads')

  const newLeadCount  = useLeadsStore(s => s.newLeads().length)
  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )
  const dueCount = useActivitiesStore(s =>
    s.activities.filter(a => a.type === 'followup' && a.status === 'open').length
  )

  const badge: Partial<Record<AkquiseTab, number>> = {
    leads:          newLeadCount  || 0,
    pipeline:       openDealCount || 0,
    wiedervorlagen: dueCount      || 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab-Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        background: 'var(--bg)',
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          const count  = badge[t.id] ?? 0
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '12px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                color: active ? 'var(--fg)' : 'var(--fg-dim)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                transition: 'color 140ms',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: active ? 'var(--accent-ink)' : 'var(--fg-dim)',
                  padding: '1px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'leads'          && <LeadsRoute />}
        {tab === 'pipeline'       && <PipelineRoute />}
        {tab === 'wiedervorlagen' && <FollowupsDashboardRoute />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Prüfen ob `useActivitiesStore` den `activities`-Array hat**

```bash
grep -n "activities:" src/store/activities.store.ts | head -5
```

Falls das Feld anders heißt (z.B. `items`), den Code in AkquiseRoute.tsx entsprechend anpassen. Falls `useActivitiesStore` keinen direkten activities-Array hat, `dueCount` auf 0 setzen:
```tsx
const dueCount = 0
```

- [ ] **Step 3: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "AkquiseRoute" | head -10
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/routes/AkquiseRoute.tsx
git commit -m "feat(nav): AkquiseRoute — Leads + Pipeline + Wiedervorlagen als Tabs"
```

---

## Task 3: PosteingangRoute — Mail + Kalender

**Files:**
- Create: `src/routes/PosteingangRoute.tsx`

- [ ] **Step 1: Datei erstellen**

```tsx
// src/routes/PosteingangRoute.tsx
import { useState } from 'react'
import { Mail, Calendar } from 'lucide-react'
import { MailRoute }     from './MailRoute'
import { CalendarRoute } from './CalendarRoute'
import { useMailStore }  from '@/store/mail.store'

type PosteingangTab = 'mails' | 'kalender'

export function PosteingangRoute() {
  const [tab, setTab] = useState<PosteingangTab>('mails')

  const unreadCount = useMailStore(s =>
    s.emails.filter(e => !e.read).length
  )

  const TABS: { id: PosteingangTab; label: string; icon: typeof Mail; badge?: number }[] = [
    { id: 'mails',    label: 'Mails',    icon: Mail,     badge: unreadCount || 0 },
    { id: 'kalender', label: 'Kalender', icon: Calendar },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab-Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        background: 'var(--bg)',
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          const count  = t.badge ?? 0
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '12px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                color: active ? 'var(--fg)' : 'var(--fg-dim)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                transition: 'color 140ms',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: active ? 'var(--accent-ink)' : 'var(--fg-dim)',
                  padding: '1px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'mails'    && <MailRoute />}
        {tab === 'kalender' && <CalendarRoute />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Prüfen ob `useMailStore` ein `emails`-Array mit `read`-Feld hat**

```bash
grep -n "read\|emails:" src/store/mail.store.ts | head -10
```

Falls `emails` anders heißt oder `read` ein anderes Feld ist, Badge-Logik anpassen. Falls unsicher: `unreadCount` auf 0 setzen.

- [ ] **Step 3: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "PosteingangRoute" | head -10
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/routes/PosteingangRoute.tsx
git commit -m "feat(nav): PosteingangRoute — Mail + Kalender als Tabs"
```

---

## Task 4: NavSidebar — Komplett neu

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`

- [ ] **Step 1: NavSidebar.tsx komplett ersetzen**

Die gesamte Datei ersetzen mit:

```tsx
import { useEffect } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useCustomersStore } from '@/store/customers.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCompanyStore } from '@/store/company.store'
import { useMailStore } from '@/store/mail.store'
import {
  Home, Users, CreditCard, Target, Inbox,
  Settings, PanelLeftClose, PanelLeftOpen, PenLine, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function NavItem({
  icon: Ic, label, active, onClick, badge, kbd,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; kbd?: string
}) {
  return (
    <div className="nav-item" data-active={String(active)} onClick={onClick} title={label}>
      <Ic size={17} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
      {kbd && !badge ? <span className="nav-kbd">{kbd}</span> : null}
    </div>
  )
}

function NavDivider() {
  return (
    <div style={{
      height: 1, background: 'rgba(255,255,255,0.06)',
      margin: '6px 12px',
    }} />
  )
}

export function NavSidebar() {
  const appView         = useUiStore(s => s.appView)
  const setAppView      = useUiStore(s => s.setAppView)
  const collapsed       = useUiStore(s => s.sidebarCollapsed)
  const setQuickCapture = useUiStore(s => s.setQuickCaptureOpen)
  const toggleSidebar   = useUiStore(s => s.toggleSidebar)
  const enterPrivate    = useUiStore(s => s.enterPrivate)
  const user            = useAuthStore(s => s.user)
  const modules         = useCompanyStore(s => s.modules)
  const isAdmin         = useCompanyStore(s => s.isAdmin)

  const clientsCount  = useCustomersStore(s => s.customers.length)
  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )
  const newLeadsCount = useLeadsStore(s => s.newLeads().length)
  const unreadMails   = useMailStore(s => s.emails.filter(e => !e.read).length)

  const mod = (key: keyof typeof modules, defaultOn = true) =>
    modules[key] === undefined ? defaultOn : !!modules[key]

  // Redirects: alte Views auf neue umleiten
  useEffect(() => {
    if (appView === 'leads' || appView === 'pipeline' || appView === 'followups') {
      setAppView('akquise')
    }
    if (appView === 'mail' || appView === 'calendar') {
      setAppView('posteingang')
    }
    if (!mod('crm') && (appView === 'clients' || appView === 'akquise')) {
      setAppView('dashboard')
    }
    if (!mod('finanzen') && appView === 'invoices') setAppView('dashboard')
  }, [modules, appView, setAppView])

  const akquiseBadge = (newLeadsCount + openDealCount) || undefined
  const posteingangBadge = unreadMails || undefined

  const initials    = user?.email ? user.email.slice(0, 2).toUpperCase() : 'CY'
  const displayName = user?.email?.split('@')[0] ?? 'Nutzer'

  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>
      {/* Brand */}
      <div className="sidebar-brand" data-tauri-drag-region>
        <div className="sidebar-brand-logo">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="22" fill="oklch(92% 0.2 125)"/>
            <rect x="36" y="19" width="40" height="13" rx="6.5" fill="oklch(15% 0 0)" transform="rotate(-28 56 25.5)"/>
            <rect x="24" y="46" width="44" height="13" rx="6.5" fill="oklch(15% 0 0)" transform="rotate(-23 46 52.5)"/>
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <strong>Focus</strong>
          <span>CYNERA · 2026</span>
        </div>
      </div>

      {/* Hauptnavigation */}
      <NavItem
        icon={Home}     label="Heute"   active={appView === 'dashboard'}
        onClick={() => setAppView('dashboard')} kbd="H"
      />

      {/* CORRA — prominent, mit Sonderdesign */}
      <div
        className="corra-nav-button"
        data-active={appView === 'corra' ? 'true' : 'false'}
        onClick={() => setAppView('corra')}
        title="CORRA Intelligence (⌘K)"
      >
        <div className="corra-nav-orb">
          <Sparkles size={12} />
        </div>
        <div className="corra-nav-text">
          <span>CORRA</span>
          <small>Intelligence</small>
        </div>
      </div>

      <NavDivider />

      {mod('crm') && (
        <NavItem
          icon={Users} label="Kunden" active={appView === 'clients'}
          onClick={() => setAppView('clients')} kbd="K"
          badge={clientsCount || undefined}
        />
      )}
      {mod('crm') && (
        <NavItem
          icon={Target} label="Akquise" active={appView === 'akquise'}
          onClick={() => setAppView('akquise')} kbd="A"
          badge={akquiseBadge}
        />
      )}
      {mod('finanzen') && isAdmin && (
        <NavItem
          icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
          onClick={() => setAppView('invoices')} kbd="F"
        />
      )}
      {(mod('mail') || mod('kalender')) && (
        <NavItem
          icon={Inbox} label="Posteingang" active={appView === 'posteingang'}
          onClick={() => setAppView('posteingang')} kbd="P"
          badge={posteingangBadge}
        />
      )}

      <div style={{ flex: 1 }} />

      {/* Quick Capture */}
      <button
        type="button"
        onClick={() => setQuickCapture(true)}
        title="Quick Capture (⌘⇧N)"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed ? '10px 0' : '10px 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          margin: '0 8px 4px',
          borderRadius: 10, border: '1px dashed var(--border)',
          background: 'transparent', cursor: 'pointer',
          color: 'var(--fg-dim)', fontSize: 12,
          transition: 'all 140ms',
          width: 'calc(100% - 16px)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--accent)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--fg-dim)'
        }}
      >
        <PenLine size={14} style={{ flexShrink: 0 }} />
        {!collapsed && <span>Quick Capture</span>}
      </button>

      {/* Sidebar collapse */}
      <button
        className="sidebar-collapse-btn"
        onClick={toggleSidebar}
        title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
      >
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>

      <NavItem
        icon={Settings} label="Einstellungen" active={appView === 'settings'}
        onClick={() => setAppView('settings')}
      />

      {/* Privater Raum */}
      <div
        className="sidebar-user"
        onClick={() => enterPrivate()}
        title="Privater Raum öffnen"
        style={{ cursor: 'pointer' }}
      >
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-text">
          <strong>{displayName}</strong>
          <span>Privater Raum</span>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "NavSidebar" | head -10
```

Expected: keine Fehler. Falls `useMailStore` kein `emails`-Array mit `read`-Feld hat, die `unreadMails`-Zeile auf `0` setzen.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/NavSidebar.tsx
git commit -m "feat(nav): NavSidebar komplett neu — 7 Items, kein Sections-Label, alles Deutsch"
```

---

## Task 5: App.tsx — Neue Routes + CORRA ⌘K

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Imports hinzufügen**

Am Ende der Route-Imports in `src/App.tsx` hinzufügen:

```tsx
import { AkquiseRoute }     from '@/routes/AkquiseRoute'
import { PosteingangRoute } from '@/routes/PosteingangRoute'
```

- [ ] **Step 2: renderMain() erweitern**

Die `renderMain()`-Funktion (aktuell Zeilen 195–216): alle neuen Cases und Redirects eintragen.

Altes `renderMain()` ersetzen durch:

```tsx
const renderMain = () => {
  switch (appView) {
    case 'dashboard':    return <DashboardRoute />
    case 'profile':      return <ProfileRoute />
    case 'clients':      return <ClientsRoute />
    case 'invoices':     return <FinanceRoute />
    case 'akquise':      return <AkquiseRoute />
    case 'posteingang':  return <PosteingangRoute />
    case 'journal':      return <JournalRoute />
    case 'settings':     return <SettingsRoute />
    case 'integrations': return <IntegrationsRoute />
    case 'corra':        return <CorraRoute />
    case 'notes':        return <NotesRoute />
    // Redirects — alte Views auf neue umleiten
    case 'leads':        return <AkquiseRoute />
    case 'pipeline':     return <AkquiseRoute />
    case 'followups':    return <AkquiseRoute />
    case 'mail':         return <PosteingangRoute />
    case 'calendar':     return <PosteingangRoute />
    case 'sales':        return <AkquiseRoute />
    case 'inbox':        return <PosteingangRoute />
    default:             return <DashboardRoute />
  }
}
```

- [ ] **Step 3: CORRA ⌘K Shortcut**

Im bestehenden `useEffect` Keyboard-Handler (Zeilen 110–132) den ⌘K-Handler anpassen. Aktuell öffnet ⌘K den Client Picker. Neues Verhalten: ⌘K → CORRA, ⌘Shift+K → Client Picker.

Den Handler ersetzen:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Cmd/Ctrl+K → CORRA Intelligence
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
      e.preventDefault()
      setAppView('corra')
      return
    }
    // Cmd/Ctrl+Shift+K → Kunden-Schnellsuche (ehemals ⌘K)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'k') {
      e.preventDefault()
      openPicker()
      return
    }
    // Cmd/Ctrl+J → Globale Suche
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault()
      setCmdPaletteOpen(true)
      return
    }
    // Cmd/Ctrl+Shift+N → Quick Capture
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
      e.preventDefault()
      setQuickCaptureOpen(true)
      return
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [openPicker, setCmdPaletteOpen, setQuickCaptureOpen, setAppView])
```

**Wichtig:** `setAppView` muss in der Dependency-Liste sein — sicherstellen dass der Hook `setAppView` aus `useUiStore` bezieht, was er bereits tut.

- [ ] **Step 4: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "error" | grep -v "node_modules" | grep -v "slashMenu\|ArbeitsraumPane" | head -20
```

Expected: 0 Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(nav): AkquiseRoute + PosteingangRoute in App.tsx, CORRA per ⌘K"
```

---

## Task 6: DashboardRoute — Heute ohne Workspace/Sales-Tabs

**Files:**
- Modify: `src/routes/DashboardRoute.tsx`

- [ ] **Step 1: DashboardTabs-Komponente und ihre Verwendung entfernen**

Lese `src/routes/DashboardRoute.tsx` Zeilen 125–170 (die `DashboardTabs`-Komponente).

Drei Änderungen:

**A) DashboardTabs-Funktion komplett löschen** (die gesamte Funktion `function DashboardTabs(...)`)

**B) In `DashboardHero`** die Zeilen entfernen die `DashboardTabs` rendern und den `view`/`setDashboardView`-State verwenden. Die Funktion vereinfachen auf:

```tsx
function DashboardHero({ name }: { name: string }) {
  const now = new Date()
  const dateLine = `${WEEKDAYS[now.getDay()]} · ${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 24, padding: '8px 4px 24px',
    }}>
      <div>
        <h1 style={{
          fontSize: 42, fontWeight: 700, letterSpacing: '-0.025em',
          lineHeight: 1.05, color: 'var(--fg)', margin: 0,
        }}>
          {greeting()}, <span style={{ color: 'var(--accent)' }}>{name}.</span>
        </h1>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 10,
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontWeight: 600,
        }}>
          <span>{dateLine}</span>
        </div>
      </div>
    </div>
  )
}
```

**C) Im Haupt-Body von `DashboardRoute`** den Abschnitt finden der `dashboardView === 'sales'` vs. `'workspace'` unterscheidet. Diesen Conditional-Render entfernen — nur noch die Workspace-Ansicht (KPI-Cards + HeuteTile) rendern, kein Sales-Tab mehr.

Konkret: Alle `dashboardView`-Checks entfernen, nur den Workspace-Content behalten. Nicht verwendete Imports (`useUiStore`'s `DashboardView`, `setDashboardView`) entfernen.

- [ ] **Step 2: Nicht mehr verwendete Imports bereinigen**

```bash
npx tsc --noEmit 2>&1 | grep "DashboardRoute" | head -15
```

Alle verbleibenden Import-Fehler beheben (nicht verwendete Variablen/Imports entfernen).

- [ ] **Step 3: TypeScript vollständig prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "error" | grep -v "node_modules" | grep -v "slashMenu\|ArbeitsraumPane" | head -20
```

Expected: 0 Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/routes/DashboardRoute.tsx
git commit -m "feat(nav): Heute ohne Workspace/Sales-Tabs — direkt zur Queue"
```

---

## Task 7: Sprache — CustomerRoute + globale Fixes

**Files:**
- Modify: `src/routes/CustomerRoute.tsx`

- [ ] **Step 1: TAB_DEFS in CustomerRoute.tsx anpassen**

In `src/routes/CustomerRoute.tsx` die `TAB_DEFS`-Konstante (Zeilen 37–45) ändern:

```typescript
const TAB_DEFS: { id: CustomerTab; label: string; icon: LucideIcon }[] = [
  { id: 'cockpit',        label: 'Cockpit',        icon: Target      },
  { id: 'tasks',          label: 'Aufgaben',        icon: CheckCircle },
  { id: 'notizen',        label: 'Notizen',         icon: FileText    },
  { id: 'dokumente',      label: 'Dokumente',       icon: File        },
  { id: 'kommunikation',  label: 'Kommunikation',   icon: Mail        },
  { id: 'verlauf',        label: 'Verlauf',         icon: History     },
  { id: 'finanzen',       label: 'Finanzen',        icon: Euro        },
]
```

Änderung: `'Tasks'` → `'Aufgaben'`

- [ ] **Step 2: Integrationen-Nav prüfen**

In der alten NavSidebar war `Integrationen` als Nav-Item. In der neuen Sidebar ist es nicht mehr als eigenes Item vorhanden. Prüfen ob `IntegrationsRoute` noch erreichbar ist (über Settings-Tab oder direkt):

```bash
grep -n "integrations\|Integrationen" src/routes/SettingsRoute.tsx | head -10
```

Falls Integrationen in den Settings erreichbar sind: gut. Falls nicht, einen Tab in SettingsRoute hinzufügen. Falls schon ein Tab existiert: nichts tun.

- [ ] **Step 3: Überprüfung 'Clients' Label überall**

```bash
grep -rn '"Clients"\|'\''Clients'\''' src/components src/routes 2>/dev/null | grep -v "node_modules" | head -20
```

Jeden Fund von `"Clients"` als Display-Label durch `"Kunden"` ersetzen. IDs (`appView === 'clients'`) bleiben unverändert.

- [ ] **Step 4: TypeScript Abschlusscheck**

```bash
npx tsc --noEmit 2>&1 | grep "error" | grep -v "node_modules" | grep -v "slashMenu\|ArbeitsraumPane" | head -20
```

Expected: 0 Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/routes/CustomerRoute.tsx
git commit -m "feat(nav): 'Tasks' → 'Aufgaben', 'Clients' → 'Kunden' überall"
```

---

## Smoke-Test Checkliste (nach allen Tasks)

Nach dem letzten Commit manuell prüfen:

- [ ] App startet ohne Fehler
- [ ] Sidebar zeigt: Heute, CORRA, [Divider], Kunden, Akquise, Finanzen, Posteingang
- [ ] Kein Sections-Label mehr (WORKSPACE / SALES / INBOX)
- [ ] ⌘K öffnet CORRA
- [ ] ⌘Shift+K öffnet Kunden-Picker
- [ ] Akquise → zeigt Tabs: Leads | Pipeline | Wiedervorlagen
- [ ] Posteingang → zeigt Tabs: Mails | Kalender
- [ ] Heute → kein Workspace/Sales-Tab-Switcher mehr
- [ ] Kunden-Detail → Tab "Tasks" heißt jetzt "Aufgaben"
- [ ] Alte Keyboard-Shortcuts (H, K, A, F, P) funktionieren
