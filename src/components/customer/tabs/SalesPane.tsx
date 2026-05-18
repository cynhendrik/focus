import { useEffect, useState } from 'react'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { DealModal } from '@/components/pipeline/DealModal'
import type { Deal } from '@/types/pipeline.types'
import { CheckCircle2, Circle } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('de-DE') + ' €'
}

interface Props { customerId: string }

export function SalesPane({ customerId }: Props) {
  const { customerDeals, loadForCustomer } = useDealsStore()
  const stages = usePipelineStore(s => s.stages)
  const [editDeal, setEditDeal] = useState<Deal | 'new' | null>(null)

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const openDeals = customerDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
  const closedDeals = customerDeals.filter(d => d.stage === 'won' || d.stage === 'lost')

  const stageBadge = (stageName: string) => {
    const stage = stages.find(s => s.name === stageName)
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
        background: `${stage?.color ?? '#6B7280'}22`,
        color: stage?.color ?? '#6B7280',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: stage?.color ?? '#6B7280', display: 'inline-block' }} />
        {stage?.label ?? stageName}
      </span>
    )
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Deals ({customerDeals.length})</span>
        <button
          onClick={() => setEditDeal('new')}
          className="btn-primary"
          style={{ fontSize: 11, padding: '5px 12px' }}
        >
          + Neuer Deal
        </button>
      </div>

      {openDeals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {openDeals.map(deal => (
            <div
              key={deal.id}
              onClick={() => setEditDeal(deal)}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{deal.title}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {stageBadge(deal.stage)}
                  {deal.value != null && (
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                      {fmt(deal.value)}
                    </span>
                  )}
                  {deal.probability != null && (
                    <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{deal.probability}%</span>
                  )}
                </div>
              </div>
              <Circle size={14} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {closedDeals.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-dim)', marginBottom: 6 }}>
            Abgeschlossen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closedDeals.map(deal => (
              <div
                key={deal.id}
                onClick={() => setEditDeal(deal)}
                style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', opacity: 0.6,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{deal.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {stageBadge(deal.stage)}
                    {deal.value != null && (
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                        {fmt(deal.value)}
                      </span>
                    )}
                  </div>
                </div>
                <CheckCircle2 size={14} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </>
      )}

      {customerDeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-dim)', fontSize: 12 }}>
          Noch keine Deals. Erstelle den ersten Deal für diesen Kunden.
        </div>
      )}

      {editDeal !== null && (
        <DealModal
          initial={editDeal === 'new' ? undefined : editDeal}
          presetCustomerId={customerId}
          onClose={() => setEditDeal(null)}
        />
      )}
    </div>
  )
}
