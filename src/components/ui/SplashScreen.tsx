import { useEffect, useRef, useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOGAN  = 'If we build, we build to lead.'
const NUMS    = '0123456789'
const ALPHNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&'

// Timing (ms)
const PHASE_NOISE    = 250   // numeric noise
const PHASE_EXPAND   = 200   // noise opens up to alphnum
const PHASE_DECODE   = 1050  // left-to-right lock-in
const ACCENT_DELAY   = 600   // after full decode: whole line flips to accent
const FPS            = 48

function rnd(pool: string) { return pool[Math.floor(Math.random() * pool.length)] }

// ── SplashScreen ──────────────────────────────────────────────────────────────

interface SplashScreenProps { exiting: boolean }

export function SplashScreen({ exiting }: SplashScreenProps) {
  const [chars,    setChars]    = useState<string[]>(() =>
    SLOGAN.split('').map(c => (c === ' ' ? ' ' : rnd(NUMS)))
  )
  const [resolved, setResolved] = useState(0)
  const [done,     setDone]     = useState(false)   // decode complete
  const [claimed,  setClaimed]  = useState(false)   // accent colour shift
  const startRef = useRef<number | null>(null)

  useEffect(() => {
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

      // Phase 3 — decode sweep, accelerates as it goes (ease-in)
      const raw   = elapsed - PHASE_NOISE - PHASE_EXPAND
      const t     = Math.min(raw / PHASE_DECODE, 1)
      // ease-in-cubic: starts slow, ends fast — feels like a machine reaching speed
      const eased = t * t * t
      const res   = Math.floor(eased * SLOGAN.length)

      setResolved(res)
      setChars(SLOGAN.split('').map((c, i) => {
        if (c === ' ') return ' '
        return i < res ? c : rnd(ALPHNUM)
      }))

      if (t < 1) {
        timerId = window.setTimeout(tick, 1000 / FPS)
      } else {
        // Decode complete — schedule accent shift
        setDone(true)
        timerId = window.setTimeout(() => setClaimed(true), ACCENT_DELAY)
      }
    }

    // Start immediately — no delay, no intro
    timerId = window.setTimeout(tick, 40)
    return () => window.clearTimeout(timerId)
  }, [])

  return (
    <div style={{
      position:       'fixed',
      inset:          0,
      background:     '#080808',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      zIndex:         9999,
      animation:      exiting ? 'splash-exit 380ms cubic-bezier(0.4,0,1,1) forwards' : 'none',
    }}>

      {/* Depth — subliminal, not decorative */}
      <div style={{
        position:      'absolute',
        inset:         0,
        background:    'radial-gradient(ellipse 800px 600px at 50% 50%, rgba(163,230,53,0.04) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* The statement */}
      <div style={{
        fontFamily:    'var(--font-sans)',
        fontSize:      36,
        fontWeight:    200,
        letterSpacing: '-0.01em',
        lineHeight:    1,
        textAlign:     'center',
        maxWidth:      560,
        padding:       '0 40px',
        userSelect:    'none',
      }}>
        {chars.map((char, i) => (
          <span
            key={i}
            style={{
              // claimed: whole line → accent simultaneously
              // resolved: individual char → white as it locks in
              // unresolved: near-invisible — text materialises out of darkness
              color: claimed
                ? 'var(--accent)'
                : i < resolved
                  ? '#ffffff'
                  : 'rgba(255,255,255,0.06)',
              transition: claimed
                ? 'color 400ms ease'
                : i < resolved
                  ? 'color 80ms ease'
                  : 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  )
}
