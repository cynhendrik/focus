import type { ReactNode } from 'react'
import { IconTile } from './IconTile'

interface Props {
  icon: ReactNode
  color?: string
  title: string
  description?: string
  control?: ReactNode
  dim?: boolean
  onClick?: () => void
}

export function SettingRow({ icon, color, title, description, control, dim = false, onClick }: Props) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '15px 18px',
      borderRadius: 'var(--radius)', background: 'var(--surface)',
      border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)',
      opacity: dim ? 0.55 : 1, cursor: onClick ? 'pointer' : 'default',
      transition: 'opacity 220ms',
    }}>
      <IconTile color={color} dim={dim}>{icon}</IconTile>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{title}</div>
        {description && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.45 }}>{description}</p>}
      </div>
      {control}
    </div>
  )
}
