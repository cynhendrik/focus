// src/components/smart-lists/CustomerTableFiltered.tsx
import { useUiStore } from '@/store/ui.store'
import type { Customer } from '@/types/customer.types'

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv', lead: 'Lead', inaktiv: 'Inaktiv', lost: 'Lost',
}
const STATUS_TONE: Record<string, string> = {
  aktiv: 'ok', lead: 'accent', inaktiv: 'warn', lost: 'bad',
}
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig', normal: 'Normal', high: 'Hoch',
}

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

  const openCustomer = (id: string) => {
    setSelected(id)
    setAppView('clients')
  }

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
            <th style={th}>Name</th>
            <th style={th}>Status</th>
            <th style={th}>Priorität</th>
            <th style={{ ...th, textAlign: 'right' }}>Score</th>
            <th style={th}>Branche</th>
            <th style={th}>Letzte Aktivität</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => {
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
