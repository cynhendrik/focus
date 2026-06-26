import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, GripHorizontal } from 'lucide-react'
import type { StickyNote, StickyCheck } from '@/types/notes-module.types'

export const STICKY_COLORS = [
  '#FDF3C7', '#FBDCE6', '#D4E9F7', '#D6EFD8', '#E7DAF3', '#FCE6CE',
] as const

interface Props {
  note: StickyNote
  onChange: (updated: StickyNote) => void
  onDelete: () => void
}

export function StickyCard({ note, onChange, onDelete }: Props) {
  const [dragging, setDragging] = useState(false)
  const offsetRef = useRef({ x: 0, y: 0 })
  const noteRef = useRef(note)
  noteRef.current = note

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    offsetRef.current = { x: e.clientX - note.x, y: e.clientY - note.y }
    setDragging(true)
  }, [note.x, note.y])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      onChange({ ...noteRef.current, x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, onChange])

  const setField = <K extends keyof StickyNote>(key: K, value: StickyNote[K]) =>
    onChange({ ...note, [key]: value })

  const setCheck = (id: string, patch: Partial<StickyCheck>) =>
    onChange({
      ...note,
      checks: note.checks.map(c => c.id === id ? { ...c, ...patch } : c),
    })

  const addCheck = () =>
    onChange({
      ...note,
      checks: [...note.checks, { id: crypto.randomUUID(), label: '', done: false }],
    })

  const removeCheck = (id: string) =>
    onChange({ ...note, checks: note.checks.filter(c => c.id !== id) })

  return (
    <div
      // Keep clicks inside the Zettel from bubbling to the note editor's
      // scroll-area onClick (which would steal focus into the main notes editor).
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: note.x,
        top: note.y,
        width: 220,
        background: note.color,
        borderRadius: 10,
        boxShadow: dragging
          ? '0 16px 40px -8px oklch(0% 0 0 / 0.35)'
          : '0 4px 16px -4px oklch(0% 0 0 / 0.18)',
        zIndex: dragging ? 100 : 10,
        display: 'flex',
        flexDirection: 'column',
        cursor: dragging ? 'grabbing' : 'default',
        transition: 'box-shadow 120ms',
        userSelect: dragging ? 'none' : 'auto',
        pointerEvents: 'auto',
      }}
    >
      {/* Header: drag handle + Farbpalette + löschen */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px 4px',
          cursor: dragging ? 'grabbing' : 'grab',
          borderRadius: '10px 10px 0 0',
          background: 'oklch(0% 0 0 / 0.06)',
        }}
      >
        <GripHorizontal size={13} style={{ color: 'oklch(0% 0 0 / 0.4)', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: 3, flex: 1 }}>
          {STICKY_COLORS.map(c => (
            <button
              key={c}
              onMouseDown={e => { e.stopPropagation(); setField('color', c) }}
              style={{
                width: 13, height: 13, borderRadius: '50%', border: 'none',
                background: c, cursor: 'pointer', flexShrink: 0,
                outline: note.color === c ? '2px solid oklch(0% 0 0 / 0.5)' : 'none',
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
        <button
          onMouseDown={e => { e.stopPropagation(); onDelete() }}
          style={{
            width: 18, height: 18, borderRadius: 5, border: 'none',
            background: 'oklch(0% 0 0 / 0.1)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={10} style={{ color: 'oklch(0% 0 0 / 0.5)' }} />
        </button>
      </div>

      {/* Titel */}
      <input
        value={note.title}
        onChange={e => setField('title', e.target.value)}
        placeholder="Titel…"
        style={{
          border: 'none', background: 'transparent', outline: 'none',
          padding: '6px 10px 2px', fontSize: 12.5, fontWeight: 700,
          color: 'oklch(10% 0 0)', fontFamily: 'inherit',
          letterSpacing: '-0.01em',
        }}
      />

      {/* Text */}
      <textarea
        value={note.text}
        onChange={e => setField('text', e.target.value)}
        placeholder="Notiz…"
        rows={3}
        style={{
          border: 'none', background: 'transparent', outline: 'none',
          padding: '4px 10px', fontSize: 12, color: 'oklch(15% 0 0)',
          fontFamily: 'inherit', resize: 'none', lineHeight: 1.5,
        }}
      />

      {/* Checkliste */}
      {(note.checks.length > 0) && (
        <div style={{ padding: '2px 8px 0', borderTop: '1px solid oklch(0% 0 0 / 0.08)' }}>
          {note.checks.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <input
                type="checkbox"
                checked={c.done}
                onChange={e => setCheck(c.id, { done: e.target.checked })}
                style={{ flexShrink: 0, accentColor: 'oklch(35% 0 0)', cursor: 'pointer' }}
              />
              <input
                value={c.label}
                onChange={e => setCheck(c.id, { label: e.target.value })}
                placeholder="Punkt…"
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 11.5, color: 'oklch(15% 0 0)', fontFamily: 'inherit',
                  textDecoration: c.done ? 'line-through' : 'none',
                  opacity: c.done ? 0.5 : 1,
                }}
              />
              <button
                onClick={() => removeCheck(c.id)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: 'oklch(0% 0 0 / 0.3)', padding: 0, display: 'flex',
                }}
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer: + Punkt */}
      <button
        onClick={addCheck}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '5px 10px 8px',
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 11, color: 'oklch(0% 0 0 / 0.4)', fontFamily: 'inherit',
        }}
      >
        <Plus size={10} /> Punkt hinzufügen
      </button>
    </div>
  )
}
