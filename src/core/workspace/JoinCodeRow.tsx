import { useState } from 'react'
import { type CSSProperties } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'

/** Owner-Ansicht: Beitritts-Code anzeigen, kopieren, neu generieren. */
export function JoinCodeRow() {
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const activeId   = useWorkspaceStore(s => s.activeWorkspaceId)
  const regenerate = useWorkspaceStore(s => s.regenerateJoinCode)
  const ws = workspaces.find(w => w.id === activeId)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!ws || ws.role !== 'owner') return null

  const code = ws.join_code ?? '—'

  const copy = () => {
    if (ws.join_code) {
      navigator.clipboard.writeText(ws.join_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }
  const onRegenerate = async () => {
    if (!activeId) return
    setBusy(true)
    try { await regenerate(activeId) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Beitritts-Code
      </label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{
          flex: 1, padding: '8px 12px', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
          borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--fg)', fontFamily: 'var(--font-mono)',
        }}>{code}</span>
        <button onClick={copy} aria-label="Code kopieren" style={btn}>
          {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
        </button>
        <button onClick={onRegenerate} disabled={busy} style={btn} title="Neu generieren" aria-label="Neu generieren">
          <RefreshCw size={14} />
          <span style={{ fontSize: 12 }}>Neu generieren</span>
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: 0 }}>
        Teile diesen Code, damit jemand deinem Workspace beitreten kann.
      </p>
    </div>
  )
}

const btn: CSSProperties = {
  padding: '0 10px', height: 34, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-muted)',
  display: 'flex', alignItems: 'center', gap: 6,
}
