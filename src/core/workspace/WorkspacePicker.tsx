import { useState } from 'react'
import { useWorkspaceStore, type Workspace } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'

function WorkspaceCard({ workspace, onSelect }: { workspace: Workspace; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/40 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
        {workspace.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{workspace.name}</p>
        <p className="text-xs text-[var(--text2)]">{workspace.role === 'owner' ? 'Inhaber' : 'Mitglied'}</p>
      </div>
      <span className="ml-auto text-[var(--text2)] text-sm">→</span>
    </button>
  )
}

export function WorkspacePicker() {
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const setActiveWorkspace = useWorkspaceStore(s => s.setActiveWorkspace)
  const createWorkspace = useWorkspaceStore(s => s.createWorkspace)
  const signOut = useAuthStore(s => s.signOut)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createWorkspace(newName.trim())
    } catch (err: any) {
      setError(err?.message ?? 'Fehler beim Erstellen')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-[var(--text)] mb-1">Workspace auswählen</h1>
        <p className="text-sm text-[var(--text2)] mb-6">
          {workspaces.length === 0 ? 'Erstelle deinen ersten Workspace.' : 'Wähle einen Workspace oder erstelle einen neuen.'}
        </p>

        {workspaces.length > 0 && (
          <div className="flex flex-col gap-2 mb-6">
            {workspaces.map(ws => (
              <WorkspaceCard key={ws.id} workspace={ws} onSelect={() => setActiveWorkspace(ws.id)} />
            ))}
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <p className="text-xs text-[var(--text2)] font-medium">Neuer Workspace</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="z.B. Agentur Müller"
              className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg1)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-primary placeholder-[var(--text2)]"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating ? '…' : 'Erstellen'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>

        <button
          onClick={signOut}
          className="mt-8 text-xs text-[var(--text2)] hover:text-[var(--text)] transition-colors"
        >
          Ausloggen
        </button>
      </div>
    </div>
  )
}
