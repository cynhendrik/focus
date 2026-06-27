import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { shareWorkspace } from '@/services/share-workspace'

export function ShareWorkspaceButton() {
  const activeId = useWorkspaceStore(s => s.activeWorkspaceId)
  const localWorkspaces = useWorkspaceStore(s => s.localWorkspaces)
  const local = localWorkspaces.find(w => w.id === activeId)
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle')
  const [progress, setProgress] = useState<string>('')
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!local) return null  // nur für lokale Workspaces

  const run = async () => {
    setPhase('running'); setError(null)
    try {
      const res = await shareWorkspace(local.id, local.name, (entity, n) => setProgress(`${entity}: ${n}`))
      setJoinCode(res.joinCode); setPhase('done')
    } catch (e) {
      setError(String(e)); setPhase('confirm')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {phase === 'idle' && (
        <button className="btn-ghost" onClick={() => setPhase('confirm')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 16px' }}>
          <Share2 size={13} /> Workspace teilen
        </button>
      )}
      {phase === 'confirm' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>Dieser Workspace wird dauerhaft in die Cloud verschoben (einbahnig). Deine Daten werden hochgeladen.</span>
          {error && <span style={{ color: 'var(--danger)' }}>Fehler: {error}. Erneut versuchen ist sicher.</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={run} style={{ fontSize: 12, padding: '6px 14px' }}>Jetzt teilen</button>
            <button className="btn-ghost" onClick={() => setPhase('idle')} style={{ fontSize: 12, padding: '6px 14px' }}>Abbrechen</button>
          </div>
        </div>
      )}
      {phase === 'running' && <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Migriere … {progress}</span>}
      {phase === 'done' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg)' }}>
          ✓ Geteilt. Beitritts-Code für dein Team: <strong style={{ fontFamily: 'var(--font-mono)' }}>{joinCode ?? '—'}</strong>
        </div>
      )}
    </div>
  )
}
