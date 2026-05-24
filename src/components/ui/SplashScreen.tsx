interface SplashScreenProps {
  exiting: boolean
}

const WORDS = ['If', 'we', 'build,', 'we', 'build', 'to', 'lead.']
const STAGGER = 320   // ms zwischen jedem Wort
const START   = 300   // ms Pause bevor erstes Wort erscheint

export function SplashScreen({ exiting }: SplashScreenProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: exiting ? 'splash-exit 600ms cubic-bezier(.4,0,1,1) forwards' : 'none',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.3em',
        justifyContent: 'center',
        maxWidth: 480,
        padding: '0 32px',
      }}>
        {WORDS.map((word, i) => (
          <span
            key={i}
            style={{
              fontSize: 30,
              fontWeight: 300,
              color: '#0f0f0f',
              letterSpacing: '-0.025em',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
              lineHeight: 1.2,
              opacity: 0,
              animation: `splash-word 700ms cubic-bezier(.2,.7,.1,1) ${START + i * STAGGER}ms forwards`,
            }}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  )
}
