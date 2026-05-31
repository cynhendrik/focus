// ─────────────────────────────────────────────────────────────────────────────
// JournalRoute — Herzstueck des "Mein Raum"-Modus.
// Linke Spalte: nach Datum gruppierte Eintragsliste (Heute, Gestern, Wochentag,
// Datum). Rechte Spalte: TipTap-Editor fuer den ausgewaehlten Eintrag.
// Title + Body separat speichern, Auto-Save beim Tippen (debounced via TipTap-
// onUpdate, das wir bereits in TaskComposer fuer Inline-Eingaben nutzen).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Plus, Trash2, BookOpen } from 'lucide-react'

import {
  useJournalStore, groupEntriesByDate, relativeDateLabel,
  type JournalEntry,
} from '@/store/journal.store'

// ── Linke Spalte: Eintrags-Liste ───────────────────────────────────────────

function EntryRow({
  entry, active, onClick,
}: {
  entry:  JournalEntry
  active: boolean
  onClick: () => void
}) {
  // Preview = erste Zeile des Bodies ohne HTML-Tags (TipTap liefert HTML).
  const preview = useMemo(() => {
    const stripped = entry.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return stripped.slice(0, 90) || '—'
  }, [entry.body])

  const updated = new Date(entry.updatedAt).toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        width: '100%', textAlign: 'left',
        padding: '12px 14px', borderRadius: 10,
        background: active ? 'var(--surface)' : 'transparent',
        border: `1px solid ${active ? 'oklch(100% 0 0 / 0.18)' : 'var(--border)'}`,
        cursor: 'pointer', color: 'var(--fg)', fontFamily: 'inherit',
        transition: 'border-color 140ms, background 140ms',
      }}
      onMouseEnter={e => {
        if (!active) e.currentTarget.style.borderColor = 'oklch(100% 0 0 / 0.12)'
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {entry.title || 'Ohne Titel'}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--fg-dim)', flexShrink: 0,
        }}>
          {updated}
        </span>
      </div>
      <span style={{
        fontSize: 11.5, color: 'var(--fg-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {preview}
      </span>
    </button>
  )
}

function DateGroupHeader({ date }: { date: string }) {
  return (
    <div style={{
      padding: '14px 4px 6px',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: 'var(--fg-dim)', fontWeight: 600,
    }}>
      {relativeDateLabel(date)}
    </div>
  )
}

// ── Rechte Spalte: Editor ──────────────────────────────────────────────────

function EntryEditor({ entry }: { entry: JournalEntry }) {
  const update = useJournalStore(s => s.update)
  const remove = useJournalStore(s => s.remove)
  const titleRef = useRef<HTMLInputElement | null>(null)

  // Wenn der ausgewaehlte Eintrag wechselt, Title-Feld neu setzen.
  // Body uebernimmt das TipTap-editor.setContent direkt.
  useEffect(() => {
    if (titleRef.current) titleRef.current.value = entry.title
  }, [entry.id])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: 'Heute habe ich gemerkt …' }),
    ],
    content: entry.body || '',
    onUpdate: ({ editor }) => {
      update(entry.id, { body: editor.getHTML() })
    },
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 100%; font-size: 14px; line-height: 1.65; color: var(--fg);',
      },
    },
  }, [entry.id])

  // Body bei Eintrags-Wechsel neu in den Editor schieben.
  // emitUpdate:false verhindert eine Endlos-Loop (onUpdate -> update -> render).
  useEffect(() => {
    if (editor && editor.getHTML() !== entry.body) {
      editor.commands.setContent(entry.body || '', { emitUpdate: false })
    }
  }, [entry.id, editor])

  const dateLabel = relativeDateLabel(entry.date)
  const fullDate  = new Date(entry.date + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '20px 28px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--fg-dim)', fontWeight: 600, marginBottom: 4,
          }}>
            {dateLabel}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{fullDate}</div>
        </div>
        <button
          onClick={() => remove(entry.id)}
          title="Eintrag loeschen"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--fg-muted)', cursor: 'pointer',
            fontSize: 11, fontFamily: 'inherit',
            transition: 'background 140ms, color 140ms, border-color 140ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'oklch(72% 0.20 25 / 0.45)'
            e.currentTarget.style.color = 'oklch(72% 0.20 25)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--fg-muted)'
          }}
        >
          <Trash2 size={12} /> Loeschen
        </button>
      </div>

      {/* Title */}
      <div style={{ padding: '16px 28px 4px', flexShrink: 0 }}>
        <input
          ref={titleRef}
          defaultValue={entry.title}
          onChange={e => update(entry.id, { title: e.target.value })}
          placeholder="Titel …"
          style={{
            width: '100%', border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--fg)',
            fontSize: 22, fontWeight: 700, fontFamily: 'inherit',
            padding: 0,
          }}
        />
      </div>

      {/* Editor */}
      <div style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        padding: '6px 28px 32px',
      }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// ── Empty-State ───────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 14, height: '100%', padding: 40, color: 'var(--fg-muted)',
    }}>
      <BookOpen size={36} style={{ opacity: 0.4 }} />
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
          Noch keine Eintraege
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          Schreib auf, was du heute gemerkt hast. Beobachtungen, halbfertige Gedanken,
          was lief — kein Format-Zwang.
        </div>
      </div>
      <button
        onClick={onCreate}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 10,
          background: 'var(--accent)', color: 'var(--accent-ink)',
          border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
        }}
      >
        <Plus size={14} /> Eintrag anlegen
      </button>
    </div>
  )
}

// ── Route ────────────────────────────────────────────────────────────────

export function JournalRoute() {
  const entries     = useJournalStore(s => s.entries)
  const selectedId  = useJournalStore(s => s.selectedId)
  const create      = useJournalStore(s => s.create)
  const setSelected = useJournalStore(s => s.setSelected)

  const grouped = useMemo(() => groupEntriesByDate(entries), [entries])
  const selected = useMemo(
    () => entries.find(e => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  // Wenn nichts ausgewaehlt aber Eintraege vorhanden — den neuesten zeigen.
  useEffect(() => {
    if (!selectedId && entries.length > 0) {
      setSelected(entries[0].id)
    }
  }, [selectedId, entries, setSelected])

  return (
    <div className="main-inner" style={{
      display: 'grid', gridTemplateColumns: '320px 1fr',
      height: '100%', overflow: 'hidden', padding: 0,
    }}>
      {/* ── Linke Spalte ── */}
      <div style={{
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', minHeight: 0,
        background: 'var(--surface-2)',
      }}>
        <div style={{
          padding: '20px 18px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div className="greeting-title" style={{ fontSize: 22 }}>
              Journal<em>.</em>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--fg-dim)', fontWeight: 600, marginTop: 4,
            }}>
              {entries.length} {entries.length === 1 ? 'Eintrag' : 'Eintraege'}
            </div>
          </div>
          <button
            onClick={() => create()}
            title="Neuer Eintrag (heute)"
            style={{
              width: 30, height: 30, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent)', color: 'var(--accent-ink)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <Plus size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 24px' }}>
          {grouped.length === 0 && (
            <div style={{
              padding: '24px 8px', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5,
            }}>
              Tipp den + oben und leg los.
            </div>
          )}
          {grouped.map(group => (
            <div key={group.date}>
              <DateGroupHeader date={group.date} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.entries.map(e => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    active={e.id === selectedId}
                    onClick={() => setSelected(e.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Rechte Spalte ── */}
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        {selected
          ? <EntryEditor entry={selected} />
          : <EmptyState onCreate={() => create()} />
        }
      </div>
    </div>
  )
}
