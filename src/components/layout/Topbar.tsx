import type { ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useClientPickerStore } from '@/store/client-picker.store'
import { Sun, Bell, Search, Minus, X, Briefcase, BookOpen } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

async function minimizeWin() { await getCurrentWindow().minimize() }
async function closeWin()    { await getCurrentWindow().close() }

export function Topbar({ children }: { children?: ReactNode }) {
  const openPicker    = useClientPickerStore(s => s.open)
  const toggleTheme   = useUiStore(s => s.toggleTheme)
  const appMode       = useUiStore(s => s.appMode)
  const toggleAppMode = useUiStore(s => s.toggleAppMode)
  const personal      = appMode === 'personal'

  return (
    <div className="topbar">
      <div
        className="search-pill glass"
        onClick={openPicker}
        role="button"
        tabIndex={0}
      >
        <Search size={15} />
        <span>Kunde suchen</span>
        <span className="kbd">⌘ K</span>
      </div>
      {children}

      {/* Modus-Switch — visualisiert klar in welchem Kontext man ist.
          Im personal-mode subtile Akzent-Farbe, damit man es immer sieht. */}
      <button
        onClick={toggleAppMode}
        title={personal ? 'Zurueck zu Business' : 'In Mein Raum wechseln'}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 11px', borderRadius: 10,
          background: personal ? 'oklch(70% 0.13 250 / 0.16)' : 'var(--surface)',
          border: `1px solid ${personal ? 'oklch(70% 0.13 250 / 0.40)' : 'var(--border)'}`,
          color: personal ? 'oklch(82% 0.13 250)' : 'var(--fg-muted)',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
          transition: 'background 160ms, color 160ms, border-color 160ms',
        }}
      >
        {personal ? <BookOpen size={13} /> : <Briefcase size={13} />}
        <span>{personal ? 'Mein Raum' : 'Business'}</span>
      </button>

      <button className="icon-btn glass" onClick={toggleTheme} title="Theme wechseln">
        <Sun size={16} />
      </button>
      <button className="icon-btn glass" title="Benachrichtigungen">
        <Bell size={16} />
      </button>

      {/* Window controls */}
      <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
        <button
          onClick={minimizeWin}
          title="Minimieren"
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--fg-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--surface-2)'
            e.currentTarget.style.color = 'var(--fg)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--fg-muted)'
          }}
        >
          <Minus size={13} />
        </button>
        <button
          onClick={closeWin}
          title="Schließen"
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--fg-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'oklch(28% 0.08 15)'
            e.currentTarget.style.color = 'oklch(72% 0.18 25)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--fg-muted)'
          }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
