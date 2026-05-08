import { useStore } from '../../store'

const MODULE_DEFS = [
  { key: 'crm',         label: 'CRM',             required: true,  description: 'Kundenverwaltung, Kontakte und Aktivitäten — das Herzstück von Cynera.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg> },
  { key: 'workflow',    label: 'Workflow',         required: false, description: 'To-Dos, Notizen und Aufgabenverwaltung für jeden Kunden.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4"/></svg> },
  { key: 'socialMedia', label: 'Social Media',     required: false, description: 'Instagram-Analyse, Reels-Tracking und Reporting.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg> },
  { key: 'deals',       label: 'Deals / Pipeline', required: false, description: 'Vertriebspipeline und Deal-Tracking. (Coming soon)',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg> },
  { key: 'followUps',   label: 'Follow-Ups',       required: false, description: 'Automatische Erinnerungen und Follow-Up-Planung. (Coming soon)',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
  { key: 'healthScore', label: 'Health Score',     required: false, description: 'Kundengesundheit, Performance-Monitoring und Score-Tracking.',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
  { key: 'aiInsights',  label: 'AI Insights',      required: false, description: 'KI-gestützte Kundenanalysen und Empfehlungen. (Coming soon)',
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg> },
]

function Toggle({ on, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!on)} style={{
      width: 44, height: 24, borderRadius: 99, padding: '0 3px',
      background: on ? 'var(--p)' : 'var(--bg4)',
      border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', transition: 'background 0.2s', flexShrink: 0,
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transform: on ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

export function ModuleManager() {
  const modules   = useStore(s => s.modules)
  const setModule = useStore(s => s.setModule)

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>Module</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Aktiviere oder deaktiviere Funktionen für deinen Workspace</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {MODULE_DEFS.map(mod => {
          const active = modules[mod.key]
          return (
            <div key={mod.key} style={{
              background: 'var(--bg1)', border: `1px solid ${active ? 'var(--border3)' : 'var(--border)'}`,
              borderRadius: 'var(--r-lg)', padding: '20px',
              display: 'flex', gap: 16, alignItems: 'flex-start',
              opacity: !active && !mod.required ? 0.65 : 1,
              transition: 'opacity 0.2s, border-color 0.2s',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: active ? 'var(--p5)' : 'var(--bg3)',
                border: `1px solid ${active ? 'var(--border3)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: active ? 'var(--p)' : 'var(--text3)', transition: 'all 0.2s',
              }}>{mod.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{mod.label}</span>
                  {mod.required
                    ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--p5)', color: 'var(--p)', fontWeight: 600 }}>Immer aktiv</span>
                    : <Toggle on={active} onChange={v => setModule(mod.key, v)} />}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.55, margin: 0 }}>{mod.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
