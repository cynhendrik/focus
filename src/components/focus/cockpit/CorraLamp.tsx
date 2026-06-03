// src/components/focus/cockpit/CorraLamp.tsx
import { Lightbulb, Loader } from 'lucide-react'

export type LampState = 'off' | 'ready' | 'loading'

interface Props {
  state: LampState
  onClick: () => void
}

export function CorraLamp({ state, onClick }: Props) {
  const isOff     = state === 'off'
  const isLoading = state === 'loading'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isOff || isLoading}
      title={isOff ? 'CORRA braucht mehr Kontext' : isLoading ? 'CORRA denkt…' : 'CORRA-Entwurf generieren'}
      style={{
        width: 28, height: 28, borderRadius: 99,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${isOff ? 'rgba(255,255,255,0.07)' : 'oklch(60% 0.25 280 / 0.3)'}`,
        background: isOff ? 'transparent' : 'oklch(60% 0.25 280 / 0.08)',
        color: isOff ? '#484858' : 'oklch(75% 0.2 280)',
        cursor: isOff || isLoading ? 'not-allowed' : 'pointer',
        transition: 'all 200ms',
        animation: state === 'ready' ? 'lampPulse 2s ease-in-out infinite' : undefined,
        flexShrink: 0,
      }}
    >
      {isLoading
        ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
        : <Lightbulb size={13} />
      }
      <style>{`
        @keyframes lampPulse {
          0%, 100% { box-shadow: 0 0 0 0 oklch(60% 0.25 280 / 0); }
          50% { box-shadow: 0 0 0 4px oklch(60% 0.25 280 / 0.15); }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </button>
  )
}
