import type { CSSProperties, ReactNode } from 'react'

type Variant = 'gradient' | 'soft' | 'ok' | 'neutral'

const VARIANTS: Record<Variant, CSSProperties> = {
  gradient: { background: 'var(--accent-gradient)', color: '#fff' },
  soft:     { background: 'var(--accent-soft)', color: 'var(--accent-text)' },
  ok:       { background: 'color-mix(in srgb, #2ea05a 18%, transparent)', color: '#3fbf72' },
  neutral:  { background: 'var(--surface-3)', color: 'var(--fg-muted)' },
}

export function Badge({ variant = 'soft', children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, ...VARIANTS[variant] }}>
      {children}
    </span>
  )
}
