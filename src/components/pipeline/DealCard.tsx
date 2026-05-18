import { usePipelineStore } from '@/store/pipeline.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { Deal } from '@/types/pipeline.types'
import { Calendar } from 'lucide-react'

interface Props {
  deal: Deal
  onEdit: (deal: Deal) => void
  isDragging?: boolean
}

export function DealCard({ deal, onEdit, isDragging }: Props) {
  const stages = usePipelineStore(s => s.stages)
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView = useUiStore(s => s.setAppView)

  const stage = stages.find(s => s.name === deal.stage)
  const customer = customers.find(c => c.id === deal.customerId)

  const handleCustomerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (customer) {
      setSelected(customer.id)
      setAppView('clients')
    }
  }

  return (
    <div
      className="task-card"
      data-dragging={isDragging ? 'true' : undefined}
      onClick={() => onEdit(deal)}
      style={{ cursor: 'pointer', marginBottom: 6 }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
        {deal.title}
      </p>
      {customer && (
        <button
          onClick={handleCustomerClick}
          style={{
            fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)',
            background: 'var(--accent-soft)', borderRadius: 99, padding: '2px 8px',
            cursor: 'pointer', marginBottom: 8, display: 'inline-block',
            border: 'none',
          }}
        >
          {customer.name}
        </button>
      )}
      {stage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontWeight: 600 }}>{stage.label}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
          {deal.value != null ? `${deal.value.toLocaleString('de-DE')} €` : '—'}
        </span>
        {deal.probability != null && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)' }}>
            {deal.probability}%
          </span>
        )}
      </div>
      {deal.expectedClose && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Calendar size={10} style={{ color: 'var(--fg-dim)' }} />
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {new Date(deal.expectedClose).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  )
}
