import { useState, useRef, useCallback, useEffect } from 'react'
import { useNotebookStore, type NoteBook, type NoteEntry } from '@/store/notebook.store'

function formatDate(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000) return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`
}

// ── Note editor ──────────────────────────────────────────────────────────────

function NoteEditor({ entry, onUpdate, onRemove }: {
  entry: NoteEntry
  onUpdate: (changes: Partial<Pick<NoteEntry, 'title' | 'content'>>) => void
  onRemove: () => void
}) {
  const [title, setTitle]     = useState(entry.title)
  const [content, setContent] = useState(entry.content)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback((patch: Partial<Pick<NoteEntry, 'title' | 'content'>>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onUpdate(patch), 500)
  }, [onUpdate])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-8 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-[var(--text2)]">
          Zuletzt bearbeitet · {formatDate(entry.updatedAt)}
        </span>
        <button
          onClick={onRemove}
          className="text-xs text-[var(--text2)] hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/8"
        >
          Löschen
        </button>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => { setTitle(e.target.value); save({ title: e.target.value, content }) }}
        placeholder="Titel…"
        className="mx-8 mt-8 mb-3 text-2xl font-bold text-[var(--text)] bg-transparent border-none focus:outline-none placeholder:text-[var(--text2)]/20 flex-shrink-0"
      />

      {/* Divider */}
      <div className="mx-8 mb-4 h-px bg-[var(--border)] flex-shrink-0" />

      {/* Content */}
      <textarea
        value={content}
        onChange={e => { setContent(e.target.value); save({ title, content: e.target.value }) }}
        placeholder="Beginne zu schreiben…"
        className="flex-1 mx-8 mb-8 text-sm text-[var(--text)] bg-transparent border-none focus:outline-none resize-none placeholder:text-[var(--text2)]/30 leading-loose"
      />
    </div>
  )
}

// ── Main pane ────────────────────────────────────────────────────────────────

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
          <span className="text-[10px] font-semibold text-[var(--text2)] uppercase tracking-wider">Mappen</span>
          <button
            onClick={createBook}
            className="w-5 h-5 rounded flex items-center justify-center text-[var(--text2)] hover:text-primary hover:bg-white/6 transition-colors text-lg leading-none"
          >+</button>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
          {books.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-[var(--text2)]/40">Noch keine Mappen</p>
              <button onClick={createBook} className="mt-2 text-xs text-primary hover:underline">+ Erstellen</button>
            </div>
          )}
          {books.map(book => {
            const count = entries.filter(e => e.bookId === book.id).length
            const isActive = activeBookId === book.id
            return (
              <div
                key={book.id}
                onClick={() => { setActiveBookId(book.id); setActiveEntryId(null) }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors mb-0.5
                  ${isActive ? 'bg-primary/10' : 'hover:bg-white/5'}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={isActive ? 'text-primary' : 'text-[var(--text2)]'}>
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
                    className="flex-1 min-w-0 text-xs bg-transparent focus:outline-none text-[var(--text)] border-b border-primary"
                  />
                ) : (
                  <span
                    onDoubleClick={() => setEditingBookId(book.id)}
                    className={`flex-1 min-w-0 text-xs font-medium truncate ${isActive ? 'text-primary' : 'text-[var(--text2)]'}`}
                  >
                    {book.name}
                  </span>
                )}

                <span className={`text-[10px] flex-shrink-0 ${isActive ? 'text-primary/60' : 'text-[var(--text2)]/40'}`}>{count}</span>

                <button
                  onClick={e => { e.stopPropagation(); handleRemoveBook(book.id) }}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 transition-opacity text-xs flex-shrink-0"
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
              <span className="text-xs font-semibold text-[var(--text)] truncate">{activeBook.name}</span>
              <button
                onClick={createEntry}
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--text2)] hover:text-primary hover:bg-white/6 transition-colors text-lg leading-none flex-shrink-0"
              >+</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {bookEntries.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-[var(--text2)]/40">Keine Notizen in dieser Mappe</p>
                  <button onClick={createEntry} className="mt-2 text-xs text-primary hover:underline">+ Neue Notiz</button>
                </div>
              )}
              {bookEntries.map(entry => {
                const isActive = activeEntryId === entry.id
                return (
                  <div
                    key={entry.id}
                    onClick={() => setActiveEntryId(entry.id)}
                    className={`px-4 py-3 cursor-pointer border-b border-[var(--border)]/40 transition-colors border-l-2
                      ${isActive ? 'border-l-primary' : 'border-l-transparent hover:bg-white/4'}`}
                  >
                    <p className={`text-xs font-semibold truncate ${isActive ? 'text-primary' : 'text-[var(--text)]'}`}>
                      {entry.title || 'Unbenannte Notiz'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--text2)]/40 flex-shrink-0">{formatDate(entry.updatedAt)}</span>
                      <p className="text-[10px] text-[var(--text2)]/50 truncate">
                        {entry.content ? entry.content.replace(/\n/g, ' ').slice(0, 50) : 'Leer'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-[var(--text2)]/40">Mappe auswählen</p>
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
              className="text-[var(--text2)]/20 mx-auto mb-3">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
            <p className="text-sm text-[var(--text2)]/40">
              {activeBook ? 'Notiz auswählen oder neue erstellen' : 'Mappe auswählen'}
            </p>
            {activeBook && (
              <button onClick={createEntry} className="mt-3 text-xs text-primary hover:underline">
                + Neue Notiz
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
