import { useEffect, useState, useRef } from 'react'
import { X, Download, FileText } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceAblageStore } from '@/store/workspace-ablage.store'
import type { WorkspaceFile } from '@/types/workspace-ablage.types'

interface Props {
  file: WorkspaceFile
  onClose: () => void
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FilePreviewModal({ file, onClose }: Props) {
  const readFile = useWorkspaceAblageStore(s => s.readFile)

  const [blobUrl,  setBlobUrl]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const canPreview = file.mimeType === 'application/pdf'
    || (file.mimeType?.startsWith('image/') ?? false)

  useEffect(() => {
    if (!canPreview) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const bytes = await readFile(file.id)
        if (cancelled) return
        const blob = new Blob([bytes as BlobPart], { type: file.mimeType ?? 'application/octet-stream' })
        const url  = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setBlobUrl(url)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [file.id])

  const handleDownload = async () => {
    try {
      const bytes = await readFile(file.id)
      await invoke('save_pdf', { bytes: Array.from(bytes), suggestedName: file.name })
    } catch (err) {
      alert(`Download fehlgeschlagen: ${String(err)}`)
    }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'oklch(0% 0 0 / 0.75)',
        backdropFilter: 'blur(16px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 860, height: '85vh',
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 32px 80px oklch(0% 0 0 / 0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <FileText size={16} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
              {file.mimeType ?? 'Unbekannter Typ'}{file.size ? ` · ${formatSize(file.size)}` : ''}
            </p>
          </div>
          <button
            onClick={handleDownload}
            className="btn-ghost"
            style={{ flexShrink: 0 }}
          >
            <Download size={13} /> Herunterladen
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--fg-muted)', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && (
            <p style={{ color: 'var(--fg-dim)', fontSize: 13 }}>Lädt Vorschau…</p>
          )}
          {error && (
            <div style={{ textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>
              <p>Vorschau nicht möglich</p>
              <p style={{ fontSize: 11, marginTop: 4, color: 'var(--fg-dim)' }}>{error}</p>
            </div>
          )}
          {!loading && !error && blobUrl && file.mimeType === 'application/pdf' && (
            <iframe
              src={blobUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={file.name}
            />
          )}
          {!loading && !error && blobUrl && file.mimeType?.startsWith('image/') && (
            <img
              src={blobUrl}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
            />
          )}
          {!loading && !error && !canPreview && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span style={{ fontSize: 48 }}>📎</span>
              <p style={{ color: 'var(--fg)', fontWeight: 600, marginTop: 12 }}>{file.name}</p>
              <p style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 4 }}>
                Keine Vorschau verfügbar für diesen Dateityp
              </p>
              <button onClick={handleDownload} className="btn-primary" style={{ marginTop: 20 }}>
                <Download size={13} /> Herunterladen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
