import { useEffect } from 'react'
import { useAccountsStore } from '@/store/accounts.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useFinanceStore } from '@/store/finance.store'
import { ChevronLeft } from 'lucide-react'

interface Props {
  customerId: string | undefined
  customerName: string
  completedCount: number
  totalCount: number
  onBack: () => void
}

function KpiTile({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 12px',
    }}>
      <div style={{
        fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor ?? 'var(--fg)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

const ACT_COLOR: Record<string, string> = {
  email: 'var(--info)',
  email_out: 'var(--info)',
  email_in: 'var(--info)',
  call: '#888',
  note: 'var(--accent)',
  invoice: 'oklch(72% 0.18 25)',
}

export function FocusCustomerPanel({ customerId, customerName, completedCount, totalCount, onBack }: Props) {
  const accounts   = useAccountsStore(s => s.accounts)
  const activities = useActivitiesStore(s => s.activities)
  const loadActs   = useActivitiesStore(s => s.loadForCustomer)
  const invoices   = useFinanceStore(s => s.invoices)

  useEffect(() => {
    if (customerId) loadActs(customerId).catch(() => {})
  }, [customerId, loadActs])

  const account = accounts.find(a => a.id === customerId)

  const customerInvoices = invoices.filter(i => i.accountId === customerId)
  const openInvoices = customerInvoices.filter(i => i.status !== 'paid')
  const openInvoiceTotal = openInvoices.reduce((sum, i) => sum + i.total, 0)

  const recentActs = [...activities]
    .filter(a => a.accountId === customerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)

  const inits = customerName.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Customer header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 99,
            background: 'linear-gradient(135deg, var(--accent), oklch(60% 0.25 280))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 11, color: 'var(--accent-ink)', flexShrink: 0,
          }}>
            {inits}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {customerName}
            </div>
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'oklch(82% 0.2 125 / 0.1)', color: 'var(--accent)',
              padding: '2px 6px', borderRadius: 99, display: 'inline-block', marginTop: 2,
            }}>
              Aktiv · Session
            </div>
          </div>
        </div>

        {/* Session progress */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{
            fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 6,
          }}>
            Session-Fortschritt
          </div>
          <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, marginBottom: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', background: 'var(--accent)',
              borderRadius: 99, transition: 'width 400ms ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-dim)' }}>
            <span>{completedCount} von {totalCount}</span>
            <span style={{ color: 'var(--accent)' }}>{pct}%</span>
          </div>
        </div>

        {/* Pipeline phase */}
        {account?.pipelinePhaseLabel && (
          <KpiTile label="Pipeline-Phase" value={account.pipelinePhaseLabel} sub={account.status} />
        )}

        {/* Last contact */}
        {recentActs[0] && (
          <KpiTile
            label="Letzter Kontakt"
            value={`${Math.floor((Date.now() - new Date(recentActs[0].updatedAt).getTime()) / 86_400_000)} Tage`}
            sub={recentActs[0].type}
          />
        )}

        {/* Open invoices */}
        {openInvoiceTotal > 0 && (
          <KpiTile
            label="Offene Rechnungen"
            value={`${openInvoiceTotal.toLocaleString('de-DE')} €`}
            sub={`${openInvoices.length} offen`}
            valueColor="oklch(72% 0.18 25)"
          />
        )}

        {/* Website */}
        {account?.website && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', fontSize: 11, color: 'var(--fg-muted)' }}>
              <span style={{ color: 'var(--fg-dim)', fontSize: 10 }}>🌐</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.website}</span>
            </div>
          </div>
        )}

        {/* Activity timeline */}
        {recentActs.length > 0 && (
          <div>
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 8,
            }}>
              Letzte Aktivität
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentActs.map((act, i) => {
                const daysAgo = Math.floor((Date.now() - new Date(act.updatedAt).getTime()) / 86_400_000)
                return (
                  <div key={act.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 0',
                    borderBottom: i < recentActs.length - 1 ? '1px solid var(--border)' : undefined,
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: 99, flexShrink: 0, marginTop: 4,
                      background: ACT_COLOR[act.type] ?? 'var(--fg-dim)',
                    }} />
                    <div style={{ flex: 1, fontSize: 10, color: 'var(--fg-dim)', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                        {act.title || act.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', flexShrink: 0, marginTop: 2 }}>
                      {daysAgo === 0 ? 'Heute' : `${daysAgo}d`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Back button */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%', padding: '8px 10px', borderRadius: 9,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-dim)', fontSize: 11, cursor: 'pointer',
          }}
        >
          <ChevronLeft size={13} />
          Alle Kunden
        </button>
      </div>
    </div>
  )
}
