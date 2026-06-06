import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Trash2, FolderInput } from 'lucide-react'
import type { NoteEntry, NoteFolder } from '@/types/notes-module.types'

interface Props {
  entry:          NoteEntry
  folders:        NoteFolder[]
  onUpdate:       (patch: { title?: string | null; content?: string; tags?: string }) => void
  onDelete:       () => void
  onMoveToFolder: (folderId: string | null) => void
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 86_400_000) return d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
  if (diff < 7 * 86_400_000) return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()]
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

const AVAILABLE_TAGS = ['Follow-up', 'Erstgespräch', 'Recherche', 'Angebot', 'Wichtig']

export function NoteCard({ entry, folders, onUpdate, onDelete, onMoveToFolder }: Props) {
  const [expanded,    setExpanded]    = useState(false)
  const [title,       setTitle]       = useState(entry.title ?? '')
  const [showTags,    setShowTags]    = useState(false)
  const [showFolders, setShowFolders] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Placeholder.configure({ placeholder: 'Notizinhalt…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13px; line-height:1.7; color:var(--fg); min-height:60px; font-family:inherit;',
      },
    },
    content: entry.content || '',
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onUpdate({ content: editor.getHTML() })
      }, 500)
    },
  }, [entry.id])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const saveTitle = useCallback((val: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onUpdate({ title: val || null }), 500)
  }, [onUpdate])

  const toggleTag = (tag: string) => {
    const next = entry.tags.includes(tag)
      ? entry.tags.filter(t => t !== tag)
      : [...entry.tags, tag]
    onUpdate({ tags: JSON.stringify(next) })
  }

  const preview = stripHtml(entry.content).slice(0, 140)

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${expanded ? 'rgba(181,240,35,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 12, marginBottom: 10,
      transition: 'border-color 160ms',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', cursor: 'pointer',
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(181,240,35,0.12)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>
          {entry.createdBy.slice(0, 2).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: entry.title ? 'var(--fg)' : 'var(--fg-dim)',
            fontStyle: entry.title ? 'normal' : 'italic',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {entry.title || 'Ohne Titel'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {fmtTime(entry.createdAt)}
            </span>
            {entry.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
                background: 'rgba(181,240,35,0.1)', color: 'var(--accent)',
                padding: '1px 6px', borderRadius: 99,
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {expanded && (
          <div style={{ display: 'flex', gap: 4, position: 'relative' }} onClick={e => e.stopPropagation()}>
            {folders.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFolders(s => !s)}
                  title="In Mappe verschieben"
                  style={{
                    width: 26, height: 26, borderRadius: 6, border: 'none',
                    background: showFolders ? 'rgba(181,240,35,0.1)' : 'transparent',
                    color: showFolders ? 'var(--accent)' : 'var(--fg-dim)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                ><FolderInput size={13} /></button>
                {showFolders && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: 4, minWidth: 160,
                    boxShadow: 'var(--shadow-2)', zIndex: 50,
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                    <FolderDropItem
                      label="Kein Ordner"
                      active={entry.folderId === null}
                      onClick={() => { onMoveToFolder(null); setShowFolders(false) }}
                    />
                    {folders.map(f => (
                      <FolderDropItem
                        key={f.id}
                        label={f.name}
                        active={entry.folderId === f.id}
                        onClick={() => { onMoveToFolder(f.id); setShowFolders(false) }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowTags(s => !s)}
              title="Tags"
              style={{
                width: 26, height: 26, borderRadius: 6, border: 'none',
                background: showTags ? 'rgba(181,240,35,0.1)' : 'transparent',
                color: showTags ? 'var(--accent)' : 'var(--fg-dim)',
                cursor: 'pointer', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >#</button>
            <button
              onClick={onDelete}
              title="Löschen"
              style={{
                width: 26, height: 26, borderRadius: 6, border: 'none',
                background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><Trash2 size={12} /></button>
          </div>
        )}
      </div>

      {/* Tag picker */}
      {expanded && showTags && (
        <div style={{ padding: '6px 14px 10px 52px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {AVAILABLE_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              style={{
                padding: '3px 9px', borderRadius: 99, cursor: 'pointer', border: '1px solid',
                borderColor: entry.tags.includes(tag) ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                background: entry.tags.includes(tag) ? 'rgba(181,240,35,0.1)' : 'transparent',
                color: entry.tags.includes(tag) ? 'var(--accent)' : 'var(--fg-dim)',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', transition: 'all 140ms',
              }}
            >{tag}</button>
          ))}
        </div>
      )}

      {/* Preview (collapsed) */}
      {!expanded && preview && (
        <div style={{
          padding: '0 14px 11px 52px', fontSize: 12.5,
          color: 'var(--fg-muted)', lineHeight: 1.6,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {preview}
        </div>
      )}

      {/* Editor (expanded) */}
      {expanded && (
        <div style={{ padding: '4px 14px 14px 52px' }}>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); saveTitle(e.target.value) }}
            placeholder="Titel (optional)…"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'block', width: '100%', border: 'none', background: 'transparent',
              fontSize: 14, fontWeight: 700, color: 'var(--fg)', outline: 'none',
              fontFamily: 'inherit', marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {([
              ['B', () => editor?.chain().focus().toggleBold().run(), { fontWeight: 700 }],
              ['I', () => editor?.chain().focus().toggleItalic().run(), { fontStyle: 'italic' }],
              ['H1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), { fontWeight: 700, fontSize: 10 }],
              ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
              ['☐', () => editor?.chain().focus().toggleTaskList().run(), {}],
            ] as const).map(([label, action, style]) => (
              <button
                key={label as string}
                onMouseDown={e => { e.preventDefault(); (action as () => void)() }}
                style={{
                  padding: '2px 7px', borderRadius: 5, border: 'none',
                  background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'inherit', transition: 'all 120ms',
                  ...(style as React.CSSProperties),
                }}
              >{label as string}</button>
            ))}
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      )}
    </div>
  )
}

function FolderDropItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderRadius: 7, width: '100%', textAlign: 'left',
        background: active ? 'var(--accent-soft)' : hover ? 'var(--surface-2)' : 'none',
        border: 'none', cursor: 'pointer',
        fontSize: 12.5, color: active ? 'var(--accent)' : 'var(--fg-2)',
        fontFamily: 'inherit', transition: 'background 80ms',
      }}
    >
      {label}
    </button>
  )
}
