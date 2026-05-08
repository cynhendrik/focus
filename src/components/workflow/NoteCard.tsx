import type { Note } from '@/types/note.types'

interface Props {
  note: Note
  onDelete: (id: string) => void
  onEdit: (note: Note) => void
}

export function NoteCard({ note, onDelete, onEdit }: Props) {
  return (
    <div
      className="p-3 rounded-lg bg-[var(--bg1)] cursor-pointer hover:ring-1 hover:ring-primary/30 group relative"
      onClick={() => onEdit(note)}
    >
      {note.pinned && (
        <span className="text-xs text-primary font-medium">📌 </span>
      )}
      <p className="text-sm font-medium text-[var(--text)] truncate">{note.title}</p>
      {note.content && (
        <p className="text-xs text-[var(--text2)] mt-1 line-clamp-2">{note.content}</p>
      )}
      <button
        onClick={e => { e.stopPropagation(); onDelete(note.id) }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs"
      >
        ✕
      </button>
    </div>
  )
}
