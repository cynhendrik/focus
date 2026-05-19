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
  const customers = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)

  const customer = customers.find(c => c.id === deal.customerId)
  const subtitle = customer?.company ?? customer?.industry ?? null

  const handleCustomerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (customer) setSelected(customer.id)
  }

  return (
    <div
      className="task-card"
      data-dragging={isDragging ? 'true' : undefined}
      onClick={() => onEdit(deal)}
      style={{ cursor: 'pointer', marginBottom: 6 }}
    >
      {/* Customer — prominent, clickable */}
      <button
        onClick={handleCustomerClick}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          background: 'none', border: 'none', padding: 0,
          cursor: customer ? 'pointer' : 'default',
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: 'var(--fg)' }}>
          {customer?.name ?? '—'}
        </div>
        {subtitle && (
          <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginTop: 2, lineHeight: 1.3 }}>
            {subtitle}
          </div>
        )}
      </button>

      {/* Deal title */}
      <div style={{
        fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.4,
        padding: '4px 8px', marginBottom: 10,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {deal.title}
      </div>

      {/* Value + probability */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontSize: 14, fontWeight: 700,
          fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em',
        }}>
          {deal.value != null ? `${deal.value.toLocaleString('de-DE')} €` : '—'}
        </span>
        {deal.probability != null && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)' }}>
            {deal.probability}%
          </span>
        )}
      </div>

      {/* Expected close */}
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
