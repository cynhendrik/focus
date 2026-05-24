interface SplashScreenProps {
  exiting: boolean
}

export function SplashScreen({ exiting }: SplashScreenProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 18,
      zIndex: 9999,
      animation: exiting ? 'splash-exit 550ms cubic-bezier(.4,0,1,1) forwards' : 'none',
    }}>

      {/* Brand wordmark */}
      <div style={{
        fontSize: 10.5,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: '#bbb',
        fontWeight: 500,
        fontFamily: '"SF Mono", "Fira Code", "Fira Mono", monospace',
        animation: 'splash-rise 700ms cubic-bezier(.2,.7,.1,1) 150ms both',
      }}>
        Cynera
      </div>

      {/* Slogan */}
      <div style={{
        fontSize: 23,
        fontWeight: 380,
        color: '#111',
        letterSpacing: '-0.025em',
        lineHeight: 1.25,
        textAlign: 'center',
        maxWidth: 380,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'splash-rise 900ms cubic-bezier(.2,.7,.1,1) 550ms both',
      }}>
        If we build,<br />we build to lead.
      </div>

      {/* Subtle bottom line */}
      <div style={{
        position: 'absolute',
        bottom: 36,
        fontSize: 10,
        letterSpacing: '0.14em',
        color: '#ddd',
        fontFamily: '"SF Mono", monospace',
        textTransform: 'uppercase',
        animation: 'splash-rise 600ms cubic-bezier(.2,.7,.1,1) 1000ms both',
      }}>
        Focus
      </div>

    </div>
  )
}
