import { useUiStore } from '@/store/ui.store'
import { NotificationCenter } from './NotificationCenter'
import {
  Sun, Sunrise, Users, CreditCard, Target,
  Mail, Calendar, Clock, Settings, Plug, Sparkles, User, Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const VIEW_META: Partial<Record<string, { label: string; tag: string; Icon: LucideIcon }>> = {
  dashboard:      { label: 'Heute',          tag: 'DEIN TAG',      Icon: Sunrise    },
  corra:          { label: 'KORA',           tag: 'KI-ASSISTENT',  Icon: Sparkles   },
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
  const appView        = useUiStore(s => s.appView)
  const setAppView     = useUiStore(s => s.setAppView)
  const toggleTheme    = useUiStore(s => s.toggleTheme)
  const zeitPanelOpen  = useUiStore(s => s.zeitPanelOpen)
  const setZeitPanel   = useUiStore(s => s.setZeitPanelOpen)

  const meta = VIEW_META[appView] ?? VIEW_META['dashboard']!
  const { label, tag } = meta

  return (
    <div className="topbar">
      {/* Left: current view — kein Icon */}
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

      {/* Right: controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          className="icon-btn"
          onClick={() => setZeitPanel(!zeitPanelOpen)}
          title="Zeit erfassen"
          style={{ color: zeitPanelOpen ? 'var(--accent)' : undefined }}
        >
          <Timer size={16} />
        </button>
        <button className="icon-btn" onClick={toggleTheme} title="Theme wechseln">
          <Sun size={16} />
        </button>
        <NotificationCenter />
      </div>
    </div>
  )
}
