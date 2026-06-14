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
      <div style={{ width: '100%', height: 80, background: '#f2f2f7', borderRadius: 8, padding: 8, border: '1px solid #dcdce5', boxSizing: 'border-box' as const }}>
        <div style={{ height: 12, background: '#e8e8ef', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, background: '#dcdce5', borderRadius: 4, width: '70%' }} />
      </div>
    ),
  },
]

const COLOR_STYLES = [
  {
    id: 'default' as const,
    label: 'Standard',
    accent: '#3B6DF4',
    preview: (
      <div style={{ width: '100%', height: 80, background: 'oklch(24% 0.008 270)', borderRadius: 8, padding: 8, boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
        <div style={{ height: 12, background: '#3B6DF4', borderRadius: 4, width: '55%' }} />
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ height: 20, width: 36, background: '#3B6DF4', borderRadius: 4 }} />
          <div style={{ height: 20, flex: 1, background: 'oklch(30% 0.008 270)', borderRadius: 4 }} />
        </div>
      </div>
    ),
  },
  {
    id: 'bw' as const,
    label: 'B&W',
    accent: 'oklch(82% 0 0)',
    preview: (
      <div style={{ width: '100%', height: 80, background: 'oklch(24% 0.008 270)', borderRadius: 8, padding: 8, boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
        <div style={{ height: 12, background: 'oklch(82% 0 0)', borderRadius: 4, width: '55%' }} />
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ height: 20, width: 36, background: 'oklch(82% 0 0)', borderRadius: 4 }} />
          <div style={{ height: 20, flex: 1, background: 'oklch(30% 0.008 270)', borderRadius: 4 }} />
        </div>
      </div>
    ),
  },
]

export function AussehensSettings() {
  const theme        = useUiStore(s => s.theme)
  const toggleTheme  = useUiStore(s => s.toggleTheme)
  const colorStyle   = useUiStore(s => s.colorStyle)
  const setColorStyle = useUiStore(s => s.setColorStyle)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Erscheinungsbild</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Theme und visuelle Einstellungen</p>
      </div>

      {/* Theme */}
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
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--accent-text)' : 'var(--fg-muted)', textAlign: 'center' }}>
                  {t.label}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Stil */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Stil</div>
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 14 }}>
          Farbakzente der Oberfläche
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {COLOR_STYLES.map(s => {
            const isActive = colorStyle === s.id
            return (
              <button
                key={s.id}
                onClick={() => setColorStyle(s.id)}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, cursor: 'pointer',
                  border: isActive ? '2px solid var(--accent)' : '2px solid var(--border)',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface-2)',
                  display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch',
                  transition: 'border-color 140ms, background 140ms',
                }}
              >
                {s.preview}
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--accent-text)' : 'var(--fg-muted)', textAlign: 'center' }}>
                  {s.label}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
