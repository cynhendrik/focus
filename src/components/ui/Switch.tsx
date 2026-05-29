import { motion } from 'framer-motion'

type Size = 'sm' | 'md' | 'lg'

interface Props {
  on: boolean
  onToggle: () => void
  size?: Size
  disabled?: boolean
  /** Inline label rendered to the left of the switch. */
  label?: string
  /** Helper text rendered below the label. */
  hint?: string
  /** Stretch label+switch row to fill width. */
  block?: boolean
}

const SIZES: Record<Size, { track: number; trackH: number; knob: number; pad: number }> = {
  sm: { track: 36, trackH: 22, knob: 16, pad: 3 },
  md: { track: 46, trackH: 26, knob: 20, pad: 3 },
  lg: { track: 56, trackH: 32, knob: 26, pad: 3 },
}

/**
 * App-styled switch. Uses the accent color for the on-state and a soft surface
 * for the off-state, both responsive to dark/light theme via CSS variables.
 *
 * Spring-driven knob with a subtle width pulse on press — feels physical, not
 * digital. The on-state also lifts a soft accent-glow shadow on the track.
 */
export function Switch({
  on, onToggle,
  size = 'md',
  disabled = false,
  label, hint,
  block = false,
}: Props) {
  const s = SIZES[size]
  const offset = s.track - s.knob - s.pad * 2

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!disabled) onToggle()
  }

  const switchEl = (
    <motion.button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      onClick={handleClick}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      style={{
        position: 'relative',
        width: s.track,
        height: s.trackH,
        borderRadius: s.trackH,
        border: 'none',
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--accent)' : 'oklch(50% 0 0 / 0.18)',
        boxShadow: on
          ? '0 0 0 1px oklch(0% 0 0 / 0.06), 0 6px 14px -6px var(--accent-glow)'
          : 'inset 0 0 0 1px oklch(0% 0 0 / 0.06)',
        opacity: disabled ? 0.5 : 1,
        padding: 0,
        transition: 'background 240ms ease, box-shadow 240ms ease',
      }}
    >
      <motion.div
        layout
        initial={false}
        animate={{
          x: on ? offset : 0,
        }}
        transition={{ type: 'spring', stiffness: 700, damping: 38, mass: 0.65 }}
        style={{
          position: 'absolute',
          top: s.pad,
          left: s.pad,
          width: s.knob,
          height: s.knob,
          borderRadius: '50%',
          background: on ? 'var(--accent-ink)' : 'var(--fg)',
          boxShadow: '0 1px 2px oklch(0% 0 0 / 0.18), 0 2px 6px oklch(0% 0 0 / 0.12)',
        }}
      />
    </motion.button>
  )

  if (!label && !hint) return switchEl

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: block ? 'space-between' : 'flex-start',
        gap: 14,
        width: block ? '100%' : 'auto',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }}
      onClick={handleClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {label && (
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.005em' }}>
            {label}
          </span>
        )}
        {hint && (
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
            {hint}
          </span>
        )}
      </div>
      {switchEl}
    </label>
  )
}
