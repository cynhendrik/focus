import type { ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useClientPickerStore } from '@/store/client-picker.store'
import { Sun, Bell, Search, Minus, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

async function minimizeWin() { await getCurrentWindow().minimize() }
async function closeWin()    { await getCurrentWindow().close() }

export function Topbar({ children }: { children?: ReactNode }) {
  const openPicker  = useClientPickerStore(s => s.open)
  const toggleTheme = useUiStore(s => s.toggleTheme)

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
