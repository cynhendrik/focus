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
  const [hover,       setHover]       = useState(false)
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

  const preview = stripHtml(entry.content).slice(0, 160)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 10,
        background: expanded ? 'var(--surface)' : hover ? 'var(--surface)' : 'transparent',
        border: expanded ? '1px solid var(--border)' : `1px solid ${hover ? 'var(--border)' : 'transparent'}`,
        marginBottom: 2,
        transition: 'background 140ms, border-color 140ms',
      }}
    >
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: entry.title ? 600 : 400,
            color: entry.title ? 'var(--fg)' : 'var(--fg-muted)',
            fontStyle: entry.title ? 'normal' : 'italic',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {entry.title || 'Ohne Titel'}
          </div>

          {!expanded && preview && (
            <div style={{
              fontSize: 12, color: 'var(--fg-muted)', marginTop: 2,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
              lineHeight: 1.5,
            }}>
              {preview}
            </div>
          )}

          {(entry.tags.length > 0) && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {entry.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
                  background: 'var(--accent-soft)', color: 'var(--accent-text)',
                  padding: '1px 6px', borderRadius: 99,
                }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {fmtTime(entry.createdAt)}
          </span>

          {(hover || expanded) && (
            <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
              {folders.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowFolders(s => !s)}
                    title="In Mappe verschieben"
                    style={iconBtn(showFolders)}
                  ><FolderInput size={12} /></button>
                  {showFolders && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: 4, minWidth: 160,
                      boxShadow: 'var(--shadow-2)', zIndex: 50,
                    }}>
                      <FolderDropItem label="Kein Ordner" active={entry.folderId === null}
                        onClick={() => { onMoveToFolder(null); setShowFolders(false) }} />
                      {folders.map(f => (
                        <FolderDropItem key={f.id} label={f.name} active={entry.folderId === f.id}
                          onClick={() => { onMoveToFolder(f.id); setShowFolders(false) }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => setShowTags(s => !s)} title="Tags" style={iconBtn(showTags)}>
                <span style={{ fontSize: 10, fontWeight: 700 }}>#</span>
              </button>
              <button onClick={onDelete} title="Löschen" style={iconBtn(false)}>
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tag picker */}
      {expanded && showTags && (
        <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {AVAILABLE_TAGS.map(tag => (
            <button key={tag} onClick={() => toggleTag(tag)} style={{
              padding: '3px 9px', borderRadius: 99, cursor: 'pointer', border: '1px solid',
              borderColor: entry.tags.includes(tag) ? 'var(--accent)' : 'var(--border)',
              background: entry.tags.includes(tag) ? 'var(--accent-soft)' : 'transparent',
              color: entry.tags.includes(tag) ? 'var(--accent-text)' : 'var(--fg-muted)',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit', transition: 'all 140ms',
            }}>{tag}</button>
          ))}
        </div>
      )}

      {/* Editor (expanded) */}
      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); saveTitle(e.target.value) }}
            placeholder="Titel (optional)…"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'block', width: '100%', border: 'none', background: 'transparent',
              fontSize: 13.5, fontWeight: 700, color: 'var(--fg)', outline: 'none',
              fontFamily: 'inherit', marginBottom: 6,
            }}
          />
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {([
              ['B', () => editor?.chain().focus().toggleBold().run(),    { fontWeight: 700 }],
              ['I', () => editor?.chain().focus().toggleItalic().run(),  { fontStyle: 'italic' }],
              ['H1',() => editor?.chain().focus().toggleHeading({ level: 1 }).run(), { fontWeight: 700, fontSize: 10 }],
              ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
              ['☐', () => editor?.chain().focus().toggleTaskList().run(), {}],
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
            borderRadius: 8, padding: '10px 12px',
          }}>
            <EditorContent editor={editor} className="tt-editor" />
          </div>
        </div>
      )}
    </div>
  )
}

function iconBtn(active: boolean): React.CSSProperties {
  return {
    width: 24, height: 24, borderRadius: 6, border: 'none',
    background: active ? 'var(--surface-2)' : 'transparent',
    color: active ? 'var(--fg)' : 'var(--fg-dim)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 120ms, color 120ms',
  }
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
        fontSize: 12.5, color: active ? 'var(--accent-text)' : 'var(--fg-2)',
        fontFamily: 'inherit', transition: 'background 80ms',
      }}
    >
      {label}
    </button>
  )
}
