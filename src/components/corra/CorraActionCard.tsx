import { motion } from 'framer-motion'
import type { CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  actions: CorraActionItem[]
  focusCta: string
  onFocus: () => void
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

function urgencyColor(urgency: string): string {
  const days = parseInt(urgency, 10)
  if (isNaN(days)) return 'var(--fg-dim)'
  if (days > 10) return 'var(--danger, #ef4444)'
  if (days > 3) return 'var(--warn, #f97316)'
  return 'var(--info, #60a5fa)'
}

export function CorraActionCard({ actions, focusCta, onFocus }: Props) {
  return (
    <div style={{ marginTop: 10 }}>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}
      >
        {actions.map(a => (
          <motion.div
            key={a.id}
            variants={item}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface-3, #1e1e1e)',
              border: '1px solid var(--border)',
              borderRadius: 7, padding: '7px 11px',
            }}
          >
            <div>
              <div style={{ color: 'var(--fg)', fontSize: 11, fontWeight: 600 }}>{a.label}</div>
              <div style={{ color: 'var(--fg-dim)', fontSize: 10 }}>{a.detail}</div>
            </div>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 10,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
              background: 'color-mix(in srgb, currentColor 15%, transparent)',
              color: urgencyColor(a.urgency),
            }}>
              {a.urgency}
            </span>
          </motion.div>
        ))}
      </motion.div>

      <button
        type="button"
        onClick={onFocus}
        style={{
          width: '100%', padding: '9px 14px', border: 'none', borderRadius: 8,
          background: 'linear-gradient(135deg, var(--accent), #7c3aed)',
          color: 'var(--accent-ink)', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6,
          boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 30%, transparent)',
        }}
      >
        <span>⚡</span> {focusCta}
      </button>
    </div>
  )
}
