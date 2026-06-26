import type { ReactNode } from 'react'

interface Props { color?: string; size?: number; dim?: boolean; children: ReactNode }

export function IconTile({ color = 'var(--accent)', size = 44, dim = false, children }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 12, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: dim ? 'color-mix(in srgb, var(--fg-dim) 10%, transparent)'
                      : `color-mix(in srgb, ${color} 14%, transparent)`,
      color: dim ? 'var(--fg-dim)' : color,
      transition: 'background 220ms, color 220ms',
    }}>
      {children}
    </div>
  )
}
