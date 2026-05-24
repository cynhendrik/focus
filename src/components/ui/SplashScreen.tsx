import { useEffect, useState } from 'react'

const SLOGAN = 'If we build, we build to lead.'
const POOL   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&'

function rnd() { return POOL[Math.floor(Math.random() * POOL.length)] }

interface SplashScreenProps { exiting: boolean }

export function SplashScreen({ exiting }: SplashScreenProps) {
  const [chars,    setChars]    = useState<string[]>(() =>
    SLOGAN.split('').map(c => (c === ' ' ? ' ' : rnd()))
  )
  const [resolved, setResolved] = useState(0)

  useEffect(() => {
    const DELAY    = 600   // ms still before decode starts
    const DURATION = 2400  // ms for full decode sweep
    const FPS      = 40

    const startAt  = Date.now() + DELAY
    let   rafId    = 0

    const tick = () => {
      const now     = Date.now()
      if (now < startAt) { rafId = window.setTimeout(tick, 1000 / FPS); return }

      const elapsed = now - startAt
      const t       = Math.min(elapsed / DURATION, 1)
      // ease-in-out cubic — slow start + slow end, fast middle
      const eased   = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2

      const res = Math.floor(eased * SLOGAN.length)
      setResolved(res)
      setChars(SLOGAN.split('').map((c, i) => {
        if (c === ' ') return ' '
        return i < res ? c : rnd()
      }))

      if (t < 1) rafId = window.setTimeout(tick, 1000 / FPS)
    }

    rafId = window.setTimeout(tick, 1000 / FPS)
    return () => window.clearTimeout(rafId)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      animation: exiting ? 'splash-text-exit 500ms ease forwards' : 'none',
    }}>
      <div style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 28,
        fontWeight: 300,
        letterSpacing: '-0.02em',
        lineHeight: 1.3,
        textAlign: 'center',
        maxWidth: 520,
        padding: '0 32px',
      }}>
        {chars.map((char, i) => (
          <span
            key={i}
            style={{
              color: i < resolved ? 'var(--accent)' : 'oklch(55% 0.12 125)',
              transition: i < resolved ? 'color 80ms ease' : 'none',
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
