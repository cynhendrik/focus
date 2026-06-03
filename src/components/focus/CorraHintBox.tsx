// src/components/focus/CorraHintBox.tsx
interface Props {
  hint: string
}

export function CorraHintBox({ hint }: Props) {
  if (!hint) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 9,
      padding: '11px 14px', borderRadius: 10,
      background: 'oklch(60% 0.25 280 / 0.06)',
      border: '1px solid oklch(60% 0.25 280 / 0.15)',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 99, flexShrink: 0,
        background: 'oklch(60% 0.25 280 / 0.2)', color: 'oklch(75% 0.2 280)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
      }}>✦</span>
      <span style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
        <span style={{ color: 'oklch(75% 0.2 280)', fontWeight: 500 }}>CORRA: </span>
        {hint}
      </span>
    </div>
  )
}
