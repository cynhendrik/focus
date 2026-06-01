import type { LucideIcon } from 'lucide-react'

export type IntegrationStatus = 'connected' | 'disconnected' | 'coming_soon'

interface Props {
  icon: LucideIcon
  name: string
  category: string
  description: string
  status: IntegrationStatus
  connectedDetail?: string
  connectedLabel?: string
  onAction?: () => void
  actionLabel?: string
}

export function IntegrationRow({
  icon: Icon, name, category, description,
  status, connectedDetail, connectedLabel = 'Verbunden', onAction, actionLabel,
}: Props) {
  const isComingSoon = status === 'coming_soon'
  const isConnected  = status === 'connected'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 20px',
      background: isComingSoon ? 'transparent' : 'var(--surface)',
      border: `1px ${isComingSoon ? 'dashed' : 'solid'} var(--border)`,
      borderRadius: 12,
      opacity: isComingSoon ? 0.55 : 1,
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 11, flexShrink: 0,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isComingSoon ? 'var(--fg-dim)' : 'var(--fg-muted)',
      }}>
        <Icon size={20} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isComingSoon ? 'var(--fg-muted)' : 'var(--fg)' }}>
            {name}
          </span>
          {isConnected && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(74,222,128,0.12)', color: '#4ade80',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 5px rgba(74,222,128,0.7)', display: 'inline-block' }} />
              {connectedLabel}
            </span>
          )}
          {status === 'disconnected' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: 'var(--surface-2)', color: 'var(--fg-dim)',
              border: '1px solid var(--border)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-dim)', display: 'inline-block' }} />
              Nicht verbunden
            </span>
          )}
          {isComingSoon && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: 'var(--surface-2)', color: 'var(--fg-dim)',
              border: '1px solid var(--border)', letterSpacing: '0.06em',
            }}>
              BALD
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', marginTop: 3 }}>{category}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 5, lineHeight: 1.5 }}>{description}</div>
        {connectedDetail && isConnected && (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            {connectedDetail}
          </div>
        )}
      </div>

      {/* Action button */}
      {!isComingSoon && onAction && (
        <button
          onClick={onAction}
          style={{
            flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', transition: 'background 140ms', border: '1px solid',
            ...(isConnected
              ? { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--fg-muted)' }
              : { background: 'rgba(208,252,105,0.12)', borderColor: 'rgba(208,252,105,0.3)', color: 'var(--accent-text)' }
            ),
          }}
        >
          {actionLabel ?? (isConnected ? 'Verwalten' : 'Verbinden →')}
        </button>
      )}
      {status === 'disconnected' && !onAction && (
        <button
          disabled
          title="Kommt bald"
          style={{
            flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--fg-dim)', cursor: 'not-allowed', opacity: 0.5,
          }}
        >
          Verbinden →
        </button>
      )}
    </div>
  )
}
