import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { useStore } from '../../store'
import { timeAgo } from '../../utils/helpers'

function renderMarkdown(md) {
  if (!md) return ''
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:12px 0 4px;color:var(--text)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:700;margin:14px 0 6px;color:var(--text)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:800;margin:16px 0 8px;color:var(--text)">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--p3);padding-left:12px;color:var(--text3);margin:8px 0">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="padding-left:20px;margin:8px 0">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
    .replace(/\n/g, '<br>')
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function GripHandle({ controls }) {
  return (
    <div
      onPointerDown={e => { e.preventDefault(); controls.start(e) }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 18, flexShrink: 0, cursor: 'grab', opacity: 0,
        transition: 'opacity 0.15s', paddingTop: 1,
      }}
      className="note-grip"
    >
      <svg width="9" height="13" viewBox="0 0 9 13" fill="var(--text3)">
        <circle cx="2.5" cy="2"  r="1.2"/>
        <circle cx="6.5" cy="2"  r="1.2"/>
        <circle cx="2.5" cy="6.5" r="1.2"/>
        <circle cx="6.5" cy="6.5" r="1.2"/>
        <circle cx="2.5" cy="11" r="1.2"/>
        <circle cx="6.5" cy="11" r="1.2"/>
      </svg>
    </div>
  )
}

// ── Single note list item ─────────────────────────────────────────────────────

function NoteItem({ note, isActive, onSelect, onDragEnd }) {
  const controls      = useDragControls()
  const contentPreview = (note.content || '').replace(/[#*`>-]/g, '').trim().slice(0, 60)

  return (
    <Reorder.Item
      value={note}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      style={{ listStyle: 'none' }}
      whileDrag={{
        scale: 1.02,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 10,
        borderRadius: 8,
      }}
    >
      <div
        onClick={() => onSelect(note.id)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 4,
          padding: '9px 10px 9px 6px', borderRadius: 'var(--r-md)', cursor: 'pointer',
          background: isActive ? 'var(--p5)' : 'transparent',
          border: `1px solid ${isActive ? 'rgba(124,58,237,0.2)' : 'transparent'}`,
          marginBottom: 2, transition: 'background 0.12s, border-color 0.12s',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (!isActive) e.currentTarget.style.background = 'var(--bg2)'
          e.currentTarget.querySelector('.note-grip').style.opacity = '1'
        }}
        onMouseLeave={e => {
          if (!isActive) e.currentTarget.style.background = 'transparent'
          e.currentTarget.querySelector('.note-grip').style.opacity = '0'
        }}
      >
        <GripHandle controls={controls} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? 'var(--p)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {note.title || 'Ohne Titel'}
          </div>
          {contentPreview && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {contentPreview}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 3 }}>{timeAgo(note.updatedAt)}</div>
        </div>
      </div>
    </Reorder.Item>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function NotesPane({ customerId }) {
  const rawNotes       = useStore(s => s.notes.filter(n => n.customerId === customerId))
  const noteOrder      = useStore(s => s.noteOrders?.[customerId] ?? [])
  const selectedNoteId = useStore(s => s.selectedNoteId)
  const addNote        = useStore(s => s.addNote)
  const updateNote     = useStore(s => s.updateNote)
  const deleteNote     = useStore(s => s.deleteNote)
  const setSelectedNoteId = useStore(s => s.setSelectedNoteId)
  const setNoteOrder   = useStore(s => s.setNoteOrder)

  // Compute order-aware note list
  const notes = useMemo(() => {
    const orderIdx = new Map(noteOrder.map((id, i) => [id, i]))
    const inOrder    = rawNotes.filter(n =>  orderIdx.has(n.id)).sort((a, b) => orderIdx.get(a.id) - orderIdx.get(b.id))
    const unordered  = rawNotes.filter(n => !orderIdx.has(n.id)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return [...unordered, ...inOrder]
  }, [rawNotes, noteOrder])

  // Local display state for smooth drag animation
  const [displayNotes, setDisplayNotes] = useState(notes)
  const isDragging   = useRef(false)
  const displayRef   = useRef(displayNotes)

  useEffect(() => { displayRef.current = displayNotes }, [displayNotes])

  useEffect(() => {
    if (!isDragging.current) setDisplayNotes(notes)
  }, [notes])

  useEffect(() => {
    setDisplayNotes(notes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  // Track global mouseup/touchend to reset drag flag
  useEffect(() => {
    const reset = () => { isDragging.current = false }
    window.addEventListener('mouseup',  reset)
    window.addEventListener('touchend', reset)
    return () => { window.removeEventListener('mouseup', reset); window.removeEventListener('touchend', reset) }
  }, [])

  const handleReorder = useCallback((newNotes) => {
    isDragging.current = true
    setDisplayNotes(newNotes)
  }, [])

  const handleDragEnd = useCallback(() => {
    isDragging.current = false
    setNoteOrder(customerId, displayRef.current.map(n => n.id))
  }, [customerId, setNoteOrder])

  const [preview, setPreview] = useState(false)
  const [saved,   setSaved]   = useState(true)
  const timerRef = useRef(null)
  const taRef    = useRef(null)

  const note = notes.find(n => n.id === selectedNoteId)

  useEffect(() => {
    if (!selectedNoteId && notes.length > 0) setSelectedNoteId(notes[0].id)
  }, [customerId, notes.length])

  useEffect(() => { setPreview(false) }, [selectedNoteId])

  const handleContent = useCallback((val) => {
    setSaved(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      updateNote(selectedNoteId, { content: val })
      setSaved(true)
    }, 500)
  }, [selectedNoteId, updateNote])

  const handleNew = () => {
    const n = addNote(customerId)
    // Prepend new note to order so it appears at top
    setNoteOrder(customerId, [n.id, ...displayRef.current.map(x => x.id)])
    setSelectedNoteId(n.id)
  }

  const handleDelete = (id) => {
    deleteNote(id)
    const remaining = notes.filter(n => n.id !== id)
    setSelectedNoteId(remaining[0]?.id ?? null)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left: note list ── */}
      <div style={{
        width: 240, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg1)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>Notizen</span>
          <button
            onClick={handleNew}
            style={{
              width: 26, height: 26, borderRadius: 'var(--r-pill)',
              background: 'var(--p)', border: 'none', color: '#fff',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m-8-8h16"/>
            </svg>
          </button>
        </div>

        {/* Reorderable note list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {displayNotes.length === 0 ? (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text4)', fontSize: 12, lineHeight: 1.6 }}>
              Noch keine Notizen.<br/>Klicke + um zu starten.
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={displayNotes}
              onReorder={handleReorder}
              style={{ listStyle: 'none', padding: 0, margin: 0 }}
            >
              {displayNotes.map(n => (
                <NoteItem
                  key={n.id}
                  note={n}
                  isActive={n.id === selectedNoteId}
                  onSelect={setSelectedNoteId}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </Reorder.Group>
          )}
        </div>
      </div>

      {/* ── Right: editor ── */}
      {!note ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 32 }}>📝</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Keine Notiz ausgewählt</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Wähle eine Notiz links oder erstelle eine neue.</div>
          <button
            onClick={handleNew}
            style={{ marginTop: 4, padding: '8px 20px', borderRadius: 'var(--r-pill)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >+ Neue Notiz</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
          {/* Toolbar */}
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg1)' }}>
            <button
              onClick={() => setPreview(p => !p)}
              style={{
                padding: '4px 12px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 600,
                border: '1px solid var(--border)',
                background: preview ? 'var(--p5)' : 'transparent',
                color: preview ? 'var(--p)' : 'var(--text3)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >{preview ? 'Editor' : 'Vorschau'}</button>

            {!preview && (
              <>
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                {[['B', '**', true], ['I', '*', true], ['{ }', '`', true]].map(([label, chars, wrap]) => (
                  <button key={label} onClick={() => insertMd(chars, wrap)}
                    style={{ padding: '3px 8px', borderRadius: 'var(--r-sm)', fontSize: 11, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)' }}
                  >{label}</button>
                ))}
                {[['H1', '# '], ['H2', '## '], ['—', '- '], ['❝', '> ']].map(([label, prefix]) => (
                  <button key={label} onClick={() => insertLine(prefix)}
                    style={{ padding: '3px 8px', borderRadius: 'var(--r-sm)', fontSize: 11, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)' }}
                  >{label}</button>
                ))}
              </>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: saved ? 'var(--green)' : 'var(--amber)', transition: 'background 0.3s' }} />
              <span style={{ fontSize: 11, color: 'var(--text4)' }}>{saved ? 'Gespeichert' : 'Speichert…'}</span>
              <div style={{ width: 1, height: 16, background: 'var(--border)', marginLeft: 4 }} />
              <button
                onClick={() => handleDelete(note.id)}
                style={{ padding: '3px 8px', borderRadius: 'var(--r-sm)', fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text4)', cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'var(--red)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text4)' }}
              >Löschen</button>
            </div>
          </div>

          {/* Title */}
          <div style={{ padding: '20px 28px 0', flexShrink: 0 }}>
            <input
              value={note.title || ''}
              onChange={e => updateNote(note.id, { title: e.target.value })}
              placeholder="Titel…"
              style={{
                width: '100%', background: 'none', border: 'none', outline: 'none',
                fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em',
                color: 'var(--text)', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '12px 28px 24px' }}>
            {preview ? (
              <div
                style={{ height: '100%', overflowY: 'auto', color: 'var(--text2)', fontSize: 14, lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: `<p style="margin:0">${renderMarkdown(note.content)}</p>` }}
              />
            ) : (
              <textarea
                ref={taRef}
                key={note.id}
                defaultValue={note.content || ''}
                onChange={e => handleContent(e.target.value)}
                placeholder="Schreibe hier…"
                style={{
                  width: '100%', height: '100%',
                  background: 'transparent', border: 'none', outline: 'none',
                  resize: 'none', color: 'var(--text2)', fontSize: 14, lineHeight: 1.8,
                  fontFamily: 'inherit',
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )

  function insertMd(chars, wrap) {
    const ta = taRef.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = ta.value.slice(s, e)
    if (wrap && sel) {
      ta.value = ta.value.slice(0, s) + chars + sel + chars + ta.value.slice(e)
      ta.setSelectionRange(s + chars.length, e + chars.length)
    } else {
      ta.setRangeText(chars, s, e, 'end')
    }
    ta.focus(); handleContent(ta.value)
  }

  function insertLine(prefix) {
    const ta = taRef.current; if (!ta) return
    const pos = ta.selectionStart
    const before = ta.value.slice(0, pos)
    const nl = before.endsWith('\n') || before === '' ? '' : '\n'
    ta.value = before + nl + prefix + ta.value.slice(pos)
    ta.focus(); handleContent(ta.value)
  }
}
