import { useEffect, useState, type ReactNode } from 'react'

interface Props {
  /** Stable key for the current view — change triggers the cross-fade. */
  viewKey: string
  children: ReactNode
}

/**
 * Cross-fades the active route using a pure CSS animation.
 *
 * **Why not framer-motion here:** even when only `opacity` is animated,
 * framer-motion adds `will-change: transform` to enable hardware acceleration.
 * That property creates a containing block for `position: fixed` descendants,
 * which breaks every modal, sheet, and dropdown in the app — they end up
 * sized to the route container instead of the viewport.
 *
 * Pure CSS opacity animation has neither problem.
 */
export function RouteSwitch({ viewKey, children }: Props) {
  const [renderKey, setRenderKey] = useState(viewKey)
  const [content, setContent] = useState<ReactNode>(children)
  const [phase, setPhase] = useState<'in' | 'out'>('in')

  useEffect(() => {
    if (viewKey === renderKey) {
      // Same view — keep content fresh (children may have changed).
      setContent(children)
      return
    }
    // New view: fade old content out, then swap.
    setPhase('out')
    const t = setTimeout(() => {
      setRenderKey(viewKey)
      setContent(children)
      setPhase('in')
    }, 140)
    return () => clearTimeout(t)
  }, [viewKey, renderKey, children])

  return (
    <div
      key={renderKey}
      style={{
        height: '100%',
        opacity: phase === 'in' ? 1 : 0,
        transition: 'opacity 160ms cubic-bezier(.2,.7,.1,1)',
      }}
    >
      {content}
    </div>
  )
}
