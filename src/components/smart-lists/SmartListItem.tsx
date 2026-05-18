import { useMemo } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { applySmartListFilter } from '@/lib/smart-list-filter'
import type { SmartList } from '@/types/smart-list.types'

export function SmartListItem({ list, active, onClick, onEdit, onDelete }: {
  list:     SmartList
  active:   boolean
  onClick:  () => void
  onEdit:   () => void
  onDelete?: () => void
}) {
  const customers    = useCustomersStore(s => s.customers)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const activityMap  = useMemo(
    () => new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt])),
    [lastActivity],
  )
  const count = useMemo(
    () => applySmartListFilter(customers, list.filter, activityMap).length,
    [customers, list.filter, activityMap],
  )

  return (
    <div
      className="nav-item smart-list-item"
      data-active={String(active)}
      onClick={onClick}
      style={{ paddingLeft: 16, gap: 7 }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{list.icon}</span>
      <span style={{ flex: 1, fontSize: 12.5 }}>{list.name}</span>
      <span style={{
        fontSize: 10.5, fontWeight: 600, minWidth: 16, textAlign: 'right',
        color: active ? 'var(--accent-ink)' : 'var(--fg-dim)',
      }}>{count}</span>
      <div className="smart-list-actions" onClick={e => e.stopPropagation()}>
        <button
          onClick={onEdit}
          title="Bearbeiten"
          style={{ fontSize: 11, color: 'var(--fg-muted)', background: 'none', padding: '0 3px' }}
        >✎</button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Löschen"
            style={{ fontSize: 11, color: 'var(--fg-muted)', background: 'none', padding: '0 3px' }}
          >✕</button>
        )}
      </div>
    </div>
  )
}
