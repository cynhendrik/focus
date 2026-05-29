import { motion, useReducedMotion } from 'framer-motion'
import { Children, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Delay between items in seconds. Default 0.03 (30ms). */
  stagger?: number
  /** Starting offset in px for each item. Default 6. */
  offset?: number
  /** Animation duration per item in seconds. Default 0.28. */
  duration?: number
  /** Wrapper element style (the motion.div container, not each item). */
  style?: React.CSSProperties
  className?: string
}

/**
 * Wraps a list of children, fading + lifting each in with a small stagger.
 * Items already mounted re-stagger when the list reference changes — that's
 * intentional: lists usually swap as a whole, and the visual rhythm makes
 * data updates feel less jarring than a hard swap.
 *
 * Respects `prefers-reduced-motion`: collapses to a single fade.
 */
export function StaggerList({
  children,
  stagger = 0.03,
  offset = 6,
  duration = 0.28,
  style,
  className,
}: Props) {
  const reduce = useReducedMotion()
  const items = Children.toArray(children)

  if (reduce) {
    return <div className={className} style={style}>{children}</div>
  }

  return (
    <div className={className} style={style}>
      {items.map((child, i) => (
        <motion.div
          key={(child as React.ReactElement).key ?? i}
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration,
            delay: i * stagger,
            ease: [0.2, 0.7, 0.1, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}
