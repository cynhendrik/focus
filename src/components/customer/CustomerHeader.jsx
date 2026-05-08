import { useStore, PRIVAT_ID } from '../../store'
import { Avatar } from '../ui/Avatar'
import { healthColor, timeAgo } from '../../utils/helpers'

const ALL_TABS = [
  { id: 'dashboard',     label: 'Dashboard',     moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg> },
  { id: 'workflow',      label: 'Workflow',       moduleKey: 'workflow',    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
  { id: 'ablage',        label: 'Ablage',         moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"/></svg> },
  { id: 'kommunikation', label: 'Kommunikation',  moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> },
  { id: 'historie',      label: 'Historie',       moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { id: 'health',        label: 'Health',         moduleKey: 'healthScore', icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
  { id: 'social',        label: 'Social Media',   moduleKey: 'socialMedia', icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg> },
  { id: 'zeit',          label: 'Zeit',           moduleKey: null,          icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={1.75}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6v6l4 2"/></svg> },
]

export function CustomerHeader({ customer, healthScore, activeTab, onTabChange }) {
  const modules   = useStore(s => s.modules)
  const isPrivat  = customer?.id === PRIVAT_ID
  const PRIVAT_HIDDEN = new Set(['social', 'health', 'zeit', 'kommunikation'])
  const tabs = ALL_TABS.filter(t => {
    if (isPrivat && PRIVAT_HIDDEN.has(t.id)) return false
    return t.moduleKey === null || modules[t.moduleKey]
  })
  const score = healthScore?.score
  const color = healthColor(score)

  return (
    <div style={{ background: 'var(--bg1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {/* Customer info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 32px 16px' }}>
        <Avatar name={customer.name} id={customer.id} size={64} radius={16} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 6 }}>
            {customer.name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {customer.category && (
              <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 'var(--r-pill)', background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 500 }}>
                {customer.category}
              </span>
            )}
            <span style={{ fontSize: 12, padding: '3px 12px', borderRadius: 'var(--r-pill)', background: 'rgba(34,197,94,0.10)', color: 'var(--green)', fontWeight: 600 }}>
              {customer.status === 'inaktiv' ? 'Inaktiv' : 'Aktiv'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              Letzte Aktivität: {timeAgo(customer.updatedAt)}
            </span>
          </div>
        </div>
        {score != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--text)', lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text3)', marginTop: 2 }}>Health Score</div>
            <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 2 }}>↑ +6</div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '0 24px' }}>
        {tabs.map(tab => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 'var(--r-md) var(--r-md) 0 0',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: active ? 600 : 400,
                background: active ? 'var(--p)' : 'transparent',
                color: active ? '#fff' : 'var(--text3)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)' }}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
