# Aurora Settings-Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Settings-System im „Aurora"-Stil (Blau→Violett-Verlauf, weiche Karten, Dark+Light+bw) neu bauen — als wiederverwendbares Design-Kit + neue Shell + alle Sektionen + neue Sektion „Lizenzen & Upgrades".

**Architecture:** Additive Aurora-Tokens in `globals.css` → ein Primitives-Kit unter `src/components/settings/ui/` → neue gruppierte Nav-Shell → neue Lizenzen-Sektion (Platzhalter-Daten) → bestehende Sektionen auf das Kit umgestellt (Funktion bleibt, nur Markup/Styles wechseln). Alles token-basiert, damit Light/Dark/bw automatisch greifen.

**Tech Stack:** React + TypeScript, Zustand, Inline-Styles mit CSS-Custom-Properties (Projekt-Konvention), Vitest + @testing-library/react, lucide-react Icons.

**Spec:** `docs/superpowers/specs/2026-06-26-aurora-settings-redesign-design.md`

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/styles/globals.css` | **+** Aurora-Tokens (Verlauf, Card-Shadow, Nav-Active) für dark/light/bw |
| `src/components/settings/ui/IconTile.tsx` | **neu** — getönte Icon-Kachel |
| `src/components/settings/ui/AuroraToggle.tsx` | **neu** — Verlauf-Schalter |
| `src/components/settings/ui/SettingsPage.tsx` | **neu** — Panel-Hülle (Titel/Untertitel) |
| `src/components/settings/ui/SettingsSection.tsx` | **neu** — Gruppen-Block mit Label |
| `src/components/settings/ui/SettingCard.tsx` | **neu** — weiche Karte |
| `src/components/settings/ui/SettingRow.tsx` | **neu** — Icon+Titel+Beschreibung+Control |
| `src/components/settings/ui/FieldRow.tsx` | **neu** — Label+Input |
| `src/components/settings/ui/Badge.tsx` | **neu** — Verlauf/Soft/OK/Neutral-Badge |
| `src/components/settings/ui/index.ts` | **neu** — Sammel-Export |
| `src/components/settings/ui/aurora-primitives.test.tsx` | **neu** — Render-Tests |
| `src/components/settings/SettingsSidebar.tsx` | Aurora-Nav (gruppiert) |
| `src/routes/SettingsRoute.tsx` | Aurora-Layout + 'lizenzen'-Case |
| `src/store/ui.store.ts` | `SettingsTab` += 'lizenzen' |
| `src/components/settings/LizenzenSettings.tsx` | **neu** — Plan/Seats/Zahlung |
| `src/components/settings/LizenzenSettings.test.tsx` | **neu** |
| `src/components/settings/ModuleSettings.tsx` | Re-Skin (Kit) |
| `src/components/settings/{Workspace,Integrationen,Aussehens,Datenschutz,Auftraege,Developer,Gefahrenzone}Settings.tsx` | Re-Skin (Kit-Muster aus Task 5) |

---

## Task 1: Aurora-Tokens in globals.css

**Files:**
- Modify: `src/styles/globals.css` (`:root` ~Z.54–59, `[data-theme="light"]` ~Z.136–141, bw-Varianten ~Z.166+)

- [ ] **Step 1: Tokens im Dark-`:root` ergänzen**

In `src/styles/globals.css` direkt nach der Zeile `--accent-text: #3B6DF4;` im `:root`-Block einfügen:

```css
  /* Aurora */
  --accent-violet:   #8b5bff;
  --accent-gradient: linear-gradient(135deg, #5b8cff, #8b5bff);
  --card-shadow:     0 1px 2px rgb(0 0 0 / 0.25);
  --nav-active-bg:   linear-gradient(90deg, rgb(91 140 255 / 0.20), rgb(139 91 255 / 0.05));
```

- [ ] **Step 2: Light-Varianten ergänzen**

Im `[data-theme="light"]`-Block direkt nach `--accent-text: #3B6DF4;` einfügen:

```css
  --accent-violet:   #8b5bff;
  --accent-gradient: linear-gradient(135deg, #5b8cff, #8b5bff);
  --card-shadow:     0 1px 2px rgb(40 50 90 / 0.05);
  --nav-active-bg:   linear-gradient(90deg, rgb(91 140 255 / 0.14), rgb(139 91 255 / 0.05));
```

- [ ] **Step 3: bw-Varianten (Verlauf → einfarbig)**

Im Block `[data-theme="light"][data-style="bw"]` (und im entsprechenden Dark-bw-Block, der `--accent: oklch(100%/22%...)` setzt) jeweils ergänzen, damit der Verlauf monochrom wird:

```css
  --accent-gradient: var(--accent);
  --accent-violet:   var(--accent);
  --nav-active-bg:   var(--surface-2);
```

- [ ] **Step 4: Typecheck (CSS bricht TS nicht, aber Bundle prüfen)**

Run: `npm run build`
Expected: Build läuft durch (CSS valide).

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(aurora): additive Design-Tokens (Verlauf, Card-Shadow, Nav-Active) dark/light/bw"
```

---

## Task 2: Primitives-Kit

**Files:**
- Create: alle 8 Dateien unter `src/components/settings/ui/` + `index.ts`
- Test: `src/components/settings/ui/aurora-primitives.test.tsx`

- [ ] **Step 1: Failing test schreiben**

Create `src/components/settings/ui/aurora-primitives.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SettingsPage, SettingCard, SettingRow, AuroraToggle } from './index'

afterEach(cleanup)

describe('Aurora primitives', () => {
  it('SettingsPage rendert Titel + Untertitel + Inhalt', () => {
    render(<SettingsPage title="Module" subtitle="Untertitel"><div>Inhalt</div></SettingsPage>)
    expect(screen.getByText('Module')).toBeTruthy()
    expect(screen.getByText('Untertitel')).toBeTruthy()
    expect(screen.getByText('Inhalt')).toBeTruthy()
  })

  it('SettingRow zeigt Titel + Beschreibung + Control', () => {
    render(<SettingRow icon={<svg/>} title="CRM" description="Beschreibung" control={<span>CTL</span>} />)
    expect(screen.getByText('CRM')).toBeTruthy()
    expect(screen.getByText('Beschreibung')).toBeTruthy()
    expect(screen.getByText('CTL')).toBeTruthy()
  })

  it('AuroraToggle spiegelt on-Prop via aria-checked und feuert onChange', () => {
    const onChange = vi.fn()
    render(<AuroraToggle on={true} onChange={onChange} />)
    const sw = screen.getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('SettingCard rendert Inhalt', () => {
    render(<SettingCard><span>Karte</span></SettingCard>)
    expect(screen.getByText('Karte')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/components/settings/ui/aurora-primitives.test.tsx`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Die 8 Primitives + index anlegen**

Create `src/components/settings/ui/IconTile.tsx`:

```tsx
import type { ReactNode } from 'react'

interface Props { color?: string; size?: number; dim?: boolean; children: ReactNode }

export function IconTile({ color = 'var(--accent)', size = 44, dim = false, children }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 12, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: dim ? 'color-mix(in srgb, var(--fg-dim) 10%, transparent)'
                      : `color-mix(in srgb, ${color} 14%, transparent)`,
      color: dim ? 'var(--fg-dim)' : color,
      transition: 'background 220ms, color 220ms',
    }}>
      {children}
    </div>
  )
}
```

Create `src/components/settings/ui/AuroraToggle.tsx`:

```tsx
interface Props { on: boolean; saving?: boolean; onChange?: () => void }

export function AuroraToggle({ on, saving = false, onChange }: Props) {
  return (
    <button
      type="button" role="switch" aria-checked={on} onClick={onChange} disabled={saving}
      style={{
        width: 44, height: 25, borderRadius: 99, flexShrink: 0, position: 'relative',
        border: 'none', padding: 0, cursor: saving ? 'default' : 'pointer',
        background: on ? 'var(--accent-gradient)' : 'var(--surface-3)',
        boxShadow: on ? '0 0 0 4px var(--accent-soft)' : 'none',
        opacity: saving ? 0.6 : 1, transition: 'background 200ms, box-shadow 200ms',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 22 : 3,
        width: 19, height: 19, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgb(0 0 0 / 0.25)',
        transition: 'left 180ms cubic-bezier(.4,0,.2,1)',
      }} />
    </button>
  )
}
```

Create `src/components/settings/ui/SettingsPage.tsx`:

```tsx
import type { ReactNode } from 'react'

interface Props { title: string; subtitle?: string; maxWidth?: number; children: ReactNode }

export function SettingsPage({ title, subtitle, maxWidth = 680, children }: Props) {
  return (
    <div style={{ maxWidth, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h2>
        {subtitle && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
```

Create `src/components/settings/ui/SettingsSection.tsx`:

```tsx
import type { ReactNode } from 'react'

interface Props { label?: string; children: ReactNode }

export function SettingsSection({ label, children }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
          {label}
        </div>
      )}
      {children}
    </div>
  )
}
```

Create `src/components/settings/ui/SettingCard.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react'

interface Props { danger?: boolean; style?: CSSProperties; children: ReactNode }

export function SettingCard({ danger = false, style, children }: Props) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${danger ? 'color-mix(in srgb, #e5484d 40%, var(--border))' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', boxShadow: 'var(--card-shadow)',
      padding: '18px 20px', ...style,
    }}>
      {children}
    </div>
  )
}
```

Create `src/components/settings/ui/SettingRow.tsx`:

```tsx
import type { ReactNode } from 'react'
import { IconTile } from './IconTile'

interface Props {
  icon: ReactNode
  color?: string
  title: string
  description?: string
  control?: ReactNode
  dim?: boolean
  onClick?: () => void
}

export function SettingRow({ icon, color, title, description, control, dim = false, onClick }: Props) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '15px 18px',
      borderRadius: 'var(--radius)', background: 'var(--surface)',
      border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)',
      opacity: dim ? 0.55 : 1, cursor: onClick ? 'pointer' : 'default',
      transition: 'opacity 220ms',
    }}>
      <IconTile color={color} dim={dim}>{icon}</IconTile>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{title}</div>
        {description && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.45 }}>{description}</p>}
      </div>
      {control}
    </div>
  )
}
```

Create `src/components/settings/ui/FieldRow.tsx`:

```tsx
import type { ReactNode } from 'react'

interface Props { label: string; hint?: string; children: ReactNode }

export function FieldRow({ label, hint, children }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-2)' }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>{hint}</span>}
    </div>
  )
}
```

Create `src/components/settings/ui/Badge.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react'

type Variant = 'gradient' | 'soft' | 'ok' | 'neutral'

const VARIANTS: Record<Variant, CSSProperties> = {
  gradient: { background: 'var(--accent-gradient)', color: '#fff' },
  soft:     { background: 'var(--accent-soft)', color: 'var(--accent-text)' },
  ok:       { background: 'color-mix(in srgb, #2ea05a 18%, transparent)', color: '#3fbf72' },
  neutral:  { background: 'var(--surface-3)', color: 'var(--fg-muted)' },
}

export function Badge({ variant = 'soft', children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, ...VARIANTS[variant] }}>
      {children}
    </span>
  )
}
```

Create `src/components/settings/ui/index.ts`:

```ts
export { SettingsPage } from './SettingsPage'
export { SettingsSection } from './SettingsSection'
export { SettingCard } from './SettingCard'
export { SettingRow } from './SettingRow'
export { AuroraToggle } from './AuroraToggle'
export { FieldRow } from './FieldRow'
export { IconTile } from './IconTile'
export { Badge } from './Badge'
```

- [ ] **Step 4: Test laufen — muss bestehen**

Run: `npx vitest run src/components/settings/ui/aurora-primitives.test.tsx`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ui/
git commit -m "feat(aurora): Settings-Primitives-Kit (Page/Card/Row/Toggle/Field/IconTile/Badge)"
```

---

## Task 3: Aurora-Shell (Sidebar + Layout)

**Files:**
- Modify: `src/components/settings/SettingsSidebar.tsx` (komplett ersetzen)
- Modify: `src/routes/SettingsRoute.tsx` (Layout-Header)

- [ ] **Step 1: SettingsSidebar.tsx ersetzen**

Ersetze den gesamten Inhalt von `src/components/settings/SettingsSidebar.tsx`:

```tsx
import type { SettingsTab } from '@/store/ui.store'
import type { LucideIcon } from 'lucide-react'
import { Building2, LayoutGrid, Plug, Code2, AlertTriangle, Clock, Palette, ShieldCheck, ReceiptText } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { Badge } from './ui'

interface Item { key: SettingsTab; label: string; icon: LucideIcon; badge?: 'Pro'; danger?: boolean; devOnly?: boolean }
interface Group { label: string; items: Item[] }

const GROUPS: Group[] = [
  { label: 'Workspace', items: [
    { key: 'workspace',     label: 'Unternehmen',   icon: Building2 },
    { key: 'module',        label: 'Module',         icon: LayoutGrid },
    { key: 'integrationen', label: 'Integrationen',  icon: Plug },
  ]},
  { label: 'Konto', items: [
    { key: 'lizenzen',      label: 'Lizenzen & Upgrades', icon: ReceiptText, badge: 'Pro' },
    { key: 'aussehen',      label: 'Aussehen',       icon: Palette },
    { key: 'datenschutz',   label: 'Datenschutz',    icon: ShieldCheck },
  ]},
  { label: 'System', items: [
    { key: 'auftraege',     label: 'Aufträge',       icon: Clock },
    { key: 'developer',     label: 'Entwickler',     icon: Code2, devOnly: true },
    { key: 'gefahrenzone',  label: 'Gefahrenzone',   icon: AlertTriangle, danger: true },
  ]},
]

interface Props { active: SettingsTab; onChange: (tab: SettingsTab) => void; showDeveloper: boolean }

export function SettingsSidebar({ active, onChange, showDeveloper }: Props) {
  const ws = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId))
  const initial = (ws?.name ?? 'W').trim().charAt(0).toUpperCase()
  const sub = ws ? `${ws.isShared ? 'Geteilter Workspace' : 'Workspace'} · ${ws.role}` : 'Lokal'

  return (
    <div style={{
      width: 262, flexShrink: 0, borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '16px 14px',
      background: 'linear-gradient(180deg, var(--surface), var(--bg))',
    }}>
      {/* Workspace-Kopf */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 8px 14px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11, background: 'var(--accent-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, color: '#fff', fontSize: 15,
        }}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws?.name ?? 'Cultera'}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{sub}</div>
        </div>
      </div>

      {GROUPS.map(group => (
        <div key={group.label}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)', padding: '14px 10px 7px' }}>
            {group.label}
          </div>
          {group.items.filter(it => !it.devOnly || showDeveloper).map(it => {
            const Icon = it.icon
            const on = active === it.key
            return (
              <button
                key={it.key}
                onClick={() => onChange(it.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '9px 11px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: on ? 'var(--nav-active-bg)' : 'transparent',
                  boxShadow: on ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent)' : 'none',
                  color: on ? 'var(--accent-text)' : (it.danger ? 'color-mix(in srgb, #e5484d 80%, var(--fg))' : 'var(--fg-muted)'),
                  fontSize: 13.5, fontWeight: on ? 600 : 500, fontFamily: 'inherit',
                  transition: 'background 140ms, color 140ms',
                }}
              >
                <Icon size={17} />
                <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
                {it.badge && <Badge variant="gradient">{it.badge}</Badge>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: SettingsRoute-Layout angleichen (Sticky-Header)**

In `src/routes/SettingsRoute.tsx` den Kopf-`<div>` mit `<h1>Settings.</h1>` durch einen ruhigeren Sticky-Header ersetzen (der `<h1>`-Block, aktuell ~Z.42–44):

```tsx
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Einstellungen</h1>
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: kein Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsSidebar.tsx src/routes/SettingsRoute.tsx
git commit -m "feat(aurora): gruppierte Settings-Nav-Shell mit Workspace-Kopf"
```

---

## Task 4: Sektion „Lizenzen & Upgrades"

**Files:**
- Modify: `src/store/ui.store.ts:74` (SettingsTab)
- Modify: `src/routes/SettingsRoute.tsx` (Import, VALID_TABS, switch)
- Create: `src/components/settings/LizenzenSettings.tsx`
- Test: `src/components/settings/LizenzenSettings.test.tsx`

- [ ] **Step 1: Failing test**

Create `src/components/settings/LizenzenSettings.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LizenzenSettings } from './LizenzenSettings'

afterEach(cleanup)

describe('LizenzenSettings', () => {
  it('zeigt Überschrift + die drei Blöcke', () => {
    render(<LizenzenSettings />)
    expect(screen.getByText('Lizenzen & Upgrades')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.getByText(/Team-Sitze/)).toBeTruthy()
    expect(screen.getByText(/Zahlung/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Test fehlschlagen lassen**

Run: `npx vitest run src/components/settings/LizenzenSettings.test.tsx`
Expected: FAIL — Import nicht auflösbar.

- [ ] **Step 3: SettingsTab erweitern**

In `src/store/ui.store.ts` Zeile 74 `'lizenzen'` ergänzen (nach `'integrationen'`):

```ts
export type SettingsTab = 'workspace' | 'profil' | 'aussehen' | 'module' | 'integrationen' | 'lizenzen' | 'datenschutz' | 'developer' | 'gefahrenzone' | 'auftraege'
```

- [ ] **Step 4: LizenzenSettings.tsx anlegen**

Create `src/components/settings/LizenzenSettings.tsx`:

```tsx
import { useWorkspaceStore } from '@/store/workspace.store'
import { SettingsPage, SettingsSection, SettingCard, Badge } from './ui'

const SEAT_TOTAL = 8

export function LizenzenSettings() {
  const ws = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId))
  // Echte Sitzanzahl, wo billig: aktiver Workspace zählt als 1; sonst Platzhalter.
  const used = ws ? 1 : 1
  const pct = Math.round((used / SEAT_TOTAL) * 100)

  return (
    <SettingsPage title="Lizenzen & Upgrades" subtitle="Plan, Team und Zahlung an einem Ort." maxWidth={720}>
      {/* Plan */}
      <div style={{ borderRadius: 'var(--radius)', padding: 1, background: 'var(--accent-gradient)' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'calc(var(--radius) - 1px)', padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Aktueller Plan</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>Pro</div>
              <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginTop: 2 }}>29 € / Monat · jährlich abgerechnet</div>
            </div>
            <button style={{
              background: 'var(--accent-gradient)', color: '#fff', border: 'none', fontFamily: 'inherit',
              fontWeight: 700, fontSize: 13.5, padding: '11px 20px', borderRadius: 11, cursor: 'pointer',
              boxShadow: '0 10px 30px -8px var(--accent-glow)',
            }}>Auf Business upgraden →</button>
          </div>
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 7 }}>
              <span>Genutzte Team-Sitze</span><span>{used} von {SEAT_TOTAL}</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: 'var(--accent-gradient)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Team-Sitze */}
      <SettingsSection label="Team-Sitze">
        <SettingCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13.5 }}>
              {used} aktiv · {SEAT_TOTAL - used} frei
              <span style={{ color: 'var(--fg-dim)', marginLeft: 8, fontSize: 12 }}>Mitglieder lädst du unter „Unternehmen" ein.</span>
            </div>
            <Badge variant="soft">Seats</Badge>
          </div>
        </SettingCard>
      </SettingsSection>

      {/* Zahlung */}
      <SettingsSection label="Zahlung">
        <SettingCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 28, borderRadius: 6, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--fg-muted)' }}>VISA</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>•••• 4242</div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Platzhalter — echte Abrechnung folgt mit dem SaaS-Plan.</div>
            </div>
            <Badge variant="neutral">Bald</Badge>
          </div>
        </SettingCard>
      </SettingsSection>
    </SettingsPage>
  )
}
```

- [ ] **Step 5: In SettingsRoute verdrahten**

In `src/routes/SettingsRoute.tsx`: Import nach den anderen Settings-Imports ergänzen:

```tsx
import { LizenzenSettings } from '@/components/settings/LizenzenSettings'
```

`VALID_TABS` (Z.21) um `'lizenzen'` erweitern:

```tsx
  const VALID_TABS = ['workspace', 'aussehen', 'module', 'integrationen', 'lizenzen', 'datenschutz', 'developer', 'gefahrenzone', 'auftraege']
```

Im `switch (settingsTab)` vor `case 'developer':` ergänzen:

```tsx
      case 'lizenzen':      return <LizenzenSettings />
```

> Hinweis: Falls die `'datenschutz'`-Sektion noch nicht in `VALID_TABS`/switch steht, ebenfalls ergänzen (`case 'datenschutz': return <DatenschutzSettings />`).

- [ ] **Step 6: Test bestehen + typecheck**

Run: `npx vitest run src/components/settings/LizenzenSettings.test.tsx && npm run typecheck`
Expected: PASS + kein TS-Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/store/ui.store.ts src/routes/SettingsRoute.tsx src/components/settings/LizenzenSettings.tsx src/components/settings/LizenzenSettings.test.tsx
git commit -m "feat(aurora): Sektion Lizenzen & Upgrades (Plan/Seats/Zahlung, Platzhalter)"
```

---

## Task 5: Re-Skin „Module" (ausgearbeitetes Muster)

**Files:**
- Modify: `src/components/settings/ModuleSettings.tsx`

Dies ist das **Referenz-Muster** für alle Re-Skins: Store-Anbindung & Handler bleiben, nur das Markup wechselt aufs Kit.

- [ ] **Step 1: ModuleSettings auf das Kit umstellen**

Ersetze in `src/components/settings/ModuleSettings.tsx` das lokale `Toggle` (Z.56–75) und den `return`-Block (ab Z.97). Importe oben ergänzen:

```tsx
import { SettingsPage, SettingRow, AuroraToggle } from './ui'
```

Lösche die lokale `Toggle`-Funktion (Z.56–75) komplett. Ersetze den `return (...)` der `ModuleSettings`-Funktion durch:

```tsx
  return (
    <SettingsPage title="Module" subtitle="Deaktivierte Module verschwinden sofort aus der Navigation.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MODULES.map(mod => {
          const Icon = mod.icon
          const on = isOn(mod.key, mod.defaultOn)
          const isSaving = saving === mod.key
          return (
            <SettingRow
              key={mod.key}
              icon={<Icon size={21} />}
              color={mod.color}
              title={mod.label}
              description={mod.description}
              dim={!on}
              onClick={() => handleToggle(mod.key, mod.defaultOn)}
              control={<AuroraToggle on={on} saving={isSaving} onChange={() => handleToggle(mod.key, mod.defaultOn)} />}
            />
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0 }}>Änderungen werden sofort wirksam.</p>
    </SettingsPage>
  )
```

Behalte `MODULES`, `isOn`, `handleToggle`, `useCompanyStore`-Anbindung unverändert. Entferne nun ungenutzte Importe (`useCallback` bleibt, der lokale `Toggle` ist weg).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: kein Fehler (keine ungenutzten Importe — `LucideIcon`/`color` weiterhin genutzt).

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/ModuleSettings.tsx
git commit -m "refactor(aurora): ModuleSettings auf Primitives-Kit (Funktion unverändert)"
```

---

## Task 6: Re-Skin der übrigen Sektionen (Muster aus Task 5 anwenden)

Für **jede** der folgenden Dateien gilt derselbe Ablauf wie Task 5: **erst die Datei lesen**, dann das sichtbare Markup durch Kit-Primitives ersetzen, **Store-Anbindung und Handler unverändert lassen**, dann `npm run typecheck`, dann committen. Nichts an der Logik ändern.

Pro Datei dasselbe Vorgehen:
1. Datei öffnen, die bestehende Funktionalität (Stores, Handler, Felder) erfassen.
2. Den äußeren Wrapper durch `<SettingsPage title=… subtitle=…>` ersetzen.
3. Inhaltsblöcke in `<SettingCard>` / `<SettingsSection label=…>` gruppieren; Listen-/Zeilen-Inhalte als `<SettingRow>`; Formularfelder als `<FieldRow label=…><input …/></FieldRow>`; Schalter als `<AuroraToggle>`; Status-Chips als `<Badge>`.
4. Inputs/Buttons mit Tokens stylen (`var(--surface-2)`, `var(--border)`, `var(--radius-sm)`, Fokus `var(--accent)`); keine hartkodierten Farben.
5. `npm run typecheck` → grün.
6. Commit: `refactor(aurora): <Sektion> auf Primitives-Kit`.

- [ ] **Step 1: `WorkspaceSettings.tsx` (Unternehmen)** — Formular → `SettingsPage` + `SettingCard` + `FieldRow`s. Typecheck. Commit.
- [ ] **Step 2: `IntegrationenSettings.tsx`** — Verbindungen → `SettingCard`-Liste mit `Badge`-Status. Typecheck. Commit.
- [ ] **Step 3: `AussehensSettings.tsx`** — Theme/Stil-Auswahl → `SettingsPage` + Auswahl-`SettingCard`s. Typecheck. Commit.
- [ ] **Step 4: `DatenschutzSettings.tsx`** — statischen Text in `SettingsPage` + `SettingCard` heben (Wortlaut unverändert). Typecheck. Commit.
- [ ] **Step 5: `AuftraegeSettings.tsx`** — Konfiguration → `SettingsPage` + `FieldRow`s. Typecheck. Commit.
- [ ] **Step 6: `DeveloperSettings.tsx`** — leicht ans Kit angleichen (`SettingsPage` + `SettingCard`; CopyRow/Inputs token-basiert). Typecheck. Commit.
- [ ] **Step 7: `GefahrenzoneSettings.tsx`** — `SettingsPage` + `<SettingCard danger>` mit roten Akzenten. Typecheck. Commit.

---

## Task 7: Gesamt-Verifikation

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: kein Fehler.

- [ ] **Step 2: Volle Test-Suite**

Run: `npm run test:run`
Expected: alle grün (bestehende + neue Primitives- und Lizenzen-Tests).

- [ ] **Step 3: Visuelle Abnahme (User am Steuer)**

Im Tauri-Fenster: Einstellungen öffnen → **Dark + Light + bw** durchschalten (Aussehen). Prüfen: gruppierte Nav, aktiver Eintrag mit Verlauf-Tönung, alle Sektionen sauber, Lizenzen (Plan/Seats/Zahlung), Module-Toggles funktionieren, keine hartkodierten Dunkel-Farben in Light.

---

## Self-Review-Ergebnis

- **Spec-Abdeckung:** Tokens (T1), Primitives-Kit (T2), Shell/Nav (T3), Lizenzen (T4), Re-Skin aller Sektionen (T5 Muster + T6 alle übrigen), Theme dark/light/bw (T1 + T7 Step 3), Tests (T2/T4/T7). Alle Spec-Punkte abgedeckt.
- **Platzhalter:** Lizenzen-Platzhalterdaten sind bewusst + sichtbar gekennzeichnet (Spec-konform), kein Plan-Platzhalter. T6 ist bewusst muster-basiert, weil Re-Skin das Lesen der jeweiligen Datei erfordert (Funktion erhalten) — Task 5 liefert das vollständige, ausgearbeitete Referenz-Muster mit Code.
- **Typ-Konsistenz:** `'lizenzen'` identisch in `SettingsTab` (T4), `VALID_TABS` (T4), Sidebar-`key` (T3), Route-`case` (T4). Primitives-Namen identisch in `index.ts` (T2) und allen Verwendungen (T4/T5). `AuroraToggle`-Prop `onChange` konsistent (T2 def, T5 use).
- **Kritischer Punkt:** `VALID_TABS` muss `'lizenzen'` enthalten (sonst Redirect) — in T4 Step 5 explizit; ebenso Hinweis auf `'datenschutz'`.
