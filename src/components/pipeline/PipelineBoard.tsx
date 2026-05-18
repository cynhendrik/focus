import { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { usePipelineStore } from '@/store/pipeline.store'
import { useDealsStore } from '@/store/deals.store'
import { DealCard } from './DealCard'
import type { Deal, PipelineStage } from '@/types/pipeline.types'

function DroppableColumn({ stage, deals, onEdit }: {
  stage: PipelineStage & { displayName: string; colorDot: string }
  deals: Deal[]
  onEdit: (deal: Deal) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.name })
  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0)

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 190, maxWidth: 240,
        background: isOver ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderRight: '1px solid var(--border)',
        padding: '14px 12px', transition: 'background 150ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.colorDot, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>
            {stage.displayName}
          </span>
        </div>
        {totalValue > 0 && (
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)' }}>
            {totalValue.toLocaleString('de-DE')} €
          </span>
        )}
      </div>
      <div>
        {deals.map(deal => (
          <DraggableDealCard key={deal.id} deal={deal} onEdit={onEdit} />
        ))}
        {deals.length === 0 && (
          <div style={{ border: '1.5px dashed rgba(255,255,255,0.08)', borderRadius: 9, padding: 16, textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Keine Deals</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableDealCard({ deal, onEdit }: { deal: Deal; onEdit: (d: Deal) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <DealCard deal={deal} onEdit={onEdit} isDragging={isDragging} />
    </div>
  )
}

interface Props {
  onEditDeal: (deal: Deal) => void
}

export function PipelineBoard({ onEditDeal }: Props) {
  const stages = usePipelineStore(s => s.stages)
  const deals = useDealsStore(s => s.deals)
  const moveToStage = useDealsStore(s => s.moveToStage)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const openStages = stages.filter(s => !s.isWon && !s.isLost)
  const wonStage = stages.find(s => s.isWon)
  const lostStage = stages.find(s => s.isLost)

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDeal(deals.find(d => d.id === e.active.id) ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDeal(null)
    if (!e.over) return
    const newStage = String(e.over.id)
    const deal = deals.find(d => d.id === e.active.id)
    if (deal && deal.stage !== newStage) {
      moveToStage(deal.id, newStage)
    }
  }

  const dealsForStage = (stageName: string) =>
    deals.filter(d => d.stage === stageName)

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', overflow: 'auto', flex: 1, minHeight: 0, height: '100%' }}>
        {openStages.map(stage => (
          <DroppableColumn
            key={stage.id}
            stage={{ ...stage, displayName: stage.label, colorDot: stage.color }}
            deals={dealsForStage(stage.name)}
            onEdit={onEditDeal}
          />
        ))}
        {wonStage && (
          <DroppableColumn
            key={wonStage.id}
            stage={{ ...wonStage, displayName: wonStage.label, colorDot: '#22C55E' }}
            deals={dealsForStage(wonStage.name)}
            onEdit={onEditDeal}
          />
        )}
        {lostStage && (
          <DroppableColumn
            key={lostStage.id}
            stage={{ ...lostStage, displayName: lostStage.label, colorDot: 'var(--fg-dim)' }}
            deals={dealsForStage(lostStage.name)}
            onEdit={onEditDeal}
          />
        )}
      </div>
      <DragOverlay>
        {activeDeal ? <DealCard deal={activeDeal} onEdit={() => {}} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
