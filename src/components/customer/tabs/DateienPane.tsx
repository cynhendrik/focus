import { useRef, useState } from 'react'
import {
  Folder, FolderOpen, File, FileText, Image, Film, Archive,
  Upload, FolderPlus, Trash2, ChevronRight, ChevronDown,
  ArrowLeft,
} from 'lucide-react'
import { useFilesStore } from '@/store/files.store'
import type { Folder as FolderType, FileEntry } from '@/types/file.types'

const MAX_BYTES = 50 * 1024 * 1024

// ── helpers ──────────────────────────────────────────────────────────────────

function mimeIcon(mimeType: string | null) {
  if (!mimeType) return <File size={28} />
  if (mimeType.startsWith('image/'))       return <Image    size={28} style={{ color: '#60a5fa' }} />
  if (mimeType.startsWith('video/'))       return <Film     size={28} style={{ color: '#a78bfa' }} />
  if (mimeType === 'application/pdf')      return <FileText size={28} style={{ color: '#f87171' }} />
  if (mimeType.includes('zip') || mimeType.includes('rar'))
                                           return <Archive  size={28} style={{ color: '#fbbf24' }} />
  return <File size={28} />
}

function fmt(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── SidebarNode ───────────────────────────────────────────────────────────────

interface SidebarNodeProps {
  folder: FolderType
  all: FolderType[]
  depth: number
  activeId: string | null
  onSelect: (id: string) => void
}

function SidebarNode({ folder, all, depth, activeId, onSelect }: SidebarNodeProps) {
  const children = all.filter(f => f.parentId === folder.id)
  const isActive = activeId === folder.id
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => onSelect(folder.id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: `5px 8px 5px ${8 + depth * 16}px`,
          border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 6,
          background: isActive ? 'var(--accent)' : 'transparent',
          color: isActive ? 'var(--accent-ink)' : 'var(--fg)',
          fontWeight: isActive ? 600 : 400,
          fontSize: 13,
          transition: 'background 80ms',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        {/* expand chevron */}
        {children.length > 0 ? (
          <span
            onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
            style={{ display: 'flex', alignItems: 'center', color: isActive ? 'var(--accent-ink)' : 'var(--fg-muted)', flexShrink: 0 }}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {isActive
          ? <FolderOpen size={14} style={{ flexShrink: 0 }} />
          : <Folder     size={14} style={{ flexShrink: 0, color: 'var(--fg-muted)' }} />
        }
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {folder.name}
        </span>
      </button>

      {open && children.map(c => (
        <SidebarNode key={c.id} folder={c} all={all} depth={depth + 1} activeId={activeId} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ── FolderCard ────────────────────────────────────────────────────────────────

function FolderCard({
  folder, subCount, onOpen, onDelete,
}: {
  folder: FolderType
  subCount: number
  onOpen: () => void
  onDelete: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        padding: '14px 14px 12px',
        borderRadius: 12,
        border: `1px solid ${hov ? 'var(--border-strong)' : 'var(--border)'}`,
        background: hov ? 'var(--surface-2)' : 'var(--surface)',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'border-color 100ms, background 100ms',
        userSelect: 'none',
      }}
      onClick={onOpen}
    >
      <FolderOpen size={32} style={{ color: 'var(--accent)' }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
          {subCount > 0 ? `${subCount} Unterordner` : 'Ordner'}
        </div>
      </div>

      {hov && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Ordner löschen"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 24, height: 24, borderRadius: 6,
            border: 'none', cursor: 'pointer',
            background: 'oklch(72% 0.18 25 / 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--danger)',
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ── FileCard ─────────────────────────────────────────────────────────────────

function FileCard({ file, onDelete }: { file: FileEntry; onDelete: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        padding: '14px 14px 12px',
        borderRadius: 12,
        border: `1px solid ${hov ? 'var(--border-strong)' : 'var(--border)'}`,
        background: hov ? 'var(--surface-2)' : 'var(--surface)',
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'border-color 100ms, background 100ms',
        userSelect: 'none',
      }}
    >
      <div style={{ color: 'var(--fg-muted)' }}>{mimeIcon(file.mimeType)}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
          {fmt(file.size) || 'Datei'}
        </div>
      </div>

      {hov && (
        <button
          onClick={onDelete}
          title="Datei löschen"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 24, height: 24, borderRadius: 6,
            border: 'none', cursor: 'pointer',
            background: 'oklch(72% 0.18 25 / 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--danger)',
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ── DeleteConfirm ─────────────────────────────────────────────────────────────

function ConfirmModal({ name, onConfirm, onCancel }: {
  name: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'oklch(0% 0 0 / 0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{ width: 360, padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-2)' }}>
        <div style={{ padding: '22px 24px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'oklch(72% 0.18 25 / 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={17} style={{ color: 'var(--danger)' }} />
            </div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Löschen?</h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
            <strong style={{ color: 'var(--fg)' }}>„{name}"</strong> und alle enthaltenen Dateien werden unwiderruflich gelöscht.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost" onClick={onCancel}>Abbrechen</button>
          <button
            onClick={onConfirm}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >
            <Trash2 size={13} /> Löschen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function DateienPane({ customerId }: Props) {
  const folders         = useFilesStore(s => s.folders)
  const files           = useFilesStore(s => s.files)
  const activeFolderId  = useFilesStore(s => s.activeFolderId)
  const isLoading       = useFilesStore(s => s.isLoading)
  const error           = useFilesStore(s => s.error)
  const setActiveFolder = useFilesStore(s => s.setActiveFolder)
  const loadFiles       = useFilesStore(s => s.loadFiles)
  const createFolder    = useFilesStore(s => s.createFolder)
  const removeFolder    = useFilesStore(s => s.removeFolder)
  const importFile      = useFilesStore(s => s.importFile)
  const removeFile      = useFilesStore(s => s.removeFile)

  const fileRef = useRef<HTMLInputElement>(null)

  // inline new-folder state
  const [creating,  setCreating]  = useState(false)
  const [newName,   setNewName]   = useState('')

  // delete confirmation
  const [delTarget, setDelTarget] = useState<{ type: 'folder'; item: FolderType } | null>(null)

  // ── navigation ─────────────────────────────────────────────────────────────
  const navigate = async (id: string | null) => {
    setActiveFolder(id)
    await loadFiles(customerId, id)
    setCreating(false)
    setNewName('')
  }

  // ── breadcrumb path ─────────────────────────────────────────────────────────
  const breadcrumb: FolderType[] = []
  if (activeFolderId) {
    let cur = folders.find(f => f.id === activeFolderId)
    while (cur) {
      breadcrumb.unshift(cur)
      cur = cur.parentId ? folders.find(f => f.id === cur!.parentId) : undefined
    }
  }

  // ── folders + files shown in right panel ────────────────────────────────────
  const shownSubfolders = folders.filter(f =>
    activeFolderId === null ? f.parentId === null : f.parentId === activeFolderId
  )

  // ── parent folder (for "go up" button) ─────────────────────────────────────
  const parentId = activeFolderId
    ? (folders.find(f => f.id === activeFolderId)?.parentId ?? null)
    : null

  // ── folder creation ─────────────────────────────────────────────────────────
  const submitCreate = async () => {
    const name = newName.trim()
    if (!name) { setCreating(false); setNewName(''); return }
    try {
      await createFolder({ customerId, name, parentId: activeFolderId })
    } catch {}
    setCreating(false)
    setNewName('')
  }

  // ── folder delete ───────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!delTarget) return
    if (delTarget.type === 'folder') {
      try {
        await removeFolder(delTarget.item.id)
        // if we deleted the active folder, navigate to its parent
        if (activeFolderId === delTarget.item.id) {
          await navigate(delTarget.item.parentId ?? null)
        }
      } catch {}
    }
    setDelTarget(null)
  }

  // ── file upload ──────────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) { alert('Datei zu groß (max. 50 MB)'); return }
    const data = Array.from(new Uint8Array(await file.arrayBuffer()))
    await importFile({ customerId, folderId: activeFolderId, name: file.name, data, mimeType: file.type || null })
    e.target.value = ''
  }

  // ── computed ─────────────────────────────────────────────────────────────────
  const rootFolders = folders.filter(f => f.parentId === null)
  const activeName  = activeFolderId ? folders.find(f => f.id === activeFolderId)?.name : undefined

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ══ LEFT: Folder Tree ═══════════════════════════════════════════════ */}
      <div style={{
        width: 210, flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            Ordner
          </span>
        </div>

        {/* scrollable tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
          {/* "Alle Dateien" root */}
          <button
            onClick={() => navigate(null)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              borderRadius: 6, fontSize: 13, fontWeight: activeFolderId === null ? 600 : 400,
              background: activeFolderId === null ? 'var(--accent)' : 'transparent',
              color: activeFolderId === null ? 'var(--accent-ink)' : 'var(--fg)',
              marginBottom: 2,
              transition: 'background 80ms',
            }}
            onMouseEnter={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'transparent' }}
          >
            {activeFolderId === null
              ? <FolderOpen size={14} style={{ flexShrink: 0 }} />
              : <Folder     size={14} style={{ flexShrink: 0, color: 'var(--fg-muted)' }} />
            }
            Alle Dateien
          </button>

          {/* recursive folder nodes */}
          {rootFolders.map(f => (
            <SidebarNode
              key={f.id}
              folder={f}
              all={folders}
              depth={0}
              activeId={activeFolderId}
              onSelect={navigate}
            />
          ))}

          {rootFolders.length === 0 && (
            <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              Noch keine Ordner
            </div>
          )}
        </div>
      </div>

      {/* ══ RIGHT: Content Panel ════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          {/* up button */}
          {activeFolderId !== null && (
            <button
              onClick={() => navigate(parentId)}
              className="btn-ghost"
              title="Eine Ebene höher"
              style={{ padding: '5px 8px', gap: 4, fontSize: 12 }}
            >
              <ArrowLeft size={13} /> Hoch
            </button>
          )}

          {/* breadcrumb */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, minWidth: 0, overflow: 'hidden' }}>
            <span
              onClick={() => navigate(null)}
              style={{ color: activeFolderId ? 'var(--fg-muted)' : 'var(--fg)', cursor: activeFolderId ? 'pointer' : 'default', fontWeight: activeFolderId ? 400 : 600, whiteSpace: 'nowrap' }}
              onMouseEnter={e => { if (activeFolderId) (e.target as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { if (activeFolderId) (e.target as HTMLElement).style.color = 'var(--fg-muted)' }}
            >
              Alle Dateien
            </span>
            {breadcrumb.map((f, i) => (
              <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <ChevronRight size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
                <span
                  onClick={() => i < breadcrumb.length - 1 ? navigate(f.id) : undefined}
                  style={{
                    color: i === breadcrumb.length - 1 ? 'var(--fg)' : 'var(--fg-muted)',
                    fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                    cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (i < breadcrumb.length - 1) (e.target as HTMLElement).style.color = 'var(--accent)' }}
                  onMouseLeave={e => { if (i < breadcrumb.length - 1) (e.target as HTMLElement).style.color = 'var(--fg-muted)' }}
                >
                  {f.name}
                </span>
              </span>
            ))}
          </div>

          {/* actions */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
            <button
              className="btn-ghost"
              onClick={() => { setCreating(true); setNewName('') }}
              style={{ fontSize: 12, gap: 5, padding: '5px 12px' }}
            >
              <FolderPlus size={13} /> Neuer Ordner
            </button>
            <button
              className="btn-ghost"
              onClick={() => fileRef.current?.click()}
              style={{ fontSize: 12, gap: 5, padding: '5px 12px' }}
            >
              <Upload size={13} /> Datei hochladen
            </button>
          </div>
        </div>

        {/* error */}
        {error && (
          <div style={{ margin: '10px 16px 0', padding: '8px 14px', borderRadius: 8, background: 'oklch(72% 0.18 25 / 0.12)', color: 'var(--danger)', fontSize: 13 }}>
            {error.message}
          </div>
        )}

        {/* ── Content grid ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

          {/* inline new-folder input */}
          {creating && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 12px',
                borderRadius: 10,
                border: '2px solid var(--accent)',
                background: 'var(--surface)',
              }}>
                <FolderOpen size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  submitCreate()
                    if (e.key === 'Escape') { setCreating(false); setNewName('') }
                  }}
                  placeholder="Ordnername…"
                  style={{
                    fontSize: 13, fontWeight: 500,
                    background: 'none', border: 'none', outline: 'none',
                    color: 'var(--fg)', width: 160,
                  }}
                />
                <button
                  onClick={submitCreate}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600 }}
                >
                  OK
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName('') }}
                  style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--fg-muted)' }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* section: subfolders */}
          {shownSubfolders.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                Ordner
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 22 }}>
                {shownSubfolders.map(f => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    subCount={folders.filter(c => c.parentId === f.id).length}
                    onOpen={() => navigate(f.id)}
                    onDelete={() => setDelTarget({ type: 'folder', item: f })}
                  />
                ))}
              </div>
            </>
          )}

          {/* section: files */}
          {(files.length > 0 || isLoading) && (
            <>
              {(shownSubfolders.length > 0 || files.length > 0) && (
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                  Dateien
                </div>
              )}
              {isLoading ? (
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '8px 0' }}>Lädt…</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {files.map(f => (
                    <FileCard key={f.id} file={f} onDelete={() => removeFile(f.id)} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* empty state */}
          {!isLoading && shownSubfolders.length === 0 && files.length === 0 && !creating && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 12, color: 'var(--fg-muted)' }}>
              <FolderOpen size={40} style={{ opacity: 0.25 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>
                {activeName ? `„${activeName}" ist leer` : 'Noch keine Dateien oder Ordner'}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>
                Erstelle einen Ordner oder lade eine Datei hoch
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn-ghost" onClick={() => setCreating(true)} style={{ fontSize: 12, gap: 5 }}>
                  <FolderPlus size={13} /> Neuer Ordner
                </button>
                <button className="btn-ghost" onClick={() => fileRef.current?.click()} style={{ fontSize: 12, gap: 5 }}>
                  <Upload size={13} /> Datei hochladen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── delete confirm ── */}
      {delTarget && (
        <ConfirmModal
          name={delTarget.item.name}
          onConfirm={confirmDelete}
          onCancel={() => setDelTarget(null)}
        />
      )}
    </div>
  )
}
