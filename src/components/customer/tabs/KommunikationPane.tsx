import { useState } from 'react'
import { useNotesStore } from '@/store/notes.store'
import type { Note, NoteType } from '@/types/note.types'

// TODO: Wichtige Nachrichten automatisch aus E-Mails generieren
// Basierend auf Kundenprofil:
// - customer.email
// - customer.domain
// - customer.aliases
// E-Mail-Parser ordnet Nachrichten automatisch zu
// und schreibt sie in das Modul "Wichtige Nachrichten"

// ── Config ──────────────────────────────────────────────────────────────────

const MODULE_CONFIG = {
  gespraech: { label: 'Gesprächsnotizen',     accent: '#404040', cardBg: '#262626', onCard: '#FFFFFF' },
  meeting:   { label: 'Meeting-Protokolle',   accent: '#404040', cardBg: '#262626', onCard: '#FFFFFF' },
  telefon:   { label: 'Telefonnotizen',       accent: '#D0FC69', cardBg: '#262626', onCard: '#FFFFFF' },
  nachricht: { label: 'Wichtige Nachrichten', accent: '#D0FC69', cardBg: '#262626', onCard: '#FFFFFF' },
} as const

type ModuleKey = keyof typeof MODULE_CONFIG

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 60)   return `${mins}m ago`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24)  return `${hours}h ago`
  const days  = Math.floor(diff / 86400000)
  if (days === 1)  return 'Gestern'
  return `vor ${days} Tagen`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function parseParticipants(content: string): { participants: string[]; body: string } {
  const match = content.match(/^Teilnehmer:\s*(.+)\n?([\s\S]*)$/)
  if (match) return { participants: match[1].split(',').map(s => s.trim()).filter(Boolean), body: match[2].trim() }
  return { participants: [], body: content }
}

function contentPreview(content: string, lines = 2): string {
  return content.split('\n').slice(0, lines).join(' ').trim()
}

// ── Note Cards ───────────────────────────────────────────────────────────────

type CardProps = { note: Note; accent: string; cardBg: string; onCard: string; onClick: () => void }

function sub(onCard: string, opacity: number) {
  return onCard === '#FFFFFF'
    ? `rgba(255,255,255,${opacity})`
    : `rgba(17,17,17,${opacity})`
}

function GesprächCard({ note, accent, cardBg, onCard, onClick }: CardProps) {
  const preview = contentPreview(note.content, 2)
  return (
    <button onClick={onClick} className="w-full text-left" style={cardStyle(accent, cardBg)}>
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontSize: 14, fontWeight: 600, color: onCard, lineHeight: 1.3 }}>{note.title}</p>
        {note.waitingReply && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', flexShrink: 0 }}>
            Wartet
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: sub(onCard, 0.45), marginTop: 4 }}>
        {formatDate(note.createdAt)} · {formatTime(note.createdAt)}
      </p>
      {preview && (
        <p style={{ fontSize: 13, color: sub(onCard, 0.6), marginTop: 6, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {preview}
        </p>
      )}
    </button>
  )
}

function MeetingCard({ note, accent, cardBg, onCard, onClick }: CardProps) {
  const { participants, body } = parseParticipants(note.content)
  return (
    <button onClick={onClick} className="w-full text-left" style={cardStyle(accent, cardBg)}>
      <p style={{ fontSize: 14, fontWeight: 600, color: onCard, lineHeight: 1.3 }}>{note.title}</p>
      <p style={{ fontSize: 12, color: sub(onCard, 0.45), marginTop: 4 }}>{formatDate(note.createdAt)}</p>
      {participants.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {participants.map((p, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: `${accent}22`, color: accent, border: `1px solid ${accent}40` }}>
              {p}
            </span>
          ))}
        </div>
      )}
      {body && (
        <p style={{ fontSize: 13, color: sub(onCard, 0.6), marginTop: 8, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {body}
        </p>
      )}
    </button>
  )
}

function TelefonCard({ note, accent, cardBg, onCard, onClick }: CardProps) {
  const keyPoint = note.content.split('\n')[0]?.trim()
  return (
    <button onClick={onClick} className="w-full text-left" style={cardStyle(accent, cardBg)}>
      <p style={{ fontSize: 14, fontWeight: 600, color: onCard, lineHeight: 1.3 }}>{note.title}</p>
      <p style={{ fontSize: 12, color: sub(onCard, 0.45), marginTop: 4 }}>{formatTime(note.createdAt)} Uhr</p>
      {keyPoint && (
        <p style={{ fontSize: 13, color: sub(onCard, 0.6), marginTop: 6, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {keyPoint}
        </p>
      )}
    </button>
  )
}

function NachrichtCard({ note, accent, cardBg, onCard, onClick }: CardProps) {
  const preview = contentPreview(note.content, 1)
  return (
    <button onClick={onClick} className="w-full text-left" style={cardStyle(accent, cardBg)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: onCard, lineHeight: 1.3, flex: 1 }}>{note.title}</p>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, flexShrink: 0,
          background: `${accent}22`, color: accent, border: `1px solid ${accent}40` }}>
          {relativeTime(note.createdAt)}
        </span>
      </div>
      {preview && (
        <p style={{ fontSize: 13, color: sub(onCard, 0.6), marginTop: 6, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {preview}
        </p>
      )}
    </button>
  )
}

function cardStyle(accent: string, cardBg: string): React.CSSProperties {
  return {
    background: cardBg,
    borderRadius: 16,
    padding: 20,
    paddingLeft: 24,
    borderLeft: `4px solid ${accent}`,
    boxShadow: '0px 4px 12px rgba(0,0,0,0.10)',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  }
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ note, accent, onClose, onUpdate, onRemove }: {
  note: Note; accent: string
  onClose: () => void
  onUpdate: (n: Note) => void
  onRemove: (id: string) => void
}) {
  const [content, setContent] = useState(note.content)
  const isMeeting = note.noteType === 'meeting'
  const { participants, body } = parseParticipants(content)
  const [participantsText, setParticipantsText] = useState(participants.join(', '))

  const saveContent = () => {
    const merged = isMeeting && participantsText.trim()
      ? `Teilnehmer: ${participantsText.trim()}\n${body}`
      : content
    onUpdate({ ...note, content: merged })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={() => { saveContent(); onClose() }} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-white/8 p-6 pb-10 flex flex-col gap-4"
        style={{ background: '#1A1A1A', animation: 'focusSlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both',
          borderLeft: `4px solid ${accent}` }}>
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto -mt-1 mb-2" />

        <div className="flex items-center gap-3">
          <h3 className="flex-1 text-base font-bold text-white">{note.title}</h3>
          <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer">
            <input type="checkbox" checked={note.waitingReply}
              onChange={() => onUpdate({ ...note, waitingReply: !note.waitingReply })}
              className="accent-amber-400" />
            Wartet auf Antwort
          </label>
          <button onClick={() => { onRemove(note.id); onClose() }}
            className="text-xs px-3 py-1.5 rounded-full bg-red-500/10 text-red-400">
            Löschen
          </button>
          <button onClick={() => { saveContent(); onClose() }}
            className="w-7 h-7 rounded-full bg-white/10 text-white/50 text-sm flex items-center justify-center">
            ✕
          </button>
        </div>

        {isMeeting && (
          <div>
            <p className="text-xs text-white/40 mb-1">Teilnehmer (kommagetrennt)</p>
            <input
              value={participantsText}
              onChange={e => setParticipantsText(e.target.value)}
              placeholder="Anna, Ben, Clara…"
              className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        <textarea
          value={isMeeting ? body : content}
          onChange={e => {
            if (isMeeting) {
              const merged = participantsText.trim()
                ? `Teilnehmer: ${participantsText}\n${e.target.value}`
                : e.target.value
              setContent(merged)
            } else {
              setContent(e.target.value)
            }
          }}
          onBlur={saveContent}
          placeholder="Inhalt…"
          rows={6}
          className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>
    </>
  )
}

// ── Add Note Form ─────────────────────────────────────────────────────────────

function AddNoteInline({ type, customerId, accent, onClose, onSave }: {
  type: NoteType; customerId: string; accent: string
  onClose: () => void
  onSave: (title: string, content: string) => void
}) {
  const [title, setTitle]   = useState('')
  const [extra, setExtra]   = useState('') // participants for meeting, key point for others

  const submit = () => {
    if (!title.trim()) return
    const content = type === 'meeting' && extra.trim()
      ? `Teilnehmer: ${extra.trim()}\n`
      : extra.trim()
    onSave(title.trim(), content)
  }

  return (
    <div style={{ background: '#1A1A1A', borderRadius: 16, padding: 16, borderLeft: `4px solid ${accent}`,
      boxShadow: '0px 4px 12px rgba(0,0,0,0.15)' }}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Titel…"
        className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary mb-2"
      />
      {type === 'meeting' && (
        <input
          value={extra}
          onChange={e => setExtra(e.target.value)}
          placeholder="Teilnehmer (kommagetrennt)…"
          className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary mb-2"
        />
      )}
      {type === 'telefon' && (
        <input
          value={extra}
          onChange={e => setExtra(e.target.value)}
          placeholder="Wichtigster Punkt…"
          className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary mb-2"
        />
      )}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg text-white/40 hover:text-white/70">
          Abbrechen
        </button>
        <button onClick={submit}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: accent, color: '#fff', fontWeight: 600 }}>
          Erstellen
        </button>
      </div>
    </div>
  )
}

// ── Module Section ────────────────────────────────────────────────────────────

function ModuleSection({ type, notes, customerId, onSelect, onSave }: {
  type: ModuleKey
  notes: Note[]
  customerId: string
  onSelect: (n: Note) => void
  onSave: (title: string, content: string, type: NoteType) => void
}) {
  const { label, accent, cardBg, onCard } = MODULE_CONFIG[type]
  const [adding, setAdding] = useState(false)

  const renderCard = (note: Note) => {
    const props = { note, accent, cardBg, onCard, onClick: () => onSelect(note) }
    if (type === 'gespraech') return <GesprächCard key={note.id} {...props} />
    if (type === 'meeting')   return <MeetingCard  key={note.id} {...props} />
    if (type === 'telefon')   return <TelefonCard  key={note.id} {...props} />
    return                           <NachrichtCard key={note.id} {...props} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 16, borderRadius: 99, background: accent }} />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>{label}</h2>
          {notes.length > 0 && (
            <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99,
              background: `${accent}20`, color: accent }}>
              {notes.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          style={{ fontSize: 18, lineHeight: 1, color: accent, fontWeight: 300, opacity: 0.8,
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
        >
          {adding ? '−' : '+'}
        </button>
      </div>

      {/* Add inline form */}
      {adding && (
        <AddNoteInline
          type={type}
          customerId={customerId}
          accent={accent}
          onClose={() => setAdding(false)}
          onSave={(title, content) => { onSave(title, content, type); setAdding(false) }}
        />
      )}

      {/* Cards */}
      {notes.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', padding: '8px 0' }}>Noch keine Einträge</p>
      )}
      {notes.map(renderCard)}
    </div>
  )
}

// ── Main Pane ─────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function KommunikationPane({ customerId }: Props) {
  const notes      = useNotesStore(s => s.notes)
  const upsertNote = useNotesStore(s => s.upsert)
  const removeNote = useNotesStore(s => s.remove)

  const [selected, setSelected] = useState<Note | null>(null)

  const byType = (type: NoteType) =>
    notes.filter(n => n.noteType === type).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const handleSave = async (title: string, content: string, noteType: NoteType) => {
    await upsertNote({ customerId, title, content, noteType })
  }

  const handleUpdate = async (n: Note) => {
    await upsertNote(n)
    setSelected(n)
  }

  return (
    <div style={{ background: 'var(--bg)', height: '100%', overflowY: 'auto', padding: '28px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 1100 }}>

        {/* Linke Spalte */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <ModuleSection type="gespraech" notes={byType('gespraech')} customerId={customerId}
            onSelect={setSelected} onSave={handleSave} />
          <ModuleSection type="telefon"   notes={byType('telefon')}   customerId={customerId}
            onSelect={setSelected} onSave={handleSave} />
        </div>

        {/* Rechte Spalte */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <ModuleSection type="meeting"   notes={byType('meeting')}   customerId={customerId}
            onSelect={setSelected} onSave={handleSave} />
          <ModuleSection type="nachricht" notes={byType('nachricht')} customerId={customerId}
            onSelect={setSelected} onSave={handleSave} />
        </div>
      </div>

      {selected && (
        <DetailPanel
          note={selected}
          accent={MODULE_CONFIG[selected.noteType as ModuleKey]?.accent ?? '#888'}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
          onRemove={id => { removeNote(id); setSelected(null) }}
        />
      )}
    </div>
  )
}
