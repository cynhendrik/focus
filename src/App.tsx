import { useEffect, useState } from 'react'
import { useClientPickerStore } from '@/store/client-picker.store'
import { ClientPicker } from '@/components/clients/ClientPicker'
import { AppShell }    from '@/components/layout/AppShell'
import { NavSidebar }  from '@/components/layout/NavSidebar'
import { Topbar }      from '@/components/layout/Topbar'
import { useAccountsStore } from '@/store/accounts.store'
import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { SmartListService }   from '@/services/smart-list.service'
import { PipelineService }    from '@/services/pipeline.service'
import { usePipelineStore }   from '@/store/pipeline.store'
import { useDealsStore }      from '@/store/deals.store'
import { useTodosStore }      from '@/store/todos.store'
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
import { FinanceRoute }    from '@/routes/FinanceRoute'
import { TasksRoute }      from '@/routes/TasksRoute'
import { KpisRoute }       from '@/routes/KpisRoute'
import { InsightsRoute }   from '@/routes/InsightsRoute'
import { CalendarRoute }   from '@/routes/CalendarRoute'
import { MailRoute }       from '@/routes/MailRoute'
import { CrmRoute }        from '@/routes/CrmRoute'
import { SettingsRoute }   from '@/routes/SettingsRoute'
import { ProfileRoute }    from '@/routes/ProfileRoute'
import { PipelineRoute }         from '@/routes/PipelineRoute'
import { FollowupsDashboardRoute } from '@/routes/FollowupsDashboardRoute'
import { WorkstationRoute }     from '@/routes/WorkstationRoute'
import { SmartListsRoute }      from '@/routes/SmartListsRoute'
import { ChatRoute }            from '@/routes/ChatRoute'
import { LeadsRoute }           from '@/routes/LeadsRoute'
import { useLeadsStore }        from '@/store/leads.store'
import { useCalendarStore }     from '@/store/calendar.store'
import { DownloadToast }        from '@/components/ui/DownloadToast'
import { SplashScreen }        from '@/components/ui/SplashScreen'

export default function App() {
  const initAuth        = useAuthStore(s => s.init)
  const user            = useAuthStore(s => s.user)
  const authLoading     = useAuthStore(s => s.loading)
  const loadWorkspaces  = useWorkspaceStore(s => s.loadWorkspaces)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const init            = useAccountsStore(s => s.init)
  const initCustomers   = useCustomersStore(s => s.init)
  const loadLastActivity = useCrmStore(s => s.loadLastActivity)
  const loadSmartLists  = useSmartListsStore(s => s.load)
  const loadPipelineStages = usePipelineStore(s => s.load)
  const loadAllDeals    = useDealsStore(s => s.loadAll)
  const loadAllTodos    = useTodosStore(s => s.loadAll)
  const syncLeads       = useLeadsStore(s => s.syncPending)
  const loadLeads       = useLeadsStore(s => s.load)
  const loadCalendar    = useCalendarStore(s => s.load)
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)
  const appView         = useUiStore(s => s.appView)
  const cmdOpen           = useUiStore(s => s.cmdPaletteOpen)
  const setCmdPaletteOpen = useUiStore(s => s.setCmdPaletteOpen)
  const pickerOpen        = useClientPickerStore(s => s.isOpen)
  const openPicker        = useClientPickerStore(s => s.open)

  // ── Splash ────────────────────────────────────────────────────────────────
  const [minTimeDone,  setMinTimeDone]  = useState(false)
  const [splashExit,   setSplashExit]   = useState(false)
  const [splashGone,   setSplashGone]   = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 4600)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (minTimeDone && !authLoading) {
      setSplashExit(true)
      const t = setTimeout(() => setSplashGone(true), 580)
      return () => clearTimeout(t)
    }
  }, [minTimeDone, authLoading])
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openPicker()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openPicker])

  useEffect(() => {
    if (DEV_BYPASS && !activeWorkspaceId) {
      useWorkspaceStore.getState().setActiveWorkspace('dev')
    }
  }, [])

  useEffect(() => {
    if (user) loadWorkspaces()
  }, [user, loadWorkspaces])

  useEffect(() => {
    if (activeWorkspaceId) {
      init()
      initCustomers()
      loadLastActivity(activeWorkspaceId)
      SmartListService.seedSystemLists(activeWorkspaceId)
        .catch(() => {})
        .then(() => loadSmartLists(activeWorkspaceId))
      PipelineService.seed(activeWorkspaceId).catch(() => {}).then(() =>
        loadPipelineStages(activeWorkspaceId)
      )
      loadAllDeals(activeWorkspaceId)
      loadAllTodos(activeWorkspaceId)
      syncLeads(activeWorkspaceId)
      loadLeads(activeWorkspaceId)
      loadCalendar(activeWorkspaceId)
    }
  }, [activeWorkspaceId, init, initCustomers, loadLastActivity, loadSmartLists, loadPipelineStages, loadAllDeals, loadAllTodos, syncLeads, loadLeads, loadCalendar])

  useSyncBridge()

  if (!splashGone) return <SplashScreen exiting={splashExit} />

  if (!user && !DEV_BYPASS) return <LoginScreen />

  if (!activeWorkspaceId && !DEV_BYPASS) return <WorkspacePicker />

  const renderMain = () => {
    switch (appView) {
      case 'dashboard':  return <DashboardRoute />
      case 'profile':    return <ProfileRoute />
      case 'clients':    return <ClientsRoute />
      case 'pipeline':     return <PipelineRoute />
      case 'followups':    return <FollowupsDashboardRoute />
      case 'workstation':  return <WorkstationRoute />
      case 'smartlists':   return <SmartListsRoute />
      case 'chat':         return <ChatRoute />
      case 'leads':        return <LeadsRoute />
      case 'invoices':   return <FinanceRoute />
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
      <div className="app">
        <NavSidebar />
        <main className="main">
          <Topbar />
          <ErrorBoundary>
            {renderMain()}
          </ErrorBoundary>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
      {pickerOpen && <ClientPicker />}
      <DownloadToast />
    </AppShell>
  )
}
