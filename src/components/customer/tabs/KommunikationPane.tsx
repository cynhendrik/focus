import { useState } from 'react'
import { useNotesStore } from '@/store/notes.store'
import type { NoteType } from '@/types/note.types'

const NOTE_TYPES: { id: NoteType; label: string; icon: string }[] = [
  { id: 'gespraech',       label: 'Gespräch',        icon: '💬' },
  { id: 'meeting',         label: 'Meeting',          icon: '📅' },
  { id: 'telefon',         label: 'Telefon',          icon: '📞' },
  { id: 'zusammenfassung', label: 'Zusammenfassung',  icon: '📄' },
  { id: 'nachricht',       label: 'Nachricht',        icon: '✉️' },
]

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

interface Props { customerId: string }

export function KommunikationPane({ customerId }: Props) {
  const notes      = useNotesStore(s => s.notes)
  const upsertNote = useNotesStore(s => s.upsert)
  const removeNote = useNotesStore(s => s.remove)

  const [filter, setFilter]       = useState<NoteType | 'alle'>('alle')
  const [expandedId, setExpanded] = useState<string | null>(null)
  const [newTitle, setNewTitle]   = useState('')
  const [newType, setNewType]     = useState<NoteType>('gespraech')
  const [showNew, setShowNew]     = useState(false)

  const filtered = filter === 'alle' ? notes : notes.filter(n => n.noteType === filter)

  const createNote = async () => {
    if (!newTitle.trim()) return
    await upsertNote({ customerId, title: newTitle.trim(), noteType: newType, content: '' })
    setNewTitle('')
    setShowNew(false)
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-3xl">
      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('alle')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
            ${filter === 'alle' ? 'bg-primary text-white' : 'bg-[var(--bg1)] text-[var(--text2)] border border-[var(--border)] hover:text-[var(--text)]'}`}
        >
          Alle
        </button>
        {NOTE_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
              ${filter === t.id ? 'bg-primary text-white' : 'bg-[var(--bg1)] text-[var(--text2)] border border-[var(--border)] hover:text-[var(--text)]'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <button
          onClick={() => setShowNew(true)}
          className="ml-auto text-xs px-3 py-1.5 rounded-full bg-primary text-white font-medium hover:bg-primary-dark"
        >
          + Neue Notiz
        </button>
      </div>

      {/* New note form */}
      {showNew && (
        <div className="p-4 rounded-xl border border-primary/30 bg-[var(--bg1)] flex flex-col gap-3">
          <div className="flex gap-2">
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as NoteType)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none"
            >
              {NOTE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </select>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createNote()}
              placeholder="Titel…"
              className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNew(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text2)]">Abbrechen</button>
            <button onClick={createNote} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark">Erstellen</button>
          </div>
        </div>
      )}

      {/* Note list */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="text-sm text-[var(--text2)] text-center py-12">Keine Einträge</p>
        )}
        {filtered.map(note => {
          const typeInfo = NOTE_TYPES.find(t => t.id === note.noteType)
          const expanded = expandedId === note.id

          return (
            <div key={note.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpanded(expanded ? null : note.id)}
              >
                <span className="text-base flex-shrink-0">{typeInfo?.icon}</span>
                <span className="flex-1 text-sm font-medium text-[var(--text)] truncate">{note.title}</span>
                {note.waitingReply && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
                    Warten auf Antwort
                  </span>
                )}
                <span className="text-xs text-[var(--text2)] flex-shrink-0">{relativeTime(note.createdAt)}</span>
                <button
                  onClick={e => { e.stopPropagation(); removeNote(note.id) }}
                  className="text-[var(--text2)] hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              </div>

              {expanded && (
                <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 flex flex-col gap-3">
                  <textarea
                    defaultValue={note.content}
                    onBlur={e => upsertNote({ ...note, content: e.target.value })}
                    placeholder="Inhalt…"
                    rows={5}
                    className="w-full text-sm text-[var(--text)] bg-[var(--bg)] rounded-lg px-3 py-2 border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <label className="flex items-center gap-2 text-xs text-[var(--text2)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={note.waitingReply}
                      onChange={() => upsertNote({ ...note, waitingReply: !note.waitingReply })}
                      className="accent-amber-400"
                    />
                    Warten auf Antwort
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
