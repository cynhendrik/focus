import { useRef, useState } from 'react'
import { Folder, File, FolderPlus, Upload, Trash2, ChevronRight, FileText, Image, Film, Archive } from 'lucide-react'
import { useFilesStore } from '@/store/files.store'
import type { Folder as FolderType, FileEntry } from '@/types/file.types'

const MAX_BYTES = 50 * 1024 * 1024

// ── helpers ──────────────────────────────────────────────────────────────────

function fileIcon(mimeType: string | null) {
  if (!mimeType) return <File size={24} style={{ color: 'var(--fg-muted)' }} />
  if (mimeType.startsWith('image/')) return <Image size={24} style={{ color: '#60a5fa' }} />
  if (mimeType.startsWith('video/')) return <Film size={24} style={{ color: '#a78bfa' }} />
  if (mimeType === 'application/pdf') return <FileText size={24} style={{ color: '#f87171' }} />
  if (mimeType.includes('zip') || mimeType.includes('rar'))
    return <Archive size={24} style={{ color: '#fbbf24' }} />
  return <File size={24} style={{ color: 'var(--fg-muted)' }} />
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function relDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── FolderNode ───────────────────────────────────────────────────────────────

interface FolderNodeProps {
  folder: FolderType
  allFolders: FolderType[]
  depth: number
  activeFolderId: string | null
  onSelect: (id: string) => void
  onDelete: (folder: FolderType) => void
  onAddSubfolder: (parentId: string) => void
  addingUnder: string | null
  newFolderName: string
  onNewFolderNameChange: (v: string) => void
  onNewFolderSubmit: () => void
  onNewFolderCancel: () => void
}

function FolderNode({
  folder, allFolders, depth, activeFolderId,
  onSelect, onDelete, onAddSubfolder,
  addingUnder, newFolderName, onNewFolderNameChange,
  onNewFolderSubmit, onNewFolderCancel,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const children = allFolders.filter(f => f.parentId === folder.id)
  const isActive = activeFolderId === folder.id

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          paddingLeft: depth * 14 + 4, paddingRight: 4,
          height: 30, borderRadius: 7, cursor: 'pointer',
          background: isActive ? 'var(--accent-soft)' : hovered ? 'var(--surface-2)' : 'transparent',
          transition: 'background 80ms',
        }}
      >
        {/* expand toggle */}
        {children.length > 0 ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--fg-muted)', flexShrink: 0 }}
          >
            <ChevronRight size={11} style={{ transition: 'transform 150ms', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          </button>
        ) : (
          <span style={{ width: 11, flexShrink: 0 }} />
        )}

        {/* folder icon + name */}
        <div
          onClick={() => onSelect(folder.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}
        >
          <Folder size={13} style={{ color: isActive ? 'var(--accent)' : 'var(--fg-muted)', flexShrink: 0 }} />
          <span style={{
            fontSize: 12, fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--accent)' : 'var(--fg-2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {folder.name}
          </span>
        </div>

        {/* action buttons on hover */}
        {hovered && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); onAddSubfolder(folder.id) }}
              title="Unterordner hinzufügen"
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', borderRadius: 4, color: 'var(--fg-muted)' }}
            >
              <FolderPlus size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(folder) }}
              title="Ordner löschen"
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', borderRadius: 4, color: 'var(--fg-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* new subfolder input */}
      {addingUnder === folder.id && (
        <div style={{ paddingLeft: (depth + 1) * 14 + 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3 }}>
          <input
            autoFocus
            value={newFolderName}
            onChange={e => onNewFolderNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onNewFolderSubmit(); if (e.key === 'Escape') onNewFolderCancel() }}
            placeholder="Ordnername…"
            style={{
              width: '100%', fontSize: 12, padding: '4px 8px',
              borderRadius: 6, border: '1px solid var(--accent)',
              background: 'var(--surface-2)', color: 'var(--fg)',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* children */}
      {expanded && children.map(child => (
        <FolderNode
          key={child.id}
          folder={child}
          allFolders={allFolders}
          depth={depth + 1}
          activeFolderId={activeFolderId}
          onSelect={onSelect}
          onDelete={onDelete}
          onAddSubfolder={onAddSubfolder}
          addingUnder={addingUnder}
          newFolderName={newFolderName}
          onNewFolderNameChange={onNewFolderNameChange}
          onNewFolderSubmit={onNewFolderSubmit}
          onNewFolderCancel={onNewFolderCancel}
        />
      ))}
    </div>
  )
}

// ── FileCard ─────────────────────────────────────────────────────────────────

function FileCard({ file, onDelete }: { file: FileEntry; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '14px 12px',
        borderRadius: 12,
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'border-color 100ms, background 100ms',
        cursor: 'default',
      }}
    >
      {/* icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44 }}>
        {fileIcon(file.mimeType)}
      </div>

      {/* name + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>
          {file.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 2, display: 'flex', gap: 6 }}>
          {file.size && <span>{formatSize(file.size)}</span>}
          <span>{relDate(file.createdAt)}</span>
        </div>
      </div>

      {/* delete button */}
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Datei löschen"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 22, height: 22, borderRadius: 6,
            background: 'oklch(72% 0.18 25 / 0.1)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--danger)',
          }}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}

// ── DeleteConfirm ────────────────────────────────────────────────────────────

function DeleteFolderModal({ folderName, onConfirm, onCancel }: {
  folderName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'oklch(0% 0 0 / 0.5)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{ width: 340, maxWidth: '92vw', padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-2)' }}>
        <div style={{ padding: '20px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'oklch(72% 0.18 25 / 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={15} style={{ color: 'var(--danger)' }} />
            </div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Ordner löschen?</h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--fg)' }}>„{folderName}"</strong> und alle enthaltenen Dateien werden gelöscht.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 22px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost" onClick={onCancel}>Abbrechen</button>
          <button
            onClick={onConfirm}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >
            <Trash2 size={12} /> Löschen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props { customerId: string }

export function DateienPane({ customerId }: Props) {
  const folders        = useFilesStore(s => s.folders)
  const files          = useFilesStore(s => s.files)
  const activeFolderId = useFilesStore(s => s.activeFolderId)
  const isLoading      = useFilesStore(s => s.isLoading)
  const error          = useFilesStore(s => s.error)
  const setActiveFolder = useFilesStore(s => s.setActiveFolder)
  const loadFiles      = useFilesStore(s => s.loadFiles)
  const createFolder   = useFilesStore(s => s.createFolder)
  const removeFolder   = useFilesStore(s => s.removeFolder)
  const importFile     = useFilesStore(s => s.importFile)
  const removeFile     = useFilesStore(s => s.removeFile)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // inline folder creation state
  const [addingUnder, setAddingUnder]   = useState<string | null>(null)
  const [addingRoot,  setAddingRoot]    = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // folder delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<FolderType | null>(null)

  // ── folder selection ──────────────────────────────────────────────────────
  const selectFolder = async (id: string | null) => {
    setActiveFolder(id)
    await loadFiles(customerId, id)
  }

  // ── breadcrumb ────────────────────────────────────────────────────────────
  const breadcrumb: FolderType[] = []
  if (activeFolderId) {
    let cur = folders.find(f => f.id === activeFolderId)
    while (cur) {
      breadcrumb.unshift(cur)
      cur = cur.parentId ? folders.find(f => f.id === cur!.parentId) : undefined
    }
  }

  // ── folder creation ───────────────────────────────────────────────────────
  const startAddSubfolder = (parentId: string) => {
    setAddingUnder(parentId)
    setAddingRoot(false)
    setNewFolderName('')
  }
  const startAddRoot = () => {
    setAddingRoot(true)
    setAddingUnder(null)
    setNewFolderName('')
  }
  const cancelNewFolder = () => {
    setAddingUnder(null)
    setAddingRoot(false)
    setNewFolderName('')
  }
  const submitNewFolder = async (parentId?: string | null) => {
    const name = newFolderName.trim()
    if (!name) { cancelNewFolder(); return }
    try {
      await createFolder({ customerId, name, parentId: parentId ?? null })
    } catch {}
    cancelNewFolder()
  }

  // ── file upload ───────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      alert('Datei zu groß (max. 50 MB)')
      return
    }
    const buffer = await file.arrayBuffer()
    const data = Array.from(new Uint8Array(buffer))
    await importFile({
      customerId,
      folderId: activeFolderId,
      name: file.name,
      data,
      mimeType: file.type || null,
    })
    e.target.value = ''
  }

  // ── folder delete ─────────────────────────────────────────────────────────
  const handleDeleteFolder = async () => {
    if (!confirmDelete) return
    try {
      await removeFolder(confirmDelete.id)
      if (activeFolderId === confirmDelete.id) {
        await selectFolder(null)
      }
    } catch {}
    setConfirmDelete(null)
  }

  // ── root folders (no parentId) ────────────────────────────────────────────
  const rootFolders = folders.filter(f => !f.parentId)

  // ── active folder name ────────────────────────────────────────────────────
  const activeFolderName = activeFolderId
    ? (folders.find(f => f.id === activeFolderId)?.name ?? 'Ordner')
    : 'Alle Dateien'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* sidebar header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            Ordner
          </span>
          <button
            onClick={startAddRoot}
            title="Neuer Stammordner"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 5, color: 'var(--fg-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
          >
            <FolderPlus size={13} />
          </button>
        </div>

        {/* folder tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>

          {/* "Alle Dateien" root */}
          <div
            onClick={() => selectFolder(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              height: 30, paddingLeft: 4, paddingRight: 4,
              borderRadius: 7, cursor: 'pointer',
              background: activeFolderId === null ? 'var(--accent-soft)' : 'transparent',
              transition: 'background 80ms',
              marginBottom: 2,
            }}
            onMouseEnter={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'transparent' }}
          >
            <Folder size={13} style={{ color: activeFolderId === null ? 'var(--accent)' : 'var(--fg-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: activeFolderId === null ? 600 : 400, color: activeFolderId === null ? 'var(--accent)' : 'var(--fg-2)' }}>
              Alle Dateien
            </span>
          </div>

          {/* root folder input */}
          {addingRoot && (
            <div style={{ padding: '3px 4px' }}>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitNewFolder(null)
                  if (e.key === 'Escape') cancelNewFolder()
                }}
                placeholder="Ordnername…"
                style={{
                  width: '100%', fontSize: 12, padding: '4px 8px',
                  borderRadius: 6, border: '1px solid var(--accent)',
                  background: 'var(--surface-2)', color: 'var(--fg)',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* folder tree */}
          {rootFolders.map(f => (
            <FolderNode
              key={f.id}
              folder={f}
              allFolders={folders}
              depth={0}
              activeFolderId={activeFolderId}
              onSelect={selectFolder}
              onDelete={folder => setConfirmDelete(folder)}
              onAddSubfolder={startAddSubfolder}
              addingUnder={addingUnder}
              newFolderName={newFolderName}
              onNewFolderNameChange={setNewFolderName}
              onNewFolderSubmit={() => submitNewFolder(addingUnder)}
              onNewFolderCancel={cancelNewFolder}
            />
          ))}

          {folders.length === 0 && !addingRoot && (
            <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
              Noch keine Ordner.{'\n'}Klicke <FolderPlus size={10} style={{ verticalAlign: 'middle' }} /> um einen anzulegen.
            </div>
          )}
        </div>
      </div>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {/* breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--fg-muted)' }}>
            <span
              onClick={() => selectFolder(null)}
              style={{ cursor: activeFolderId ? 'pointer' : 'default', color: activeFolderId ? 'var(--fg-2)' : 'var(--fg)', fontWeight: activeFolderId ? 400 : 500 }}
              onMouseEnter={e => { if (activeFolderId) (e.target as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { if (activeFolderId) (e.target as HTMLElement).style.color = 'var(--fg-2)' }}
            >
              Alle Dateien
            </span>
            {breadcrumb.map((f, i) => (
              <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight size={11} />
                <span
                  onClick={() => i < breadcrumb.length - 1 ? selectFolder(f.id) : undefined}
                  style={{
                    cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default',
                    color: i === breadcrumb.length - 1 ? 'var(--fg)' : 'var(--fg-2)',
                    fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                  }}
                  onMouseEnter={e => { if (i < breadcrumb.length - 1) (e.target as HTMLElement).style.color = 'var(--accent)' }}
                  onMouseLeave={e => { if (i < breadcrumb.length - 1) (e.target as HTMLElement).style.color = 'var(--fg-2)' }}
                >
                  {f.name}
                </span>
              </span>
            ))}
          </div>

          {/* actions */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isLoading && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Lädt…</span>}
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
            <button
              className="btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: 12, gap: 5, padding: '5px 12px' }}
            >
              <Upload size={12} /> Datei hochladen
            </button>
          </div>
        </div>

        {/* error */}
        {error && (
          <div style={{ margin: '10px 18px 0', padding: '8px 12px', borderRadius: 8, background: 'oklch(72% 0.18 25 / 0.1)', color: 'var(--danger)', fontSize: 12 }}>
            {error.message}
          </div>
        )}

        {/* file grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {files.length === 0 && !isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--fg-dim)' }}>
              <File size={32} style={{ opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 13 }}>
                {activeFolderId ? `Keine Dateien in „${activeFolderName}"` : 'Noch keine Dateien'}
              </p>
              <button className="btn-ghost" onClick={() => fileInputRef.current?.click()} style={{ fontSize: 12 }}>
                <Upload size={12} /> Erste Datei hochladen
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {files.map(file => (
                <FileCard
                  key={file.id}
                  file={file}
                  onDelete={() => removeFile(file.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* delete folder confirmation modal */}
      {confirmDelete && (
        <DeleteFolderModal
          folderName={confirmDelete.name}
          onConfirm={handleDeleteFolder}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
