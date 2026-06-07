import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { CorraActionItem } from '@/lib/ai/corra-intelligence'

type ItemStatus = 'idle' | 'loading' | 'done' | 'dismissed'

interface Props {
  actions:   CorraActionItem[]
  onExecute: (action: CorraActionItem) => Promise<void>
  onDismiss?: (id: string) => void
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}
const item = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

function urgencyColor(urgency: string): string {
  const days = parseInt(urgency, 10)
  if (isNaN(days)) return 'var(--fg-dim)'
  if (days > 10) return 'var(--danger, #ef4444)'
  if (days > 3)  return 'var(--warn, #f97316)'
  return 'var(--info, #60a5fa)'
}

const typeIcon: Record<string, string> = {
  invoice: '💳',
  mail:    '📬',
  todo:    '✅',
}

export function CorraActionCard({ actions, onExecute, onDismiss }: Props) {
  const [status, setStatus] = useState<Record<string, ItemStatus>>(
    () => Object.fromEntries(actions.map(a => [a.id, 'idle']))
  )

  const handleExecute = async (action: CorraActionItem) => {
    setStatus(s => ({ ...s, [action.id]: 'loading' }))
    try {
      await onExecute(action)
      setStatus(s => ({ ...s, [action.id]: 'done' }))
    } catch {
      setStatus(s => ({ ...s, [action.id]: 'idle' }))
    }
  }

  const handleDismiss = (id: string) => {
    setStatus(s => ({ ...s, [id]: 'dismissed' }))
    onDismiss?.(id)
  }

  const visible = actions.filter(a => status[a.id] !== 'dismissed')
  if (visible.length === 0) return null

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}
    >
      {visible.map(a => {
        const s = status[a.id] ?? 'idle'
        return (
          <motion.div key={a.id} variants={item} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--surface-1, #111)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 14px',
            opacity: s === 'done' ? 0.6 : 1,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon[a.type] ?? '📌'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>{a.detail}</div>
            </div>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 99,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', flexShrink: 0,
              background: 'color-mix(in srgb, currentColor 12%, transparent)',
              color: urgencyColor(a.urgency),
            }}>{a.urgency}</span>

            {s === 'done' ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: 'var(--accent)', fontWeight: 600,
              }}>
                <Check size={13} /> Erledigt
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={s === 'loading'}
                  onClick={() => handleExecute(a)}
                  style={{
                    padding: '5px 12px', borderRadius: 7, border: 'none',
                    background: s === 'loading' ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
                    color: s === 'loading' ? 'var(--fg-dim)' : 'var(--accent-ink)',
                    fontSize: 11, fontWeight: 700, cursor: s === 'loading' ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s === 'loading' ? '…' : '→ Ausführen'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(a.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--fg-dim)', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Später
                </button>
              </div>
            )}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
