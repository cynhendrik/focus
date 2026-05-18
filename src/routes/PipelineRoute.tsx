import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useDealsStore } from '@/store/deals.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { PipelineBoard } from '@/components/pipeline/PipelineBoard'
import { DealModal } from '@/components/pipeline/DealModal'
import { StagesManager } from '@/components/pipeline/StagesManager'
import type { Deal } from '@/types/pipeline.types'

export function PipelineRoute() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const deals = useDealsStore(s => s.deals)
  const [editDeal, setEditDeal] = useState<Deal | null | 'new'>(null)
  const [showStages, setShowStages] = useState(false)

  const openDealsValue = deals
    .filter(d => d.stage !== 'won' && d.stage !== 'lost')
    .reduce((s, d) => s + (d.value ?? 0), 0)

  const openDealsCount = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
      <div className="greeting" style={{ padding: '24px 24px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="greeting-title">Pipeline<em>.</em></h1>
            <div className="greeting-sub">
              <span>
                Offen: <strong style={{ fontFamily: 'var(--font-mono)' }}>
                  {openDealsValue.toLocaleString('de-DE')} €
                </strong>
              </span>
              <span>{openDealsCount} Deals</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <button
              onClick={() => setShowStages(v => !v)}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
            >
              <Settings2 size={13} />
              Stages
            </button>
            <button
              onClick={() => setEditDeal('new')}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px' }}
            >
              + Neuer Deal
            </button>
            {showStages && (
              <StagesManager workspaceId={workspaceId} onClose={() => setShowStages(false)} />
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderTop: '1px solid var(--border)' }}>
        <PipelineBoard onEditDeal={deal => setEditDeal(deal)} />
      </div>

      {editDeal !== null && (
        <DealModal
          initial={editDeal === 'new' ? undefined : editDeal}
          onClose={() => setEditDeal(null)}
        />
      )}
    </div>
  )
}
