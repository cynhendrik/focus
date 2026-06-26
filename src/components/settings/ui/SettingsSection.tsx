import type { ReactNode } from 'react'

interface Props { label?: string; children: ReactNode }

export function SettingsSection({ label, children }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
          {label}
        </div>
      )}
      {children}
    </div>
  )
}
