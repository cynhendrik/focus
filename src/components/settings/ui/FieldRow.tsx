import type { ReactNode } from 'react'

interface Props { label: string; hint?: string; children: ReactNode }

export function FieldRow({ label, hint, children }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-2)' }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>{hint}</span>}
    </div>
  )
}
