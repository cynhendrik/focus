import { useEffect } from 'react'
import { useFocusStack } from '@/hooks/useFocusStack'
import { TaskFocusCard } from './TaskFocusCard'
import { ChevronLeft, ChevronRight, Check, Clock } from 'lucide-react'

export function TasksFocusView() {
  const stack = useFocusStack()
  const { current, currentIndex, total, prev, skip, complete, postpone } = stack

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === ' ')          { e.preventDefault(); complete() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); postpone() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [complete, prev, skip, postpone])

  if (total === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '96px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 48 }}>🙌</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, margin: 0 }}>
          Tag geschafft!
        </h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>
          Keine offenen Aufgaben für heute. Wechsle zu Liste oder Board.
        </p>
      </div>
    )
  }
  if (!current) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>
          AUFGABE {currentIndex + 1} VON {total}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 99,
              background: i === currentIndex ? 'var(--accent)' : 'oklch(50% 0 0 / 0.15)',
            }} />
          ))}
        </div>
      </div>

      <TaskFocusCard todo={current} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={prev}
          disabled={currentIndex === 0}
          style={{
            width: 44, height: 44, borderRadius: 99,
            background: 'oklch(50% 0 0 / 0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-muted)',
            opacity: currentIndex === 0 ? 0.4 : 1,
          }}
          aria-label="Zurück"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          onClick={complete}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 24px', borderRadius: 99,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 14, fontWeight: 700,
            boxShadow: '0 8px 24px -10px var(--accent-glow)',
          }}
        >
          <Check size={16} />
          Erledigt · weiter
          <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>SPACE</span>
        </button>

        <button
          onClick={postpone}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 18px', borderRadius: 99,
            background: 'oklch(50% 0 0 / 0.08)',
            color: 'var(--fg)',
            fontSize: 13, fontWeight: 600,
          }}
        >
          <Clock size={14} />
          Morgen
          <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <button
          onClick={skip}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 13, color: 'var(--fg-muted)',
            padding: '12px 16px',
          }}
        >
          Überspringen
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
