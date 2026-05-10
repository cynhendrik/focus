import { useUiStore } from '@/store/ui.store'

export function SettingsRoute() {
  const theme = useUiStore(s => s.theme)
  const toggleTheme = useUiStore(s => s.toggleTheme)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">Settings</h1>
      </div>
      <div className="flex-1 overflow-auto p-6 max-w-lg">
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Theme</p>
              <p className="text-xs text-[var(--text2)] mt-0.5">
                {theme === 'dark' ? 'Dunkel' : 'Hell'}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--bg3)] transition-colors"
            >
              {theme === 'dark' ? '☀ Hell' : '🌙 Dunkel'}
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
            <p className="text-sm font-medium text-[var(--text)]">Cynera Focus</p>
            <p className="text-xs text-[var(--text2)] mt-0.5">Version 2.0.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
