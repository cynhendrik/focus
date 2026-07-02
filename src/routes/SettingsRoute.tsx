import { useEffect } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { WorkspaceSettings } from '@/components/settings/WorkspaceSettings'
import { ModuleSettings } from '@/components/settings/ModuleSettings'
import { IntegrationenSettings } from '@/components/settings/IntegrationenSettings'
import { DeveloperSettings } from '@/components/settings/DeveloperSettings'
import { GefahrenzoneSettings } from '@/components/settings/GefahrenzoneSettings'
import { AuftraegeSettings } from '@/components/settings/AuftraegeSettings'
import { AussehensSettings } from '@/components/settings/AussehensSettings'
import { DatenschutzSettings } from '@/components/settings/DatenschutzSettings'
import { LizenzenSettings } from '@/components/settings/LizenzenSettings'
import { BenachrichtigungenSettings } from '@/components/settings/BenachrichtigungenSettings'

export function SettingsRoute() {
  const settingsTab    = useUiStore(s => s.settingsTab)
  const setSettingsTab = useUiStore(s => s.setSettingsTab)
  const workspaceId    = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const showDeveloper = import.meta.env.DEV ||
    localStorage.getItem('cynera:dev-mode') === '1'

  const VALID_TABS = ['workspace', 'aussehen', 'module', 'integrationen', 'datenschutz', 'lizenzen', 'developer', 'gefahrenzone', 'auftraege', 'benachrichtigungen']
  useEffect(() => {
    if (!VALID_TABS.includes(settingsTab)) setSettingsTab('workspace')
  }, [])

  function renderPanel() {
    switch (settingsTab) {
      case 'workspace':     return <WorkspaceSettings workspaceId={workspaceId} />
      case 'aussehen':      return <AussehensSettings />
      case 'module':        return <ModuleSettings />
      case 'integrationen': return <IntegrationenSettings />
      case 'datenschutz':   return <DatenschutzSettings />
      case 'lizenzen':      return <LizenzenSettings />
      case 'developer':     return showDeveloper ? <DeveloperSettings workspaceId={workspaceId} /> : <WorkspaceSettings workspaceId={workspaceId} />
      case 'gefahrenzone':  return <GefahrenzoneSettings workspaceId={workspaceId} />
      case 'auftraege':          return <AuftraegeSettings />
      case 'benachrichtigungen': return <BenachrichtigungenSettings />
      default:                   return <WorkspaceSettings workspaceId={workspaceId} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Einstellungen</h1>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <SettingsSidebar
            active={settingsTab}
            onChange={setSettingsTab}
            showDeveloper={showDeveloper}
          />
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
            {renderPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}
