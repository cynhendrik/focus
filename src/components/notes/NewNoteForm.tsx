import { useState, useEffect } from 'react'
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
  const [title, setTitle]   = useState('')
  const [saving, setSaving] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Was wurde besprochen? Was ist wichtig?…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13px; line-height:1.7; color:var(--fg); min-height:70px; font-family:inherit;',
      },
    },
    autofocus: true,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onCancel])

  const handleSave = async () => {
    const content = editor?.getHTML() ?? ''
    if (!content || editor?.isEmpty) return
    setSaving(true)
    try {
      await onSave(title.trim() || null, content)
    } finally {
      setSaving(false)
    }
  }

  type ToolbarItem = [string, () => void, React.CSSProperties]

  const toolbarItems: ToolbarItem[] = [
    ['B', () => editor?.chain().focus().toggleBold().run(), { fontWeight: 700 }],
    ['I', () => editor?.chain().focus().toggleItalic().run(), { fontStyle: 'italic' }],
    ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
    ['☐', () => editor?.chain().focus().toggleTaskList().run(), {}],
  ]

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid rgba(181,240,35,0.25)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      boxShadow: '0 0 0 3px rgba(181,240,35,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(181,240,35,0.12)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>HW</div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titel (optional)…"
          style={{
            flex: 1, border: 'none', background: 'transparent',
            fontSize: 13, fontWeight: 600, color: 'var(--fg)',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {toolbarItems.map(([label, action, style]) => (
          <button
            key={label}
            onMouseDown={e => { e.preventDefault(); action() }}
            style={{
              padding: '2px 7px', borderRadius: 5, border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
              fontSize: 11, fontFamily: 'inherit',
              ...style,
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, padding: '10px 12px',
      }}>
        <EditorContent editor={editor} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.04)', color: 'var(--fg-muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Abbrechen</button>
        <button
          onClick={handleSave}
          disabled={saving || !editor || editor.isEmpty}
          style={{
            padding: '5px 14px', borderRadius: 8, border: 'none',
            background: saving || !editor || editor.isEmpty ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
            color: saving || !editor || editor.isEmpty ? 'var(--fg-dim)' : 'var(--accent-ink)',
            fontSize: 11, fontWeight: 700,
            cursor: saving || !editor || editor.isEmpty ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </div>
  )
}
