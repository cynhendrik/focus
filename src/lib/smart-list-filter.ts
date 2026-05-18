import type { Customer } from '@/types/customer.types'
import type { SmartListFilter } from '@/types/smart-list.types'

export function applySmartListFilter(
  customers: Customer[],
  filter: SmartListFilter,
  lastActivity: Map<string, string | null>,
): Customer[] {
  return customers.filter(c => {
    if (filter.status?.length && !filter.status.includes(c.status)) return false
    if (filter.priority?.length && !filter.priority.includes(c.priority)) return false
    if (filter.scoreMin != null && c.leadScore < filter.scoreMin) return false
    if (filter.scoreMax != null && c.leadScore > filter.scoreMax) return false
    if (filter.tags?.length && !filter.tags.every(t => c.tags.includes(t))) return false
    if (filter.industry?.length && (!c.industry || !filter.industry.includes(c.industry))) return false
    if (filter.inactiveDays != null) {
      const last = lastActivity.get(c.id) ?? null
      const days = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
        : 9999
      if (days < filter.inactiveDays) return false
    }
    return true
  })
}
