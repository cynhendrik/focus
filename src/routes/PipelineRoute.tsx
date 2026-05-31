import { useMemo, useState } from 'react'
import { Settings2, Bell } from 'lucide-react'
import { useDealsStore } from '@/store/deals.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useCrmStore } from '@/store/crm.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { PipelineBoard } from '@/components/pipeline/PipelineBoard'
import { DealModal } from '@/components/pipeline/DealModal'
import { StagesManager } from '@/components/pipeline/StagesManager'
import type { Deal, PipelineStage } from '@/types/pipeline.types'

// Open = nicht gewonnen UND nicht verloren. Stages werden vom User umbenannt,
// also nie auf Namen wie 'won'/'lost' vergleichen — immer die Flags der
// Stage-Definition befragen.
function makeIsOpenStage(stages: PipelineStage[]) {
  const byName = new Map(stages.map(s => [s.name, s]))
  return (stageName: string) => {
    const stage = byName.get(stageName)
    if (!stage) return true // unbekannte Stage → als offen behandeln
    return !stage.isWon && !stage.isLost
  }
}

export function PipelineRoute() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const deals = useDealsStore(s => s.deals)
  const stages = usePipelineStore(s => s.stages)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const [editDeal, setEditDeal] = useState<Deal | null | 'new'>(null)
  const [showStages, setShowStages] = useState(false)
  const [onlyWithFollowUps, setOnlyWithFollowUps] = useState(false)

  const isOpenStage = useMemo(() => makeIsOpenStage(stages), [stages])

  const openDealsValue = useMemo(
    () => deals.filter(d => isOpenStage(d.stage)).reduce((s, d) => s + (d.value ?? 0), 0),
    [deals, isOpenStage],
  )

  const openDealsCount = useMemo(
    () => deals.filter(d => isOpenStage(d.stage)).length,
    [deals, isOpenStage],
  )

  // Customer-IDs with an open follow-up due today or earlier.
  // Lokale Zeit, nicht UTC — sonst flippt der Vergleich nachts.
  const dueFollowUpCustomerIds = useMemo(() => {
    const today = new Date().toLocaleDateString('sv')
    return new Set(
      allFollowUps
        .filter(f => f.status === 'offen' && f.dueDate <= today)
        .map(f => f.customerId)
    )
  }, [allFollowUps])

  const filteredCount = useMemo(() => {
    if (!onlyWithFollowUps) return openDealsCount
    return deals.filter(d =>
      isOpenStage(d.stage) && dueFollowUpCustomerIds.has(d.accountId)
    ).length
  }, [deals, openDealsCount, onlyWithFollowUps, dueFollowUpCustomerIds, isOpenStage])

  const dealFilter = onlyWithFollowUps
    ? (d: Deal) => dueFollowUpCustomerIds.has(d.accountId)
    : undefined

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
              <span>{onlyWithFollowUps ? `${filteredCount} / ${openDealsCount}` : openDealsCount} Deals</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <button
              onClick={() => setOnlyWithFollowUps(v => !v)}
              className={onlyWithFollowUps ? 'btn-primary' : 'btn-secondary'}
              title="Nur Deals mit fälligen Follow-Ups anzeigen"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
            >
              <Bell size={13} />
              Fällige Follow-Ups
              {dueFollowUpCustomerIds.size > 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  background: onlyWithFollowUps ? 'oklch(100% 0 0 / 0.18)' : 'var(--surface)',
                  padding: '1px 6px', borderRadius: 99,
                }}>
                  {dueFollowUpCustomerIds.size}
                </span>
              )}
            </button>
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
        <PipelineBoard onEditDeal={deal => setEditDeal(deal)} dealFilter={dealFilter} />
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
