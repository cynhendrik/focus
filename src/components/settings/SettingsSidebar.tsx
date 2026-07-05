import type { SettingsTab } from '@/store/ui.store'
import type { LucideIcon } from 'lucide-react'
import { Building2, LayoutGrid, Plug, Code2, AlertTriangle, Clock, Palette, ShieldCheck, ReceiptText, BellRing } from 'lucide-react'
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
    { key: 'aussehen',          label: 'Aussehen',            icon: Palette },
    { key: 'benachrichtigungen', label: 'Benachrichtigungen', icon: BellRing },
    { key: 'datenschutz',       label: 'Datenschutz',         icon: ShieldCheck },
  ]},
  { label: 'System', items: [
    { key: 'auftraege',     label: 'Aufträge',       icon: Clock },
    { key: 'developer',     label: 'Entwickler',     icon: Code2, devOnly: true },
    { key: 'gefahrenzone',  label: 'Gefahrenzone',   icon: AlertTriangle, danger: true },
  ]},
]

interface Props { active: SettingsTab; onChange: (tab: SettingsTab) => void; showDeveloper: boolean }

export function SettingsSidebar({ active, onChange, showDeveloper }: Props) {
  const ws = useWorkspaceStore(s => [...s.workspaces, ...s.localWorkspaces].find(w => w.id === s.activeWorkspaceId))
  const initial = (ws?.name ?? 'W').trim().charAt(0).toUpperCase()
  const sub = ws ? `${ws.isShared ? 'Geteilter Workspace' : 'Workspace'} · ${ws.role}` : 'Lokal'

  return (
    <div style={{
      width: 262, flexShrink: 0, borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '16px 14px',
      background: 'linear-gradient(180deg, var(--surface), var(--bg))',
    }}>
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
