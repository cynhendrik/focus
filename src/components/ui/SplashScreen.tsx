interface SplashScreenProps {
  exiting: boolean
}

const WORDS   = ['If', 'we', 'build,', 'we', 'build', 'to', 'lead.']
const STAGGER = 320
const START   = 300

export function SplashScreen({ exiting }: SplashScreenProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: exiting ? 'splash-text-exit 500ms ease forwards' : 'none',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.3em',
        justifyContent: 'center',
        maxWidth: 500,
        padding: '0 32px',
      }}>
        {WORDS.map((word, i) => (
          <span
            key={i}
            style={{
              fontSize: 30,
              fontWeight: 300,
              color: 'var(--accent)',
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
