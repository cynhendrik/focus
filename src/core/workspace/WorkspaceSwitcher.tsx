import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'

export function WorkspaceSwitcher() {
  const workspaces       = useWorkspaceStore(s => s.workspaces)
  const activeId         = useWorkspaceStore(s => s.activeWorkspaceId)
  const setActive        = useWorkspaceStore(s => s.setActiveWorkspace)
  const createWorkspace  = useWorkspaceStore(s => s.createWorkspace)
  const pendingCount     = useWorkspaceStore(s => s.pendingCount)
  const isOnline         = useWorkspaceStore(s => s.isOnline)
  const signOut          = useAuthStore(s => s.signOut)

  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [error, setError]       = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const active = workspaces.find(w => w.id === activeId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setNewName('')
        setError(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setError(null)
    try {
      await createWorkspace(newName.trim())
      setCreating(false)
      setNewName('')
      setOpen(false)
    } catch (err: any) {
      setError(err?.message ?? 'Fehler beim Erstellen')
    }
  }

  return (
    <div ref={ref} className="relative px-3 pt-3 pb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/30 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
          {active?.name.charAt(0).toUpperCase() ?? '?'}
        </div>
        <span className="text-sm font-semibold text-[var(--text)] truncate flex-1 text-left">
          {active?.name ?? 'Kein Workspace'}
        </span>
        {pendingCount > 0 && (
          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
            ⚡{pendingCount}
          </span>
        )}
        {!isOnline && (
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Offline" />
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)] flex-shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-3 right-3 mt-1 py-1 rounded-xl bg-[var(--bg1)] border border-[var(--border)] shadow-lg z-50">
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { setActive(ws.id); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-[var(--bg2)] transition-colors
                ${ws.id === activeId ? 'text-primary font-medium' : 'text-[var(--text)]'}`}
            >
              {ws.id === activeId ? <span className="text-xs">✓</span> : <span className="w-3" />}
              {ws.name}
            </button>
          ))}

          <div className="h-px mx-3 bg-[var(--border)] my-1" />

          {creating ? (
            <form onSubmit={handleCreate} className="px-3 py-2 flex flex-col gap-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Workspace-Name…"
                className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-primary"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-[#0a0a0a] text-xs font-semibold disabled:opacity-40"
                >
                  Anlegen
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setError(null) }}
                  className="px-3 py-1.5 rounded-lg text-xs text-[var(--text2)] hover:text-[var(--text)]"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors text-left"
            >
              <span className="text-base leading-none">+</span>
              Neuer Workspace
            </button>
          )}

          <div className="h-px mx-3 bg-[var(--border)] my-1" />
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text2)] hover:text-red-400 hover:bg-[var(--bg2)] transition-colors text-left"
          >
            Ausloggen
          </button>
        </div>
      )}
    </div>
  )
}
