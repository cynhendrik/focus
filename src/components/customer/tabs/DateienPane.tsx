import { useRef, useState, useMemo } from 'react'
import {
  Folder, FolderOpen, File, FileText, Image, Film, Archive,
  Upload, FolderPlus, Trash2, ChevronRight, ChevronDown, Search, Plus, X,
} from 'lucide-react'
import { useFilesStore } from '@/store/files.store'
import type { Folder as FolderType, FileEntry } from '@/types/file.types'

const MAX_BYTES = 50 * 1024 * 1024

// ── helpers ──────────────────────────────────────────────────────────────────

function mimeIcon(mimeType: string | null, size = 15) {
  if (!mimeType) return <File size={size} />
  if (mimeType.startsWith('image/'))  return <Image    size={size} style={{ color: '#60a5fa' }} />
  if (mimeType.startsWith('video/'))  return <Film     size={size} style={{ color: '#a78bfa' }} />
  if (mimeType === 'application/pdf') return <FileText size={size} style={{ color: '#f87171' }} />
  if (mimeType.includes('zip') || mimeType.includes('rar'))
                                      return <Archive  size={size} style={{ color: '#fbbf24' }} />
  return <File size={size} />
}

function fmt(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Heute'
  if (d === 1) return 'Gestern'
  if (d < 7)  return `vor ${d} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
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
      <div
        onClick={() => onSelect(folder.id)}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        style={{
          display: 'flex', alignItems: 'center',
          paddingLeft: 8 + depth * 16, paddingRight: 8,
          borderRadius: 7, cursor: 'pointer', marginBottom: 1,
          background: isActive ? 'var(--accent)' : 'transparent',
          transition: 'background 80ms',
        }}
      >
        {/* expand chevron */}
        <span
          onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
          style={{
            width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: isActive ? 'var(--accent-ink)' : 'var(--fg-dim)',
          }}
        >
          {children.length > 0
            ? (open ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : null}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', color: isActive ? 'var(--accent-ink)' : 'var(--fg-muted)', marginRight: 6, flexShrink: 0 }}>
          {isActive ? <FolderOpen size={13} /> : <Folder size={13} />}
        </span>

        <span style={{
          flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--accent-ink)' : 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          padding: '5px 0',
        }}>
          {folder.name}
        </span>

        {children.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 500, minWidth: 18, height: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 5, flexShrink: 0, marginLeft: 4, padding: '0 4px',
            background: isActive ? 'oklch(100% 0 0 / 0.2)' : 'var(--surface-2)',
            color: isActive ? 'var(--accent-ink)' : 'var(--fg-muted)',
          }}>
            {children.length}
          </span>
        )}
      </div>

      {open && children.map(c => (
        <SidebarNode key={c.id} folder={c} all={all} depth={depth + 1} activeId={activeId} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ── FolderCard ────────────────────────────────────────────────────────────────

function FolderCard({ folder, subCount, onOpen, onDelete }: {
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
      onClick={onOpen}
      style={{
        position: 'relative', cursor: 'pointer', borderRadius: 14,
        border: `1px solid ${hov ? 'var(--border-strong)' : 'var(--border)'}`,
        background: hov ? 'var(--surface-2)' : 'var(--surface)',
        transition: 'border-color 100ms, background 100ms',
        overflow: 'hidden', userSelect: 'none',
      }}
    >
      {/* Illustration */}
      <div style={{
        height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        position: 'relative',
      }}>
        <div style={{ position: 'relative', width: 60, height: 60 }}>
          {/* back paper */}
          <div style={{
            position: 'absolute', bottom: 2, left: '50%',
            transform: 'translateX(-50%) rotate(-7deg)',
            width: 38, height: 46, borderRadius: 4,
            background: 'oklch(25% 0.015 250)',
            border: '1px solid oklch(36% 0.02 250)',
          }} />
          {/* mid paper */}
          <div style={{
            position: 'absolute', bottom: 2, left: '50%',
            transform: 'translateX(-50%) rotate(-2deg)',
            width: 38, height: 46, borderRadius: 4,
            background: 'oklch(29% 0.015 250)',
            border: '1px solid oklch(40% 0.02 250)',
          }} />
          {/* folder body */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 46, height: 36, borderRadius: '0 0 6px 6px',
            background: 'oklch(35% 0.03 250)',
            border: '1px solid oklch(46% 0.03 250)',
          }} />
          {/* folder tab */}
          <div style={{
            position: 'absolute', bottom: 34, left: '50%',
            marginLeft: -18,
            width: 18, height: 7, borderRadius: '4px 4px 0 0',
            background: 'oklch(35% 0.03 250)',
            border: '1px solid oklch(46% 0.03 250)',
            borderBottom: 'none',
          }} />
        </div>
      </div>

      {/* Label */}
      <div style={{ padding: '10px 12px 11px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          {folder.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          {subCount > 0 ? `${subCount} Unterordner` : 'Ordner'}
        </div>
      </div>

      {/* Delete */}
      {hov && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Ordner löschen"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: 'oklch(72% 0.18 25 / 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--danger)', zIndex: 1,
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({ file, onDelete }: { file: FileEntry; onDelete: () => void }) {
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 120px 72px 32px',
        alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 9,
        background: hov ? 'var(--surface-2)' : 'transparent',
        transition: 'background 80ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ flexShrink: 0, display: 'flex', color: 'var(--fg-muted)' }}>
          {mimeIcon(file.mimeType)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{relDate(file.createdAt)}</span>
      <span style={{ fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(file.size)}
      </span>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {hov && (
          <button
            onClick={onDelete}
            style={{
              width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'oklch(72% 0.18 25 / 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--danger)',
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

function ConfirmModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
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
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Löschen?</h3>
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

  const [sidebarTab, setSidebarTab] = useState<'ordner' | 'tags'>('ordner')
  const [search,     setSearch]     = useState('')
  const [creating,   setCreating]   = useState(false)
  const [newName,    setNewName]    = useState('')
  const [delTarget,  setDelTarget]  = useState<{ type: 'folder'; item: FolderType } | null>(null)

  // ── navigation ─────────────────────────────────────────────────────────────
  const navigate = async (id: string | null) => {
    setActiveFolder(id)
    await loadFiles(customerId, id)
    setCreating(false)
    setNewName('')
  }

  // ── derived ─────────────────────────────────────────────────────────────────
  const rootFolders     = useMemo(() => folders.filter(f => f.parentId === null), [folders])
  const activeName      = activeFolderId ? folders.find(f => f.id === activeFolderId)?.name ?? null : null
  const shownSubfolders = useMemo(
    () => folders.filter(f => activeFolderId === null ? f.parentId === null : f.parentId === activeFolderId),
    [folders, activeFolderId],
  )

  // ── sidebar search ───────────────────────────────────────────────────────────
  const sidebarFolders = useMemo(() => {
    if (!search.trim()) return rootFolders
    const q = search.toLowerCase()
    return folders.filter(f => f.name.toLowerCase().includes(q))
  }, [folders, rootFolders, search])

  // ── folder creation ─────────────────────────────────────────────────────────
  const submitCreate = async () => {
    const name = newName.trim()
    if (!name) { setCreating(false); setNewName(''); return }
    try { await createFolder({ customerId, name, parentId: activeFolderId }) } catch {}
    setCreating(false); setNewName('')
  }

  // ── folder delete ───────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!delTarget) return
    try {
      await removeFolder(delTarget.item.id)
      if (activeFolderId === delTarget.item.id) {
        await navigate(delTarget.item.parentId ?? null)
      }
    } catch {}
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

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ══ LEFT SIDEBAR ════════════════════════════════════════════════════ */}
      <div style={{
        width: 226, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}>

        {/* header */}
        <div style={{
          padding: '12px 12px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
            Dateien
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            {[
              { icon: <Plus size={14} />, title: 'Neuer Ordner', onClick: () => { setCreating(true); setNewName('') } },
              { icon: <Upload size={13} />, title: 'Hochladen', onClick: () => fileRef.current?.click() },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={btn.onClick}
                title={btn.title}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--fg)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
                style={{
                  width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--fg-muted)', transition: 'background 80ms, color 80ms',
                }}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        </div>

        {/* search */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 10px', borderRadius: 8,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}>
            <Search size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suchen…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 12, color: 'var(--fg)' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--fg-dim)' }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Ordner / Tags tabs */}
        <div style={{ display: 'flex', padding: '6px 10px', gap: 4, borderBottom: '1px solid var(--border)' }}>
          {(['ordner', 'tags'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSidebarTab(t)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: sidebarTab === t ? 600 : 400,
                background: sidebarTab === t ? 'var(--surface-2)' : 'transparent',
                color: sidebarTab === t ? 'var(--fg)' : 'var(--fg-muted)',
                transition: 'background 80ms, color 80ms',
              }}
            >
              {t === 'ordner' ? 'Ordner' : 'Tags'}
            </button>
          ))}
        </div>

        {/* tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {sidebarTab === 'ordner' ? (
            <>
              {/* Root */}
              <div
                onClick={() => navigate(null)}
                onMouseEnter={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'transparent' }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderRadius: 7, cursor: 'pointer', marginBottom: 1,
                  background: activeFolderId === null ? 'var(--accent)' : 'transparent',
                  transition: 'background 80ms',
                }}
              >
                <span style={{ width: 16, flexShrink: 0 }} />
                <span style={{ display: 'flex', color: activeFolderId === null ? 'var(--accent-ink)' : 'var(--fg-muted)', flexShrink: 0 }}>
                  {activeFolderId === null ? <FolderOpen size={13} /> : <Folder size={13} />}
                </span>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: activeFolderId === null ? 600 : 400,
                  color: activeFolderId === null ? 'var(--accent-ink)' : 'var(--fg)',
                }}>
                  Alle Dateien
                </span>
                {rootFolders.length > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 500, minWidth: 18, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 5, padding: '0 4px',
                    background: activeFolderId === null ? 'oklch(100% 0 0 / 0.2)' : 'var(--surface-2)',
                    color: activeFolderId === null ? 'var(--accent-ink)' : 'var(--fg-muted)',
                  }}>
                    {rootFolders.length}
                  </span>
                )}
              </div>

              {sidebarFolders.map(f => (
                <SidebarNode key={f.id} folder={f} all={folders} depth={0} activeId={activeFolderId} onSelect={navigate} />
              ))}

              {rootFolders.length === 0 && (
                <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                  Noch keine Ordner.<br />Klicke <strong>+</strong> um einen zu erstellen.
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              Tags-Funktion<br />kommt bald
            </div>
          )}
        </div>
      </div>

      {/* ══ RIGHT CONTENT ════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

        {/* Content header */}
        <div style={{
          padding: '13px 22px 11px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
              {activeName ?? 'Alle Dateien'}
            </h2>
            <ChevronDown size={14} style={{ color: 'var(--fg-dim)', marginTop: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
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
              <Upload size={13} /> Hochladen
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: '10px 20px 0', padding: '8px 14px', borderRadius: 8, background: 'oklch(72% 0.18 25 / 0.12)', color: 'var(--danger)', fontSize: 13 }}>
            {error.message}
          </div>
        )}

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {/* Inline folder creation */}
          {creating && (
            <div style={{ marginBottom: 18 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10,
                border: '2px solid var(--accent)', background: 'var(--surface)',
              }}>
                <FolderOpen size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <input
                  autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  submitCreate()
                    if (e.key === 'Escape') { setCreating(false); setNewName('') }
                  }}
                  placeholder="Ordnername…"
                  style={{ fontSize: 13, fontWeight: 500, background: 'none', border: 'none', outline: 'none', color: 'var(--fg)', width: 160 }}
                />
                <button onClick={submitCreate} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600 }}>OK</button>
                <button onClick={() => { setCreating(false); setNewName('') }} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--fg-muted)' }}>✕</button>
              </div>
            </div>
          )}

          {/* ── Folders grid ── */}
          {shownSubfolders.length > 0 && (
            <div style={{ marginBottom: 30 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em', marginBottom: 14 }}>
                Ordner
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(162px, 1fr))', gap: 12 }}>
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
            </div>
          )}

          {/* ── Files table ── */}
          {(files.length > 0 || isLoading) && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                Dateien
              </div>

              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 72px 32px',
                alignItems: 'center', gap: 8,
                padding: '6px 12px', marginBottom: 2,
                borderBottom: '1px solid var(--border)',
              }}>
                {['Name', 'Datum', 'Größe', ''].map((h, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    textAlign: i === 2 ? 'right' : 'left',
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {isLoading ? (
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '14px 12px' }}>Lädt…</div>
              ) : (
                files.map(f => <FileRow key={f.id} file={f} onDelete={() => removeFile(f.id)} />)
              )}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && shownSubfolders.length === 0 && files.length === 0 && !creating && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: 260, gap: 12,
            }}>
              <FolderOpen size={42} style={{ opacity: 0.15, color: 'var(--fg)' }} />
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

      {/* Delete confirm */}
      {delTarget && (
        <ConfirmModal name={delTarget.item.name} onConfirm={confirmDelete} onCancel={() => setDelTarget(null)} />
      )}
    </div>
  )
}
