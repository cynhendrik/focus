import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

interface Props {
  value: number
  /** Custom formatter — receives the live value, must return a display string. */
  format?: (n: number) => string
  /** Duration in seconds. Default 0.9. */
  duration?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Counts from previous value to next value with an ease-out spring feel.
 * Respects `prefers-reduced-motion`. Default formatter rounds to integer.
 */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString('de-DE'),
  duration = 0.9,
  className,
  style,
}: Props) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState<string>(() => format(reduceMotion ? value : 0))
  const prev = useRef<number>(reduceMotion ? value : 0)

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(format(value))
      prev.current = value
      return
    }
    const from = prev.current
    const controls = animate(from, value, {
      duration,
      ease: [0.2, 0.7, 0.1, 1],
      onUpdate: (latest) => setDisplay(format(latest)),
      onComplete: () => { prev.current = value },
    })
    return () => controls.stop()
  }, [value, duration, format, reduceMotion])

  return <span className={className} style={style}>{display}</span>
}
