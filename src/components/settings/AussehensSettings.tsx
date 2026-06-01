import { useUiStore } from '@/store/ui.store'

const THEMES = [
  {
    id: 'dark' as const,
    label: 'Dunkel',
    preview: (
      <div style={{ width: '100%', height: 80, background: 'oklch(17% 0.005 270)', borderRadius: 8, padding: 8, boxSizing: 'border-box' as const }}>
        <div style={{ height: 12, background: 'oklch(23% 0.007 270)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, background: 'oklch(27% 0.009 270)', borderRadius: 4, width: '70%' }} />
      </div>
    ),
  },
  {
    id: 'light' as const,
    label: 'Hell',
    preview: (
      <div style={{ width: '100%', height: 80, background: 'oklch(98% 0.003 90)', borderRadius: 8, padding: 8, border: '1px solid oklch(89% 0.005 90)', boxSizing: 'border-box' as const }}>
        <div style={{ height: 12, background: 'oklch(94% 0.005 90)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, background: 'oklch(89% 0.005 90)', borderRadius: 4, width: '70%' }} />
      </div>
    ),
  },
]

export function AussehensSettings() {
  const theme       = useUiStore(s => s.theme)
  const toggleTheme = useUiStore(s => s.toggleTheme)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Erscheinungsbild</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Theme und visuelle Einstellungen</p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 14 }}>Theme</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {THEMES.map(t => {
            const isActive = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => { if (theme !== t.id) toggleTheme() }}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, cursor: 'pointer',
                  border: isActive ? '2px solid var(--accent)' : '2px solid var(--border)',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface-2)',
                  display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch',
                  transition: 'border-color 140ms, background 140ms',
                }}
              >
                {t.preview}
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--fg-muted)', textAlign: 'center' }}>
                  {t.label}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
