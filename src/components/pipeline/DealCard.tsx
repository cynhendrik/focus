import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import type { Deal } from '@/types/pipeline.types'
import { Calendar } from 'lucide-react'

/** Days a deal must sit without any update to be considered stalled. */
const STALL_THRESHOLD_DAYS = 14

export function getDaysIdle(deal: Deal): number {
  if (!deal.updatedAt) return 0
  return Math.floor(
    (Date.now() - new Date(deal.updatedAt).getTime()) / 86_400_000,
  )
}

export function isDealStalled(deal: Deal): boolean {
  return getDaysIdle(deal) >= STALL_THRESHOLD_DAYS
}

interface Props {
  deal: Deal
  onEdit: (deal: Deal) => void
  isDragging?: boolean
  /** Pass true when the deal's stage is open (not won/lost) AND the deal is idle ≥ 14 days. */
  isStalled?: boolean
}

export function DealCard({ deal, onEdit, isDragging, isStalled }: Props) {
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

      {/* Stall warning */}
      {isStalled && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 9.5, padding: '2px 7px', borderRadius: 99,
          background: 'oklch(65% 0.18 50 / 0.15)', color: 'oklch(65% 0.18 50)',
          fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em',
          marginBottom: 8,
        }}>
          ⚠ {getDaysIdle(deal)}d kein Kontakt
        </div>
      )}

      {/* Lead source badge */}
      {deal.notes?.startsWith('Lead-Quelle:') && (
        <div style={{ marginBottom: 8 }}>
          <span style={{
            fontSize: 9.5, padding: '1px 7px', borderRadius: 99,
            background: 'oklch(68% 0.2 50 / 0.12)', color: 'oklch(68% 0.2 50)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', fontWeight: 700,
          }}>
            🏷 {deal.notes.replace('Lead-Quelle: ', '')}
          </span>
        </div>
      )}

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
