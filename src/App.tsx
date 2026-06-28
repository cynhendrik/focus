import { lazy, Suspense, useEffect, useState } from 'react'
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

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { CommandPalette } from '@/components/CommandPalette'
import { LoginScreen }   from '@/core/auth/LoginScreen'
import { WorkspacePicker } from '@/core/workspace/WorkspacePicker'
import { useSyncBridge } from '@/core/sync/useSyncBridge'
import { useWorkspaceRealtime } from '@/core/sync/useWorkspaceRealtime'
import { useMailAutoSync } from '@/core/sync/useMailAutoSync'

// Routes are code-split: each becomes its own chunk loaded on first navigation
// instead of inflating the initial bundle. Named exports are adapted to the
// default export that React.lazy expects.
const named = <T extends Record<string, unknown>, K extends keyof T>(p: Promise<T>, key: K) =>
  p.then(m => ({ default: m[key] as React.ComponentType<unknown> }))

const DashboardRoute     = lazy(() => named(import('@/routes/DashboardRoute'), 'DashboardRoute'))
const ClientsRoute       = lazy(() => named(import('@/routes/ClientsRoute'), 'ClientsRoute'))
const FinanceRoute       = lazy(() => named(import('@/routes/FinanceRoute'), 'FinanceRoute'))
const SettingsRoute      = lazy(() => named(import('@/routes/SettingsRoute'), 'SettingsRoute'))
const IntegrationsRoute  = lazy(() => named(import('@/routes/IntegrationsRoute'), 'IntegrationsRoute'))
const ProfileRoute       = lazy(() => named(import('@/routes/ProfileRoute'), 'ProfileRoute'))
const CalendarRoute      = lazy(() => named(import('@/routes/CalendarRoute'), 'CalendarRoute'))
const JournalRoute       = lazy(() => named(import('@/routes/JournalRoute'), 'JournalRoute'))
const CorraRoute         = lazy(() => named(import('@/routes/CorraRoute'), 'CorraRoute'))
const NotesRoute         = lazy(() => named(import('@/routes/NotesRoute'), 'NotesRoute'))
const AkquiseRoute       = lazy(() => named(import('@/routes/AkquiseRoute'), 'AkquiseRoute'))
const PosteingangRoute   = lazy(() => named(import('@/routes/PosteingangRoute'), 'PosteingangRoute'))
const ZeitmanagementRoute = lazy(() => named(import('@/routes/ZeitmanagementRoute'), 'ZeitmanagementRoute'))
const LeverageInboxRoute    = lazy(() => named(import('@/routes/leverage/LeverageInboxRoute'), 'LeverageInboxRoute'))
const LeverageLeadsRoute    = lazy(() => named(import('@/routes/leverage/LeverageLeadsRoute'), 'LeverageLeadsRoute'))
const LeveragePipelineRoute = lazy(() => named(import('@/routes/leverage/LeveragePipelineRoute'), 'LeveragePipelineRoute'))
const LeverageMailRoute     = lazy(() => named(import('@/routes/leverage/LeverageMailRoute'), 'LeverageMailRoute'))
const LeverageLeadRoute     = lazy(() => named(import('@/routes/leverage/LeverageLeadRoute'), 'LeverageLeadRoute'))

// Always-mounted editor components pull in TipTap/ProseMirror (~heavy). Code-
// split so that engine lands in its own chunk and loads after first paint
// instead of inflating the main bundle.
const GlobalQuickComposer = lazy(() => named(import('@/components/global/GlobalQuickComposer'), 'GlobalQuickComposer'))
const QuickCaptureModal   = lazy(() => named(import('@/components/layout/QuickCaptureModal'), 'QuickCaptureModal'))

import { useLeadsStore }        from '@/store/leads.store'
import { useCalendarStore }     from '@/store/calendar.store'
import { DownloadToast }        from '@/components/ui/DownloadToast'
import { UpdateBanner }         from '@/components/ui/UpdateBanner'
import { checkForUpdate }       from '@/services/updater'
import { ToastViewport }       from '@/components/ui/Toast'

import { RouteSwitch }         from '@/components/layout/RouteSwitch'
import { ZeitPanel }           from '@/components/layout/ZeitPanel'
import { WelcomeIntro } from '@/components/onboarding/WelcomeIntro'
import { OnboardingBar } from '@/components/onboarding/OnboardingBar'
import { OnboardingCard } from '@/components/onboarding/OnboardingCard'
import { CompanyStep } from '@/components/onboarding/CompanyStep'
import { SplashScreen } from '@/components/ui/SplashScreen'
import { HelpDrawer } from '@/components/help/HelpDrawer'
import { TeamChatOverlay } from '@/components/team/TeamChatOverlay'
import { NamePrompt } from '@/components/onboarding/NamePrompt'
import { useOnboardingSync } from '@/components/onboarding/useOnboardingSync'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useVertraege } from '@/store/vertraege.store'
import { useMembersStore } from '@/store/members.store'
import { useTourStore } from '@/store/tour.store'

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
  const selectedLeverageLeadId = useUiStore(s => s.selectedLeverageLeadId)
  const appView         = useUiStore(s => s.appView)
  const setAppView      = useUiStore(s => s.setAppView)
  const cmdOpen             = useUiStore(s => s.cmdPaletteOpen)
  const setCmdPaletteOpen   = useUiStore(s => s.setCmdPaletteOpen)
  const setQuickCaptureOpen = useUiStore(s => s.setQuickCaptureOpen)
  const sidebarCollapsed  = useUiStore(s => s.sidebarCollapsed)
  const pickerOpen        = useClientPickerStore(s => s.isOpen)
  const openPicker        = useClientPickerStore(s => s.open)
  // Onboarding — Selektoren BEFORE any early return (Rules of Hooks).
  const welcomeSeen     = useOnboardingStore(s => s.welcomeSeen)
  const bootstrapped    = useOnboardingStore(s => s.bootstrapped)
  const markWelcomeSeen = useOnboardingStore(s => s.markWelcomeSeen)

  // Intro-Splash ("If we build, we build to lead") bei jedem Start.
  const [splashPhase, setSplashPhase] = useState<'show' | 'exiting' | 'done'>('show')
  useEffect(() => {
    const t1 = setTimeout(() => setSplashPhase('exiting'), 3200)
    const t2 = setTimeout(() => setSplashPhase('done'), 3800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Auto-Update: ~3 s nach Start prüfen, danach alle 6 h. No-op außerhalb Tauri.
  useEffect(() => {
    const SIX_HOURS = 6 * 60 * 60 * 1000
    const first = setTimeout(() => { void checkForUpdate() }, 3000)
    const iv = setInterval(() => { void checkForUpdate() }, SIX_HOURS)
    return () => { clearTimeout(first); clearInterval(iv) }
  }, [])

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘K → KORA Intelligence
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
        e.preventDefault()
        setAppView('corra')
        return
      }
      // ⌘Shift+K → Kunden-Schnellsuche (ehemals ⌘K)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'k') {
        e.preventDefault()
        openPicker()
        return
      }
      // ⌘J → Globale Suche
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setCmdPaletteOpen(true)
        return
      }
      // ⌘Shift+N → Quick Capture
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
        e.preventDefault()
        setQuickCaptureOpen(true)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openPicker, setCmdPaletteOpen, setQuickCaptureOpen, setAppView])

  useEffect(() => {
    if (user) loadWorkspaces()
  }, [user, loadWorkspaces])

  useEffect(() => {
    if (useTourStore.getState().active) return
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
      useMembersStore.getState().ensureSelf()
      useMembersStore.getState().load(activeWorkspaceId)
      useVertraege.getState().loadVertraege(activeWorkspaceId)
      // Demo-Seeder gehoert ganz nach hinten, blockiert nichts.
      useOnboardingStore.getState().bootstrap()
    })

    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback
      if (cic) cic(handle)
      else window.clearTimeout(handle)
    }
  }, [activeWorkspaceId, init, initCustomers, loadLastActivity, loadCrmAll, loadPipelineStages, loadAllDeals, loadAllTodos, syncLeads, loadLeads, loadCalendar])

  useSyncBridge()
  useWorkspaceRealtime()
  useMailAutoSync()
  useOnboardingSync()

  // Intro-Splash bei JEDEM Start zeigen — als Overlay über allen Render-Pfaden,
  // damit ihn die Auth-Early-Returns (Login / Workspace-Picker) nicht überspringen.
  const splashOverlay = splashPhase !== 'done'
    ? <SplashScreen exiting={splashPhase === 'exiting'} />
    : null

  if (authLoading) return <><div style={{ position: 'fixed', inset: 0, background: '#3B6DF4' }} />{splashOverlay}</>

  if (!user) return <><LoginScreen />{splashOverlay}</>

  if (!activeWorkspaceId) return <><WorkspacePicker />{splashOverlay}</>


  const renderMain = () => {
    switch (appView) {
      case 'dashboard':    return <DashboardRoute />
      case 'profile':      return <ProfileRoute />
      case 'clients':      return <ClientsRoute />
      case 'invoices':     return <FinanceRoute />
      case 'akquise':      return <AkquiseRoute />
      case 'posteingang':  return <PosteingangRoute />
      case 'journal':      return <JournalRoute />
      case 'settings':     return <SettingsRoute />
      case 'integrations': return <IntegrationsRoute />
      case 'corra':           return <CorraRoute />
      case 'notes':           return <NotesRoute />
      case 'zeitmanagement':  return <ZeitmanagementRoute />
      case 'calendar':        return <CalendarRoute />
      // Akquise / Sales (vormals LEVERAGE — jetzt in der einen Shell)
      case 'leverage_inbox':       return <LeverageInboxRoute />
      case 'leverage_leads':       return <LeverageLeadsRoute />
      case 'leverage_pipeline':    return <LeveragePipelineRoute />
      case 'leverage_mail':        return <LeverageMailRoute />
      case 'leverage_lead_detail': return <LeverageLeadRoute />
      // Redirects
      case 'leads':           return <AkquiseRoute />
      case 'pipeline':        return <AkquiseRoute />
      case 'followups':       return <AkquiseRoute />
      case 'mail':            return <PosteingangRoute />
      case 'sales':           return <AkquiseRoute />
      default:             return <DashboardRoute />
    }
  }

  // Use selected customer ID as part of the key so opening different customers
  // also triggers the transition (CustomerRoute is rendered via appView='clients').
  // Sales sub-views share one route key so AkquiseRoute isn't re-mounted on tab switch
  const SALES_VIEWS = new Set<string>(['akquise', 'leads', 'pipeline', 'followups', 'sales'])
  const routeKey = appView === 'clients' && selectedCustomerId
    ? `clients:${selectedCustomerId}`
    : appView === 'leverage_lead_detail' && selectedLeverageLeadId
    ? `lead:${selectedLeverageLeadId}`
    : SALES_VIEWS.has(appView) ? 'akquise'
    : appView

  // Erststart: WelcomeIntro nur nach Bootstrap und solange nicht gesehen.
  const showWelcome = bootstrapped && !welcomeSeen && !!activeWorkspaceId

  return (
    <AppShell>
      <OnboardingBar />
      <div className="app" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
        <NavSidebar />
        <main className="main">
          <Topbar />
          <div className="main-content">
            <ErrorBoundary>
              <RouteSwitch viewKey={routeKey}>
                <Suspense fallback={<div style={{ flex: 1 }} />}>
                  {renderMain()}
                </Suspense>
              </RouteSwitch>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdPaletteOpen(false)} />}
      {pickerOpen && <ClientPicker />}
      <Suspense fallback={null}><QuickCaptureModal /></Suspense>
      <ZeitPanel />
      <DownloadToast />
      <UpdateBanner />
      <ToastViewport />
      <Suspense fallback={null}><GlobalQuickComposer /></Suspense>
      <TeamChatOverlay />
      <HelpDrawer />
      <NamePrompt />
      <OnboardingCard />
      <CompanyStep />
      {showWelcome && <WelcomeIntro onDone={markWelcomeSeen} />}
      {splashOverlay}
    </AppShell>
  )
}
