import { useEffect, useRef, useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOGAN  = 'If we build, we build to lead.'
const NUMS    = '0123456789'
const ALPHNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&'

// Timing (ms)
const PHASE_NOISE    = 600    // pure numeric noise
const PHASE_EXPAND   = 400    // pool expands to alphnum
const PHASE_DECODE   = 3200   // left-to-right char lock-in
const TOTAL          = PHASE_NOISE + PHASE_EXPAND + PHASE_DECODE
const FPS            = 60

function rnd(pool: string) { return pool[Math.floor(Math.random() * pool.length)] }

// ── SplashScreen ──────────────────────────────────────────────────────────────

interface SplashScreenProps { exiting: boolean }

export function SplashScreen({ exiting }: SplashScreenProps) {
  const [chars,    setChars]    = useState<string[]>(() =>
    SLOGAN.split('').map(c => (c === ' ' ? ' ' : rnd(NUMS)))
  )
  const [resolved, setResolved] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    let timerId = 0

    const tick = () => {
      const now = Date.now()
      if (startRef.current === null) startRef.current = now

      const elapsed = now - startRef.current

      if (elapsed < PHASE_NOISE) {
        // Phase 1 — pure number noise
        setChars(SLOGAN.split('').map(c => (c === ' ' ? ' ' : rnd(NUMS))))
        timerId = window.setTimeout(tick, 1000 / FPS)
        return
      }

      if (elapsed < PHASE_NOISE + PHASE_EXPAND) {
        // Phase 2 — gradually blend NUMS → ALPHNUM based on how far into this phase we are
        const t    = (elapsed - PHASE_NOISE) / PHASE_EXPAND       // 0 → 1
        const pool = t < 0.5 ? NUMS + NUMS + ALPHNUM : ALPHNUM    // weighted towards nums early
        setChars(SLOGAN.split('').map(c => (c === ' ' ? ' ' : rnd(pool))))
        timerId = window.setTimeout(tick, 1000 / FPS)
        return
      }

      // Phase 3 — decode sweep (cubic ease-in-out)
      const raw   = elapsed - PHASE_NOISE - PHASE_EXPAND
      const t     = Math.min(raw / PHASE_DECODE, 1)
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2
      const res   = Math.floor(eased * SLOGAN.length)

      setResolved(res)
      setChars(SLOGAN.split('').map((c, i) => {
        if (c === ' ') return ' '
        return i < res ? c : rnd(ALPHNUM)
      }))

      if (t < 1) timerId = window.setTimeout(tick, 1000 / FPS)
    }

    timerId = window.setTimeout(tick, 1000 / FPS)
    return () => window.clearTimeout(timerId)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      animation: exiting ? 'splash-text-exit 600ms ease forwards' : 'none',
    }}>
      <div style={{
        fontFamily:    'var(--font-sans)',
        fontSize:      28,
        fontWeight:    300,
        letterSpacing: '-0.02em',
        lineHeight:    1.3,
        textAlign:     'center',
        maxWidth:      520,
        padding:       '0 32px',
      }}>
        {chars.map((char, i) => (
          <span
            key={i}
            style={{
              color:             i < resolved ? 'var(--accent)' : 'oklch(42% 0.09 125)',
              transition:        'color 180ms ease',
              fontVariantNumeric:'tabular-nums',
            }}
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  )
}
