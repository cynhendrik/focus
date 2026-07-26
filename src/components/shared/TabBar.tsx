import type { LucideIcon } from 'lucide-react'

export interface TabDef {
  id: string
  label: string
  icon: LucideIcon
  count?: number
}

export function TabBar({ tabs, activeId, onChange }: {
  tabs: TabDef[]
  activeId: string
  onChange: (id: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0, padding: '0 24px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg)',
    }}>
      {tabs.map(t => {
        const Ic = t.icon
        const active = activeId === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '18px 18px 16px', marginRight: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: active ? 'var(--accent-text)' : 'var(--fg-dim)',
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: active ? 600 : 500,
              position: 'relative', transition: 'color 140ms',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-dim)' }}
          >
            <Ic size={15} style={{ opacity: active ? 1 : 0.85 }} />
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 18, height: 18, padding: '0 6px', borderRadius: 99,
                background: 'var(--accent-soft)', color: 'var(--accent-text)',
                fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              }}>
                {t.count}
              </span>
            )}
            {active && (
              <span style={{
                position: 'absolute', left: 18, right: 18, bottom: -1, height: 2, borderRadius: 2,
                background: 'var(--accent-gradient)', boxShadow: '0 0 12px var(--accent-glow)',
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
