import type { CSSProperties } from 'react'

interface Props {
  /** Width — number = px, string = CSS value. Default 100%. */
  width?: number | string
  /** Height — number = px, string = CSS value. Default 14px. */
  height?: number | string
  /** Border radius — defaults to 6px (regular lines) or '50%' for circles. */
  radius?: number | string
  /** Render as a circle (radius = 50%, width/height should match). */
  circle?: boolean
  /** Extra style to merge in. */
  style?: CSSProperties
  className?: string
}

/**
 * Subtle shimmer placeholder. Render exactly where the eventual content
 * will appear, with matching dimensions, so the layout doesn't jump when
 * data arrives.
 *
 * Shimmer driven by a CSS keyframe defined in globals.css to avoid the
 * cost of running it on the JS main thread.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius,
  circle = false,
  style,
  className,
}: Props) {
  return (
    <span
      className={`skeleton ${className ?? ''}`}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width:  typeof width  === 'number' ? `${width}px`  : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: circle
          ? '50%'
          : typeof radius === 'number' ? `${radius}px`
          : radius ?? 6,
        ...style,
      }}
    />
  )
}

/** Compose a few Skeleton lines for a paragraph-shaped block. */
export function SkeletonText({ lines = 2, lastWidth = '60%' }: { lines?: number; lastWidth?: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? lastWidth : '100%'}
          height={11}
        />
      ))}
    </span>
  )
}
