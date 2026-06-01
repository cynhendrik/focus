import type { SettingsTab } from '@/store/ui.store'
import type { LucideIcon } from 'lucide-react'
import { Building2, User, Palette, Code2, AlertTriangle } from 'lucide-react'

const ITEMS: { key: SettingsTab; label: string; icon: LucideIcon }[] = [
  { key: 'workspace',    label: 'Workspace',        icon: Building2     },
  { key: 'profil',       label: 'Profil',            icon: User          },
  { key: 'aussehen',     label: 'Erscheinungsbild',  icon: Palette       },
  { key: 'developer',    label: 'Entwickler',        icon: Code2         },
  { key: 'gefahrenzone', label: 'Gefahrenzone',      icon: AlertTriangle },
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
              color: isActive ? 'var(--accent-text)' : 'var(--fg-muted)',
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
