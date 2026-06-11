import {
  useEffect, useState, useRef, useCallback, useMemo, type KeyboardEvent,
} from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Plus, Trash2, Search, X, Bold, Italic, List, CheckSquare, Heading2, PenLine, StickyNote as StickyIcon } from 'lucide-react'
import { useNotesModuleStore } from '@/store/notes-module.store'
import { useWorkspaceStore }   from '@/store/workspace.store'
import { useAuthStore }        from '@/store/auth.store'
import type { NoteEntry, NoteFolder } from '@/types/notes-module.types'
import { StickyCanvas, createSticky } from './StickyCanvas'
import type { StickyNote } from '@/types/notes-module.types'

interface Props { accountId: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function fmtMeta(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function fmtListTime(iso: string): string {
  const d    = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)         return 'Gerade eben'
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000)     return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (diff < 7 * 86_400_000) return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()]
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`
}

// Gruppen: Heute / Diese Woche / Dieser Monat / Älter
function groupEntries(entries: NoteEntry[]) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const groups: { label: string; entries: NoteEntry[] }[] = [
    { label: 'Heute',        entries: [] },
    { label: 'Diese Woche',  entries: [] },
    { label: 'Dieser Monat', entries: [] },
    { label: 'Älter',        entries: [] },
  ]

  for (const e of entries) {
    const d = new Date(e.updatedAt)
    if (d >= today)        groups[0].entries.push(e)
    else if (d >= weekStart)  groups[1].entries.push(e)
    else if (d >= monthStart) groups[2].entries.push(e)
    else                      groups[3].entries.push(e)
  }
  return groups.filter(g => g.entries.length > 0)
}

// ── Editor toolbar ────────────────────────────────────────────────────────────

function Toolbar({
  editor,
  onAddSticky,
}: {
  editor: ReturnType<typeof useEditor>
  onAddSticky: () => void
}) {
  if (!editor) return null

  const btn = (
    active: boolean,
    icon: React.ReactNode,
    action: () => void,
    title: string,
  ) => (
    <button
      onMouseDown={e => { e.preventDefault(); action() }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: active ? 'var(--surface-3)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--fg-dim)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 100ms, color 100ms',
      }}
    >{icon}</button>
  )

  return (
    <div style={{
      display: 'flex', gap: 2, padding: '6px 0', marginBottom: 4,
      borderBottom: '1px solid var(--border)', alignItems: 'center',
    }}>
      {btn(editor.isActive('bold'),         <Bold size={13} />,          () => editor.chain().focus().toggleBold().run(),             'Fett')}
      {btn(editor.isActive('italic'),       <Italic size={13} />,        () => editor.chain().focus().toggleItalic().run(),           'Kursiv')}
      {btn(editor.isActive('heading',{level:2}), <Heading2 size={13} />, () => editor.chain().focus().toggleHeading({level:2}).run(), 'Überschrift')}
      <div style={{ width: 1, background: 'var(--border)', margin: '2px 4px' }} />
      {btn(editor.isActive('bulletList'),   <List size={13} />,          () => editor.chain().focus().toggleBulletList().run(),       'Liste')}
      {btn(editor.isActive('taskList'),     <CheckSquare size={13} />,   () => editor.chain().focus().toggleTaskList().run(),         'Checkliste')}
      <div style={{ flex: 1 }} />
      <button
        onClick={onAddSticky}
        title="Zettel hinzufügen"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent', cursor: 'pointer',
          fontSize: 11.5, color: 'var(--fg-muted)',
          transition: 'color 120ms, border-color 120ms',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--fg)'
          e.currentTarget.style.borderColor = 'var(--accent)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--fg-muted)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        <StickyIcon size={12} /> Zettel
      </button>
    </div>
  )
}

// ── NoteEditor (right panel) ──────────────────────────────────────────────────

function NoteEditor({
  note, folders, onUpdate,
}: {
  note: NoteEntry
  folders: NoteFolder[]
  onUpdate: (patch: { title?: string | null; content?: string; stickies?: string }) => Promise<void>
}) {
  const [title,  setTitle]  = useState(note.title ?? '')
  const [status, setStatus] = useState<'saved' | 'saving' | ''>('')
  const titleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [stickies, setStickies] = useState<StickyNote[]>(note.stickies ?? [])
  const stickiesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashSaved = useCallback(() => {
    setStatus('saved')
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(''), 2000)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Schreib hier deine Notiz…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: [
          'outline:none',
          'font-size:15px',
          'line-height:1.8',
          'color:var(--fg)',
          'font-family:inherit',
          'min-height:200px',
          'caret-color:var(--accent)',
        ].join(';'),
      },
    },
    content: note.content || '',
    onUpdate({ editor }) {
      setStatus('saving')
      if (contentTimer.current) clearTimeout(contentTimer.current)
      contentTimer.current = setTimeout(async () => {
        await onUpdate({ content: editor.getHTML() })
        flashSaved()
      }, 600)
    },
  }, [note.id])

  useEffect(() => { setTitle(note.title ?? '') }, [note.id, note.title])
  useEffect(() => { setStickies(note.stickies ?? []) }, [note.id])

  useEffect(() => () => {
    if (titleTimer.current)    clearTimeout(titleTimer.current)
    if (contentTimer.current)  clearTimeout(contentTimer.current)
    if (statusTimer.current)   clearTimeout(statusTimer.current)
    if (stickiesTimer.current) clearTimeout(stickiesTimer.current)
  }, [])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    setStatus('saving')
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(async () => {
      await onUpdate({ title: val.trim() || null })
      flashSaved()
    }, 600)
  }

  const handleTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus() }
  }

  const handleStickiesChange = useCallback((updated: StickyNote[]) => {
    setStickies(updated)
    if (stickiesTimer.current) clearTimeout(stickiesTimer.current)
    stickiesTimer.current = setTimeout(() => {
      onUpdate({ stickies: JSON.stringify(updated) })
    }, 600)
  }, [onUpdate])

  const handleAddSticky = useCallback(() => {
    const updated = [...stickies, createSticky(stickies.length)]
    setStickies(updated)
    onUpdate({ stickies: JSON.stringify(updated) })
  }, [stickies, onUpdate])

  const folder = folders.find(f => f.id === note.folderId)

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'var(--bg)',
    }}>
      {/* Editor header */}
      <div style={{
        padding: '32px 56px 0',
        flexShrink: 0,
      }}>
        {/* Metadata row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
        }}>
          <span>{fmtMeta(note.createdAt)}</span>
          {folder && (
            <>
              <span style={{ opacity: 0.35 }}>·</span>
              <span style={{
                background: 'var(--accent-soft)', color: 'var(--accent-text)',
                padding: '1px 8px', borderRadius: 99, fontWeight: 600,
              }}>
                {folder.name}
              </span>
            </>
          )}
          <span style={{
            marginLeft: 'auto',
            opacity: status === '' ? 0 : 1,
            transition: 'opacity 300ms',
            color: status === 'saving' ? 'var(--fg-dim)' : 'var(--ok)',
          }}>
            {status === 'saving' ? 'Speichert…' : 'Gespeichert ✓'}
          </span>
        </div>

        {/* Title */}
        <input
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          onKeyDown={handleTitleKey}
          placeholder="Titel…"
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2,
            color: 'var(--fg)', fontFamily: 'inherit', width: '100%',
            caretColor: 'var(--accent)', marginBottom: 16,
          }}
        />

        <Toolbar editor={editor} onAddSticky={handleAddSticky} />
      </div>

      {/* Editor scroll area */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '20px 56px 80px', position: 'relative' }}
        onClick={() => editor?.commands.focus()}
      >
        <StickyCanvas stickies={stickies} onChange={handleStickiesChange} />
        <div style={{ maxWidth: 720 }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

// ── NoteListRow ───────────────────────────────────────────────────────────────

function NoteListRow({
  note, active, onClick, onDelete,
}: {
  note: NoteEntry; active: boolean; onClick: () => void; onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const preview = stripHtml(note.content).slice(0, 100)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
        background: active
          ? 'var(--accent)'
          : hover ? 'var(--surface-2)' : 'transparent',
        borderLeft: active ? 'none' : '2px solid transparent',
        transition: 'background 120ms',
        position: 'relative', marginBottom: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, lineHeight: 1.3,
          color: active ? 'var(--accent-ink)' : 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {note.title || 'Ohne Titel'}
        </span>
        <span style={{
          fontSize: 10, flexShrink: 0, fontFamily: 'var(--font-mono)',
          color: active ? 'oklch(15% 0 0 / 0.45)' : 'var(--fg-dim)',
        }}>
          {fmtListTime(note.updatedAt)}
        </span>
      </div>

      {preview && (
        <div style={{
          fontSize: 12, marginTop: 2, lineHeight: 1.45,
          color: active ? 'oklch(15% 0 0 / 0.55)' : 'var(--fg-muted)',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {preview}
        </div>
      )}

      {hover && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 20, height: 20, borderRadius: 5, border: 'none',
            background: active ? 'oklch(100% 0 0 / 0.18)' : 'var(--surface-3)',
            color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><Trash2 size={10} /></button>
      )}
    </div>
  )
}

// ── EmptyEditor ───────────────────────────────────────────────────────────────

function EmptyEditor({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: 'var(--bg)',
    }}>
      <PenLine size={40} style={{ opacity: 0.15, color: 'var(--fg-dim)' }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>
          Notiz auswählen oder neu anlegen
        </div>
        <button onClick={onNew} className="btn-primary" style={{ fontSize: 12 }}>
          <Plus size={13} /> Neue Notiz
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

  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [activeFolderId,  setActiveFolderId]  = useState<string | null>(null)
  const [search,          setSearch]          = useState('')
  const [quickNote,       setQuickNote]       = useState('')
  const [newFolderMode,   setNewFolderMode]   = useState(false)
  const [newFolderName,   setNewFolderName]   = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingName,     setEditingName]     = useState('')

  useEffect(() => { loadForAccount(accountId) }, [accountId, loadForAccount])

  // Auto-select first note
  useEffect(() => {
    if (!selectedId && entries.length > 0) setSelectedId(entries[0].id)
  }, [entries.length]) // eslint-disable-line

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

  const quickCaptures = useMemo(
    () => filteredEntries.filter(e => e.tags.includes('quick-capture')),
    [filteredEntries],
  )
  const regularEntries = useMemo(
    () => filteredEntries.filter(e => !e.tags.includes('quick-capture')),
    [filteredEntries],
  )
  const groups     = useMemo(() => groupEntries(regularEntries), [regularEntries])
  const selectedNote = useMemo(() => entries.find(e => e.id === selectedId) ?? null, [entries, selectedId])

  const handleNew = async (title?: string, content?: string) => {
    const note = await createEntry({
      workspaceId, accountId,
      folderId: activeFolderId,
      title: title?.trim() || undefined,
      content: content || '',
      createdBy: userId,
    })
    setSelectedId(note.id)
    return note
  }

  const handleQuickNote = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    const text = quickNote.trim()
    if (!text) return
    setQuickNote('')
    await handleNew(undefined, `<p>${text}</p>`)
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
    patch: { title?: string | null; content?: string; stickies?: string },
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

  const handleRenameFolder = async () => {
    if (!editingFolderId || !editingName.trim()) return
    // updateFolder via store
    const { updateFolder } = useNotesModuleStore.getState()
    await updateFolder(editingFolderId, { name: editingName.trim() })
    setEditingFolderId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Mappe-Tabs ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0, overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {/* "Alle" tab */}
        <FolderTab
          label="Alle"
          count={entries.length}
          active={activeFolderId === null}
          onClick={() => setActiveFolderId(null)}
        />

        {folders.map(folder =>
          editingFolderId === folder.id ? (
            <div key={folder.id} style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
              <input
                autoFocus
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  handleRenameFolder()
                  if (e.key === 'Escape') setEditingFolderId(null)
                }}
                onBlur={handleRenameFolder}
                style={{
                  fontSize: 13, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--accent)', background: 'var(--surface-2)',
                  color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
                  width: Math.max(80, editingName.length * 9),
                }}
              />
            </div>
          ) : (
            <FolderTab
              key={folder.id}
              label={folder.name}
              count={entries.filter(e => e.folderId === folder.id).length}
              active={activeFolderId === folder.id}
              onClick={() => setActiveFolderId(folder.id)}
              onRename={() => { setEditingFolderId(folder.id); setEditingName(folder.name) }}
              onDelete={() => { deleteFolder(folder.id); if (activeFolderId === folder.id) setActiveFolderId(null) }}
            />
          )
        )}

        {/* New folder */}
        {newFolderMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 6px' }}>
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  handleCreateFolder()
                if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName('') }
              }}
              onBlur={() => newFolderName.trim() ? handleCreateFolder() : setNewFolderMode(false)}
              placeholder="Mappenname…"
              style={{
                fontSize: 13, padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--accent)', background: 'var(--surface-2)',
                color: 'var(--fg)', outline: 'none', fontFamily: 'inherit', minWidth: 120,
              }}
            />
            <button onClick={() => { setNewFolderMode(false); setNewFolderName('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 4 }}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setNewFolderMode(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 10px', border: 'none', background: 'transparent',
              color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 12.5,
              transition: 'color 140ms', whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-dim)')}
          >
            <Plus size={13} /> Mappe
          </button>
        )}
      </div>

      {/* ── Body: list + editor ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: notes list */}
        <div style={{
          width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          {/* Search + new button */}
          <div style={{
            display: 'flex', gap: 6, padding: '10px 10px 8px',
            borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-2)', borderRadius: 8,
              padding: '6px 10px', border: '1px solid var(--border)',
            }}>
              <Search size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen…"
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  outline: 'none', fontSize: 12.5, color: 'var(--fg)',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 0, display: 'flex' }}>
                  <X size={11} />
                </button>
              )}
            </div>
            <button
              onClick={() => handleNew()}
              title="Neue Notiz (Strg+N)"
              style={{
                width: 34, height: 34, borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Plus size={15} />
            </button>
          </div>

          {/* Notes list — grouped by time */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            {loadingEntries ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: 'var(--fg-dim)' }}>
                Lädt…
              </div>
            ) : (
              <>
                {/* Quick Capture section — immer sichtbar */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--accent-text)',
                    fontFamily: 'var(--font-mono)',
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px 4px',
                  }}>
                    <PenLine size={10} />
                    Quick Capture
                  </div>
                  {quickCaptures.length === 0 ? (
                    <div style={{
                      padding: '6px 12px 8px',
                      fontSize: 11.5, color: 'var(--fg-dim)', fontStyle: 'italic',
                    }}>
                      Gedanken via ✎ unten rechts erfassen…
                    </div>
                  ) : (
                    quickCaptures.map(note => (
                      <NoteListRow
                        key={note.id}
                        note={note}
                        active={note.id === selectedId}
                        onClick={() => setSelectedId(note.id)}
                        onDelete={() => handleDelete(note.id)}
                      />
                    ))
                  )}
                  {regularEntries.length > 0 && (
                    <div style={{ height: 1, background: 'var(--border)', margin: '8px 12px 4px' }} />
                  )}
                </div>

                {/* Time groups */}
                {groups.map(group => (
                  <div key={group.label} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--fg-dim)',
                      fontFamily: 'var(--font-mono)',
                      padding: '8px 12px 4px',
                    }}>
                      {group.label}
                    </div>
                    {group.entries.map(note => (
                      <NoteListRow
                        key={note.id}
                        note={note}
                        active={note.id === selectedId}
                        onClick={() => setSelectedId(note.id)}
                        onDelete={() => handleDelete(note.id)}
                      />
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Quick Capture */}
          <div style={{
            padding: '8px 10px', borderTop: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <textarea
              value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              onKeyDown={handleQuickNote}
              placeholder="Schnellnotiz… ↵"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '7px 10px',
                fontSize: 12, color: 'var(--fg)', resize: 'none',
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                transition: 'border-color 140ms',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              ↵ speichern · ⇧↵ neue Zeile
            </div>
          </div>
        </div>

        {/* Right: editor */}
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            folders={folders}
            onUpdate={patch => handleUpdate(selectedNote.id, patch)}
          />
        ) : (
          <EmptyEditor onNew={() => handleNew()} />
        )}
      </div>
    </div>
  )
}

// ── FolderTab ─────────────────────────────────────────────────────────────────

function FolderTab({
  label, count, active, onClick, onRename, onDelete,
}: {
  label: string; count: number; active: boolean
  onClick: () => void; onRename?: () => void; onDelete?: () => void
}) {
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false) }}
    >
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '11px 14px', border: 'none', background: 'transparent',
          cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
          color: active ? 'var(--fg)' : 'var(--fg-muted)',
          borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
          marginBottom: -1,
          transition: 'color 140ms',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg-2)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
      >
        {label}
        <span style={{
          fontSize: 10.5, fontFamily: 'var(--font-mono)',
          color: active ? 'var(--fg-dim)' : 'var(--fg-dim)', opacity: 0.7,
        }}>{count}</span>
      </button>

      {/* Hover context menu for folder tabs */}
      {hover && onDelete && (
        <div style={{
          position: 'absolute', top: 4, right: 4,
          display: 'flex', gap: 2,
        }}>
          {onRename && (
            <button
              onClick={e => { e.stopPropagation(); onRename() }}
              style={{
                width: 16, height: 16, borderRadius: 4, border: 'none',
                background: 'var(--surface-3)', color: 'var(--fg-dim)',
                cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Umbenennen"
            >✎</button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            style={{
              width: 16, height: 16, borderRadius: 4, border: 'none',
              background: 'var(--surface-3)', color: 'var(--fg-dim)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Löschen"
          ><X size={9} /></button>
        </div>
      )}
    </div>
  )
}
