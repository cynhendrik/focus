import { useEffect, useState } from 'react'
import { useClientPickerStore } from '@/store/client-picker.store'
import { ClientPicker } from '@/components/clients/ClientPicker'
import { AppShell }    from '@/components/layout/AppShell'
import { NavSidebar }  from '@/components/layout/NavSidebar'
import { Topbar }      from '@/components/layout/Topbar'
import { useAccountsStore } from '@/store/accounts.store'
import { useCustomersStore } from '@/store/customers.store'
import { useCrmStore } from '@/store/crm.store'
import { PipelineService }    from '@/services/pipeline.service'
import { usePipelineStore }   from '@/store/pipeline.store'
import { LeadStagesService }  from '@/services/lead-stages.service'
import { useLeadStagesStore } from '@/store/lead-stages.store'
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
import { IntegrationsRoute } from '@/routes/IntegrationsRoute'
import { ProfileRoute }    from '@/routes/ProfileRoute'
import { LeadsRoute }            from '@/routes/LeadsRoute'
import { PipelineRoute }         from '@/routes/PipelineRoute'
import { FollowupsDashboardRoute } from '@/routes/FollowupsDashboardRoute'
import { CalendarRoute }         from '@/routes/CalendarRoute'
import { MailRoute }             from '@/routes/MailRoute'
import { JournalRoute }          from '@/routes/JournalRoute'
import { FocusRoute }            from '@/routes/FocusRoute'
import { PrivateShell }          from '@/routes/private/PrivateShell'
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
  const sidebarCollapsed  = useUiStore(s => s.sidebarCollapsed)
  const appMode           = useUiStore(s => s.appMode)
  const pickerOpen        = useClientPickerStore(s => s.isOpen)
  const openPicker        = useClientPickerStore(s => s.open)
  // Onboarding signal — must be called BEFORE any early return below to satisfy
  // the Rules of Hooks. Hook order must be stable across renders.
  const customersCount    = useCustomersStore(s => s.customers.length)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  // ── Splash ────────────────────────────────────────────────────────────────
  // Splash wartet auf zwei Bedingungen: ein kurzer Min-Floor (damit der Splash
  // nicht kurz aufblitzt) UND Auth fertig. Frueher 4300 ms — das war ein
  // fester Floor, auch wenn Auth in 200 ms zurueckkam. Jetzt 900 ms: lang
  // genug, dass das Branding wahrgenommen wird, kurz genug, dass es sich nicht
  // wie eine traege App anfuehlt.
  const [minTimeDone,  setMinTimeDone]  = useState(false)
  const [splashExit,   setSplashExit]   = useState(false)
  const [splashGone,   setSplashGone]   = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 900)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (minTimeDone && !authLoading) {
      setSplashExit(true)
      const t = setTimeout(() => setSplashGone(true), 320)
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
    if (!activeWorkspaceId) return

    // Welle 1 — alles, was die Dashboard-Route beim ersten Paint zeigt.
    // Vorher liefen 11 Loads gleichzeitig parallel, jeder triggerte beim
    // Settlen einen Re-Render → spuerbarer Hang beim Workspace-Wechsel.
    init()
    initCustomers()
    loadCrmAll(activeWorkspaceId)
    loadCalendar(activeWorkspaceId)
    loadAllTodos(activeWorkspaceId)

    // Welle 2 — alles, was erst beim Klick auf eine andere Route gebraucht
    // wird, nach dem ersten Paint nachschieben (Idle wenn verfuegbar, sonst
    // Macro-Task). Spart auf dem kritischen Pfad ~6 store-updates.
    const ric: (cb: () => void) => number =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200))

    const handle = ric(() => {
      loadLastActivity(activeWorkspaceId)
      PipelineService.seed(activeWorkspaceId).catch(() => {}).then(() =>
        loadPipelineStages(activeWorkspaceId)
      )
      LeadStagesService.seed(activeWorkspaceId).catch(() => {}).then(() =>
        useLeadStagesStore.getState().load(activeWorkspaceId)
      )
      loadAllDeals(activeWorkspaceId)
      syncLeads(activeWorkspaceId)
      loadLeads(activeWorkspaceId)
      // Demo-Seeder gehoert ganz nach hinten, blockiert nichts.
      seedSampleAiSummaries()
    })

    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback
      if (cic) cic(handle)
      else window.clearTimeout(handle)
    }
  }, [activeWorkspaceId, init, initCustomers, loadLastActivity, loadCrmAll, loadPipelineStages, loadAllDeals, loadAllTodos, syncLeads, loadLeads, loadCalendar])

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
      case 'journal':      return <JournalRoute />
      case 'calendar':     return <CalendarRoute />
      case 'mail':         return <MailRoute />
      case 'settings':     return <SettingsRoute />
      case 'integrations': return <IntegrationsRoute />
      case 'focus':        return <FocusRoute />
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

  // Privater Raum: komplett anderes Layout, kein NavSidebar/Topbar.
  // Modals/Toasts laufen weiter parallel — bewusst, damit z.B. Toasts
  // beim Loeschen einer Notiz auch hier sichtbar werden.
  if (appMode === 'private') {
    return (
      <AppShell>
        <PrivateShell />
        <DownloadToast />
        <ToastViewport />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="app" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
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
