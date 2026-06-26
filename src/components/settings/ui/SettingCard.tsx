import type { CSSProperties, ReactNode } from 'react'

interface Props { danger?: boolean; style?: CSSProperties; children: ReactNode }

export function SettingCard({ danger = false, style, children }: Props) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${danger ? 'color-mix(in srgb, #e5484d 40%, var(--border))' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', boxShadow: 'var(--card-shadow)',
      padding: '18px 20px', ...style,
    }}>
      {children}
    </div>
  )
}
