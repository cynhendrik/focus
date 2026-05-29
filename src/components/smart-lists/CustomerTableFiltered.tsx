// src/components/smart-lists/CustomerTableFiltered.tsx
import { useMemo, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import type { Customer } from '@/types/customer.types'

type SortKey = 'name' | 'status' | 'priority' | 'score' | 'industry' | 'lastActivity'
type SortDir = 'asc' | 'desc'

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv', lead: 'Lead', inaktiv: 'Inaktiv', lost: 'Lost',
}
const STATUS_TONE: Record<string, string> = {
  aktiv: 'ok', lead: 'accent', inaktiv: 'warn', lost: 'bad',
}
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig', normal: 'Normal', high: 'Hoch',
}
const PRIORITY_NUM: Record<string, number> = { low: 0, normal: 1, high: 2 }

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Heute'
  if (d === 1) return 'Gestern'
  if (d < 7) return `vor ${d}T`
  if (d < 30) return `vor ${Math.floor(d / 7)}W`
  return `vor ${Math.floor(d / 30)}M`
}

export function CustomerTableFiltered({
  customers, lastActivity,
}: {
  customers:    Customer[]
  lastActivity: Map<string, string | null>
}) {
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView  = useUiStore(s => s.setAppView)

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null)

  const openCustomer = (id: string) => {
    setSelected(id)
    setAppView('clients')
  }

  const toggleSort = (key: SortKey) => {
    setSort(prev => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { key, dir: 'asc' }
    })
  }

  const sortedCustomers = useMemo(() => {
    if (sort === null) return customers
    const { key, dir } = sort
    return [...customers].sort((a, b) => {
      let cmp = 0
      if (key === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (key === 'status') {
        cmp = a.status.localeCompare(b.status)
      } else if (key === 'priority') {
        cmp = (PRIORITY_NUM[a.priority] ?? 1) - (PRIORITY_NUM[b.priority] ?? 1)
      } else if (key === 'score') {
        cmp = a.leadScore - b.leadScore
      } else if (key === 'industry') {
        cmp = (a.industry ?? '').localeCompare(b.industry ?? '')
      } else if (key === 'lastActivity') {
        const la = lastActivity.get(a.id) ?? ''
        const lb = lastActivity.get(b.id) ?? ''
        cmp = la.localeCompare(lb)
      }
      return dir === 'asc' ? cmp : -cmp
    })
  }, [customers, sort, lastActivity])

  const arrow = (key: SortKey) =>
    sort?.key === key
      ? <span style={{ fontSize: 9, marginLeft: 3 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
      : null

  if (customers.length === 0) {
    return (
      <div style={{
        padding: '60px 20px', textAlign: 'center',
        color: 'var(--fg-dim)', fontSize: 13,
      }}>
        Keine Kunden matchen diesen Filter.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
              Name {arrow('name')}
            </th>
            <th style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
              Status {arrow('status')}
            </th>
            <th style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('priority')}>
              Priorität {arrow('priority')}
            </th>
            <th style={{ ...th, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('score')}>
              Score {arrow('score')}
            </th>
            <th style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('industry')}>
              Branche {arrow('industry')}
            </th>
            <th style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('lastActivity')}>
              Letzte Aktivität {arrow('lastActivity')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCustomers.map(c => {
            const last = lastActivity.get(c.id)
            return (
              <tr
                key={c.id}
                onClick={() => openCustomer(c.id)}
                style={{
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'background 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                <td style={td}>
                  <span className="chip" data-tone={STATUS_TONE[c.status] ?? ''}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td style={td}>{PRIORITY_LABEL[c.priority] ?? c.priority}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{c.leadScore}</td>
                <td style={{ ...td, color: 'var(--fg-muted)' }}>{c.industry ?? '—'}</td>
                <td style={{ ...td, color: 'var(--fg-muted)', fontSize: 12 }}>
                  {last ? relTime(last) : 'noch nie'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--fg-dim)',
}
const td: React.CSSProperties = {
  padding: '12px 14px',
}
