import type { ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'
import { Sun, Bell } from 'lucide-react'

export function Topbar({ children }: { children?: ReactNode }) {
  const toggleTheme = useUiStore(s => s.toggleTheme)

  return (
    <div className="topbar">
      {children}
      <button className="icon-btn" onClick={toggleTheme} title="Theme wechseln">
        <Sun size={16} />
      </button>
      <button className="icon-btn" title="Benachrichtigungen">
        <Bell size={16} />
      </button>
    </div>
  )
}
