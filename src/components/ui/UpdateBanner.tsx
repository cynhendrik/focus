import type { CSSProperties } from 'react'
import { useUpdateStore } from '@/store/update.store'
import { startDownload, restartApp } from '@/services/updater'
import { Download, RefreshCw, AlertCircle } from 'lucide-react'

export function UpdateBanner() {
  const phase    = useUpdateStore(s => s.phase)
  const version  = useUpdateStore(s => s.version)
  const progress = useUpdateStore(s => s.progress)
  const errorMsg = useUpdateStore(s => s.errorMsg)
  const dismiss  = useUpdateStore(s => s.dismiss)

  if (phase === 'idle') return null

  return (
    <div
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9998,
        minWidth: 300, maxWidth: 360, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 8px 32px oklch(0% 0 0 / 0.35), 0 0 0 1px oklch(100% 0 0 / 0.08)',
        background: 'oklch(16% 0 0 / 0.95)', backdropFilter: 'blur(20px)',
        animation: 'toast-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
      }}
    >
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: phase === 'error' ? 'oklch(28% 0.06 25)' : 'oklch(68% 0.16 41)' }}>
          {phase === 'error'
            ? <AlertCircle size={20} style={{ color: 'oklch(75% 0.2 25)' }} />
            : phase === 'ready'
              ? <RefreshCw size={18} style={{ color: '#fff' }} />
              : <Download size={18} style={{ color: '#fff' }} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', marginBottom: 2 }}>
            {label(phase, version)}
          </div>
          <div style={{ fontSize: 11, color: 'oklch(70% 0 0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {phase === 'downloading' ? `${progress} %`
              : phase === 'error'    ? errorMsg
              : phase === 'ready'    ? 'Neustart übernimmt die neue Version'
              : `Version ${version}`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {phase === 'available' && (
            <>
              <button onClick={() => startDownload()} style={btnPrimary}>Jetzt laden</button>
              <button onClick={() => dismiss()} style={btnGhost}>Später</button>
            </>
          )}
          {phase === 'ready' && (
            <>
              <button onClick={() => restartApp()} style={btnPrimary}>Neu starten</button>
              <button onClick={() => dismiss()} style={btnGhost}>Später</button>
            </>
          )}
          {phase === 'error' && (
            <button onClick={() => dismiss()} style={btnGhost}>Schließen</button>
          )}
        </div>
      </div>

      {phase === 'downloading' && (
        <div style={{ height: 3, background: 'oklch(25% 0 0)' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'oklch(68% 0.16 41)', transition: 'width 180ms ease' }} />
        </div>
      )}
    </div>
  )
}

const btnPrimary: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#fff', border: 'none', borderRadius: 8,
  padding: '6px 10px', background: 'oklch(68% 0.16 41)', cursor: 'pointer',
}
const btnGhost: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'oklch(70% 0 0)', border: 'none', borderRadius: 8,
  padding: '6px 8px', background: 'transparent', cursor: 'pointer',
}

function label(phase: string, version: string): string {
  if (phase === 'available')   return 'Update verfügbar'
  if (phase === 'downloading') return `Lade Update ${version}…`
  if (phase === 'ready')       return 'Update bereit'
  if (phase === 'error')       return 'Update fehlgeschlagen'
  return ''
}
