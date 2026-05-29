import { useEffect } from 'react'
import { TrendingUp, Clock, AlertTriangle, Users, Lightbulb } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

const TONE_COLOR: Record<string, string> = {
  ok:      'var(--ok)',
  warn:    'var(--warn)',
  bad:     'var(--danger)',
  neutral: 'var(--accent)',
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  tone?: 'ok' | 'warn' | 'bad' | 'neutral'
}

function KpiCard({ label, value, sub, icon, tone = 'neutral' }: KpiCardProps) {
  const color = TONE_COLOR[tone]
  return (
    <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="card-label">{label}</span>
        <span style={{ color, opacity: 0.7 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{sub}</div>}
    </div>
  )
}

export function FinanceKPIs() {
  const kpis        = useFinanceStore(s => s.kpis)
  const loadKpis    = useFinanceStore(s => s.loadKpis)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  useEffect(() => {
    if (workspaceId) loadKpis(workspaceId)
  }, [workspaceId, loadKpis])

  if (!kpis) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64, color: 'var(--fg-dim)', fontSize: 13 }}>
        Lade KPIs…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row-4" style={{ marginBottom: 0 }}>
        <KpiCard
          label="Monatsumsatz"
          value={fmt(kpis.monthRevenue)}
          sub="Bezahlte Rechnungen diesen Monat"
          icon={<TrendingUp size={18} />}
          tone="ok"
        />
        <KpiCard
          label="Jahresumsatz"
          value={fmt(kpis.yearRevenue)}
          sub="Bezahlte Rechnungen dieses Jahr"
          icon={<TrendingUp size={18} />}
          tone="neutral"
        />
        <KpiCard
          label="Offen"
          value={fmt(kpis.openTotal)}
          sub={`${kpis.openCount} Rechnung${kpis.openCount !== 1 ? 'en' : ''}`}
          icon={<Clock size={18} />}
          tone={kpis.openCount > 0 ? 'warn' : 'neutral'}
        />
        <KpiCard
          label="Überfällig"
          value={fmt(kpis.overdueTotal)}
          sub={`${kpis.overdueCount} Rechnung${kpis.overdueCount !== 1 ? 'en' : ''}`}
          icon={<AlertTriangle size={18} />}
          tone={kpis.overdueCount > 0 ? 'bad' : 'neutral'}
        />
      </div>

      {kpis.suggestionCount > 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
          <Lightbulb size={16} style={{ color: 'var(--warn)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            <strong style={{ color: 'var(--warn)' }}>{kpis.suggestionCount} Rechnungsvorschlag{kpis.suggestionCount !== 1 ? 'e' : ''}</strong> warten auf Freigabe
          </span>
        </div>
      )}

      {kpis.topClients.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Users size={15} style={{ color: 'var(--fg-muted)' }} />
            <span className="card-label">Top-Kunden (Umsatz)</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {kpis.topClients.map((client, i) => {
              const maxVal = kpis.topClients[0]?.total ?? 1
              const pct = (client.total / maxVal) * 100
              return (
                <div key={client.accountId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="mono" style={{ width: 18, fontSize: 11, color: 'var(--fg-dim)' }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{client.name}</span>
                  <div style={{ width: 120, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
                  </div>
                  <span className="mono" style={{ width: 88, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                    {fmt(client.total)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
