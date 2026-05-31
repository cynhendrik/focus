import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Moon, Clock, ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useUiStore } from '@/store/ui.store'

import { computeAccountSignals } from '@/lib/insights'
import type { AccountSignal, InsightKind, InsightSeverity } from '@/lib/insights'

// ─────────────────────────────────────────────────────────────────────────────
// AccountSignals — dashboard section "Beziehungen brauchen Pflege".
// Surfaces dormant accounts and stage stalls across the whole workspace.
// Empty → entire section hidden, no noise.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  urgent:   'var(--danger)',
  caution:  'var(--warn)',
  positive: 'var(--accent)',
  neutral:  'var(--fg-muted)',
}

const KIND_ICON: Record<InsightKind, LucideIcon> = {
  dormancy:          Moon,
  overdue_followup:  Clock,
  stage_stall:       Clock,
  birthday:          Clock,
  trend_up:          Clock,
  trend_down:        Clock,
  untouched_contact: Clock,
  pipeline_health:   Clock,
}

const MAX_VISIBLE = 5

export function AccountSignals() {
  const customers    = useCustomersStore(s => s.customers)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const followUps    = useCrmStore(s => s.allFollowUps)
  const deals        = useDealsStore(s => s.deals)
  const stages       = usePipelineStore(s => s.stages)
  const setSelected  = useUiStore(s => s.setSelectedCustomer)

  const signals = useMemo(
    () => computeAccountSignals({
      customers, lastActivity, followups: followUps, deals, stages,
    }),
    [customers, lastActivity, followUps, deals, stages],
  )

  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? signals : signals.slice(0, MAX_VISIBLE)
  const hidden = Math.max(0, signals.length - MAX_VISIBLE)

  if (signals.length === 0) return null

  return (
    <div className="card" style={{
      padding: 18,
      display: 'flex', flexDirection: 'column', gap: 10,
      marginTop: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14.5, fontWeight: 600, margin: 0,
          letterSpacing: '-0.005em',
        }}>
          Beziehungen brauchen Pflege
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5,
            color: 'var(--fg-dim)', fontWeight: 500, letterSpacing: '0.06em',
            background: 'oklch(100% 0 0 / 0.04)', padding: '2px 7px', borderRadius: 99,
          }}>
            {String(signals.length).padStart(2, '0')}
          </span>
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <AnimatePresence initial={false}>
          {visible.map(sig => (
            <SignalRow
              key={sig.insight.id}
              signal={sig}
              onClick={() => setSelected(sig.customerId)}
            />
          ))}
        </AnimatePresence>
      </div>

      {hidden > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            alignSelf: 'flex-start',
            marginTop: 4,
            padding: '4px 10px',
            fontSize: 11.5, color: 'var(--fg-muted)',
            background: 'transparent', cursor: 'pointer',
            transition: 'color 180ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-muted)' }}
        >
          + {hidden} weitere zeigen
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SignalRow
// ─────────────────────────────────────────────────────────────────────────────

function SignalRow({ signal, onClick }: { signal: AccountSignal; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  // Defensive: unbekannte kinds/severities sollten die App nicht zerschiessen.
  const Icon  = KIND_ICON[signal.insight.kind]              ?? KIND_ICON.pipeline_health
  const color = SEVERITY_COLOR[signal.insight.severity]     ?? SEVERITY_COLOR.neutral

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit   ={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '8px 10px',
        borderRadius: 10,
        background: hover ? 'oklch(100% 0 0 / 0.04)' : 'transparent',
        borderLeft: `2px solid ${color}`,
        cursor: 'pointer',
        transition: 'background 180ms ease',
      }}
    >
      <Icon size={13} strokeWidth={2.4} style={{ color }} />

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 500,
          color: 'var(--fg)',
          letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {signal.customerName}
        </span>
        <span style={{
          fontSize: 11.5,
          color: 'var(--fg-muted)',
          letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginTop: 1,
        }}>
          {signal.insight.text}
        </span>
      </div>

      <ChevronRight
        size={13}
        style={{
          color: 'var(--fg-dim)',
          opacity: hover ? 1 : 0.4,
          transform: hover ? 'translateX(2px)' : 'translateX(0)',
          transition: 'opacity 180ms ease, transform 180ms ease',
        }}
      />
    </motion.div>
  )
}
