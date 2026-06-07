import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

interface Props {
  onSave:   (title: string | null, content: string) => Promise<void>
  onCancel: () => void
}

export function NewNoteForm({ onSave, onCancel }: Props) {
  const [title,  setTitle]  = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')

  const titleRef   = useRef(title)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedRef   = useRef(false)

  useEffect(() => { titleRef.current = title }, [title])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Notiz tippen — wird automatisch gespeichert…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13px; line-height:1.7; color:var(--fg); min-height:80px; font-family:inherit;',
      },
    },
    autofocus: true,
    onUpdate({ editor }) {
      if (savedRef.current) return
      const content = editor.getHTML()
      const hasContent = content.replace(/<[^>]*>/g, '').trim().length > 0
      if (!hasContent) return

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        if (savedRef.current) return
        savedRef.current = true
        setStatus('saving')
        try {
          await onSave(titleRef.current.trim() || null, editor.getHTML())
          // onSave calls setShowForm(false) in parent — form closes
        } catch {
          savedRef.current = false
          setStatus('error')
        }
      }, 900)
    },
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [onCancel])

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
    }}>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Titel (optional)…"
        style={{
          display: 'block', width: '100%', border: 'none', background: 'transparent',
          fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', outline: 'none',
          fontFamily: 'inherit', marginBottom: 8,
        }}
      />

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {([
          ['B', () => editor?.chain().focus().toggleBold().run(),       { fontWeight: 700 }],
          ['I', () => editor?.chain().focus().toggleItalic().run(),     { fontStyle: 'italic' }],
          ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
          ['☐', () => editor?.chain().focus().toggleTaskList().run(),   {}],
        ] as const).map(([label, action, style]) => (
          <button
            key={label as string}
            onMouseDown={e => { e.preventDefault(); (action as () => void)() }}
            style={{
              padding: '2px 7px', borderRadius: 5, border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
              fontSize: 11, fontFamily: 'inherit',
              ...(style as React.CSSProperties),
            }}
          >{label as string}</button>
        ))}
      </div>

      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 10px',
      }}>
        <EditorContent editor={editor} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
          {status === 'saving' && 'Speichert…'}
          {status === 'error'  && <span style={{ color: 'var(--danger)' }}>Fehler beim Speichern</span>}
          {status === 'idle'   && 'Wird automatisch gespeichert'}
        </span>
        <button onClick={onCancel} className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
