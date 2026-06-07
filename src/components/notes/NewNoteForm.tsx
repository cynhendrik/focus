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
  const [title,     setTitle]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Was wurde besprochen? Was ist wichtig?…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13px; line-height:1.7; color:var(--fg); min-height:80px; font-family:inherit;',
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

  const content    = editor?.getHTML() ?? ''
  const hasContent = content.replace(/<[^>]*>/g, '').trim().length > 0

  const handleSave = async () => {
    if (!hasContent) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(title.trim() || null, content)
    } catch (err) {
      setSaveError(String(err))
    } finally {
      setSaving(false)
    }
  }

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
        borderRadius: 8, padding: '8px 10px', marginBottom: 10,
      }}>
        <EditorContent editor={editor} />
      </div>

      {saveError && (
        <div style={{
          marginBottom: 8, padding: '6px 10px', borderRadius: 7,
          background: 'oklch(72% 0.18 25 / 0.12)', color: 'var(--danger)',
          fontSize: 11, border: '1px solid oklch(72% 0.18 25 / 0.3)',
        }}>
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasContent}
          className={saving || !hasContent ? undefined : 'btn-primary'}
          style={saving || !hasContent ? {
            padding: '6px 14px', borderRadius: 99, border: 'none',
            background: 'var(--surface-2)', color: 'var(--fg-dim)',
            fontSize: 12, fontWeight: 600, cursor: 'not-allowed', fontFamily: 'inherit',
          } : { fontSize: 12, padding: '6px 14px' }}
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
