import type { ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useClientPickerStore } from '@/store/client-picker.store'
import { Sun, Bell, Search } from 'lucide-react'

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
    </div>
  )
}
