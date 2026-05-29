import { X } from 'lucide-react'
import type { SmartListFilter } from '@/types/smart-list.types'

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv', lead: 'Lead', inaktiv: 'Inaktiv', lost: 'Lost',
}
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig', normal: 'Normal', high: 'Hoch',
}

export function FilterChipBar({
  filter, onChange,
}: {
  filter:   SmartListFilter
  onChange: (next: SmartListFilter) => void
}) {
  const chips: { key: keyof SmartListFilter; label: string }[] = []

  if (filter.status?.length) {
    chips.push({ key: 'status', label: `Status: ${filter.status.map(s => STATUS_LABEL[s] ?? s).join(', ')}` })
  }
  if (filter.priority?.length) {
    chips.push({ key: 'priority', label: `Priorität: ${filter.priority.map(p => PRIORITY_LABEL[p] ?? p).join(', ')}` })
  }
  if (filter.scoreMin != null || filter.scoreMax != null) {
    const min = filter.scoreMin ?? 0
    const max = filter.scoreMax ?? 100
    chips.push({ key: 'scoreMin', label: `Score: ${min}–${max}` })
  }
  if (filter.tags?.length) {
    chips.push({ key: 'tags', label: `Tags: ${filter.tags.join(', ')}` })
  }
  if (filter.industry?.length) {
    chips.push({ key: 'industry', label: `Branche: ${filter.industry.join(', ')}` })
  }
  if (filter.inactiveDays != null) {
    chips.push({ key: 'inactiveDays', label: `Inaktiv ≥ ${filter.inactiveDays}T` })
  }

  if (chips.length === 0) return null

  const removeKey = (key: keyof SmartListFilter) => {
    const next: SmartListFilter = { ...filter }
    if (key === 'scoreMin') {
      delete next.scoreMin
      delete next.scoreMax
    } else {
      delete next[key]
    }
    onChange(next)
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6,
      padding: '10px 28px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface-2)',
    }}>
      {chips.map(c => (
        <div
          key={c.key}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 6px 4px 10px', borderRadius: 99,
            background: 'var(--bg)', border: '1px solid var(--border)',
            fontSize: 11.5, fontWeight: 500, color: 'var(--fg)',
          }}
        >
          <span>{c.label}</span>
          <button
            onClick={() => removeKey(c.key)}
            title="Entfernen"
            style={{
              background: 'transparent', border: 'none', padding: 0,
              cursor: 'pointer', color: 'var(--fg-muted)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
