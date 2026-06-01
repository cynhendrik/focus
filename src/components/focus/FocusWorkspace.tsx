import { useEffect } from 'react'
import { useFocusStack } from '@/hooks/useFocusStack'
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusQueueSidebar } from './FocusQueueSidebar'
import { Check, Clock, ChevronRight } from 'lucide-react'

export function FocusWorkspace() {
  const { current, currentIndex, total, stack, prev, skip, complete, postpone } = useFocusStack()

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')            { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight')           { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm')      { e.preventDefault(); postpone() }
      if (e.key === ' ' && current?.actionType !== 'send_reminder') {
        e.preventDefault()
        complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, skip, postpone, complete, current?.actionType])

  if (total === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 52 }}>🙌</div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 600,
          margin: 0,
        }}>
          Alles erledigt!
        </h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>
          Keine offenen Aufgaben für heute.
        </p>
      </div>
    )
  }

  if (!current) return null

  const isReminder = current.actionType === 'send_reminder'

  return (
    <div style={{
      display: 'flex',
      gap: 0,
      height: '100%',
      padding: '32px 40px',
    }}>
      {/* Left panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minWidth: 0,
        paddingRight: 32,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            fontWeight: 700,
          }}>
            Dein nächster Zug
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: Math.min(total, 8) }).map((_, i) => (
                <div key={i} style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: i === currentIndex
                    ? 'var(--accent)'
                    : 'oklch(50% 0 0 / 0.2)',
                  transition: 'background 200ms',
                }} />
              ))}
              {total > 8 && (
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 2 }}>
                  +{total - 8}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {currentIndex + 1} / {total}
            </span>
          </div>
        </div>

        {/* Card */}
        {isReminder ? (
          <FocusCardReminder todo={current} onComplete={complete} />
        ) : (
          <FocusCardDefault todo={current} />
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!isReminder && (
            <button
              type="button"
              onClick={complete}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 24px',
                borderRadius: 99,
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                fontSize: 14,
                fontWeight: 700,
                boxShadow: '0 8px 24px -10px var(--accent-glow)',
                cursor: 'pointer',
              }}
            >
              <Check size={16} />
              Erledigt · weiter
              <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>
                SPACE
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={postpone}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '12px 18px',
              borderRadius: 99,
              background: 'oklch(50% 0 0 / 0.08)',
              color: 'var(--fg)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Clock size={14} />
            Morgen
            <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
          </button>

          <button
            type="button"
            onClick={skip}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: 'var(--fg-muted)',
              padding: '12px 16px',
              cursor: 'pointer',
            }}
          >
            Überspringen
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Right panel */}
      <FocusQueueSidebar stack={stack} currentIndex={currentIndex} />
    </div>
  )
}
