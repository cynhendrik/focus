// ─────────────────────────────────────────────────────────────────────────────
// PrivateSidebar — schmale, warm-getoente Nav im Privaten Raum.
// Bereiche: Quick Capture, To-Dos, Notizen, Journal, Ziele, Wochen-Review,
// Dokumente. Aktive Items haben Bullet + Akzent-Farbe. Unten "Zurueck zur
// Arbeit" mit ESC-Hint.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import {
  Inbox, CheckSquare, FileText, BookOpen, Target, CalendarCheck, Folder,
  ArrowLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useUiStore, type PrivateView } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { usePrivateInboxStore } from '@/store/private-inbox.store'
import { usePrivateTodosStore } from '@/store/private-todos.store'

interface NavDef {
  id:    PrivateView
  label: string
  icon:  LucideIcon
}

const NAV: NavDef[] = [
  { id: 'capture', label: 'Quick Capture',  icon: Inbox         },
  { id: 'todos',   label: 'To-Dos',         icon: CheckSquare   },
  { id: 'notes',   label: 'Notizen',        icon: FileText      },
  { id: 'journal', label: 'Journal',        icon: BookOpen      },
  { id: 'goals',   label: 'Ziele',          icon: Target        },
  { id: 'review',  label: 'Wochen-Review',  icon: CalendarCheck },
  { id: 'docs',    label: 'Dokumente',      icon: Folder        },
]

function NavItem({
  def, active, onClick, badge, progress,
}: {
  def:    NavDef
  active: boolean
  onClick: () => void
  badge?:    number
  progress?: number  // 0..1
}) {
  const Ic = def.icon
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '8px 12px', borderRadius: 8,
        background: active ? 'oklch(100% 0 0 / 0.05)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: active ? 'var(--priv-fg)' : 'var(--priv-fg-dim)',
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: active ? 600 : 500,
        position: 'relative', textAlign: 'left',
        transition: 'color 140ms, background 140ms',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--priv-fg-muted)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--priv-fg-dim)' }}
    >
      <Ic size={14} style={{ flexShrink: 0, opacity: active ? 1 : 0.85 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {def.label}
      </span>
      {progress !== undefined && (
        <span style={{
          width: 22, height: 4, borderRadius: 99,
          background: 'oklch(100% 0 0 / 0.08)', overflow: 'hidden', flexShrink: 0,
        }}>
          <span style={{
            display: 'block', height: '100%',
            width: `${Math.max(8, Math.min(100, progress * 100))}%`,
            background: 'var(--priv-accent)',
          }} />
        </span>
      )}
      {badge !== undefined && badge > 0 && (
        <span style={{
          minWidth: 18, height: 16, padding: '0 5px', borderRadius: 99,
          background: 'oklch(100% 0 0 / 0.10)',
          color: 'var(--priv-fg-muted)',
          fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {badge}
        </span>
      )}
      {active && (
        <span style={{
          position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: 16, borderRadius: 99,
          background: 'var(--priv-accent)',
        }} />
      )}
    </button>
  )
}

export function PrivateSidebar() {
  const user         = useAuthStore(s => s.user)
  const view         = useUiStore(s => s.privateView)
  const setView      = useUiStore(s => s.setPrivateView)
  const leavePrivate = useUiStore(s => s.leavePrivate)

  const inboxCount = usePrivateInboxStore(s => s.items.length)
  const todos      = usePrivateTodosStore(s => s.todos)
  const todoProgress = useMemo(() => {
    if (todos.length === 0) return undefined
    const done = todos.filter(t => t.done).length
    return done / todos.length
  }, [todos])
  const todoOpen = todos.filter(t => !t.done).length

  const displayName = user?.email?.split('@')[0] ?? 'Du'
  const initials    = displayName.slice(0, 2).toUpperCase()

  return (
    <aside className="private-sidebar">
      {/* ── Top: Avatar + Name ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '20px 12px 22px',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'oklch(100% 0 0 / 0.06)',
          border: '1px solid oklch(100% 0 0 / 0.10)',
          color: 'var(--priv-fg)', fontFamily: 'var(--font-mono)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--priv-fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {displayName}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--priv-fg-dim)', marginTop: 2,
          }}>
            Privater Raum
          </div>
        </div>
      </div>

      {/* ── BEREICHE ─────────────────────────────────────────────────────── */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'var(--priv-fg-dim)', fontWeight: 600,
        padding: '0 12px 8px',
      }}>
        Bereiche
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
        {NAV.map(def => {
          const isCapture = def.id === 'capture'
          const isTodos   = def.id === 'todos'
          return (
            <NavItem
              key={def.id}
              def={def}
              active={view === def.id}
              onClick={() => setView(def.id)}
              badge={isCapture ? inboxCount : isTodos ? todoOpen : undefined}
              progress={isTodos ? todoProgress : undefined}
            />
          )
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* ── Bottom: Zurueck zur Arbeit ──────────────────────────────────── */}
      <button
        onClick={leavePrivate}
        title="Zurueck zur Arbeit (Esc)"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', margin: '0 8px 12px',
          background: 'transparent', border: '1px solid oklch(100% 0 0 / 0.06)',
          borderRadius: 8, cursor: 'pointer',
          color: 'var(--priv-fg-dim)', fontFamily: 'inherit', fontSize: 11.5,
          transition: 'background 140ms, color 140ms, border-color 140ms',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--priv-fg)'
          e.currentTarget.style.borderColor = 'oklch(100% 0 0 / 0.14)'
          e.currentTarget.style.background = 'oklch(100% 0 0 / 0.03)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--priv-fg-dim)'
          e.currentTarget.style.borderColor = 'oklch(100% 0 0 / 0.06)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <ArrowLeft size={12} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>Zurück zur Arbeit</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
          padding: '2px 5px', borderRadius: 4,
          background: 'oklch(100% 0 0 / 0.06)', color: 'var(--priv-fg-dim)',
        }}>
          ESC
        </span>
      </button>
    </aside>
  )
}
