import { useEffect, useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { TodoItem } from './TodoItem'
import { NoteCard } from './NoteCard'
import type { Note } from '@/types/note.types'

interface Props {
  customerId: string
}

export function WorkflowPane({ customerId }: Props) {
  const todos       = useTodosStore(s => s.todos)
  const loadTodos   = useTodosStore(s => s.loadForCustomer)
  const upsertTodo  = useTodosStore(s => s.upsert)
  const removeTodo  = useTodosStore(s => s.remove)
  const notes       = useNotesStore(s => s.notes)
  const loadNotes   = useNotesStore(s => s.loadForCustomer)
  const upsertNote  = useNotesStore(s => s.upsert)
  const removeNote  = useNotesStore(s => s.remove)

  const [newTodo, setNewTodo] = useState('')
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [editingNote, setEditingNote] = useState<Note | null>(null)

  useEffect(() => {
    loadTodos(customerId)
    loadNotes(customerId)
  }, [customerId])

  const addTodo = async () => {
    const title = newTodo.trim()
    if (!title) return
    await upsertTodo({ customerId, title })
    setNewTodo('')
  }

  const toggleTodo = (id: string, done: boolean) => {
    const todo = todos.find(t => t.id === id)
    if (!todo) return
    upsertTodo({ id, customerId, title: todo.title, status: done ? 'done' : 'open' })
  }

  const addNote = async () => {
    const title = newNoteTitle.trim()
    if (!title) return
    await upsertNote({ customerId, title })
    setNewNoteTitle('')
  }

  const saveNote = (note: Note) => {
    upsertNote({ id: note.id, customerId, title: note.title, content: note.content, pinned: note.pinned })
    setEditingNote(null)
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      {/* Todos */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Todos</h3>
        <div className="flex gap-2">
          <input
            value={newTodo}
            onChange={e => setNewTodo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo()}
            placeholder="Neues Todo…"
            className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] placeholder-[var(--text2)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={addTodo}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            +
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {todos.map(todo => (
            <TodoItem key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={removeTodo} />
          ))}
          {todos.length === 0 && (
            <p className="text-sm text-[var(--text2)] px-3 py-4 text-center">Keine Todos</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Notizen</h3>
        <div className="flex gap-2">
          <input
            value={newNoteTitle}
            onChange={e => setNewNoteTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNote()}
            placeholder="Neue Notiz…"
            className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] placeholder-[var(--text2)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={addNote}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            +
          </button>
        </div>
        {editingNote ? (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-[var(--bg1)]">
            <input
              value={editingNote.title}
              onChange={e => setEditingNote({ ...editingNote, title: e.target.value })}
              className="text-sm font-medium px-2 py-1 rounded bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={editingNote.content}
              onChange={e => setEditingNote({ ...editingNote, content: e.target.value })}
              rows={4}
              className="text-sm px-2 py-1 rounded bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => saveNote(editingNote)} className="px-3 py-1 text-xs rounded bg-primary text-white hover:bg-primary-dark">Speichern</button>
              <button onClick={() => setEditingNote(null)} className="px-3 py-1 text-xs rounded bg-[var(--bg)] text-[var(--text2)] hover:text-[var(--text)]">Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notes.map(note => (
              <NoteCard key={note.id} note={note} onDelete={removeNote} onEdit={setEditingNote} />
            ))}
            {notes.length === 0 && (
              <p className="text-sm text-[var(--text2)] px-3 py-4 text-center">Keine Notizen</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
