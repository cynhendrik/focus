interface SplashScreenProps { exiting: boolean }

const WORDS = ['If', 'we', 'build,', 'we', 'build', 'to', 'lead']

export function SplashScreen({ exiting }: SplashScreenProps) {
  return (
    <div className={`splash ${exiting ? 'splash--exit' : ''}`}>
      <div className="splash__aura splash__aura--a" />
      <div className="splash__aura splash__aura--b" />
      <div className="splash__vignette" />

      <div className="splash__stage">
        <h1 className="splash__headline" aria-label="If we build, we build to lead">
          {WORDS.map((word, i) => (
            <span
              key={i}
              className={`splash__word${word === 'lead' ? ' splash__word--accent' : ''}`}
              style={{ animationDelay: `${320 + i * 105}ms` }}
              aria-hidden="true"
            >
              {word}
              {i < WORDS.length - 1 && ' '}
            </span>
          ))}
        </h1>
      </div>

      <div className="splash__mark" />
    </div>
  )
}
