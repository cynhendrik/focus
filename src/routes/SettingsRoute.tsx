import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { WorkspaceSettings } from '@/components/settings/WorkspaceSettings'
import { ProfilSettings } from '@/components/settings/ProfilSettings'
import { AussehensSettings } from '@/components/settings/AussehensSettings'
import { DeveloperSettings } from '@/components/settings/DeveloperSettings'
import { GefahrenzoneSettings } from '@/components/settings/GefahrenzoneSettings'

export function SettingsRoute() {
  const settingsTab    = useUiStore(s => s.settingsTab)
  const setSettingsTab = useUiStore(s => s.setSettingsTab)
  const workspaceId    = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const showDeveloper = import.meta.env.DEV ||
    new URLSearchParams(window.location.search).has('dev')

  function renderPanel() {
    switch (settingsTab) {
      case 'workspace':    return <WorkspaceSettings workspaceId={workspaceId} />
      case 'profil':       return <ProfilSettings />
      case 'aussehen':     return <AussehensSettings />
      case 'developer':    return <DeveloperSettings workspaceId={workspaceId} />
      case 'gefahrenzone': return <GefahrenzoneSettings workspaceId={workspaceId} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Settings.</h1>
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
