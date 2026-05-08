import { useState, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

export function SyncProgressBar({ accountId, onDone }) {
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    let unlisten
    listen('email-sync-progress', (event) => {
      const p = event.payload
      setProgress(p)
      if (p.phase === 'done' || p.phase === 'error') {
        setTimeout(() => {
          setProgress(null)
          onDone?.()
        }, 1500)
      }
    }).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [accountId])

  if (!progress) return null

  const pct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  const label = progress.phase === 'connecting' ? 'Verbinde…'
    : progress.phase === 'scanning'  ? `Scanne ${progress.folder}…`
    : progress.phase === 'fetching'  ? `${progress.folder}: ${progress.done}/${progress.total}`
    : progress.phase === 'done'      ? 'Sync abgeschlossen ✓'
    : progress.phase === 'error'     ? 'Sync fehlgeschlagen'
    : '…'

  const barColor = progress.phase === 'error' ? '#ef4444'
    : progress.phase === 'done' ? '#10b981'
    : 'var(--p)'

  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg2)',
      borderTop: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>{label}</div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: barColor, borderRadius: 2,
          width: progress.phase === 'connecting' ? '10%' : `${pct}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}
