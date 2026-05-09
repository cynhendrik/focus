import { useEffect, type ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'

interface Props {
  children: ReactNode
}

export function AppShell({ children }: Props) {
  const theme = useUiStore(s => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {children}
    </div>
  )
}
