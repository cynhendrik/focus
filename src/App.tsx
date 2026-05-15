import { useEffect } from 'react'
import { AppShell }    from '@/components/layout/AppShell'
import { NavSidebar }  from '@/components/layout/NavSidebar'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore }   from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

const DEV_BYPASS = import.meta.env.DEV
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { CommandPalette } from '@/components/CommandPalette'
import { LoginScreen }   from '@/core/auth/LoginScreen'
import { WorkspacePicker } from '@/core/workspace/WorkspacePicker'
import { useSyncBridge } from '@/core/sync/useSyncBridge'

import { DashboardRoute }  from '@/routes/DashboardRoute'
import { ClientsRoute }    from '@/routes/ClientsRoute'
import { InvoicesRoute }   from '@/routes/InvoicesRoute'
import { TasksRoute }      from '@/routes/TasksRoute'
import { KpisRoute }       from '@/routes/KpisRoute'
import { InsightsRoute }   from '@/routes/InsightsRoute'
import { CalendarRoute }   from '@/routes/CalendarRoute'
import { MailRoute }       from '@/routes/MailRoute'
import { CrmRoute }        from '@/routes/CrmRoute'
import { SettingsRoute }   from '@/routes/SettingsRoute'
import { ProfileRoute }    from '@/routes/ProfileRoute'

export default function App() {
  const initAuth        = useAuthStore(s => s.init)
  const user            = useAuthStore(s => s.user)
  const authLoading     = useAuthStore(s => s.loading)
  const loadWorkspaces  = useWorkspaceStore(s => s.loadWorkspaces)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const init            = useCustomersStore(s => s.init)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const appView         = useUiStore(s => s.appView)
  const cmdOpen         = useUiStore(s => s.cmdPaletteOpen)
  const setCmdPaletteOpen = useUiStore(s => s.setCmdPaletteOpen)

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    if (DEV_BYPASS && !activeWorkspaceId) {
      useWorkspaceStore.getState().setActiveWorkspace('dev')
    }
  }, [])

  useEffect(() => {
    if (user) loadWorkspaces()
  }, [user, loadWorkspaces])

  useEffect(() => {
    if (activeWorkspaceId) init()
  }, [activeWorkspaceId, init])

  useSyncBridge()

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user && !DEV_BYPASS) return <LoginScreen />

  if (!activeWorkspaceId && !DEV_BYPASS) return <WorkspacePicker />

  const renderMain = () => {
    switch (appView) {
      case 'dashboard':  return <DashboardRoute />
      case 'profile':    return <ProfileRoute />
      case 'clients':    return <ClientsRoute />
      case 'invoices':   return <InvoicesRoute />
      case 'tasks':      return <TasksRoute />
      case 'kpis':       return <KpisRoute />
      case 'insights':   return <InsightsRoute />
      case 'calendar':   return <CalendarRoute />
      case 'mail':       return <MailRoute />
      case 'crm':        return <CrmRoute />
      case 'settings':   return <SettingsRoute />
      default:           return <DashboardRoute />
    }
  }

  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        <NavSidebar />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            {renderMain()}
          </ErrorBoundary>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
    </AppShell>
  )
}
