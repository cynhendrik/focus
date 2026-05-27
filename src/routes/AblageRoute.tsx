import { useEffect, useRef, useState } from 'react'
import { FolderOpen, FolderPlus, Upload, Trash2 } from 'lucide-react'
import { useWorkspaceAblageStore } from '@/store/workspace-ablage.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FilePreviewModal } from '@/components/ablage/FilePreviewModal'
import type { WorkspaceFile, WorkspaceFolder } from '@/types/workspace-ablage.types'

const MAX_BYTES = 50 * 1024 * 1024

function fileIcon(mimeType: string | null): string {
  if (!mimeType) return '📎'
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType === 'application/pdf') return '📄'
  return '📎'
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── Folder Tree ───────────────────────────────────────────────────────────────

function FolderNode({
  folder,
  folders,
  activeFolderId,
  depth,
  onSelect,
  onDelete,
}: {
  folder: WorkspaceFolder
  folders: WorkspaceFolder[]
  activeFolderId: string | null
  depth: number
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  const children = folders.filter(f => f.parentId === folder.id)
  const isActive = activeFolderId === folder.id

  return (
    <div>
      <div
        className="flex items-center gap-1 group"
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          onClick={() => onSelect(folder.id)}
          className="flex-1 flex items-center gap-1.5 text-left text-sm px-2 py-1.5 rounded-lg transition-colors truncate"
          style={{
            background: isActive ? 'var(--accent)' : 'none',
            color: isActive ? 'var(--accent-ink)' : 'var(--fg-muted)',
          }}
        >
          <FolderOpen size={13} style={{ flexShrink: 0 }} />
          <span className="truncate">{folder.name}</span>
        </button>
        <button
          onClick={() => onDelete(folder.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--fg-muted)] hover:text-red-400 transition-opacity"
          title="Ordner löschen"
        >
          <Trash2 size={11} />
        </button>
      </div>
      {children.map(child => (
        <FolderNode
          key={child.id}
          folder={child}
          folders={folders}
          activeFolderId={activeFolderId}
          depth={depth + 1}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

// ── Main Route ────────────────────────────────────────────────────────────────

export function AblageRoute() {
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const folders      = useWorkspaceAblageStore(s => s.folders)
  const files        = useWorkspaceAblageStore(s => s.files)
  const activeFolderId = useWorkspaceAblageStore(s => s.activeFolderId)
  const isLoading    = useWorkspaceAblageStore(s => s.isLoading)
  const error        = useWorkspaceAblageStore(s => s.error)
  const load         = useWorkspaceAblageStore(s => s.load)
  const selectFolder = useWorkspaceAblageStore(s => s.selectFolder)
  const createFolder = useWorkspaceAblageStore(s => s.createFolder)
  const removeFolder = useWorkspaceAblageStore(s => s.removeFolder)
  const importFile   = useWorkspaceAblageStore(s => s.importFile)
  const removeFile   = useWorkspaceAblageStore(s => s.removeFile)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [previewFile, setPreviewFile]     = useState<WorkspaceFile | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  useEffect(() => {
    if (workspaceId) load(workspaceId)
  }, [workspaceId, load])

  const rootFolders  = folders.filter(f => f.parentId === null)

  const handleSelectFolder = (id: string | null) => {
    selectFolder(workspaceId, id)
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name || !workspaceId) return
    await createFolder(workspaceId, name, activeFolderId)
    setNewFolderName('')
  }

  const handleDeleteFolder = async (id: string) => {
    const folder = folders.find(f => f.id === id)
    if (!folder) return
    if (!confirm(`Ordner "${folder.name}" wirklich löschen? Alle Unterordner werden ebenfalls entfernt.`)) return
    await removeFolder(id)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workspaceId) return
    if (file.size > MAX_BYTES) {
      alert('Datei zu groß (max. 50 MB)')
      return
    }
    const buffer = await file.arrayBuffer()
    const data   = Array.from(new Uint8Array(buffer))
    await importFile({ workspaceId, folderId: activeFolderId, name: file.name, data, mimeType: file.type || null })
    e.target.value = ''
  }

  const handleDeleteFile = async (id: string) => {
    setDeletingId(id)
    try { await removeFile(id) } finally { setDeletingId(null) }
  }

  const breadcrumb = (() => {
    if (!activeFolderId) return 'Alle Dateien'
    const parts: string[] = []
    let current: WorkspaceFolder | undefined = folders.find(f => f.id === activeFolderId)
    while (current) {
      parts.unshift(current.name)
      current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined
    }
    return parts.join(' › ')
  })()

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="greeting-title">Ablage<em>.</em></h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginTop: 8 }}>
            {folders.length} Ordner · {files.length} Dateien
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
            <Upload size={13} /> Datei hochladen
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="card" style={{ display: 'flex', flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' }}>
        {/* Sidebar — Ordner */}
        <div style={{
          width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: 2, overflowY: 'auto',
        }}>
          <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', padding: '4px 8px 8px' }}>
            Ordner
          </p>

          {/* "Alle Dateien" */}
          <button
            onClick={() => handleSelectFolder(null)}
            className="flex items-center gap-1.5 text-left text-sm px-2 py-1.5 rounded-lg transition-colors w-full"
            style={{
              background: activeFolderId === null ? 'var(--accent)' : 'none',
              color: activeFolderId === null ? 'var(--accent-ink)' : 'var(--fg-muted)',
            }}
          >
            <FolderOpen size={13} />
            <span>Alle Dateien</span>
          </button>

          {/* Ordner-Baum */}
          {rootFolders.map(folder => (
            <FolderNode
              key={folder.id}
              folder={folder}
              folders={folders}
              activeFolderId={activeFolderId}
              depth={0}
              onSelect={handleSelectFolder}
              onDelete={handleDeleteFolder}
            />
          ))}

          {/* Neuer Ordner */}
          <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
            <input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Neuer Ordner…"
              style={{
                flex: 1, fontSize: 12, padding: '5px 8px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--fg)', outline: 'none',
              }}
            />
            <button
              onClick={handleCreateFolder}
              title="Ordner anlegen"
              style={{
                padding: '5px 8px', borderRadius: 8,
                background: 'var(--accent)', color: 'var(--accent-ink)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              }}
            >
              <FolderPlus size={13} />
            </button>
          </div>
        </div>

        {/* Datei-Grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Breadcrumb */}
          <div style={{
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)',
          }}>
            {breadcrumb}
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error.message}</p>
            )}
            {isLoading && (
              <p style={{ color: 'var(--fg-dim)', fontSize: 13 }}>Lädt…</p>
            )}
            {!isLoading && files.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
                <FolderOpen size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                <p>Keine Dateien{activeFolderId ? ' in diesem Ordner' : ''}</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>Dateien hochladen oder Rechnungen freigeben</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {files.map(file => (
                <div
                  key={file.id}
                  onClick={() => setPreviewFile(file)}
                  style={{
                    padding: 14, borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--surface-2)', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
                    transition: 'border-color 150ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <span style={{ fontSize: 28 }}>{fileIcon(file.mimeType)}</span>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                    {file.name}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {file.size !== null && (
                      <p style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{formatSize(file.size)}</p>
                    )}
                    <p style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{fmtDate(file.createdAt)}</p>
                  </div>

                  {/* Quelle-Badge für automatisch abgelegte Rechnungen */}
                  {file.sourceType === 'invoice' && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      fontSize: 9, padding: '2px 6px', borderRadius: 99,
                      background: 'oklch(92% 0.2 125 / 0.15)',
                      color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>
                      Rechnung
                    </span>
                  )}

                  {/* Löschen-Button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteFile(file.id) }}
                    disabled={deletingId === file.id}
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      opacity: 0, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 4, borderRadius: 6,
                      color: 'var(--fg-muted)', transition: 'opacity 150ms, color 150ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
                    className="file-delete-btn"
                    title="Datei löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}
