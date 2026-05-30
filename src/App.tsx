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
import { SettingsRoute }   from '@/routes/SettingsRoute'
import { ProfileRoute }    from '@/routes/ProfileRoute'
import { LeadsRoute }            from '@/routes/LeadsRoute'
import { PipelineRoute }         from '@/routes/PipelineRoute'
import { FollowupsDashboardRoute } from '@/routes/FollowupsDashboardRoute'
import { CalendarRoute }         from '@/routes/CalendarRoute'
import { MailRoute }             from '@/routes/MailRoute'
import { useLeadsStore }        from '@/store/leads.store'
import { useCalendarStore }     from '@/store/calendar.store'
import { DownloadToast }        from '@/components/ui/DownloadToast'
import { GlobalQuickComposer } from '@/components/global/GlobalQuickComposer'
import { ToastViewport }       from '@/components/ui/Toast'
import { SplashScreen }        from '@/components/ui/SplashScreen'
import { RouteSwitch }         from '@/components/layout/RouteSwitch'
import { OnboardingWizard, hasCompletedOnboarding } from '@/components/onboarding/OnboardingWizard'
import { seedSampleAiSummaries } from '@/lib/seed-ai-summaries'

export default function App() {
  const initAuth        = useAuthStore(s => s.init)
  const user            = useAuthStore(s => s.user)
  const authLoading     = useAuthStore(s => s.loading)
  const loadWorkspaces  = useWorkspaceStore(s => s.loadWorkspaces)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const init            = useAccountsStore(s => s.init)
  const initCustomers   = useCustomersStore(s => s.init)
  const loadLastActivity = useCrmStore(s => s.loadLastActivity)
  const loadCrmAll       = useCrmStore(s => s.loadAll)
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
  // Onboarding signal — must be called BEFORE any early return below to satisfy
  // the Rules of Hooks. Hook order must be stable across renders.
  const customersCount    = useCustomersStore(s => s.customers.length)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  // ── Splash ────────────────────────────────────────────────────────────────
  const [minTimeDone,  setMinTimeDone]  = useState(false)
  const [splashExit,   setSplashExit]   = useState(false)
  const [splashGone,   setSplashGone]   = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 4300)
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
      // Cmd/Ctrl+K → Client picker (jump to a specific customer)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openPicker()
        return
      }
      // Cmd/Ctrl+J → Global Spotlight search (across everything)
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setCmdPaletteOpen(true)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openPicker, setCmdPaletteOpen])

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
      loadCrmAll(activeWorkspaceId)
      SmartListService.seedSystemLists(activeWorkspaceId)
        .catch(() => {})
        .then(() => loadSmartLists(activeWorkspaceId))
      PipelineService.seed(activeWorkspaceId).catch(() => {}).then(() =>
        loadPipelineStages(activeWorkspaceId)
      )
      loadAllDeals(activeWorkspaceId)
      loadAllTodos(activeWorkspaceId).then(() => seedSampleAiSummaries())
      syncLeads(activeWorkspaceId)
      loadLeads(activeWorkspaceId)
      loadCalendar(activeWorkspaceId)
    }
  }, [activeWorkspaceId, init, initCustomers, loadLastActivity, loadCrmAll, loadSmartLists, loadPipelineStages, loadAllDeals, loadAllTodos, syncLeads, loadLeads, loadCalendar])

  useSyncBridge()

  if (!splashGone) return <SplashScreen exiting={splashExit} />

  if (!user && !DEV_BYPASS) return <LoginScreen />

  if (!activeWorkspaceId && !DEV_BYPASS) return <WorkspacePicker />

  const renderMain = () => {
    switch (appView) {
      case 'dashboard':    return <DashboardRoute />
      case 'profile':      return <ProfileRoute />
      case 'clients':      return <ClientsRoute />
      case 'invoices':     return <FinanceRoute />
      case 'leads':        return <LeadsRoute />
      case 'pipeline':     return <PipelineRoute />
      case 'followups':    return <FollowupsDashboardRoute />
      case 'calendar':     return <CalendarRoute />
      case 'mail':         return <MailRoute />
      case 'settings':     return <SettingsRoute />
      // Legacy fallbacks (consolidated wrappers removed)
      case 'sales':        return <LeadsRoute />
      case 'inbox':        return <MailRoute />
      default:             return <DashboardRoute />
    }
  }

  // Use selected customer ID as part of the key so opening different customers
  // also triggers the transition (CustomerRoute is rendered via appView='clients').
  const routeKey = appView === 'clients' && selectedCustomerId
    ? `clients:${selectedCustomerId}`
    : appView

  // First-run onboarding: shown if user has never completed it AND there are
  // no customers yet. Once they finish (or skip) it stays gone.
  // (Hooks declared at top of component to satisfy Rules of Hooks.)
  const showOnboarding = !onboardingDismissed
    && !hasCompletedOnboarding()
    && customersCount === 0
    && !!activeWorkspaceId

  return (
    <AppShell>
      <div className="app">
        <NavSidebar />
        <main className="main">
          <Topbar />
          <ErrorBoundary>
            <RouteSwitch viewKey={routeKey}>
              {renderMain()}
            </RouteSwitch>
          </ErrorBoundary>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
      {pickerOpen && <ClientPicker />}
      <DownloadToast />
      <ToastViewport />
      <GlobalQuickComposer />
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setOnboardingDismissed(true)} />
      )}
    </AppShell>
  )
}
