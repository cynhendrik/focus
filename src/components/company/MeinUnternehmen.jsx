import { useStore } from '../../store'
import { UnternehmensProfil } from './UnternehmensProfil'
import { ModuleManager } from './ModuleManager'
import { CrmSettings } from './CrmSettings'
import { WorkspaceInfo } from './WorkspaceInfo'
import { FocusAI } from './FocusAI'
const NAV_ITEMS = [
  {
    id: 'focusai', label: 'FOCUS AI', ai: true,
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>,
  },
  {
    id: 'profil', label: 'Unternehmensprofil',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>,
  },
  {
    id: 'module', label: 'Module',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>,
  },
  {
    id: 'crm-settings', label: 'CRM-Einstellungen',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  },
  {
    id: 'workspace', label: 'Workspace',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>,
  },
]

export function MeinUnternehmen() {
  const companyView    = useStore(s => s.companyView)
  const setCompanyView = useStore(s => s.setCompanyView)

  const isFocusAI = companyView === 'focusai'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', flex: 1 }}>

      {/* ── Sub-Nav ── */}
      <div style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg1)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '28px 10px 20px',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text3)', padding: '0 10px', marginBottom: 14 }}>
          Mein Unternehmen
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item, idx) => {
            const active = companyView === item.id
            // Divider + label before settings (after FOCUS AI at idx 0)
            const showSettingsLabel = idx === 1
            return (
              <div key={item.id}>
                {showSettingsLabel && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px 10px' }} />
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text4)', padding: '0 10px', marginBottom: 6 }}>Einstellungen</div>
                  </>
                )}
                <button
                  onClick={() => setCompanyView(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 10px', borderRadius: 'var(--r-md)',
                    border: `1px solid ${active ? 'var(--border3)' : 'transparent'}`,
                    background: active ? 'var(--p5)' : 'transparent',
                    color: active ? 'var(--p)' : item.ai ? 'var(--p)' : 'var(--text2)',
                    fontSize: 13, fontWeight: active ? 700 : item.ai ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s', textAlign: 'left', width: '100%',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = item.ai ? 'var(--p5)' : 'var(--bg2)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  {item.icon}
                  {item.label}
                  {item.ai && !active && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 99, background: 'var(--p5)', color: 'var(--p)', border: '1px solid var(--border3)' }}>AI</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Content ── */}
      {isFocusAI ? (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <FocusAI />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          {companyView === 'profil'        && <UnternehmensProfil />}
          {companyView === 'module'        && <ModuleManager />}
          {companyView === 'crm-settings'  && <CrmSettings />}
          {companyView === 'workspace'     && <WorkspaceInfo />}
        </div>
      )}
    </div>
  )
}
