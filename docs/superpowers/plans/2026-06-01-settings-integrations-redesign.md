# Settings + Integrationen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings-Seite mit Sidebar-Navigation neu aufbauen und neue Integrationen-Seite (Zeilen-Liste mit 6 Einträgen) als eigenen Nav-Punkt einführen.

**Architecture:** Settings wird von einer 787-Zeilen-Flatlist in ein Sidebar+Content-Layout mit 5 Sub-Panels aufgeteilt. Integrationen ist eine neue Route. Beide teilen sich die AppView-Erweiterung und den neuen NavSidebar-Eintrag. Kein neues Backend — alle Daten kommen aus bestehenden Stores/localStorage/env-vars.

**Tech Stack:** React + TypeScript, Zustand (ui.store persist), lucide-react, bestehende CSS-Variablen (`--surface`, `--border`, `--accent` etc.)

---

## File Map

| Datei | Aktion |
|---|---|
| `src/store/ui.store.ts` | MODIFY — `SettingsTab`-Typ, `settingsTab` State, `setSettingsTab` Action, `'integrations'` zu `AppView` |
| `src/components/layout/NavSidebar.tsx` | MODIFY — Plug-Icon + neuer Nav-Eintrag "Integrationen" |
| `src/App.tsx` | MODIFY — IntegrationsRoute Import + case |
| `src/routes/SettingsRoute.tsx` | REWRITE — Sidebar-Layout, delegiert an 5 Panel-Komponenten |
| `src/components/settings/SettingsSidebar.tsx` | NEU — Kategorie-Navigation links |
| `src/components/settings/WorkspaceSettings.tsx` | NEU — Name, ID |
| `src/components/settings/ProfilSettings.tsx` | NEU — Anzeigename, E-Mail |
| `src/components/settings/AussehensSettings.tsx` | NEU — Theme-Kacheln (extrahiert aus bestehendem Code) |
| `src/components/settings/DeveloperSettings.tsx` | NEU — Supabase, Webhook, AI-Key, Modell |
| `src/components/settings/GefahrenzoneSettings.tsx` | NEU — Export-Button, Reset-Confirm |
| `src/routes/IntegrationsRoute.tsx` | NEU — Zeilen-Liste der 6 Integrationen |
| `src/components/integrations/IntegrationRow.tsx` | NEU — einzelne Zeile: Icon, Name, Status, Button |
| `src/components/integrations/ZoomSetupModal.tsx` | NEU — Zoom Webhook-Anleitung |
| `src/components/integrations/WebhookInfoModal.tsx` | NEU — Webhook URL + Secret |

---

## Task 1: AppView + SettingsTab + NavSidebar + App.tsx routing

**Files:**
- Modify: `src/store/ui.store.ts`
- Modify: `src/components/layout/NavSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Schritt 1: `src/store/ui.store.ts` — SettingsTab-Typ + State + 'integrations' AppView**

Vor `export type AppView` den neuen Typ einfügen:
```ts
export type SettingsTab = 'workspace' | 'profil' | 'aussehen' | 'developer' | 'gefahrenzone'
```

`AppView` erweitern — `'integrations'` hinzufügen:
```ts
export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'sales'     | 'invoices'  | 'inbox'
  | 'settings'  | 'integrations'
  | 'pipeline'  | 'calendar'   | 'mail' | 'followups' | 'leads'
  | 'journal'
```

In `UiState` Interface hinzufügen:
```ts
  settingsTab: SettingsTab
  setSettingsTab: (tab: SettingsTab) => void
```

Im `create`-Block Initialwert + Action hinzufügen (direkt nach `dashboardView: 'workspace'`):
```ts
      settingsTab: 'workspace',
```

Und in den Actionen (nach `setDashboardView`):
```ts
      setSettingsTab: (tab) => set({ settingsTab: tab }),
```

Da `settingsTab` persistiert werden soll, ist keine weitere Änderung nötig (der persist-Wrapper erfasst den gesamten State).

- [ ] **Schritt 2: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Erwartet: keine neuen Fehler

- [ ] **Schritt 3: `src/components/layout/NavSidebar.tsx` — Plug-Icon + neuer Eintrag**

Import ergänzen — `Plug` zu den lucide-react Importen hinzufügen:
```ts
import {
  Home, Users, CreditCard,
  TrendingUp, Target, Reply,
  Calendar, Mail, Settings, Plug,
  ChevronRight, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
```

Direkt **vor** dem bestehenden `<SidebarNavItem icon={Settings} ...>` (ca. Zeile 171) einfügen:
```tsx
      <SidebarNavItem icon={Plug} label="Integrationen" active={appView === 'integrations'} onClick={() => setAppView('integrations')} />
```

- [ ] **Schritt 4: `src/App.tsx` — IntegrationsRoute einbinden**

Import hinzufügen (bei den anderen Route-Imports):
```ts
import { IntegrationsRoute } from '@/routes/IntegrationsRoute'
```

Im Switch-Block nach `case 'settings':` hinzufügen:
```ts
      case 'integrations': return <IntegrationsRoute />
```

Temporär eine Placeholder-Datei anlegen damit der Import nicht bricht:
```bash
echo "export function IntegrationsRoute() { return <div>Integrationen</div> }" > src/routes/IntegrationsRoute.tsx
```

- [ ] **Schritt 5: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Erwartet: keine Fehler

- [ ] **Schritt 6: Commit**

```bash
git add src/store/ui.store.ts src/components/layout/NavSidebar.tsx src/App.tsx src/routes/IntegrationsRoute.tsx
git commit -m "feat(nav): Integrationen-Eintrag + AppView + SettingsTab"
```

---

## Task 2: Settings-Route Rewrite — Sidebar-Layout + SettingsSidebar

**Files:**
- Create: `src/components/settings/SettingsSidebar.tsx`
- Rewrite: `src/routes/SettingsRoute.tsx`

- [ ] **Schritt 1: `src/components/settings/SettingsSidebar.tsx` erstellen**

```tsx
import type { SettingsTab } from '@/store/ui.store'
import { Building2, User, Palette, Code2, AlertTriangle } from 'lucide-react'

const ITEMS: { key: SettingsTab; label: string; icon: React.FC<{ size?: number }> }[] = [
  { key: 'workspace',   label: 'Workspace',      icon: Building2    },
  { key: 'profil',      label: 'Profil',          icon: User         },
  { key: 'aussehen',    label: 'Erscheinungsbild', icon: Palette      },
  { key: 'developer',   label: 'Entwickler',       icon: Code2        },
  { key: 'gefahrenzone', label: 'Gefahrenzone',    icon: AlertTriangle },
]

interface Props {
  active: SettingsTab
  onChange: (tab: SettingsTab) => void
  showDeveloper: boolean
}

export function SettingsSidebar({ active, onChange, showDeveloper }: Props) {
  const visible = ITEMS.filter(i => i.key !== 'developer' || showDeveloper)

  return (
    <div style={{
      width: 200, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '12px 0',
    }}>
      {visible.map(item => {
        const Icon = item.icon
        const isActive = active === item.key
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 16px', width: '100%',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              border: 'none', cursor: 'pointer',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              color: isActive ? 'var(--accent)' : 'var(--fg-muted)',
              fontSize: 13, fontWeight: isActive ? 600 : 500,
              transition: 'background 120ms, color 120ms',
            }}
          >
            <Icon size={15} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Schritt 2: `src/routes/SettingsRoute.tsx` — kompletter Rewrite als Sidebar-Layout**

Die gesamte Datei ersetzen:

```tsx
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { WorkspaceSettings } from '@/components/settings/WorkspaceSettings'
import { ProfilSettings } from '@/components/settings/ProfilSettings'
import { AussehensSettings } from '@/components/settings/AussehensSettings'
import { DeveloperSettings } from '@/components/settings/DeveloperSettings'
import { GefahrenzoneSettings } from '@/components/settings/GefahrenzoneSettings'

export function SettingsRoute() {
  const settingsTab  = useUiStore(s => s.settingsTab)
  const setSettingsTab = useUiStore(s => s.setSettingsTab)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  // Entwickler-Tab nur im Dev-Build oder mit ?dev=1
  const showDeveloper = import.meta.env.DEV ||
    new URLSearchParams(window.location.search).has('dev')

  function renderPanel() {
    switch (settingsTab) {
      case 'workspace':    return <WorkspaceSettings workspaceId={workspaceId} />
      case 'profil':       return <ProfilSettings />
      case 'aussehen':     return <AussehensSettings />
      case 'developer':    return <DeveloperSettings workspaceId={workspaceId} />
      case 'gefahrenzone': return <GefahrenzoneSettings workspaceId={workspaceId} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      {/* Page header */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Settings.</h1>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <SettingsSidebar
            active={settingsTab}
            onChange={setSettingsTab}
            showDeveloper={showDeveloper}
          />
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
            {renderPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 3: TypeScript-Check (Panels fehlen noch — Fehler erwartet)**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "Cannot find module" | head -10
```

Fehler für fehlende Panel-Importe sind OK — werden in Task 3+4 behoben.

- [ ] **Schritt 4: Commit**

```bash
git add src/components/settings/SettingsSidebar.tsx src/routes/SettingsRoute.tsx
git commit -m "feat(settings): Sidebar-Layout + SettingsSidebar Kategorie-Navigation"
```

---

## Task 3: Settings-Panels — Workspace, Profil, Aussehen

**Files:**
- Create: `src/components/settings/WorkspaceSettings.tsx`
- Create: `src/components/settings/ProfilSettings.tsx`
- Create: `src/components/settings/AussehensSettings.tsx`

- [ ] **Schritt 1: `src/components/settings/WorkspaceSettings.tsx` erstellen**

```tsx
import { useState, useEffect } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCompanyStore } from '@/store/company.store'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input readOnly value={value} style={{
          flex: 1, padding: '8px 12px', fontSize: 12,
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--fg-dim)',
          outline: 'none', fontFamily: 'var(--font-mono)',
        }} />
        <button
          onClick={copy}
          style={{
            padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center',
          }}
        >
          {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

interface Props { workspaceId: string }

export function WorkspaceSettings({ workspaceId }: Props) {
  const profile     = useCompanyStore(s => s.profile)
  const load        = useCompanyStore(s => s.load)
  const saveProfile = useCompanyStore(s => s.saveProfile)
  const [name, setName] = useState(profile.name ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [load])
  useEffect(() => { setName(profile.name ?? '') }, [profile.name])

  const handleSave = async () => {
    await saveProfile({ ...profile, name })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Workspace</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Grundeinstellungen deines Workspace</p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Workspace Name
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSave}
              className="btn-primary"
              style={{ fontSize: 12, padding: '6px 16px' }}
            >
              {saved ? '✓ Gespeichert' : 'Speichern'}
            </button>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <CopyField label="Workspace ID" value={workspaceId} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: `src/components/settings/ProfilSettings.tsx` erstellen**

```tsx
import { useAuthStore } from '@/store/auth.store'

export function ProfilSettings() {
  const user = useAuthStore(s => s.user)
  const email = user?.email ?? '—'
  const initials = email.slice(0, 2).toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Profil</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Deine Nutzerdaten</p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Avatar */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{email}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>Administrator</div>
          </div>
        </div>

        {/* E-Mail (read-only) */}
        <div style={{ padding: '16px 20px' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            E-Mail
          </label>
          <input
            readOnly value={email}
            style={{
              width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--fg-dim)', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '6px 0 0' }}>
            E-Mail-Adresse wird über dein Supabase-Konto verwaltet.
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 3: `src/components/settings/AussehensSettings.tsx` erstellen**

Extrahiert aus dem Theme-Toggle-Code in der alten SettingsRoute:

```tsx
import { useUiStore } from '@/store/ui.store'

const THEMES = [
  {
    id: 'dark' as const,
    label: 'Dunkel',
    preview: (
      <div style={{ width: '100%', height: 80, background: 'oklch(17% 0.005 270)', borderRadius: 8, padding: 8, boxSizing: 'border-box' }}>
        <div style={{ height: 12, background: 'oklch(23% 0.007 270)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, background: 'oklch(27% 0.009 270)', borderRadius: 4, width: '70%' }} />
      </div>
    ),
  },
  {
    id: 'light' as const,
    label: 'Hell',
    preview: (
      <div style={{ width: '100%', height: 80, background: 'oklch(98% 0.003 90)', borderRadius: 8, padding: 8, border: '1px solid oklch(89% 0.005 90)', boxSizing: 'border-box' }}>
        <div style={{ height: 12, background: 'oklch(94% 0.005 90)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, background: 'oklch(89% 0.005 90)', borderRadius: 4, width: '70%' }} />
      </div>
    ),
  },
]

export function AussehensSettings() {
  const theme       = useUiStore(s => s.theme)
  const toggleTheme = useUiStore(s => s.toggleTheme)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Erscheinungsbild</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Theme und visuelle Einstellungen</p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 14 }}>Theme</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {THEMES.map(t => {
            const isActive = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => { if (theme !== t.id) toggleTheme() }}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, cursor: 'pointer',
                  border: isActive ? '2px solid var(--accent)' : '2px solid var(--border)',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface-2)',
                  display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch',
                  transition: 'border-color 140ms, background 140ms',
                }}
              >
                {t.preview}
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--fg-muted)', textAlign: 'center' }}>
                  {t.label}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 4: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Erwartet: nur noch Fehler für DeveloperSettings + GefahrenzoneSettings (noch nicht erstellt)

- [ ] **Schritt 5: Commit**

```bash
git add src/components/settings/WorkspaceSettings.tsx src/components/settings/ProfilSettings.tsx src/components/settings/AussehensSettings.tsx
git commit -m "feat(settings): Workspace, Profil, Aussehen Panels"
```

---

## Task 4: Settings-Panels — Developer + Gefahrenzone

**Files:**
- Create: `src/components/settings/DeveloperSettings.tsx`
- Create: `src/components/settings/GefahrenzoneSettings.tsx`

- [ ] **Schritt 1: `src/components/settings/DeveloperSettings.tsx` erstellen**

```tsx
import { useState } from 'react'
import { Eye, EyeOff, Copy, Check, Trash2 } from 'lucide-react'
import { getApiKey, setApiKey, clearApiKey, getModel, setModel } from '@/lib/ai/briefing'

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

const MODELS = [
  { id: 'claude-opus-4-8',              label: 'Claude Opus 4.8 (Stärkste)' },
  { id: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6 (Empfohlen)' },
  { id: 'claude-haiku-4-5-20251001',    label: 'Claude Haiku 4.5 (Schnell)' },
]

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      <button onClick={copy} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center' }}>
        {copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

interface Props { workspaceId: string }

export function DeveloperSettings({ workspaceId }: Props) {
  const [apiKey, setApiKeyState] = useState(getApiKey() ?? '')
  const [showKey, setShowKey] = useState(false)
  const [model, setModelState] = useState(getModel())
  const [keySaved, setKeySaved] = useState(false)

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      setApiKey(apiKey.trim())
    } else {
      clearApiKey()
    }
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  const handleClearKey = () => {
    clearApiKey()
    setApiKeyState('')
  }

  const handleModelChange = (m: string) => {
    setModelState(m)
    setModel(m)
  }

  const base = SUPABASE_URL ?? '—'
  const secret = WEBHOOK_SECRET ?? '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Entwickler</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Interne Konfiguration — nicht für Endkunden sichtbar</p>
      </div>

      {/* Supabase + Webhook URLs */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Backend</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {SUPABASE_URL
            ? <CopyRow label="Supabase URL" value={SUPABASE_URL} />
            : <div style={{ padding: '14px 20px', fontSize: 12, color: 'var(--warn)' }}>VITE_SUPABASE_URL nicht gesetzt</div>
          }
          {WEBHOOK_SECRET
            ? <>
                <CopyRow label="Zoom Webhook URL" value={`${base}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${secret}&source=zoom`} />
                <CopyRow label="Generic Webhook URL" value={`${base}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${secret}&source=generic`} />
              </>
            : <div style={{ padding: '14px 20px', fontSize: 12, color: 'var(--warn)', borderTop: '1px solid var(--border)' }}>VITE_LEAD_WEBHOOK_SECRET nicht gesetzt</div>
          }
        </div>
      </div>

      {/* AI API Key */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Anthropic API Key</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKeyState(e.target.value)}
                placeholder="sk-ant-api03-..."
                style={{
                  width: '100%', padding: '8px 36px 8px 12px', fontSize: 13, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--fg)', outline: 'none', fontFamily: 'var(--font-mono)',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => setShowKey(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 0 }}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={handleSaveKey} className="btn-primary" style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }}>
              {keySaved ? '✓' : 'Speichern'}
            </button>
            {apiKey && (
              <button onClick={handleClearKey} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modell */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Modell</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {MODELS.map((m, i) => (
            <button
              key={m.id}
              onClick={() => handleModelChange(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: i < MODELS.length - 1 ? '1px solid var(--border)' : 'none',
                color: 'var(--fg)',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${model === m.id ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: model === m.id ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {model === m.id && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-ink)' }} />}
              </div>
              <span style={{ fontSize: 13, fontWeight: model === m.id ? 600 : 400 }}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: `src/components/settings/GefahrenzoneSettings.tsx` erstellen**

```tsx
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useCustomersStore } from '@/store/customers.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'

interface Props { workspaceId: string }

export function GefahrenzoneSettings({ workspaceId }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const customers = useCustomersStore(s => s.customers)
  const deals     = useDealsStore(s => s.deals)
  const leads     = useLeadsStore(s => s.leads)

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      workspaceId,
      customers,
      deals,
      leads,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cynera-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Gefahrenzone</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Irreversible Aktionen — mit Bedacht verwenden</p>
      </div>

      {/* Export */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Daten exportieren</div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Exportiere alle Kunden, Deals und Leads als JSON-Datei.
        </p>
        <button onClick={handleExport} className="btn-ghost" style={{ fontSize: 12, padding: '7px 16px' }}>
          JSON exportieren
        </button>
      </div>

      {/* Reset */}
      <div style={{ background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={15} style={{ color: '#f87171' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>Workspace zurücksetzen</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Löscht alle Kunden, Deals, Leads und Einstellungen. Nicht rückgängig machbar.
        </p>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={'Tippe "zurücksetzen" zum Bestätigen'}
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8, marginBottom: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <button
          disabled={confirmText !== 'zurücksetzen'}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: confirmText === 'zurücksetzen' ? 'pointer' : 'not-allowed',
            background: confirmText === 'zurücksetzen' ? '#ef4444' : 'var(--surface-2)',
            border: '1px solid ' + (confirmText === 'zurücksetzen' ? '#ef4444' : 'var(--border)'),
            color: confirmText === 'zurücksetzen' ? '#fff' : 'var(--fg-dim)',
            transition: 'background 140ms, color 140ms',
          }}
        >
          Workspace zurücksetzen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Erwartet: keine Fehler

- [ ] **Schritt 4: App starten + Settings manuell prüfen**

```bash
npm run tauri dev
```

Checkliste:
- [ ] Settings öffnet mit Sidebar links (5 Kategorien)
- [ ] Aktive Kategorie hat Akzent-Balken
- [ ] Workspace-Name speichert korrekt
- [ ] Theme-Kacheln wechseln Theme
- [ ] Entwickler-Tab nur in DEV-Build sichtbar
- [ ] API-Key: Eingabe, Eye/EyeOff, Speichern, Clear
- [ ] Export generiert JSON-Download

- [ ] **Schritt 5: Commit**

```bash
git add src/components/settings/DeveloperSettings.tsx src/components/settings/GefahrenzoneSettings.tsx
git commit -m "feat(settings): Developer + Gefahrenzone Panels"
```

---

## Task 5: IntegrationsRoute + IntegrationRow

**Files:**
- Create: `src/components/integrations/IntegrationRow.tsx`
- Rewrite: `src/routes/IntegrationsRoute.tsx`

- [ ] **Schritt 1: `src/components/integrations/IntegrationRow.tsx` erstellen**

```tsx
import type { LucideIcon } from 'lucide-react'

export type IntegrationStatus = 'connected' | 'disconnected' | 'coming_soon'

interface Props {
  icon: LucideIcon
  name: string
  category: string
  description: string
  status: IntegrationStatus
  connectedDetail?: string
  onAction?: () => void
  actionLabel?: string
}

export function IntegrationRow({
  icon: Icon, name, category, description,
  status, connectedDetail, onAction, actionLabel,
}: Props) {
  const isComingSoon  = status === 'coming_soon'
  const isConnected   = status === 'connected'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 20px',
      background: isComingSoon ? 'transparent' : 'var(--surface)',
      border: `1px ${isComingSoon ? 'dashed' : 'solid'} var(--border)`,
      borderRadius: 12,
      opacity: isComingSoon ? 0.55 : 1,
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 11, flexShrink: 0,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isComingSoon ? 'var(--fg-dim)' : 'var(--fg-muted)',
      }}>
        <Icon size={20} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isComingSoon ? 'var(--fg-muted)' : 'var(--fg)' }}>
            {name}
          </span>
          {/* Status badge */}
          {isConnected && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(74,222,128,0.12)', color: '#4ade80',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 5px rgba(74,222,128,0.7)', display: 'inline-block' }} />
              Verbunden
            </span>
          )}
          {status === 'disconnected' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: 'var(--surface-2)', color: 'var(--fg-dim)',
              border: '1px solid var(--border)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-dim)', display: 'inline-block' }} />
              Nicht verbunden
            </span>
          )}
          {isComingSoon && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: 'var(--surface-2)', color: 'var(--fg-dim)',
              border: '1px solid var(--border)', letterSpacing: '0.06em',
            }}>
              BALD
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', marginTop: 3 }}>{category}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 5, lineHeight: 1.5 }}>{description}</div>
        {connectedDetail && isConnected && (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            {connectedDetail}
          </div>
        )}
      </div>

      {/* Action */}
      {!isComingSoon && onAction && (
        <button
          onClick={onAction}
          style={{
            flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', transition: 'background 140ms',
            ...(isConnected
              ? { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-muted)' }
              : { background: 'rgba(208,252,105,0.12)', border: '1px solid rgba(208,252,105,0.3)', color: '#D0FC69' }
            ),
          }}
        >
          {actionLabel ?? (isConnected ? 'Verwalten' : 'Verbinden →')}
        </button>
      )}
      {status === 'disconnected' && !onAction && (
        <button
          disabled
          title="Kommt bald"
          style={{
            flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--fg-dim)', cursor: 'not-allowed', opacity: 0.5,
          }}
        >
          Verbinden →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Schritt 2: `src/routes/IntegrationsRoute.tsx` vollständig schreiben**

```tsx
import { useState } from 'react'
import { Mail, Video, Webhook, CalendarDays, Landmark, ShoppingBag } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { IntegrationRow } from '@/components/integrations/IntegrationRow'
import { ZoomSetupModal } from '@/components/integrations/ZoomSetupModal'
import { WebhookInfoModal } from '@/components/integrations/WebhookInfoModal'
import { useUiStore } from '@/store/ui.store'

export function IntegrationsRoute() {
  const mailAccounts = useMailStore(s => s.accounts)
  const setAppView   = useUiStore(s => s.setAppView)
  const hasMailAccount = mailAccounts.length > 0

  const [showZoom, setShowZoom] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Integrationen.</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
          Verbinde externe Dienste mit Cynera
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 10 }}>

          <IntegrationRow
            icon={Mail}
            name="IMAP / SMTP"
            category="E-Mail"
            description="Empfange und sende E-Mails direkt in Cynera über dein eigenes Postfach. Unterstützt alle IMAP-fähigen Anbieter (Gmail, Outlook, iCloud, etc.)."
            status={hasMailAccount ? 'connected' : 'disconnected'}
            connectedDetail={mailAccounts[0]?.email}
            onAction={() => setAppView('mail')}
            actionLabel={hasMailAccount ? 'Verwalten' : 'Verbinden →'}
          />

          <IntegrationRow
            icon={Video}
            name="Zoom"
            category="Webinar Lead-Import"
            description="Importiere Teilnehmer aus Zoom-Webinaren automatisch als Leads in Cynera. Einrichtung via Webhook in deinen Zoom-Einstellungen."
            status="disconnected"
            onAction={() => setShowZoom(true)}
            actionLabel="Einrichten →"
          />

          <IntegrationRow
            icon={Webhook}
            name="Webhook"
            category="Lead-Eingang"
            description="Empfange Leads von deiner Website, Wix, Zapier oder externen Formularen automatisch. Deine persönliche Webhook-URL ist immer aktiv."
            status="connected"
            connectedDetail="Webhook aktiv"
            onAction={() => setShowWebhook(true)}
            actionLabel="URL anzeigen"
          />

          <IntegrationRow
            icon={CalendarDays}
            name="Google Calendar / Outlook"
            category="Kalender-Sync"
            description="Synchronisiere Termine bidirektional mit deinem Google Calendar oder Outlook. Cynera-Termine erscheinen in deinem Kalender und umgekehrt."
            status="disconnected"
          />

          <div style={{ margin: '8px 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            In Entwicklung
          </div>

          <IntegrationRow
            icon={Landmark}
            name="Bank"
            category="Finanzsystem"
            description="Verknüpfe dein Geschäftskonto für automatischen Zahlungsabgleich mit deinen Rechnungen in Cynera."
            status="coming_soon"
          />

          <IntegrationRow
            icon={ShoppingBag}
            name="Shopify"
            category="E-Commerce"
            description="Verbinde deinen Shopify-Shop. Bestellungen und Umsatzdaten fließen automatisch in das Finanzsystem."
            status="coming_soon"
          />

        </div>
      </div>

      {showZoom    && <ZoomSetupModal    onClose={() => setShowZoom(false)} />}
      {showWebhook && <WebhookInfoModal  onClose={() => setShowWebhook(false)} />}
    </div>
  )
}
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Erwartet: Fehler nur für fehlende ZoomSetupModal + WebhookInfoModal (kommen in Task 6)

- [ ] **Schritt 4: Commit**

```bash
git add src/components/integrations/IntegrationRow.tsx src/routes/IntegrationsRoute.tsx
git commit -m "feat(integrations): IntegrationRow + IntegrationsRoute mit 6 Einträgen"
```

---

## Task 6: ZoomSetupModal + WebhookInfoModal

**Files:**
- Create: `src/components/integrations/ZoomSetupModal.tsx`
- Create: `src/components/integrations/WebhookInfoModal.tsx`

- [ ] **Schritt 1: `src/components/integrations/ZoomSetupModal.tsx` erstellen**

```tsx
import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

export function ZoomSetupModal({ onClose }: { onClose: () => void }) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const [copied, setCopied] = useState(false)

  const webhookUrl = (SUPABASE_URL && WEBHOOK_SECRET)
    ? `${SUPABASE_URL}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${WEBHOOK_SECRET}&source=zoom`
    : null

  const copy = () => {
    if (!webhookUrl) return
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Zoom einrichten</h2>
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '3px 0 0' }}>Webinar-Teilnehmer automatisch als Leads importieren</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Steps */}
        <ol style={{ margin: '0 0 20px', padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Gehe zu zoom.us → Einstellungen → Integrationen → Webhook-Abonnements',
            'Klicke auf „+ Neues Ereignis-Abonnement"',
            'Aktiviere das Ereignis: webinar.participant_joined',
            'Füge die folgende URL als Endpunkt-URL ein:',
            'Speichere und aktiviere das Abonnement',
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 13, color: i === 3 ? 'var(--fg-muted)' : 'var(--fg)', lineHeight: 1.5 }}>
              {step}
            </li>
          ))}
        </ol>

        {/* URL */}
        {webhookUrl ? (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Webhook URL</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {webhookUrl}
              </code>
              <button
                onClick={copy}
                style={{ flexShrink: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center' }}
              >
                {copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: 'var(--warn)' }}>
            Webhook-URL nicht verfügbar — VITE_SUPABASE_URL oder VITE_LEAD_WEBHOOK_SECRET nicht konfiguriert.
          </div>
        )}

        <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '7px 16px' }}>
          Schließen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: `src/components/integrations/WebhookInfoModal.tsx` erstellen**

```tsx
import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

const EXAMPLE_PAYLOAD = `{
  "name": "Max Mustermann",
  "email": "max@beispiel.de",
  "source": "generic"
}`

function CopyUrl({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <code style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, wordBreak: 'break-all', lineHeight: 1.5 }}>
          {url}
        </code>
        <button onClick={copy} style={{ flexShrink: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center' }}>
          {copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  )
}

export function WebhookInfoModal({ onClose }: { onClose: () => void }) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const base   = SUPABASE_URL ?? null
  const secret = WEBHOOK_SECRET ?? null

  const zoomUrl    = base && secret ? `${base}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${secret}&source=zoom` : null
  const genericUrl = base && secret ? `${base}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${secret}&source=generic` : null
  const configured = !!zoomUrl

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 500, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Webhook</h2>
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '3px 0 0' }}>Leads von externen Quellen empfangen</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)' }}>
            <X size={16} />
          </button>
        </div>

        {configured ? (
          <>
            <CopyUrl label="Zoom Webhook URL" url={zoomUrl!} />
            <CopyUrl label="Generic Webhook URL (Wix, Zapier, Typeform)" url={genericUrl!} />

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Beispiel-Payload (POST, JSON)</div>
              <pre style={{ margin: 0, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, overflow: 'auto' }}>
                {EXAMPLE_PAYLOAD}
              </pre>
            </div>
          </>
        ) : (
          <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '14px', fontSize: 12, color: 'var(--warn)' }}>
            Webhook-URLs nicht verfügbar — VITE_SUPABASE_URL oder VITE_LEAD_WEBHOOK_SECRET nicht konfiguriert.
          </div>
        )}

        <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '7px 16px', alignSelf: 'flex-start' }}>
          Schließen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Erwartet: keine Fehler

- [ ] **Schritt 4: App starten + Integrationen manuell testen**

```bash
npm run tauri dev
```

Checkliste:
- [ ] "Integrationen" erscheint in NavSidebar mit Plug-Icon zwischen Settings und User-Button
- [ ] Klick öffnet Integrationen-Route
- [ ] 6 Zeilen sichtbar: IMAP, Zoom, Webhook, Google Calendar, Bank, Shopify
- [ ] IMAP zeigt "Verbunden" wenn Mail-Account existiert, sonst "Nicht verbunden"
- [ ] IMAP "Verbinden/Verwalten" → wechselt zu Mail-Route
- [ ] Zoom "Einrichten" → öffnet ZoomSetupModal mit Webhook-URL
- [ ] Webhook "URL anzeigen" → öffnet WebhookInfoModal mit beiden URLs + Beispiel-Payload
- [ ] Google Calendar zeigt "Nicht verbunden" mit deaktiviertem Button
- [ ] Bank + Shopify gedimmt mit "BALD"-Badge

- [ ] **Schritt 5: Commit**

```bash
git add src/components/integrations/ZoomSetupModal.tsx src/components/integrations/WebhookInfoModal.tsx
git commit -m "feat(integrations): ZoomSetupModal + WebhookInfoModal"
```
