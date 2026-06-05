import { useEffect, useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { X, Trash2 } from 'lucide-react'
import type { NoteDoc } from '@/types/notes-module.types'

interface Props {
  doc:       NoteDoc | null   // null = new document
  accountId: string
  onSave:    (title: string, content: string) => Promise<void>
  onDelete:  (() => Promise<void>) | null
  onClose:   () => void
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function NoteDocModal({ doc, onSave, onDelete, onClose }: Props) {
  const [title, setTitle]   = useState(doc?.title ?? '')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Dokumentinhalt…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13.5px; line-height:1.75; color:var(--fg); font-family:inherit; min-height:200px;',
      },
    },
    content: doc?.content ?? '',
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        if (doc) onSave(title, editor.getHTML()).catch(() => {})
      }, 800)
    },
  }, [doc?.id])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try { await onSave(title, editor?.getHTML() ?? '') }
    finally { setSaving(false); onClose() }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    await onDelete()
    onClose()
  }

  type ToolbarEntry = [string, () => void, React.CSSProperties]

  const toolbarItems: ToolbarEntry[] = [
    ['B', () => editor?.chain().focus().toggleBold().run(), { fontWeight: 700 }],
    ['I', () => editor?.chain().focus().toggleItalic().run(), { fontStyle: 'italic' }],
    ['H1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), { fontWeight: 700, fontSize: 10 }],
    ['H2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), { fontWeight: 700, fontSize: 10 }],
    ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
    ['1.', () => editor?.chain().focus().toggleOrderedList().run(), {}],
    ['☐', () => editor?.chain().focus().toggleTaskList().run(), {}],
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: '85vh',
          background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16, display: 'flex', flexDirection: 'column',
          boxShadow: '0 40px 100px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Dokumenttitel…"
            autoFocus={!doc}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 15, fontWeight: 700, color: 'var(--fg)',
              outline: 'none', fontFamily: 'inherit', letterSpacing: '-0.02em',
            }}
          />
          {onDelete && (
            <button
              onClick={handleDelete}
              style={{
                width: 28, height: 28, borderRadius: 7, border: 'none',
                background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><Trash2 size={13} /></button>
          )}
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7, border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><X size={14} /></button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '7px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', gap: 2, flexShrink: 0,
        }}>
          {toolbarItems.map(([label, action, style]) => (
            <button
              key={label}
              onMouseDown={e => { e.preventDefault(); action() }}
              style={{
                padding: '3px 8px', borderRadius: 5, border: 'none',
                background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', transition: 'all 120ms',
                ...style,
              }}
            >{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '18px 22px', overflowY: 'auto' }}>
          <EditorContent editor={editor} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '11px 18px', borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {doc ? `📌 Angeheftet · zuletzt ${fmtDate(doc.updatedAt)}` : 'Neues Dokument'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '5px 12px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.04)', color: 'var(--fg-muted)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Schließen</button>
            {!doc && (
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: !title.trim() ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
                  color: !title.trim() ? 'var(--fg-dim)' : 'var(--accent-ink)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{saving ? 'Erstellen…' : 'Erstellen'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
