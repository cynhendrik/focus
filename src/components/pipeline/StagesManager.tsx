import { useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePipelineStore } from '@/store/pipeline.store'
import type { PipelineStage } from '@/types/pipeline.types'
import { GripVertical, Trash2, Plus, X } from 'lucide-react'

const PRESET_COLORS = ['#6B7280','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#10B981','#06B6D4','#F97316']

function SortableStageRow({ stage, onDelete, onUpdate }: {
  stage: PipelineStage
  onDelete: (id: string) => void
  onUpdate: (id: string, label: string, color: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const [label, setLabel] = useState(stage.label)
  const [color, setColor] = useState(stage.color)

  const handleBlur = () => {
    if (label !== stage.label || color !== stage.color) onUpdate(stage.id, label, color)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 0', borderBottom: '1px solid var(--border)',
      }}
    >
      <div {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--fg-dim)', flexShrink: 0 }}>
        <GripVertical size={14} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); onUpdate(stage.id, label, c) }}
            style={{
              width: 12, height: 12, borderRadius: '50%', background: c, cursor: 'pointer',
              border: color === c ? '2px solid var(--fg)' : '2px solid transparent',
            }}
          />
        ))}
      </div>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        onBlur={handleBlur}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          fontSize: 12, fontWeight: 600, color: 'var(--fg)',
        }}
      />
      {!stage.isWon && !stage.isLost && (
        <button onClick={() => onDelete(stage.id)} style={{ color: 'var(--fg-dim)', cursor: 'pointer', flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

interface Props { workspaceId: string; onClose: () => void }

export function StagesManager({ workspaceId, onClose }: Props) {
  const stages      = usePipelineStore(s => s.stages)
  const upsertStage = usePipelineStore(s => s.upsertStage)
  const removeStage = usePipelineStore(s => s.removeStage)
  const reorder     = usePipelineStore(s => s.reorder)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = stages.findIndex(s => s.id === active.id)
    const newIndex = stages.findIndex(s => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex)
    reorder(workspaceId, reordered.map(s => s.id))
  }

  const handleUpdate = async (id: string, label: string, color: string) => {
    const stage = stages.find(s => s.id === id)!
    await upsertStage({ id, workspaceId, name: stage.name, label, color, isWon: stage.isWon, isLost: stage.isLost })
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      await removeStage(id, workspaceId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Stage konnte nicht gelöscht werden'
      setError(msg)
    }
  }

  const handleAdd = async () => {
    if (!newLabel.trim()) return
    const name = newLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    await upsertStage({
      workspaceId, name, label: newLabel.trim(),
      color: PRESET_COLORS[stages.length % PRESET_COLORS.length],
      orderIndex: stages.length,
    })
    setNewLabel('')
  }

  return (
    <div
      style={{
        position: 'absolute', top: 48, right: 0, width: 380,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 16, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Stages verwalten</span>
        <button onClick={onClose} style={{ color: 'var(--fg-dim)', cursor: 'pointer' }}><X size={14} /></button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
          {error}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {stages.map(stage => (
            <SortableStageRow key={stage.id} stage={stage} onDelete={handleDelete} onUpdate={handleUpdate} />
          ))}
        </SortableContext>
      </DndContext>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          className="mock-input"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="+ Neue Stage"
          style={{ flex: 1, fontSize: 12 }}
        />
        <button onClick={handleAdd} className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}
