# Module Card Grid — Design Spec

**Datum:** 2026-05-22
**Branch:** feature/v2-redesign
**Ansatz:** Iterativ — bestehenden Modul-Abschnitt in SettingsRoute ersetzen

---

## Ziel

Den einfachen Checkbox-Block in den Settings durch ein visuell hochwertiges Card-Grid ersetzen. Jede Karte zeigt Icon, Name, Beschreibung und einen iOS-Toggle.

---

## 1. Was sich ändert

**Datei:** `src/routes/SettingsRoute.tsx`

Der bestehende Modul-Block (Zeilen ~330–339):
```tsx
<div className="card" style={{ padding: '20px 24px', ... }}>
  <SectionHeader title="Module" />
  {(Object.keys(MODULE_LABELS) ...).map(key => (
    <label>
      <input type="checkbox" ... />
      <span>{MODULE_LABELS[key]}</span>
    </label>
  ))}
</div>
```

Wird ersetzt durch: `<ModuleGrid modules={modules} onToggle={toggleModule} />`

Der `MODULE_LABELS`-Constant entfällt — Beschreibungen und Icons ziehen in `MODULE_DEFS` ein (inline im gleichen File).

**Datei:** `src/routes/CompanyRoute.tsx` — bleibt unverändert (hat eigene einfache Checkbox-Liste, kein Redesign nötig).

---

## 2. Neue Komponente: `ModuleGrid`

Inline in `SettingsRoute.tsx` definiert (kein eigenes File — zu klein).

### 2.1 `MODULE_DEFS`

```ts
import { TrendingUp, Users, Mail, Share2, Sparkles, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ModuleDef {
  key: keyof CompanyModules
  label: string
  description: string
  icon: LucideIcon
}

const MODULE_DEFS: ModuleDef[] = [
  { key: 'sales',        label: 'Sales',         description: 'Leads, Pipeline und Deal-Tracking.',               icon: TrendingUp },
  { key: 'crm',          label: 'CRM System',    description: 'Kundenverwaltung, Kontakte und Aktivitäten.',      icon: Users      },
  { key: 'mail',         label: 'Mail-Client',   description: 'E-Mails direkt in Cynera verwalten.',              icon: Mail       },
  { key: 'instagram',    label: 'Social Media',  description: 'Instagram-Analyse und Reporting.',                 icon: Share2     },
  { key: 'focusAi',      label: 'FOCUS AI',      description: 'KI-gestützte Analysen und Empfehlungen.',          icon: Sparkles   },
  { key: 'zeiterfassung',label: 'Zeiterfassung', description: 'Stunden erfassen und auswerten.',                  icon: Clock      },
]
```

### 2.2 `ModuleToggle` (iOS-style)

```tsx
function ModuleToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={e => { e.preventDefault(); onToggle() }}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        background: on ? 'oklch(55% 0.25 270)' : 'var(--border)',
        position: 'relative', transition: 'background 200ms', flexShrink: 0,
        padding: 0,
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: on ? 21 : 3,
        transition: 'left 200ms',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}
```

### 2.3 `ModuleCard`

```tsx
function ModuleCard({ def, on, onToggle }: { def: ModuleDef; on: boolean; onToggle: () => void }) {
  const Icon = def.icon
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'oklch(92% 0.08 270)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color="oklch(50% 0.2 270)" />
        </div>
        <ModuleToggle on={on} onToggle={onToggle} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>{def.label}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{def.description}</div>
      </div>
    </div>
  )
}
```

### 2.4 `ModuleGrid`

```tsx
function ModuleGrid({ modules, onToggle }: {
  modules: CompanyModules
  onToggle: (key: keyof CompanyModules) => void
}) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.03em', marginBottom: 4 }}>Module</div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Aktiviere oder deaktiviere Funktionen für deinen Workspace</div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 14,
      }}>
        {MODULE_DEFS.map(def => (
          <ModuleCard
            key={def.key}
            def={def}
            on={!!modules[def.key]}
            onToggle={() => onToggle(def.key)}
          />
        ))}
      </div>
    </div>
  )
}
```

---

## 3. Integration in `SettingsRoute`

Der `MODULE_LABELS`-Import und der bestehende `Object.keys(MODULE_LABELS)`-Block werden durch `<ModuleGrid>` ersetzt:

```tsx
{/* ── Module ──────────────────────────────────────────────────────────── */}
<ModuleGrid modules={modules} onToggle={toggleModule} />
```

Das `<div className="card">` drumherum entfällt — das Grid bringt seine eigene Struktur mit.

Die veralteten Imports (`MODULE_LABELS`, zugehörige `Record`-Typen) werden entfernt.

---

## 4. Nicht im Scope

- CompanyRoute.tsx Modul-Sektion (bleibt Checkbox-Liste)
- Neue CompanyModules-Keys
- Responsive Breakpoints (auto-fill grid passt sich automatisch an)
- Animationen über die Toggle-Transition hinaus
