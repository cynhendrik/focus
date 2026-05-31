// ─────────────────────────────────────────────────────────────────────────────
// Private Notizen — Card-Grid (Pinterest-Style) mit Edit-Modal.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef } from 'react'
import { FileText, Plus, X, Trash2, Pencil } from 'lucide-react'
import {
  usePrivateNotesStore,
  type PrivateNote,
} from '@/store/private-notes.store'

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function PrivateNotesRoute() {
  const notes      = usePrivateNotesStore(s => s.notes)
  const create     = usePrivateNotesStore(s => s.create)
  const selectedId = usePrivateNotesStore(s => s.selectedId)
  const setSelected = usePrivateNotesStore(s => s.setSelected)

  const selected = useMemo(
    () => notes.find(n => n.id === selectedId) ?? null,
    [notes, selectedId],
  )

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div className="priv-section-label">
        <FileText size={11} /> Private Notizen
      </div>

      <h1 className="priv-title">
        Gedanken, <span className="muted">die bleiben.</span>
      </h1>
      <p className="priv-subtitle">
        Persönliche Notizen — getrennt von allem Beruflichen. Niemand sonst sieht sie.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 14,
      }}>
        {/* New-Note Card */}
        <button
          onClick={() => create()}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, minHeight: 168,
            background: 'transparent', border: '1px dashed var(--priv-border)',
            borderRadius: 14, cursor: 'pointer', color: 'var(--priv-fg-dim)',
            fontFamily: 'inherit', fontSize: 12,
            transition: 'border-color 140ms, color 140ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--priv-accent)'
            e.currentTarget.style.color = 'var(--priv-accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--priv-border)'
            e.currentTarget.style.color = 'var(--priv-fg-dim)'
          }}
        >
          <Plus size={20} />
          <span>Neue Notiz</span>
        </button>

        {notes.map(n => (
          <NoteCard key={n.id} note={n} onClick={() => setSelected(n.id)} />
        ))}
      </div>

      {selected && (
        <NoteEditorModal note={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

// ── NoteCard ────────────────────────────────────────────────────────────────

function NoteCard({ note, onClick }: { note: PrivateNote; onClick: () => void }) {
  const preview = useMemo(() => stripHtml(note.body).slice(0, 220), [note.body])
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        minHeight: 168, padding: 18,
        background: 'var(--priv-surface)',
        border: `1px solid ${hover ? 'oklch(100% 0 0 / 0.18)' : 'var(--priv-border)'}`,
        borderRadius: 14, cursor: 'pointer',
        color: 'var(--priv-fg)', fontFamily: 'inherit', textAlign: 'left',
        transition: 'border-color 140ms',
      }}
    >
      <div style={{
        fontSize: 15, fontWeight: 700, lineHeight: 1.25,
        color: 'var(--priv-fg)', letterSpacing: '-0.01em',
      }}>
        {note.title || 'Ohne Titel'}
      </div>
      <div style={{
        flex: 1, fontSize: 12, lineHeight: 1.55,
        color: 'var(--priv-fg-muted)',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 5, WebkitBoxOrient: 'vertical',
      }}>
        {preview || 'Leer'}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--priv-fg-dim)', letterSpacing: '0.05em',
      }}>
        <span>{fmtDate(note.updatedAt)}</span>
        <Pencil size={11} style={{ opacity: hover ? 0.7 : 0 }} />
      </div>
    </button>
  )
}

// ── Editor-Modal ────────────────────────────────────────────────────────────

function NoteEditorModal({ note, onClose }: { note: PrivateNote; onClose: () => void }) {
  const update = usePrivateNotesStore(s => s.update)
  const remove = usePrivateNotesStore(s => s.remove)
  const [title, setTitle] = useState(note.title)
  const [body, setBody]   = useState(note.body)
  const titleRef = useRef<HTMLInputElement | null>(null)

  // Bei Eintragswechsel die lokalen Werte synchronisieren.
  useEffect(() => {
    setTitle(note.title)
    setBody(note.body)
  }, [note.id])

  // Auto-Save: debounce ueber simple setTimeout.
  useEffect(() => {
    const t = setTimeout(() => {
      update(note.id, { title, body })
    }, 350)
    return () => clearTimeout(t)
  }, [title, body, note.id, update])

  // Esc schliesst (auch wenn der ESC-Handler in PrivateShell normalerweise
  // den Privatmodus verlaesst — hier stoppen wir das Event vorher).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'oklch(0% 0 0 / 0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: '85vh',
          background: 'var(--priv-bg-2)',
          border: '1px solid var(--priv-border)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 30px 80px oklch(0% 0 0 / 0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--priv-border)',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--priv-fg-dim)', fontWeight: 600,
          }}>
            Notiz · {fmtDate(note.updatedAt)}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { remove(note.id); onClose() }}
              title="Loeschen"
              style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--priv-fg-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'oklch(72% 0.18 25)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--priv-fg-dim)' }}
            >
              <Trash2 size={13} />
            </button>
            <button
              onClick={onClose}
              title="Schliessen"
              style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--priv-fg-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Title */}
        <div style={{ padding: '18px 22px 6px' }}>
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Titel …"
            autoFocus={!note.title}
            style={{
              width: '100%', border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--priv-fg)',
              fontSize: 22, fontWeight: 700, fontFamily: 'inherit',
              padding: 0,
            }}
          />
        </div>

        {/* Body */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Schreib was dir bleibt …"
          style={{
            flex: 1, padding: '8px 22px 22px',
            border: 'none', outline: 'none', resize: 'none',
            background: 'transparent', color: 'var(--priv-fg)',
            fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6,
            minHeight: 280,
          }}
        />
      </div>
    </div>
  )
}
