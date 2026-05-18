import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { useNotebookStore, type NoteBook, type NoteEntry } from '@/store/notebook.store'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000) return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// ── Formatting toolbar ────────────────────────────────────────────────────────

type FmtBtn = { cmd: string; label: string; title: string; style?: React.CSSProperties }

const FORMAT_BTNS: FmtBtn[] = [
  { cmd: 'bold',          label: 'B', title: 'Fett (⌘B)',          style: { fontWeight: 700 } },
  { cmd: 'italic',        label: 'I', title: 'Kursiv (⌘I)',        style: { fontStyle: 'italic' } },
  { cmd: 'underline',     label: 'U', title: 'Unterstrichen (⌘U)', style: { textDecoration: 'underline' } },
  { cmd: 'strikeThrough', label: 'S', title: 'Durchgestrichen',    style: { textDecoration: 'line-through' } },
]

function FormatBar({ onFormat, active }: {
  onFormat: (cmd: string, value?: string) => void
  active: Set<string>
}) {
  const handleHighlight = (e: React.MouseEvent) => {
    e.preventDefault()
    const val = document.queryCommandValue('hiliteColor')
    const isOn = val && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent' && val !== ''
    onFormat('hiliteColor', isOn ? 'transparent' : 'rgba(194, 240, 48, 0.35)')
  }

  return (
    <div className="flex items-center gap-0.5">
      {FORMAT_BTNS.map(f => (
        <button
          key={f.cmd}
          onMouseDown={e => { e.preventDefault(); onFormat(f.cmd) }}
          title={f.title}
          className={`w-7 h-6 rounded text-xs flex items-center justify-center transition-colors
            ${active.has(f.cmd)
              ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
              : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-black/5'
            }`}
          style={f.style}
        >
          {f.label}
        </button>
      ))}

      <div className="w-px h-4 bg-[var(--border)] mx-1 flex-shrink-0" />

      {/* Highlight */}
      <button
        onMouseDown={handleHighlight}
        title="Markieren"
        className="w-7 h-6 rounded flex items-center justify-center transition-colors text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-black/5"
      >
        <span className="text-xs font-bold relative">
          A
          <span
            className="absolute bottom-0 left-0 right-0 h-1 rounded-sm"
            style={{ background: 'oklch(92% 0.2 125 / 0.7)' }}
          />
        </span>
      </button>
    </div>
  )
}

// ── Note editor ───────────────────────────────────────────────────────────────

function NoteEditor({ entry, onUpdate, onRemove }: {
  entry: NoteEntry
  onUpdate: (changes: Partial<Pick<NoteEntry, 'title' | 'content'>>) => void
  onRemove: () => void
}) {
  const [title, setTitle] = useState(entry.title)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load stored HTML on mount / when switching entries
  useLayoutEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = entry.content
    }
  }, [entry.id])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onUpdate({ content: editorRef.current?.innerHTML ?? '' })
    }, 500)
  }, [onUpdate])

  const saveTitle = useCallback((val: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onUpdate({ title: val }), 500)
  }, [onUpdate])

  const refreshFormats = () => {
    const cmds = ['bold', 'italic', 'underline', 'strikeThrough']
    setActiveFormats(new Set(cmds.filter(c => document.queryCommandState(c))))
  }

  const handleFormat = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value ?? undefined)
    refreshFormats()
    scheduleSave()
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-2.5 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <FormatBar onFormat={handleFormat} active={activeFormats} />
        <div className="flex items-center gap-4">
          <span className="text-xs text-[var(--fg-dim)]">
            {formatDate(entry.updatedAt)}
          </span>
          <button
            onClick={onRemove}
            className="text-xs text-[var(--fg-dim)] hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/8"
          >
            Löschen
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => { setTitle(e.target.value); saveTitle(e.target.value) }}
        placeholder="Titel…"
        className="mx-8 mt-8 mb-3 text-2xl font-bold text-[var(--fg)] bg-transparent border-none focus:outline-none placeholder:text-[var(--fg-dim)]/30 flex-shrink-0"
      />

      <div className="mx-8 mb-4 h-px bg-[var(--border)] flex-shrink-0" />

      {/* Rich text content */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Beginne zu schreiben…"
        onInput={scheduleSave}
        onKeyUp={refreshFormats}
        onMouseUp={refreshFormats}
        className="flex-1 mx-8 mb-8 text-sm text-[var(--fg)] bg-transparent focus:outline-none leading-loose overflow-y-auto"
        style={{ minHeight: 0 }}
      />
    </div>
  )
}

// ── Main pane ─────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function NotizPane({ customerId }: Props) {
  const books       = useNotebookStore(s => s.books.filter(b => b.customerId === customerId))
  const entries     = useNotebookStore(s => s.entries.filter(e => e.customerId === customerId))
  const addBook     = useNotebookStore(s => s.addBook)
  const renameBook  = useNotebookStore(s => s.renameBook)
  const removeBook  = useNotebookStore(s => s.removeBook)
  const addEntry    = useNotebookStore(s => s.addEntry)
  const updateEntry = useNotebookStore(s => s.updateEntry)
  const removeEntry = useNotebookStore(s => s.removeEntry)

  const [activeBookId,  setActiveBookId]  = useState<string | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [editingBookId, setEditingBookId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeBookId && books.length > 0) setActiveBookId(books[0].id)
  }, [books.length])

  const bookEntries = entries
    .filter(e => e.bookId === activeBookId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const activeBook  = books.find(b => b.id === activeBookId) ?? null
  const activeEntry = entries.find(e => e.id === activeEntryId) ?? null

  const createBook = () => {
    const id = addBook(customerId, 'Neue Mappe')
    setActiveBookId(id)
    setActiveEntryId(null)
    setEditingBookId(id)
  }

  const createEntry = () => {
    if (!activeBookId) return
    const id = addEntry(activeBookId, customerId, 'Neue Notiz')
    setActiveEntryId(id)
  }

  const handleRemoveBook = (id: string) => {
    removeBook(id)
    if (activeBookId === id) {
      const next = books.find(b => b.id !== id)
      setActiveBookId(next?.id ?? null)
      setActiveEntryId(null)
    }
  }

  const handleRemoveEntry = () => {
    if (!activeEntryId) return
    removeEntry(activeEntryId)
    const next = bookEntries.find(e => e.id !== activeEntryId)
    setActiveEntryId(next?.id ?? null)
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: Mappen ── */}
      <div className="w-48 flex-shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Mappen</span>
          <button
            onClick={createBook}
            className="w-5 h-5 rounded flex items-center justify-center text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-lg leading-none"
          >+</button>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
          {books.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-[var(--fg-dim)]/40">Noch keine Mappen</p>
              <button
                onClick={createBook}
                className="mt-2 text-xs text-[var(--fg-2)] hover:text-[var(--accent)] hover:underline transition-colors"
              >+ Erstellen</button>
            </div>
          )}
          {books.map(book => {
            const count = entries.filter(e => e.bookId === book.id).length
            const isActive = activeBookId === book.id
            return (
              <div
                key={book.id}
                onClick={() => { setActiveBookId(book.id); setActiveEntryId(null) }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all mb-0.5
                  ${isActive
                    ? 'bg-primary'
                    : 'hover:bg-black/5'
                  }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={isActive ? 'text-[var(--accent-ink)]' : 'text-[var(--fg-muted)]'}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>

                {editingBookId === book.id ? (
                  <input
                    autoFocus
                    defaultValue={book.name}
                    onBlur={e => { renameBook(book.id, e.target.value || book.name); setEditingBookId(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { renameBook(book.id, e.currentTarget.value || book.name); setEditingBookId(null) }
                      if (e.key === 'Escape') setEditingBookId(null)
                    }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 text-xs bg-transparent focus:outline-none text-[var(--fg)] border-b border-[var(--accent)]"
                  />
                ) : (
                  <span
                    onDoubleClick={() => setEditingBookId(book.id)}
                    className={`flex-1 min-w-0 text-xs font-medium truncate
                      ${isActive ? 'text-[var(--accent-ink)]' : 'text-[var(--fg-muted)]'}`}
                  >
                    {book.name}
                  </span>
                )}

                <span className={`text-[10px] flex-shrink-0 ${isActive ? 'text-[var(--accent-ink)]/60' : 'text-[var(--fg-dim)]/40'}`}>{count}</span>

                <button
                  onClick={e => { e.stopPropagation(); handleRemoveBook(book.id) }}
                  className="opacity-0 group-hover:opacity-100 text-[var(--fg-muted)] hover:text-red-400 transition-opacity text-xs flex-shrink-0"
                >✕</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Middle: Notizliste ── */}
      <div className="w-60 flex-shrink-0 border-r border-[var(--border)] flex flex-col">
        {activeBook ? (
          <>
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-semibold text-[var(--fg)] truncate">{activeBook.name}</span>
              <button
                onClick={createEntry}
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-lg leading-none flex-shrink-0"
              >+</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {bookEntries.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-[var(--fg-dim)]/40">Keine Notizen in dieser Mappe</p>
                  <button
                    onClick={createEntry}
                    className="mt-2 text-xs text-[var(--fg-2)] hover:text-[var(--accent)] hover:underline transition-colors"
                  >+ Neue Notiz</button>
                </div>
              )}
              {bookEntries.map(entry => {
                const isActive = activeEntryId === entry.id
                return (
                  <div
                    key={entry.id}
                    onClick={() => setActiveEntryId(entry.id)}
                    className={`px-4 py-3 cursor-pointer border-b border-[var(--border)]/40 transition-colors border-l-2
                      ${isActive
                        ? 'bg-[var(--accent-soft)] border-l-[var(--accent)]'
                        : 'border-l-transparent hover:bg-black/4'
                      }`}
                  >
                    <p className="text-xs font-semibold truncate text-[var(--fg)]">
                      {entry.title || 'Unbenannte Notiz'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--fg-dim)] flex-shrink-0">{formatDate(entry.updatedAt)}</span>
                      <p className="text-[10px] text-[var(--fg-dim)] truncate">
                        {stripHtml(entry.content) || 'Leer'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-[var(--fg-dim)]/40">Mappe auswählen</p>
          </div>
        )}
      </div>

      {/* ── Right: Editor ── */}
      {activeEntry ? (
        <NoteEditor
          key={activeEntry.id}
          entry={activeEntry}
          onUpdate={changes => updateEntry(activeEntry.id, changes)}
          onRemove={handleRemoveEntry}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="text-[var(--fg-dim)]/20 mx-auto mb-3">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
            <p className="text-sm text-[var(--fg-dim)]/40">
              {activeBook ? 'Notiz auswählen oder neue erstellen' : 'Mappe auswählen'}
            </p>
            {activeBook && (
              <button
                onClick={createEntry}
                className="mt-3 text-xs text-[var(--fg-2)] hover:text-[var(--accent)] hover:underline transition-colors"
              >
                + Neue Notiz
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
