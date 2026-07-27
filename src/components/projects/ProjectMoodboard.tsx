import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { MoodboardItem, MoodboardColorItem, MoodboardTypeItem, MoodboardNoteItem, MoodboardImageItem } from '@/types/project.types'

const DEFAULT_COLORS = ['oklch(80% 0.06 60)', 'oklch(60% 0.08 250)', 'oklch(92% 0.01 90)']

function newItem(kind: MoodboardItem['kind']): MoodboardItem {
  const id = crypto.randomUUID()
  const base = { id, x: 40, y: 40, w: 24, h: 20 }
  if (kind === 'image') return { ...base, kind: 'image', w: 24, h: 26, cap: 'Neues Bild — hier ablegen', storageKey: null }
  if (kind === 'color') return { ...base, kind: 'color', h: 12, cap: 'Palette', colors: [...DEFAULT_COLORS] }
  if (kind === 'type') return { ...base, kind: 'type', h: 22, cap: 'Typo', font: 'var(--font-display)', sample: 'Aa', note: 'Schrift wählen' }
  return { ...base, kind: 'note', h: 16, cap: 'Notiz', text: 'Neue Notiz — hier tippen.' }
}

function ColorTile({ item }: { item: MoodboardColorItem }) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {item.colors.map((c, i) => <i key={i} style={{ flex: 1, background: c, display: 'block' }} title={c} />)}
    </div>
  )
}

function TypeTile({ item, onEdit }: { item: MoodboardTypeItem; onEdit: (patch: Partial<MoodboardTypeItem>) => void }) {
  return (
    <div style={{ padding: 8 }}>
      <span style={{ display: 'block', fontSize: 22, fontFamily: item.font }}>{item.sample}</span>
      <input
        className="mock-input" value={item.note} onChange={e => onEdit({ note: e.target.value })}
        style={{ fontSize: 11.5, marginTop: 4, width: '100%' }}
      />
    </div>
  )
}

function NoteTile({ item, onEdit }: { item: MoodboardNoteItem; onEdit: (patch: Partial<MoodboardNoteItem>) => void }) {
  return (
    <textarea
      className="mock-input" value={item.text} onChange={e => onEdit({ text: e.target.value })}
      style={{ width: '100%', height: '100%', resize: 'none', fontSize: 12.5, border: 'none', background: 'transparent' }}
    />
  )
}

function ImageTile({ item, onUpload, readImage }: {
  item: MoodboardImageItem
  onUpload: (file: File) => void
  readImage: (storageKey: string) => Promise<Blob>
}) {
  const [url, setUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const readImageRef = useRef(readImage)
  readImageRef.current = readImage

  useEffect(() => {
    if (!item.storageKey) { setUrl(null); return }
    let cancelled = false
    let objectUrl: string | null = null
    readImageRef.current(item.storageKey).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item.storageKey])

  if (!item.storageKey) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <label style={{ fontSize: 11.5, cursor: 'pointer', color: 'var(--accent)' }}>
          Bild auswählen
          <input
            ref={inputRef} type="file" accept="image/*" aria-label="Bild auswählen"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
          />
        </label>
      </div>
    )
  }

  return url ? (
    <img src={url} alt={item.cap} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  ) : (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 11, color: 'var(--fg-dim)' }}>Lädt…</div>
  )
}

export function ProjectMoodboard({ items, onChange, onUploadImage, onRemoveImage, readImage }: {
  items: MoodboardItem[]
  onChange: (next: MoodboardItem[]) => void
  onUploadImage: (itemId: string, file: File) => void
  onRemoveImage: (itemId: string) => void
  readImage: (itemId: string, storageKey: string) => Promise<Blob>
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; ox: number; oy: number; x: number; y: number; bw: number; bh: number } | null>(null)
  const [, forceRerender] = useState(0)

  const add = (kind: MoodboardItem['kind']) => onChange([...items, newItem(kind)])
  const remove = (id: string, kind: MoodboardItem['kind']) => {
    if (kind === 'image') onRemoveImage(id)
    onChange(items.filter(it => it.id !== id))
  }
  const edit = (id: string, patch: Partial<MoodboardItem>) =>
    onChange(items.map(it => it.id === id ? { ...it, ...patch } as MoodboardItem : it))

  const onGrab = (e: React.PointerEvent, it: MoodboardItem) => {
    e.preventDefault()
    const box = canvasRef.current?.getBoundingClientRect()
    if (!box) return
    drag.current = { id: it.id, ox: e.clientX, oy: e.clientY, x: it.x, y: it.y, bw: box.width, bh: box.height }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const nx = Math.max(0, Math.min(100 - it.w, d.x + (ev.clientX - d.ox) / d.bw * 100))
      const ny = Math.max(0, Math.min(100 - it.h, d.y + (ev.clientY - d.oy) / d.bh * 100))
      const idx = items.findIndex(x => x.id === it.id)
      if (idx >= 0) { items[idx] = { ...items[idx], x: nx, y: ny }; forceRerender(n => n + 1) }
    }
    const up = () => {
      drag.current = null
      onChange(items)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 20 }}>
      <div
        ref={canvasRef}
        style={{ position: 'relative', minHeight: 480, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}
      >
        {items.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
            Noch keine Kacheln auf diesem Board.
          </div>
        )}
        {items.map(it => (
          <div
            key={it.id}
            style={{ position: 'absolute', left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, height: `${it.h}%`, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', overflow: 'hidden' }}
          >
            <div
              onPointerDown={e => onGrab(e, it)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px', fontSize: 10, color: 'var(--fg-dim)', cursor: 'grab', background: 'var(--surface)' }}
            >
              <span>{it.cap}</span>
              <button
                onClick={() => remove(it.id, it.kind)} aria-label="Kachel entfernen"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', padding: 0 }}
              >
                <X size={11} />
              </button>
            </div>
            <div style={{ height: 'calc(100% - 22px)' }}>
              {it.kind === 'color' && <ColorTile item={it} />}
              {it.kind === 'type' && <TypeTile item={it} onEdit={patch => edit(it.id, patch)} />}
              {it.kind === 'note' && <NoteTile item={it} onEdit={patch => edit(it.id, patch)} />}
              {it.kind === 'image' && (
                <ImageTile item={it} onUpload={file => onUploadImage(it.id, file)} readImage={key => readImage(it.id, key)} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pcard">
        <div className="pcard-h"><h3>Hinzufügen</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn-ghost" onClick={() => add('image')}>Bild</button>
          <button className="btn-ghost" onClick={() => add('color')}>Farbe</button>
          <button className="btn-ghost" onClick={() => add('type')}>Typo</button>
          <button className="btn-ghost" onClick={() => add('note')}>Notiz</button>
        </div>
      </div>
    </div>
  )
}
