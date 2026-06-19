import { useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace.store'

/** Member-Ansicht: einem Workspace per Beitritts-Code beitreten. */
export function JoinWorkspaceForm() {
  const joinWorkspaceByCode = useWorkspaceStore(s => s.joinWorkspaceByCode)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      await joinWorkspaceByCode(code)
    } catch (err: any) {
      setError(err?.message ?? 'Beitritt fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleJoin} className="flex flex-col gap-3">
      <p className="text-xs text-[var(--text2)] font-medium">Einem Workspace beitreten</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Beitritts-Code"
          className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg1)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-primary placeholder-[var(--text2)]"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {busy ? '…' : 'Beitreten'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  )
}
