import { useEffect, type ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'

interface Props {
  children: ReactNode
}

export function AppShell({ children }: Props) {
  const theme = useUiStore(s => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {children}
    </div>
  )
}
