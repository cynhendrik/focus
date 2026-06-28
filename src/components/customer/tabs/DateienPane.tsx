import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  Folder, FolderOpen, File, FileText, Image, Film, Archive,
  Upload, FolderPlus, Trash2, ChevronRight, ChevronDown, Search, Plus, X,
  FolderInput, Download, Eye, ExternalLink, type LucideIcon,
} from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useFilesStore } from '@/store/files.store'
import { useToastStore } from '@/store/toast.store'
import type { Folder as FolderType, FileEntry } from '@/types/file.types'

function isPreviewable(mimeType: string | null): 'image' | 'pdf' | null {
  if (!mimeType) return null
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  return null
}

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


// ── ContextMenu ───────────────────────────────────────────────────────────────

interface ContextMenuItem {
  icon:    LucideIcon
  label:   string
  danger?: boolean
  onClick: () => void
}

interface ContextMenuState {
  x:     number
  y:     number
  items: ContextMenuItem[]
}

function ContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown',   onKey)
    }
  }, [onClose])

  // Prevent menu from going off-screen
  const style: React.CSSProperties = {
    position: 'fixed',
    top:  menu.y,
    left: menu.x,
    zIndex: 1000,
  }

  return (
    <div ref={ref} style={style}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 4,
        minWidth: 180,
        boxShadow: 'var(--shadow-2)',
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        {menu.items.map((item, i) => {
          const Icon = item.icon
          return (
            <button
              key={i}
              onClick={() => { item.onClick(); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 10px', borderRadius: 7, border: 'none',
                background: 'transparent', cursor: 'pointer', width: '100%',
                fontSize: 13, color: item.danger ? 'var(--danger)' : 'var(--fg-2)',
                textAlign: 'left', fontFamily: 'inherit',
                transition: 'background 80ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = item.danger
                  ? 'oklch(72% 0.18 25 / 0.1)'
                  : 'var(--surface-2)'
              }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={14} style={{ opacity: item.danger ? 1 : 0.75 }} />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
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
          background: isActive ? 'var(--nav-active-bg)' : 'transparent',
          transition: 'background 80ms',
        }}
      >
        <span
          onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
          style={{
            width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: isActive ? 'var(--accent-text)' : 'var(--fg-dim)',
          }}
        >
          {children.length > 0
            ? (open ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : null}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', color: isActive ? 'var(--accent-text)' : 'var(--fg-muted)', marginRight: 6, flexShrink: 0 }}>
          {isActive ? <FolderOpen size={13} /> : <Folder size={13} />}
        </span>

        <span style={{
          flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--accent-text)' : 'var(--fg)',
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
            background: isActive ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'var(--surface-2)',
            color: isActive ? 'var(--accent-text)' : 'var(--fg-muted)',
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

// ── FolderShape ───────────────────────────────────────────────────────────────

function FolderShape({
  name, meta, hov, creating, inputRef, inputValue, onInputChange, onInputKeyDown, onInputBlur,
}: {
  name?: string
  meta?: string
  hov?: boolean
  creating?: boolean
  inputRef?: React.RefObject<HTMLInputElement>
  inputValue?: string
  onInputChange?: (v: string) => void
  onInputKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onInputBlur?: () => void
}) {
  const bodyBg = hov
    ? 'linear-gradient(150deg, var(--surface-3) 0%, var(--surface-2) 100%)'
    : 'linear-gradient(150deg, var(--surface-2) 0%, var(--surface-3) 100%)'

  const borderColor = creating
    ? 'var(--accent)'
    : hov ? 'var(--border-strong)' : 'var(--border)'

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Tab */}
      <div style={{
        width: '42%', height: 13, marginLeft: 10,
        borderRadius: '7px 7px 0 0',
        background: creating ? 'var(--accent-soft)' : 'var(--surface-3)',
        border: `1px solid ${borderColor}`,
        borderBottom: 'none',
        transition: 'background 120ms',
      }} />

      {/* Body */}
      <div style={{
        borderRadius: '0 8px 8px 8px',
        background: creating ? 'var(--accent-soft)' : bodyBg,
        border: `1px solid ${borderColor}`,
        height: 64,
        transition: 'background 120ms, border-color 120ms',
        boxShadow: hov ? '0 6px 20px oklch(0% 0 0 / 0.16)' : 'none',
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: creating ? 'flex-start' : 'center',
        padding: creating ? '0 12px' : 0,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'oklch(100% 0 0 / 0.06)', pointerEvents: 'none',
        }} />

        {creating && (
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => onInputChange?.(e.target.value)}
            onKeyDown={onInputKeyDown}
            onBlur={onInputBlur}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              fontSize: 12, fontWeight: 600, color: 'var(--fg)',
              fontFamily: 'inherit', width: '100%',
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── FolderCard ────────────────────────────────────────────────────────────────

function FolderCard({ folder, subfolderCount, onOpen, onContextMenu }: {
  folder: FolderType
  subfolderCount: number
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onOpen}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e) }}
      style={{
        cursor: 'pointer',
        transform: hov ? 'translateY(-3px)' : 'none',
        transition: 'transform 160ms cubic-bezier(.2,.7,.1,1)',
      }}
    >
      <FolderShape hov={hov} />
      <div style={{ marginTop: 7, padding: '0 2px' }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: 'var(--fg)',
          letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {folder.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>
          {subfolderCount > 0 ? `${subfolderCount} Unterordner` : 'Leer'}
        </div>
      </div>
    </div>
  )
}

// ── NewFolderCard ─────────────────────────────────────────────────────────────

function NewFolderCard({ onSubmit, onCancel }: {
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('Neuer Ordner')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const commit = () => {
    const n = name.trim()
    if (n) onSubmit(n)
    else   onCancel()
  }

  return (
    <FolderShape
      creating
      inputRef={inputRef}
      inputValue={name}
      onInputChange={setName}
      onInputKeyDown={e => {
        if (e.key === 'Enter')  commit()
        if (e.key === 'Escape') onCancel()
      }}
      onInputBlur={commit}
    />
  )
}

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({ file, onOpen, onContextMenu }: {
  file: FileEntry
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onDoubleClick={onOpen}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e) }}
      title="Doppelklick zum Öffnen"
      style={{
        display: 'grid', gridTemplateColumns: '1fr 120px 72px',
        alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 9,
        background: hov ? 'var(--surface-2)' : 'transparent',
        transition: 'background 80ms',
        cursor: 'pointer',
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
  const importFromPath  = useFilesStore(s => s.importFromPath)
  const removeFile      = useFilesStore(s => s.removeFile)

  const fileRef = useRef<HTMLInputElement>(null)

  const [sidebarTab] = useState<'ordner'>('ordner')
  const [search,      setSearch]      = useState('')
  const [creating,    setCreating]    = useState(false)
  const [delTarget,   setDelTarget]   = useState<FolderType | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [preview,     setPreview]     = useState<{ file: FileEntry; url: string; kind: 'image' | 'pdf' } | null>(null)
  const [busyLabel,   setBusyLabel]   = useState<string | null>(null)
  const [dragOver,    setDragOver]    = useState(false)
  const toast = useToastStore(s => s.show)

  // ── open / download ──────────────────────────────────────────────────────────
  const openFile = async (file: FileEntry) => {
    const kind = isPreviewable(file.mimeType)
    if (kind) {
      try {
        const bytes = await invoke<number[]>('cmd_read_file', { path: file.path })
        const blob = new Blob([new Uint8Array(bytes)], { type: file.mimeType ?? undefined })
        setPreview({ file, url: URL.createObjectURL(blob), kind })
      } catch (e) {
        toast({ message: `Öffnen fehlgeschlagen: ${String(e)}`, variant: 'error' })
      }
    } else {
      // Nicht-Vorschaubare Typen (docx, xlsx, …) im Standardprogramm öffnen.
      try { await invoke('cmd_open_file', { path: file.path }) }
      catch (e) { toast({ message: `Öffnen fehlgeschlagen: ${String(e)}`, variant: 'error' }) }
    }
  }

  const closePreview = () => {
    setPreview(p => { if (p) URL.revokeObjectURL(p.url); return null })
  }

  const downloadFile = async (file: FileEntry) => {
    setBusyLabel('Lade herunter…')
    try {
      const path = await invoke<string>('cmd_download_file', { path: file.path, suggestedName: file.name })
      toast({ message: `Gespeichert: ${path}`, variant: 'success', durationMs: 5000 })
    } catch (e) {
      toast({ message: `Download fehlgeschlagen: ${String(e)}`, variant: 'error' })
    } finally {
      setBusyLabel(null)
    }
  }

  const downloadAllZip = async () => {
    if (files.length === 0 || busyLabel) return
    setBusyLabel('Packe ZIP…')
    try {
      const zipFiles: { name: string; bytes: number[] }[] = []
      for (const f of files) {
        const bytes = await invoke<number[]>('cmd_read_file', { path: f.path })
        zipFiles.push({ name: f.name, bytes })
      }
      const zipName = `${activeName ?? 'Dokumente'}.zip`
      const path = await invoke<string>('save_zip', { files: zipFiles, suggestedName: zipName })
      toast({ message: `ZIP gespeichert: ${path}`, variant: 'success', durationMs: 5000 })
    } catch (e) {
      toast({ message: `ZIP fehlgeschlagen: ${String(e)}`, variant: 'error' })
    } finally {
      setBusyLabel(null)
    }
  }

  // Dateien per Pfad importieren (Drag-&-Drop vom Desktop liefert Pfade).
  const importPaths = async (paths: string[]) => {
    if (!paths.length) return
    setBusyLabel(paths.length > 1 ? `Importiere ${paths.length} Dateien…` : 'Importiere…')
    let ok = 0
    try {
      for (const srcPath of paths) {
        try { await importFromPath({ customerId, folderId: activeFolderId, srcPath }); ok++ }
        catch { /* einzelne Datei übersprungen (z.B. Ordner) */ }
      }
      if (ok > 0) toast({ message: `${ok} Datei${ok === 1 ? '' : 'en'} importiert`, variant: 'success' })
      if (ok < paths.length) toast({ message: `${paths.length - ok} konnte(n) nicht importiert werden`, variant: 'error' })
    } finally {
      setBusyLabel(null)
    }
  }

  const openFolderMenu = useCallback((e: React.MouseEvent, folder: FolderType) => {
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: FolderInput, label: 'Öffnen',  onClick: () => navigate(folder.id) },
        { icon: Trash2,      label: 'Löschen', danger: true, onClick: () => setDelTarget(folder) },
      ],
    })
  }, [])

  const openFileMenu = useCallback((e: React.MouseEvent, file: FileEntry) => {
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: isPreviewable(file.mimeType) ? Eye : ExternalLink, label: 'Öffnen', onClick: () => openFile(file) },
        { icon: Download, label: 'Herunterladen', onClick: () => downloadFile(file) },
        { icon: Trash2, label: 'Löschen', danger: true, onClick: () => removeFile(file.id) },
      ],
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeFile])

  // ── navigation ─────────────────────────────────────────────────────────────
  const navigate = async (id: string | null) => {
    setActiveFolder(id)
    await loadFiles(customerId, id)
    setCreating(false)
  }

  // ── derived ─────────────────────────────────────────────────────────────────
  const rootFolders     = useMemo(() => folders.filter(f => f.parentId === null), [folders])
  const activeName      = activeFolderId ? folders.find(f => f.id === activeFolderId)?.name ?? null : null
  const shownSubfolders = useMemo(
    () => folders.filter(f => activeFolderId === null ? f.parentId === null : f.parentId === activeFolderId),
    [folders, activeFolderId],
  )

  const sidebarFolders = useMemo(() => {
    if (!search.trim()) return rootFolders
    const q = search.toLowerCase()
    return folders.filter(f => f.name.toLowerCase().includes(q))
  }, [folders, rootFolders, search])

  // ── folder creation ─────────────────────────────────────────────────────────
  const handleCreate = async (name: string) => {
    setCreating(false)
    try { await createFolder({ customerId, name, parentId: activeFolderId }) } catch {}
  }

  // ── folder delete ───────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!delTarget) return
    try {
      await removeFolder(delTarget.id)
      if (activeFolderId === delTarget.id) {
        await navigate(delTarget.parentId ?? null)
      }
    } catch {}
    setDelTarget(null)
  }

  // ── file upload ──────────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) { alert('Datei zu groß (max. 50 MB)'); return }
    setBusyLabel('Lädt hoch…')
    try {
      const data = Array.from(new Uint8Array(await file.arrayBuffer()))
      await importFile({ customerId, folderId: activeFolderId, name: file.name, data, mimeType: file.type || null })
      toast({ message: `„${file.name}" hochgeladen`, variant: 'success' })
    } catch (err) {
      toast({ message: `Upload fehlgeschlagen: ${String(err)}`, variant: 'error' })
    } finally {
      setBusyLabel(null)
      e.target.value = ''
    }
  }

  // Drag & Drop vom Desktop: Tauri liefert die Pfade der gezogenen Dateien
  // (kein HTML5-Drop). Aktiv, solange die Dokumente-Ansicht offen ist.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    getCurrentWebview().onDragDropEvent(ev => {
      const p = ev.payload
      if (p.type === 'over') setDragOver(true)
      else if (p.type === 'leave') setDragOver(false)
      else if (p.type === 'drop') { setDragOver(false); importPaths(p.paths) }
    }).then(fn => { if (cancelled) fn(); else unlisten = fn })
    return () => { cancelled = true; if (unlisten) unlisten() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, activeFolderId])

  const showFolders = shownSubfolders.length > 0 || creating
  const showFiles   = files.length > 0 || isLoading

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
              { icon: <Plus size={14} />, title: 'Neuer Ordner', fn: () => setCreating(true) },
              { icon: <Upload size={13} />, title: 'Hochladen',    fn: () => fileRef.current?.click() },
            ].map((b, i) => (
              <button key={i} onClick={b.fn} title={b.title}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--fg)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
                style={{ width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', transition: 'background 80ms, color 80ms' }}
              >
                {b.icon}
              </button>
            ))}
          </div>
        </div>

        {/* search */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <Search size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 12, color: 'var(--fg)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--fg-dim)' }}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>


        {/* tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          <div
            onClick={() => navigate(null)}
            onMouseEnter={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { if (activeFolderId !== null) e.currentTarget.style.background = 'transparent' }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, cursor: 'pointer', marginBottom: 1, background: activeFolderId === null ? 'var(--nav-active-bg)' : 'transparent', transition: 'background 80ms' }}
          >
            <span style={{ width: 16, flexShrink: 0 }} />
            <span style={{ display: 'flex', color: activeFolderId === null ? 'var(--accent-text)' : 'var(--fg-muted)', flexShrink: 0 }}>
              {activeFolderId === null ? <FolderOpen size={13} /> : <Folder size={13} />}
            </span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: activeFolderId === null ? 600 : 400, color: activeFolderId === null ? 'var(--accent-text)' : 'var(--fg)' }}>
              Alle Dateien
            </span>
            {rootFolders.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 500, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, padding: '0 4px', background: activeFolderId === null ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'var(--surface-2)', color: activeFolderId === null ? 'var(--accent-text)' : 'var(--fg-muted)' }}>
                {rootFolders.length}
              </span>
            )}
          </div>

          {sidebarFolders.map(f => (
            <SidebarNode key={f.id} folder={f} all={folders} depth={0} activeId={activeFolderId} onSelect={navigate} />
          ))}

          {rootFolders.length === 0 && !creating && (
            <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              Noch keine Ordner.<br />Klicke <strong>+</strong> um einen zu erstellen.
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
          flexShrink: 0, background: 'var(--surface-2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
              {activeName ?? 'Alle Dateien'}
            </h2>
            <ChevronDown size={14} style={{ color: 'var(--fg-dim)', marginTop: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
            {files.length > 0 && (
              <button className="btn-ghost" onClick={downloadAllZip} disabled={!!busyLabel} style={{ fontSize: 12, gap: 5, padding: '5px 12px' }}>
                <Download size={13} /> {busyLabel === 'Packe ZIP…' ? 'Packe…' : `Alle als ZIP (${files.length})`}
              </button>
            )}
            <button className="btn-ghost" onClick={() => setCreating(true)} disabled={!!busyLabel} style={{ fontSize: 12, gap: 5, padding: '5px 12px' }}>
              <FolderPlus size={13} /> Neuer Ordner
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={!!busyLabel} style={{ fontSize: 12, gap: 5, padding: '5px 12px' }}>
              {busyLabel === 'Lädt hoch…'
                ? <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)' }} className="animate-spin" />
                : <Upload size={13} />}
              {busyLabel === 'Lädt hoch…' ? 'Lädt…' : 'Hochladen'}
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

          {/* ── Folders grid ── */}
          {showFolders && (
            <div style={{ marginBottom: 30 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em', marginBottom: 10 }}>
                Ordner
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12 }}>
                {shownSubfolders.map(f => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    subfolderCount={folders.filter(c => c.parentId === f.id).length}
                    onOpen={() => navigate(f.id)}
                    onContextMenu={e => openFolderMenu(e, f)}
                  />
                ))}
                {/* Inline new folder card */}
                {creating && (
                  <NewFolderCard
                    onSubmit={handleCreate}
                    onCancel={() => setCreating(false)}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Files table ── */}
          {showFiles && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                Dateien
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 68px', alignItems: 'center', gap: 8, padding: '6px 12px 8px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}>
                {['Name', 'Datum', 'Größe'].map((h, i) => (
                  <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: i === 2 ? 'right' : 'left' }}>
                    {h}
                  </span>
                ))}
              </div>
              {isLoading ? (
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '14px 12px' }}>Lädt…</div>
              ) : (
                files.map(f => (
                  <FileRow
                    key={f.id}
                    file={f}
                    onOpen={() => openFile(f)}
                    onContextMenu={e => openFileMenu(e, f)}
                  />
                ))
              )}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !showFolders && !showFiles && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 12 }}>
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

      {contextMenu && (
        <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {delTarget && (
        <ConfirmModal name={delTarget.name} onConfirm={confirmDelete} onCancel={() => setDelTarget(null)} />
      )}

      {/* Drop-Overlay beim Ziehen vom Desktop */}
      {dragOver && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 560, pointerEvents: 'none',
          background: 'var(--accent-soft)', border: '3px dashed var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--accent)' }}>
            <Upload size={36} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Dateien hier ablegen</span>
          </div>
        </div>
      )}

      {/* Busy-Overlay — Upload / Download / ZIP / Import */}
      {busyLabel && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 570,
          background: 'oklch(0% 0 0 / 0.35)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '16px 22px', boxShadow: 'var(--shadow-2)',
          }}>
            <span className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{busyLabel}</span>
          </div>
        </div>
      )}

      {preview && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'oklch(0% 0 0 / 0.72)', backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column', padding: '36px 48px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%', maxWidth: 1100, margin: '0 auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview.file.name}
              </span>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn-ghost" onClick={() => downloadFile(preview.file)} style={{ fontSize: 12, gap: 6 }}>
                  <Download size={13} /> Herunterladen
                </button>
                <button className="btn-ghost" onClick={() => invoke('cmd_open_file', { path: preview.file.path }).catch(() => {})} style={{ fontSize: 12, gap: 6 }}>
                  <ExternalLink size={13} /> Extern öffnen
                </button>
                <button className="icon-btn" onClick={closePreview} style={{ color: '#fff' }} aria-label="Schließen">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, borderRadius: 12, overflow: 'hidden', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {preview.kind === 'image'
                ? <img src={preview.url} alt={preview.file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <iframe src={preview.url} title={preview.file.name} style={{ width: '100%', height: '100%', border: 'none' }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
