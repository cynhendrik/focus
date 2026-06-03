import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { CorraActionCard } from './CorraActionCard'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  message: CorraMessageType
  onFocusActions?: (actions: CorraActionItem[]) => void
}

export function CorraMessage({ message, onFocusActions }: Props) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        padding: '0 24px',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 10px rgba(124,58,237,0.35)',
          marginTop: 2,
        }}>
          <Sparkles size={12} style={{ color: '#fff' }} />
        </div>
      )}

      <div style={{
        maxWidth: '82%',
        padding: '12px 15px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser
          ? 'linear-gradient(135deg, #1e1b4b, #2d1b69)'
          : 'var(--surface-2)',
        border: isUser
          ? '1px solid rgba(124,58,237,0.3)'
          : '1px solid var(--border)',
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--fg)',
      }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {message.text}
        </div>

        {message.actions && message.actions.length > 0 && onFocusActions && (
          <CorraActionCard
            actions={message.actions}
            focusCta={message.focusCta ?? `${message.actions.length} Aktion${message.actions.length > 1 ? 'en' : ''} in Fokus bearbeiten`}
            onFocus={() => onFocusActions(message.actions!)}
          />
        )}
      </div>

      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--surface-3)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 2,
          fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)',
        }}>
          Du
        </div>
      )}
    </motion.div>
  )
}
