import { useEffect, useRef, useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOGAN  = 'If we build, we build to lead.'
const NUMS    = '0123456789'
const ALPHNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&'

// Timing (ms)
const SLOGAN_DELAY   = 700    // name + line finish before scramble starts
const PHASE_NOISE    = 200    // pure numeric noise
const PHASE_EXPAND   = 150    // pool expands to alphnum
const PHASE_DECODE   = 900    // left-to-right char lock-in
const FPS            = 48

function rnd(pool: string) { return pool[Math.floor(Math.random() * pool.length)] }

// ── SplashScreen ──────────────────────────────────────────────────────────────

interface SplashScreenProps { exiting: boolean }

export function SplashScreen({ exiting }: SplashScreenProps) {
  const [chars,         setChars]         = useState<string[]>(() =>
    SLOGAN.split('').map(c => (c === ' ' ? ' ' : rnd(NUMS)))
  )
  const [resolved,      setResolved]      = useState(0)
  const [sloganStarted, setSloganStarted] = useState(false)
  const startRef = useRef<number | null>(null)

  // Delay scramble until after name + line animations land
  useEffect(() => {
    const t = setTimeout(() => setSloganStarted(true), SLOGAN_DELAY)
    return () => clearTimeout(t)
  }, [])

  // Scramble loop
  useEffect(() => {
    if (!sloganStarted) return
    let timerId = 0

    const tick = () => {
      const now = Date.now()
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current

      if (elapsed < PHASE_NOISE) {
        setChars(SLOGAN.split('').map(c => (c === ' ' ? ' ' : rnd(NUMS))))
        timerId = window.setTimeout(tick, 1000 / FPS)
        return
      }

      if (elapsed < PHASE_NOISE + PHASE_EXPAND) {
        const t    = (elapsed - PHASE_NOISE) / PHASE_EXPAND
        const pool = t < 0.5 ? NUMS + NUMS + ALPHNUM : ALPHNUM
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
  }, [sloganStarted])

  return (
    <div style={{
      position:   'fixed',
      inset:      0,
      background: '#080808',
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex:     9999,
      animation:  exiting ? 'splash-exit 420ms cubic-bezier(0.4,0,1,1) forwards' : 'none',
    }}>

      {/* Subliminal glow — barely visible, adds depth */}
      <div style={{
        position:       'absolute',
        inset:          0,
        background:     'radial-gradient(ellipse 700px 500px at 50% 50%, rgba(163,230,53,0.05) 0%, transparent 70%)',
        pointerEvents:  'none',
      }} />

      {/* Composition */}
      <div style={{ position: 'relative', textAlign: 'center', userSelect: 'none' }}>

        {/* Product name */}
        <div style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      52,
          fontWeight:    800,
          letterSpacing: '0.28em',
          paddingRight:  '0.28em', // compensate trailing tracking
          color:         '#ffffff',
          lineHeight:    1,
          animation:     'splash-name-in 380ms cubic-bezier(0.16,1,0.3,1) 80ms both',
        }}>
          CYNERA
        </div>

        {/* Accent divider */}
        <div style={{
          width:           40,
          height:          1,
          margin:          '20px auto 0',
          background:      'var(--accent)',
          transformOrigin: 'center',
          animation:       'splash-line-in 350ms cubic-bezier(0.16,1,0.3,1) 310ms both',
        }} />

        {/* Slogan */}
        <div style={{
          marginTop:     20,
          fontFamily:    'var(--font-sans)',
          fontSize:      13,
          fontWeight:    300,
          letterSpacing: '0.1em',
          lineHeight:    1.4,
          animation:     `splash-slogan-in 180ms ease ${SLOGAN_DELAY}ms both`,
        }}>
          {chars.map((char, i) => (
            <span
              key={i}
              style={{
                color:              i < resolved ? 'var(--accent)' : 'rgba(255,255,255,0.18)',
                transition:         i < resolved ? 'color 100ms ease' : 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {char}
            </span>
          ))}
        </div>

      </div>
    </div>
  )
}
