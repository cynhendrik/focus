import { useState } from 'react'
import { Target, TrendingUp, Reply } from 'lucide-react'
import { LeadsRoute }              from './LeadsRoute'
import { PipelineRoute }           from './PipelineRoute'
import { FollowupsDashboardRoute } from './FollowupsDashboardRoute'
import { useLeadsStore }  from '@/store/leads.store'
import { useDealsStore }  from '@/store/deals.store'

type AkquiseTab = 'leads' | 'pipeline' | 'wiedervorlagen'

const TABS: { id: AkquiseTab; label: string; icon: typeof Target }[] = [
  { id: 'leads',          label: 'Leads',          icon: Target     },
  { id: 'pipeline',       label: 'Pipeline',       icon: TrendingUp },
  { id: 'wiedervorlagen', label: 'Wiedervorlagen', icon: Reply      },
]

export function AkquiseRoute() {
  const [tab, setTab] = useState<AkquiseTab>('leads')

  const newLeadCount  = useLeadsStore(s => s.newLeads().length)
  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )

  const badge: Partial<Record<AkquiseTab, number>> = {
    leads:    newLeadCount  || 0,
    pipeline: openDealCount || 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab-Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        background: 'var(--bg)',
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          const count  = badge[t.id] ?? 0
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '12px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                color: active ? 'var(--fg)' : 'var(--fg-dim)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                transition: 'color 140ms',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: active ? 'var(--accent-ink)' : 'var(--fg-dim)',
                  padding: '1px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'leads'          && <LeadsRoute />}
        {tab === 'pipeline'       && <PipelineRoute />}
        {tab === 'wiedervorlagen' && <FollowupsDashboardRoute />}
      </div>
    </div>
  )
}
