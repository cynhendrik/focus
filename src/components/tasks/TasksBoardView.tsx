import { useMemo, useState, useRef, useEffect } from 'react'
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { Plus, Check, ChevronDown } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import type { Todo, TodoBucket } from '@/types/todo.types'
import { TaskBoardCard } from './TaskBoardCard'
import { TaskComposer } from './TaskComposer'
import { parseTaskText } from './prefix-parser'

// ── Leichter Inline-Add direkt in eine Stage — Titel + optional ! für Priorität.
function ColumnQuickAdd({ bucket, customerId }: { bucket: TodoBucket; customerId?: string }) {
  const upsert = useTodosStore(s => s.upsert)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const submit = async () => {
    const parsed = parseTaskText(text)
    if (!parsed.title.trim()) { setText(''); return }
    await upsert({
      title: parsed.title.trim(),
      customerId,
      bucket,
      priority: parsed.priority ?? 'p3',
      tags: parsed.tags,
      checklist: [],
    })
    setText('')
    inputRef.current?.focus()   // schnelles Mehrfach-Erfassen
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, width: '100%',
          padding: '6px 8px', borderRadius: 8,
          background: 'transparent', border: '1px dashed var(--border)',
          color: 'var(--fg-dim)', fontSize: 11.5, cursor: 'pointer',
          transition: 'color 160ms, border-color 160ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)'; e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <Plus size={12} /> Aufgabe
      </button>
    )
  }
  return (
    <input
      ref={inputRef}
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); submit() }
        if (e.key === 'Escape') { setText(''); setOpen(false) }
      }}
      onBlur={() => { if (!text.trim()) setOpen(false) }}
      placeholder="Titel…  ! dringend"
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '7px 9px', borderRadius: 8,
        background: 'var(--surface-2)', border: '1px solid var(--accent)',
        color: 'var(--fg)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
      }}
    />
  )
}

// ── Eine Stage-Zone (Droppable). layout='column' für den schmalen Rail,
//    'grid' für die breite Heute/In-Arbeit-Fläche (Karten-Raster statt
//    gestreckter Einzelkarten).
function BucketZone({
  bucket, label, hint, items, customerId,
  accent = false, withQuickAdd = false, layout = 'column', emptyHint,
}: {
  bucket: TodoBucket
  label: string
  hint: string
  items: Todo[]
  customerId?: string
  accent?: boolean
  withQuickAdd?: boolean
  layout?: 'column' | 'grid'
  emptyHint?: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id: bucket })
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'var(--accent-soft)' : 'oklch(50% 0 0 / 0.025)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12, padding: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'background 180ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          display: 'flex', alignItems: 'baseline', gap: 7,
          fontSize: 12, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--fg)',
        }}>
          {label}
          <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--fg-dim)' }}>{hint}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{items.length}</span>
      </div>

      {withQuickAdd && <ColumnQuickAdd bucket={bucket} customerId={customerId} />}

      {items.length === 0 ? (
        emptyHint && (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontStyle: 'italic', padding: '1px 2px 2px' }}>
            {emptyHint}
          </div>
        )
      ) : (
        <div style={
          layout === 'grid'
            ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }
            : { display: 'flex', flexDirection: 'column', gap: 6 }
        }>
          {items.map(t => <TaskBoardCard key={t.id} todo={t} />)}
        </div>
      )}
    </div>
  )
}

// ── Erledigt — kein vollwertiger Bereich, nur ein dünner Streifen, der auf
//    Klick ausklappt. Bleibt Drop-Ziel (drag drauf = erledigt).
function DoneStrip({ items }: { items: Todo[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'done' })
  const [open, setOpen] = useState(false)
  return (
    <div
      ref={setNodeRef}
      style={{
        border: `1px solid ${isOver ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12,
        background: isOver ? 'var(--accent-soft)' : 'transparent',
        transition: 'background 160ms, border-color 160ms',
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '9px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 12, fontFamily: 'inherit',
        }}
      >
        <Check size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600 }}>{items.length} erledigt</span>
        <ChevronDown
          size={14}
          style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }}
        />
      </button>
      {open && items.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8, padding: '0 12px 12px', opacity: 0.7,
        }}>
          {items.slice(-24).reverse().map(t => <TaskBoardCard key={t.id} todo={t} />)}
        </div>
      )}
    </div>
  )
}

interface Props { customerId?: string; showComposer?: boolean }

export function TasksBoardView({ customerId, showComposer = true }: Props = {}) {
  const allTodos  = useTodosStore(s => s.allTodos)
  const setBucket = useTodosStore(s => s.setBucket)
  const complete  = useTodosStore(s => s.complete)
  const upsert    = useTodosStore(s => s.upsert)

  const todos = useMemo(
    () => customerId ? allTodos.filter(t => t.customerId === customerId) : allTodos,
    [allTodos, customerId],
  )

  // Erledigte zählen IMMER zur Done-Gruppe — egal in welchem Bucket sie liegen.
  const byGroup = useMemo(() => {
    const map: Record<TodoBucket, Todo[]> = { backlog: [], today: [], in_progress: [], done: [] }
    for (const t of todos) {
      const g: TodoBucket = t.status === 'done' ? 'done' : (t.bucket === 'done' ? 'backlog' : t.bucket)
      map[g].push(t)
    }
    return map
  }, [todos])

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return
    const target = e.over.id as TodoBucket
    const id = String(e.active.id)
    const todo = e.active.data.current?.todo as Todo | undefined

    if (target === 'done') {
      if (todo?.status !== 'done') void complete(id)
      return
    }
    // In eine aktive Stage ziehen: Bucket setzen — und reaktivieren, falls erledigt.
    if (todo?.status === 'done') {
      void upsert({
        id, title: todo.title, status: 'open', bucket: target,
        priority: todo.priority, customerId: todo.customerId,
        checklist: todo.checklist, tags: todo.tags,
      })
    } else {
      void setBucket(id, target)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {showComposer && <TaskComposer customerId={customerId} />}

      <DndContext onDragEnd={onDragEnd}>
        {/* Stages nebeneinander als schmale Spalten */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BucketZone
              bucket="backlog" label="Backlog" hint="Warteschlange"
              items={byGroup.backlog} customerId={customerId}
              withQuickAdd emptyHint="leer"
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BucketZone
              bucket="today" label="Heute" hint="Geplant"
              items={byGroup.today} customerId={customerId}
              withQuickAdd emptyHint="–"
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BucketZone
              bucket="in_progress" label="In Arbeit" hint="Dran"
              items={byGroup.in_progress} accent
              emptyHint="–"
            />
          </div>
        </div>

        {/* Erledigt — dünner ausklappbarer Streifen */}
        <DoneStrip items={byGroup.done} />
      </DndContext>
    </div>
  )
}
