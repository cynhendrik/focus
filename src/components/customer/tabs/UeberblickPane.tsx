import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, LayoutDashboard, DollarSign, FileText, User } from 'lucide-react'

import { DashboardPane } from './DashboardPane'
import { SalesPane } from './SalesPane'
import { InformationenPane } from './InformationenPane'
import { FinanzPane } from './FinanzPane'

type Section = 'dashboard' | 'finanzen' | 'sales' | 'informationen'

const SECTIONS: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard',     label: 'Übersicht',        icon: LayoutDashboard },
  { id: 'finanzen',      label: 'Finanzen',         icon: DollarSign      },
  { id: 'sales',         label: 'Deals & Pipeline', icon: FileText        },
  { id: 'informationen', label: 'Stammdaten',       icon: User            },
]

interface Props { customerId: string }

/**
 * Combined "Überblick" tab — replaces the old separate Dashboard / Sales /
 * Finanzen / Informationen tabs. Sub-sections collapse so the user can scan
 * the whole customer state on one page and expand what's relevant.
 *
 * Dashboard expands by default; the rest collapsed.
 */
export function UeberblickPane({ customerId }: Props) {
  const [open, setOpen] = useState<Record<Section, boolean>>({
    dashboard:     true,
    finanzen:      false,
    sales:         false,
    informationen: false,
  })

  const toggle = (id: Section) => setOpen(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 32px' }}>
      {SECTIONS.map(s => (
        <SectionShell
          key={s.id}
          label={s.label}
          icon={s.icon}
          open={open[s.id]}
          onToggle={() => toggle(s.id)}
        >
          {renderSection(s.id, customerId)}
        </SectionShell>
      ))}
    </div>
  )
}

function renderSection(section: Section, customerId: string): React.ReactNode {
  switch (section) {
    case 'dashboard':     return <DashboardPane     customerId={customerId} />
    case 'finanzen':      return <FinanzPane        customerId={customerId} />
    case 'sales':         return <SalesPane         customerId={customerId} />
    case 'informationen': return <InformationenPane customerId={customerId} />
  }
}

function SectionShell({
  label, icon: Icon, open, onToggle, children,
}: {
  label: string
  icon: typeof LayoutDashboard
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 14,
      background: 'var(--surface)',
      overflow: 'hidden',
      transition: 'border-color 180ms ease',
    }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--fg)',
        }}
      >
        <Icon size={15} style={{ color: open ? 'var(--accent)' : 'var(--fg-muted)', transition: 'color 180ms' }} />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>
          {label}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--fg-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 220ms cubic-bezier(.2,.7,.1,1)',
          }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height:  { duration: 0.26, ease: [0.2, 0.7, 0.1, 1] },
              opacity: { duration: 0.18, ease: 'easeOut' },
            }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--border)' }}
          >
            <div style={{ padding: '12px 4px' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
