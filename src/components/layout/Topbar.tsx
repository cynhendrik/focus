import { useUiStore } from '@/store/ui.store'
import {
  Sun, Bell, Users, CreditCard, Target,
  Mail, Calendar, Clock, Settings, Plug, Sparkles, User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const VIEW_META: Partial<Record<string, { label: string; tag: string; Icon: LucideIcon }>> = {
  dashboard:      { label: 'Heute',          tag: 'DEIN TAG',      Icon: Sun        },
  corra:          { label: 'CORRA',          tag: 'KI-ASSISTENT',  Icon: Sparkles   },
  clients:        { label: 'Kunden',         tag: 'CRM',           Icon: Users      },
  invoices:       { label: 'Finanzen',       tag: 'BUCHHALTUNG',   Icon: CreditCard },
  akquise:        { label: 'Akquise',        tag: 'PIPELINE',      Icon: Target     },
  posteingang:    { label: 'Posteingang',    tag: 'INBOX',         Icon: Mail       },
  calendar:       { label: 'Kalender',       tag: 'TERMINE',       Icon: Calendar   },
  zeitmanagement: { label: 'Zeitmanagement', tag: 'PLANUNG',       Icon: Clock      },
  settings:       { label: 'Einstellungen',  tag: 'SYSTEM',        Icon: Settings   },
  integrations:   { label: 'Integrationen',  tag: 'VERBINDUNGEN',  Icon: Plug       },
  profile:        { label: 'Profil',         tag: 'KONTO',         Icon: User       },
}

export function Topbar() {
  const appView    = useUiStore(s => s.appView)
  const toggleTheme = useUiStore(s => s.toggleTheme)

  const meta = VIEW_META[appView] ?? VIEW_META['dashboard']!
  const { label, tag, Icon } = meta

  return (
    <div className="topbar">
      {/* Left: current view */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={16} style={{ color: 'var(--fg-dim)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontSize: 17, fontWeight: 700, color: 'var(--fg)',
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'var(--fg-dim)', letterSpacing: '0.14em',
            textTransform: 'uppercase', fontWeight: 600,
          }}>
            {tag}
          </span>
        </div>
      </div>

      {/* Right: controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="icon-btn" onClick={toggleTheme} title="Theme wechseln">
          <Sun size={16} />
        </button>
        <button className="icon-btn" title="Benachrichtigungen">
          <Bell size={16} />
        </button>
      </div>
    </div>
  )
}
