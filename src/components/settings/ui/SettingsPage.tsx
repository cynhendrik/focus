import type { ReactNode } from 'react'

interface Props { title: string; subtitle?: string; maxWidth?: number; children: ReactNode }

export function SettingsPage({ title, subtitle, maxWidth = 680, children }: Props) {
  return (
    <div style={{ maxWidth, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h2>
        {subtitle && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
