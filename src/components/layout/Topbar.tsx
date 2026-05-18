import type { ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'
import { Sun, Bell, Plus, Search } from 'lucide-react'

export function Topbar({ children }: { children?: ReactNode }) {
  const setCmdPaletteOpen = useUiStore(s => s.setCmdPaletteOpen)
  const toggleTheme       = useUiStore(s => s.toggleTheme)

  return (
    <div className="topbar">
      <div
        className="search-pill glass"
        onClick={() => setCmdPaletteOpen(true)}
        role="button"
        tabIndex={0}
      >
        <Search size={15} />
        <span>Suche oder springe zu…</span>
        <span className="kbd">⌘ K</span>
      </div>
      {children}
      <button className="icon-btn glass" onClick={toggleTheme} title="Theme wechseln">
        <Sun size={16} />
      </button>
      <button className="icon-btn glass" title="Benachrichtigungen">
        <Bell size={16} />
      </button>
      <button className="btn-primary" onClick={() => setCmdPaletteOpen(true)}>
        <Plus size={14} /> Neu
        <span className="mono" style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>⌘N</span>
      </button>
    </div>
  )
}
