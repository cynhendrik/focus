import { Target, TrendingUp, Reply } from 'lucide-react'
import { LeadsRoute }              from './LeadsRoute'
import { PipelineRoute }           from './PipelineRoute'
import { FollowupsDashboardRoute } from './FollowupsDashboardRoute'
import { useLeadsStore }  from '@/store/leads.store'
import { useDealsStore }  from '@/store/deals.store'
import { useUiStore }     from '@/store/ui.store'

type AkquiseTab = 'leads' | 'pipeline' | 'wiedervorlagen'

const TABS: { id: AkquiseTab; label: string; icon: typeof Target }[] = [
  { id: 'leads',          label: 'Leads',        icon: Target     },
  { id: 'pipeline',       label: 'Pipeline',     icon: TrendingUp },
  { id: 'wiedervorlagen', label: 'Follow-ups',   icon: Reply      },
]

function viewToTab(view: string): AkquiseTab {
  if (view === 'pipeline')  return 'pipeline'
  if (view === 'followups') return 'wiedervorlagen'
  return 'leads'
}

export function AkquiseRoute() {
  const appView    = useUiStore(s => s.appView)
  const setAppView = useUiStore(s => s.setAppView)

  const newLeadCount  = useLeadsStore(s => s.newLeads().length)
  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )

  const tab = viewToTab(appView)

  const setTab = (t: AkquiseTab) => {
    if (t === 'pipeline')       setAppView('pipeline')
    else if (t === 'wiedervorlagen') setAppView('followups')
    else                        setAppView('leads')
  }

  const badge: Partial<Record<AkquiseTab, number>> = {
    leads:    newLeadCount  || 0,
    pipeline: openDealCount || 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '0 48px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
        {TABS.map(t => {
          const active = tab === t.id
          const b = badge[t.id]
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '18px 18px 16px', marginRight: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: active ? 'var(--fg)' : 'var(--fg-dim)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: active ? 600 : 500, letterSpacing: '-0.01em', position: 'relative', transition: 'color 140ms' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-dim)' }}>
              <t.icon size={14} />
              {t.label}
              {b ? <span style={{ fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 99, background: active ? 'var(--accent)' : 'var(--surface-3)', color: active ? 'var(--accent-ink)' : 'var(--fg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', fontFamily: 'var(--font-mono)' }}>{b}</span> : null}
              {active && <span style={{ position: 'absolute', left: 18, right: 18, bottom: -1, height: 2, borderRadius: 2, background: 'oklch(92% 0.2 125)', boxShadow: '0 0 12px oklch(92% 0.2 125 / 0.5)' }} />}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'leads'          && <LeadsRoute />}
        {tab === 'pipeline'       && <PipelineRoute />}
        {tab === 'wiedervorlagen' && <FollowupsDashboardRoute />}
      </div>
    </div>
  )
}
