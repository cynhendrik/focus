import { useEffect, type ReactNode } from 'react'
import { useUiStore } from '@/store/ui.store'

interface Props {
  children: ReactNode
}

export function AppShell({ children }: Props) {
  const theme      = useUiStore(s => s.theme)
  const colorStyle = useUiStore(s => s.colorStyle)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (colorStyle === 'default') {
      document.documentElement.removeAttribute('data-style')
    } else {
      document.documentElement.setAttribute('data-style', colorStyle)
    }
  }, [colorStyle])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {children}
    </div>
  )
}
