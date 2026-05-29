import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Moon, AlertCircle, Clock, Cake, TrendingUp, TrendingDown,
  UserX, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useActivitiesStore } from '@/store/activities.store'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useMailStore } from '@/store/mail.store'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useContactsStore } from '@/store/contacts.store'

import { computeInsights } from '@/lib/insights'
import type { Insight, InsightSeverity, InsightKind } from '@/lib/insights'

// ─────────────────────────────────────────────────────────────────────────────
// InsightsStrip — system-spoken observations at the top of the right column.
// Compact, dismissable (session-only), severity-colored.
// ─────────────────────────────────────────────────────────────────────────────

interface Props { customerId: string }

const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  urgent:   'var(--danger)',
  caution:  'var(--warn)',
  positive: 'var(--accent)',
  neutral:  'var(--fg-muted)',
}

const SEVERITY_TINT: Record<InsightSeverity, string> = {
  urgent:   'oklch(72% 0.18 25 / 0.08)',
  caution:  'oklch(82% 0.16 70 / 0.08)',
  positive: 'oklch(92% 0.2 125 / 0.07)',
  neutral:  'oklch(100% 0 0 / 0.03)',
}

const KIND_ICON: Record<InsightKind, LucideIcon> = {
  dormancy:          Moon,
  overdue_followup:  AlertCircle,
  stage_stall:       Clock,
  birthday:          Cake,
  trend_up:          TrendingUp,
  trend_down:        TrendingDown,
  untouched_contact: UserX,
  pipeline_health:   Sparkles,
}

export function InsightsStrip({ customerId }: Props) {
  // Subscribe to everything the engine needs
  const activities = useActivitiesStore(s => s.activities)
  const todos      = useTodosStore(s => s.todos)
  const notes      = useNotesStore(s => s.notes)
  const emails     = useMailStore(s => s.emails)
  const deals      = useDealsStore(s => s.customerDeals)
  const stages     = usePipelineStore(s => s.stages)
  const contacts   = useContactsStore(s => s.contacts.filter(c => c.accountId === customerId))

  const insights = useMemo(
    () => computeInsights({ customerId, activities, todos, notes, emails, deals, stages, contacts }),
    [customerId, activities, todos, notes, emails, deals, stages, contacts],
  )

  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const dismiss = (id: string) => setDismissed(prev => {
    const next = new Set(prev); next.add(id); return next
  })

  const visible = insights.filter(i => !dismissed.has(i.id))

  if (visible.length === 0) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 8, paddingLeft: 2,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontWeight: 500,
        }}>
          Was mir auffällt
        </span>
        <span style={{
          fontSize: 10, color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)', opacity: 0.7,
        }}>
          · {visible.length}
        </span>
        <div style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
        }} />
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <AnimatePresence initial={false}>
          {visible.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onDismiss={() => dismiss(insight.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InsightCard
// ─────────────────────────────────────────────────────────────────────────────

function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const Icon = KIND_ICON[insight.kind]
  const color = SEVERITY_COLOR[insight.severity]
  const tint = SEVERITY_TINT[insight.severity]
  const [hover, setHover] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0,  scale: 1     }}
      exit   ={{ opacity: 0, x: 12, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.1, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px 8px 10px',
        borderRadius: 10,
        background: tint,
        borderLeft: `2px solid ${color}`,
        border: `1px solid ${color}33`,
        borderLeftWidth: 2,
        position: 'relative',
        transition: 'background 180ms ease',
      }}
    >
      <Icon
        size={13}
        strokeWidth={2.4}
        style={{ color, flexShrink: 0 }}
      />
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 12.5,
        lineHeight: 1.4,
        color: 'var(--fg-2)',
        letterSpacing: '-0.005em',
      }}>
        {insight.text}
      </span>
      <button
        onClick={onDismiss}
        aria-label="Insight ausblenden"
        style={{
          width: 20, height: 20, borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          color: 'var(--fg-dim)',
          opacity: hover ? 1 : 0.3,
          transition: 'opacity 180ms ease, color 180ms ease',
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = color }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)' }}
      >
        <X size={11} />
      </button>
    </motion.div>
  )
}
