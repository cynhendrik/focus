import { useEffect } from 'react'
import { useUiStore } from '@/store/ui.store'

interface Props {
  currentIndex: number
  total: number
}

export function FocusTopBar({ currentIndex, total }: Props) {
  const setAppView = useUiStore(s => s.setAppView)
  const progress = total > 0 ? (currentIndex + 1) / total : 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAppView('dashboard')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setAppView])

  return (
    <div style={{
      height: 48,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      gap: 24,
      flexShrink: 0,
    }}>
      {/* Left: brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: 'var(--accent)',
          boxShadow: '0 0 6px var(--accent)',
        }} />
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>Focus</span>
        <span style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-dim)',
          letterSpacing: '0.04em',
        }}>
          abarbeiten, ohne Ablenkung
        </span>
      </div>

      {/* Center: counter + progress bar */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg)',
          flexShrink: 0,
        }}>
          {total > 0 ? `${currentIndex + 1} / ${total}` : '— / —'}
        </span>
        <div style={{
          flex: 1,
          height: 4,
          borderRadius: 99,
          background: 'oklch(50% 0 0 / 0.15)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: 'var(--accent)',
            borderRadius: 99,
            transition: 'width 300ms ease',
          }} />
        </div>
      </div>

      {/* Right: close button */}
      <button
        type="button"
        onClick={() => setAppView('dashboard')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--fg)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Schließen
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-dim)',
          background: 'var(--surface-2)',
          padding: '2px 5px',
          borderRadius: 4,
        }}>
          ESC
        </span>
      </button>
    </div>
  )
}
