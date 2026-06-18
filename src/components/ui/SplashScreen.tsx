import { Fragment } from 'react'

interface SplashScreenProps { exiting: boolean }

const WORDS = ['You', "don't", 'find', 'yourself,', 'you', 'create', 'yourself.']

export function SplashScreen({ exiting }: SplashScreenProps) {
  return (
    <div className={`splash ${exiting ? 'splash--exit' : ''}`}>
      <div className="splash__stage">
        <h1 className="splash__headline" aria-label="You don't find yourself, you create yourself.">
          {WORDS.map((word, i) => (
            <Fragment key={i}>
              <span
                className={`splash__word${word === 'create' ? ' splash__word--accent' : ''}`}
                style={{ animationDelay: `${320 + i * 130}ms` }}
                aria-hidden="true"
              >
                {word}
              </span>
              {i < WORDS.length - 1 ? ' ' : ''}
            </Fragment>
          ))}
        </h1>
      </div>
    </div>
  )
}
