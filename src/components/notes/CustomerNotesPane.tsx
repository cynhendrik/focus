import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Plus, Trash2, Search } from 'lucide-react'
import { useNotesModuleStore } from '@/store/notes-module.store'
import { useWorkspaceStore }   from '@/store/workspace.store'
import { useAuthStore }        from '@/store/auth.store'
import type { NoteEntry, NoteFolder } from '@/types/notes-module.types'

interface Props { accountId: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d    = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)         return 'Gerade eben'
  if (diff < 3_600_000)      return `vor ${Math.floor(diff / 60_000)} Min`
  if (diff < 86_400_000)     return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (diff < 7 * 86_400_000) return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()]
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── NoteListRow ───────────────────────────────────────────────────────────────

function NoteListRow({
  note, active, onClick, onDelete,
}: {
  note: NoteEntry; active: boolean; onClick: () => void; onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const preview = stripHtml(note.content).slice(0, 80)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
        background: active ? 'var(--accent)' : hover ? 'var(--surface-2)' : 'transparent',
        transition: 'background 120ms',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: active ? 'var(--accent-ink)' : 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {note.title || 'Ohne Titel'}
        </span>
        <span style={{
          fontSize: 10, flexShrink: 0,
          fontFamily: 'var(--font-mono)',
          color: active ? 'oklch(15% 0 0 / 0.5)' : 'var(--fg-dim)',
        }}>
          {fmtDate(note.updatedAt)}
        </span>
      </div>

      {preview && (
        <div style={{
          fontSize: 12, marginTop: 2, lineHeight: 1.4,
          color: active ? 'oklch(15% 0 0 / 0.6)' : 'var(--fg-muted)',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {preview}
        </div>
      )}

      {hover && !active && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 22, height: 22, borderRadius: 6, border: 'none',
            background: 'var(--surface-3)', color: 'var(--fg-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><Trash2 size={11} /></button>
      )}
    </div>
  )
}

// ── NoteEditor ────────────────────────────────────────────────────────────────

function NoteEditor({
  note, folders, onUpdate,
}: {
  note: NoteEntry
  folders: NoteFolder[]
  onUpdate: (patch: { title?: string | null; content?: string }) => Promise<void>
}) {
  const [title,   setTitle]   = useState(note.title ?? '')
  const [status,  setStatus]  = useState<'saved' | 'saving' | ''>('saved')
  const titleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSaved = useCallback(() => {
    setStatus('saved')
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(''), 1800)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Schreib drauf los…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: [
          'outline:none',
          'font-size:14.5px',
          'line-height:1.75',
          'color:var(--fg)',
          'font-family:inherit',
          'min-height:200px',
          'max-width:680px',
        ].join(';'),
      },
    },
    content: note.content || '',
    onUpdate({ editor }) {
      setStatus('saving')
      if (contentTimer.current) clearTimeout(contentTimer.current)
      contentTimer.current = setTimeout(async () => {
        await onUpdate({ content: editor.getHTML() })
        showSaved()
      }, 600)
    },
  }, [note.id])

  // Sync title when note changes
  useEffect(() => {
    setTitle(note.title ?? '')
  }, [note.id])

  useEffect(() => () => {
    if (titleTimer.current)   clearTimeout(titleTimer.current)
    if (contentTimer.current) clearTimeout(contentTimer.current)
    if (statusTimer.current)  clearTimeout(statusTimer.current)
  }, [])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    setStatus('saving')
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(async () => {
      await onUpdate({ title: val.trim() || null })
      showSaved()
    }, 600)
  }

  const folder = folders.find(f => f.id === note.folderId)
  const dateStr = new Date(note.createdAt).toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'auto', padding: '40px 56px 80px',
    }}>
      {/* Metadata */}
      <div style={{
        fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center',
      }}>
        <span>{dateStr}</span>
        {folder && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: 'var(--accent-text)' }}>{folder.name}</span>
          </>
        )}
        <span style={{ marginLeft: 'auto', opacity: status === '' ? 0 : 1, transition: 'opacity 400ms' }}>
          {status === 'saving' ? 'Speichert…' : status === 'saved' ? 'Gespeichert' : ''}
        </span>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => handleTitleChange(e.target.value)}
        placeholder="Titel…"
        style={{
          border: 'none', background: 'transparent', outline: 'none',
          fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em',
          color: 'var(--fg)', fontFamily: 'inherit',
          width: '100%', maxWidth: 680, marginBottom: 20,
          caretColor: 'var(--accent)',
        }}
      />

      {/* Editor */}
      <div style={{ maxWidth: 680 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      color: 'var(--fg-dim)',
    }}>
      <div style={{ fontSize: 40, opacity: 0.15 }}>✎</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6 }}>
          Keine Notiz ausgewählt
        </div>
        <button onClick={onNew} className="btn-primary" style={{ fontSize: 12 }}>
          + Neue Notiz
        </button>
      </div>
    </div>
  )
}

// ── CustomerNotesPane ─────────────────────────────────────────────────────────

export function CustomerNotesPane({ accountId }: Props) {
  const loadForAccount = useNotesModuleStore(s => s.loadForAccount)
  const entries        = useNotesModuleStore(s => s.entries)
  const folders        = useNotesModuleStore(s => s.folders)
  const createEntry    = useNotesModuleStore(s => s.createEntry)
  const updateEntry    = useNotesModuleStore(s => s.updateEntry)
  const deleteEntry    = useNotesModuleStore(s => s.deleteEntry)
  const createFolder   = useNotesModuleStore(s => s.createFolder)
  const deleteFolder   = useNotesModuleStore(s => s.deleteFolder)
  const loadingEntries = useNotesModuleStore(s => s.loadingEntries)

  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId      = useAuthStore(s => s.user?.id) ?? ''

  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [search,         setSearch]         = useState('')
  const [newFolderMode,  setNewFolderMode]  = useState(false)
  const [newFolderName,  setNewFolderName]  = useState('')

  useEffect(() => { loadForAccount(accountId) }, [accountId, loadForAccount])

  // Auto-select first note after load
  useEffect(() => {
    if (!selectedId && entries.length > 0) setSelectedId(entries[0].id)
  }, [entries.length])

  const filteredEntries = useMemo(() => {
    let list = activeFolderId === null
      ? entries
      : entries.filter(e => e.folderId === activeFolderId)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        (e.title ?? '').toLowerCase().includes(q) ||
        stripHtml(e.content).toLowerCase().includes(q)
      )
    }
    return list
  }, [entries, activeFolderId, search])

  const selectedNote = useMemo(
    () => entries.find(e => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const handleNewNote = async () => {
    const note = await createEntry({
      workspaceId, accountId,
      folderId: activeFolderId,
      content: '', createdBy: userId,
    })
    setSelectedId(note.id)
  }

  const handleDelete = async (id: string) => {
    await deleteEntry(id)
    if (selectedId === id) {
      const next = filteredEntries.find(e => e.id !== id)
      setSelectedId(next?.id ?? null)
    }
  }

  const handleUpdate = useCallback(async (
    id: string,
    patch: { title?: string | null; content?: string },
  ) => {
    await updateEntry(id, { ...patch, updatedBy: userId })
  }, [updateEntry, userId])

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    await createFolder({ workspaceId, accountId, name, createdBy: userId })
    setNewFolderName('')
    setNewFolderMode(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left panel ────────────────────────────────────────────────────── */}
      <div style={{
        width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        {/* Top bar */}
        <div style={{
          padding: '12px 12px 8px', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-2)', borderRadius: 8,
              padding: '5px 10px', border: '1px solid var(--border)',
            }}>
              <Search size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen…"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 12, color: 'var(--fg)',
                }}
              />
            </div>
            <button
              onClick={handleNewNote}
              className="btn-primary"
              title="Neue Notiz"
              style={{ padding: '5px 10px', fontSize: 13, borderRadius: 8 }}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Folder pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <FolderPill
              label="Alle"
              active={activeFolderId === null}
              count={entries.length}
              onClick={() => setActiveFolderId(null)}
            />
            {folders.map(f => (
              <FolderPill
                key={f.id}
                label={f.name}
                active={activeFolderId === f.id}
                count={entries.filter(e => e.folderId === f.id).length}
                onClick={() => setActiveFolderId(f.id)}
                onDelete={() => { deleteFolder(f.id); if (activeFolderId === f.id) setActiveFolderId(null) }}
              />
            ))}
            {newFolderMode ? (
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  handleCreateFolder()
                  if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName('') }
                }}
                onBlur={() => { if (newFolderName.trim()) handleCreateFolder(); else setNewFolderMode(false) }}
                placeholder="Mappenname…"
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 99,
                  border: '1px solid var(--accent)', background: 'var(--surface-2)',
                  color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
                  minWidth: 80,
                }}
              />
            ) : (
              <button
                onClick={() => setNewFolderMode(true)}
                style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 99,
                  border: '1px dashed var(--border)', background: 'transparent',
                  color: 'var(--fg-dim)', cursor: 'pointer',
                }}
                title="Neue Mappe"
              >+</button>
            )}
          </div>
        </div>

        {/* Notes list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {loadingEntries ? (
            <div style={{ padding: '20px 8px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center' }}>
              Lädt…
            </div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--fg-dim)' }}>
              <div style={{ fontSize: 12, marginBottom: 10 }}>
                {search ? 'Keine Treffer' : 'Noch keine Notizen'}
              </div>
              {!search && (
                <button onClick={handleNewNote} className="btn-ghost" style={{ fontSize: 11 }}>
                  + Erste Notiz
                </button>
              )}
            </div>
          ) : (
            filteredEntries.map(note => (
              <NoteListRow
                key={note.id}
                note={note}
                active={note.id === selectedId}
                onClick={() => setSelectedId(note.id)}
                onDelete={() => handleDelete(note.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Editor panel ──────────────────────────────────────────────────── */}
      {selectedNote ? (
        <NoteEditor
          key={selectedNote.id}
          note={selectedNote}
          folders={folders}
          onUpdate={patch => handleUpdate(selectedNote.id, patch)}
        />
      ) : (
        <EmptyState onNew={handleNewNote} />
      )}
    </div>
  )
}

// ── FolderPill ────────────────────────────────────────────────────────────────

function FolderPill({
  label, count, active, onClick, onDelete,
}: {
  label: string; count: number; active: boolean
  onClick: () => void; onDelete?: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={onClick}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
          border: active ? 'none' : '1px solid var(--border)',
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
          fontSize: 11, fontWeight: active ? 600 : 400,
          transition: 'background 120ms',
        }}
      >
        {label}
        <span style={{ opacity: 0.65, fontSize: 10, fontFamily: 'var(--font-mono)' }}>{count}</span>
      </button>
      {hover && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', right: -6, top: -5,
            width: 14, height: 14, borderRadius: '50%', border: 'none',
            background: 'var(--danger)', color: '#fff',
            cursor: 'pointer', fontSize: 9, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      )}
    </div>
  )
}
