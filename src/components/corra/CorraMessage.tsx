// src/components/corra/CorraMessage.tsx
import { motion } from 'framer-motion'
import { CorraActionCard } from './CorraActionCard'
import { CorraWidget } from './CorraWidget'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  message:   CorraMessageType
  onExecute: (action: CorraActionItem) => Promise<void>
}

export function CorraMessage({ message, onExecute }: Props) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, marginTop: 2,
        }}>✦</div>
      )}

      <div style={{ maxWidth: '80%', flex: isUser ? undefined : 1 }}>
        {!isUser && (
          <div style={{
            fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', marginBottom: 5,
          }}>KORA</div>
        )}

        <div style={{
          padding: isUser ? '10px 14px' : undefined,
          borderRadius: isUser ? '12px 0 12px 12px' : undefined,
          background: isUser ? 'oklch(92% 0.2 245 / 0.08)' : undefined,
          border: isUser ? '1px solid oklch(92% 0.2 245 / 0.25)' : undefined,
          fontSize: 13, lineHeight: 1.65, color: 'var(--fg)',
        }}>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.text}
          </div>

          {message.widget && (
            <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden' }}>
              <CorraWidget type={message.widget} compact />
            </div>
          )}

          {message.actions && message.actions.length > 0 && (
            <CorraActionCard
              actions={message.actions}
              onExecute={onExecute}
            />
          )}
        </div>
      </div>

      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', marginTop: 2,
        }}>Du</div>
      )}
    </motion.div>
  )
}
