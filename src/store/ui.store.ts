import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
type ColorStyle = 'default' | 'bw'
/**
 * Top-Level-Tabs im Customer-Detail. "Aktivitäten" (verlauf) ist der Default
 * und die Seele der Kundenakte — Timeline mit KPI-Zeile oben. Das frühere
 * Cockpit ist darin aufgegangen.
 */
export type CustomerTab =
  | 'tasks'        // Tasks (offene + erledigte)
  | 'notizen'      // Notebooks + Notes
  | 'dokumente'    // Dateien + Folder
  | 'kommunikation' // Mails + Chat + Calls (legacy-redirect → verlauf)
  | 'verlauf'      // Aktivitäten: Timeline + KPI-Strip (Default)
  | 'finanzen'     // Rechnungen + Angebote (gefiltert auf diesen Kunden)

/** Clients page view mode: card board vs. filtered list (Smart Lists). */

/** Tasks page tab. */
export type TasksTab = 'list' | 'board' | 'focus'

/**
 * Dashboard "Heute" hatte zwei View-Modi.
 * @deprecated Workspace/Sales-Tabs entfernt — Heute zeigt direkt die CORRA-Queue
 */
export type DashboardView = 'workspace' | 'sales'


/** Legacy CustomerTab values, kept for backwards-compat with deep-link callers. */
export type LegacyCustomerTab =
  | 'cockpit'                                      // ehem. eigener Tab, jetzt in Aktivitäten aufgegangen
  | 'ueberblick' | 'arbeiten' | 'historie'         // 3-Tab-Aera
  | 'dashboard' | 'aktivitaeten' | 'informationen' // noch aeltere 9-Tab-Aera
  | 'sales' | 'workflow' | 'arbeitsraum' | 'dateien'

/** Map legacy tab IDs onto the current 5-tab model. */
export function mapLegacyCustomerTab(tab: string): CustomerTab {
  switch (tab) {
    // Schon im neuen Schema
    case 'tasks':
    case 'notizen':
    case 'dokumente':
    case 'kommunikation':
    case 'verlauf':
    case 'finanzen':
      return tab as CustomerTab
    // Cockpit + 3-Tab-Modell — Übersichten landen in Aktivitäten
    case 'cockpit':
    case 'ueberblick':
      return 'verlauf'
    case 'arbeiten':
      return 'tasks'
    case 'historie':
      return 'verlauf'
    // Mapping aus dem aelteren 9-Tab-Modell
    case 'dashboard':
    case 'sales':
    case 'informationen':
      return 'verlauf'
    case 'workflow':
      return 'tasks'
    case 'arbeitsraum':
      return 'notizen'
    case 'dateien':
      return 'dokumente'
    case 'aktivitaeten':
      return 'verlauf'
    default:
      return 'verlauf'
  }
}
export type SettingsTab = 'workspace' | 'profil' | 'aussehen' | 'module' | 'integrationen' | 'lizenzen' | 'datenschutz' | 'developer' | 'gefahrenzone' | 'auftraege' | 'benachrichtigungen'

export type AppView =
  | 'dashboard' | 'profile'
  | 'clients'   | 'invoices'
  | 'settings'  | 'integrations'
  | 'posteingang' | 'zeitmanagement'
  | 'calendar'  | 'mail'
  | 'corra'
  // Akquise / Sales views (vormals LEVERAGE — jetzt Teil der einen Nav)
  | 'leverage_inbox'
  | 'leverage_leads'
  | 'leverage_pipeline'
  | 'leverage_mail'
  | 'leverage_lead_detail'
  // Projektplaner
  | 'projects'
  | 'project_detail'

interface UiState {
  theme: Theme
  colorStyle: ColorStyle
  selectedCustomerId: string | null
  appView: AppView
  focusMode: boolean
  hasSeenIntro: boolean
  migrationDone: boolean
  cmdPaletteOpen: boolean
  quickCaptureOpen: boolean
  zeitPanelOpen: boolean
  helpOpen: boolean
  /** Nachricht, zu der die MessageList nach einem Inbox-Sprung scrollen + highlighten soll. */
  pendingScrollMessageId: string | null
  activeCustomerTab: CustomerTab
  tasksTab: TasksTab
  dashboardView: DashboardView
  settingsTab: SettingsTab
  /** Sidebar im Icon-only-Modus (mehr Platz fuer die Workflaeche). Persistiert. */
  sidebarCollapsed: boolean
  /** Aktiver Lead im LEVERAGE-Modus (für die Detail-Ansicht). */
  selectedLeverageLeadId: string | null
  /** Aktives Projekt im Projektplaner (für die Detail-Ansicht). */
  selectedProjectId: string | null
  setColorStyle: (style: ColorStyle) => void
  toggleTheme: () => void
  setSelectedCustomer: (id: string | null) => void
  openCustomerAt: (id: string, tab?: CustomerTab | LegacyCustomerTab) => void
  setAppView: (view: AppView) => void
  toggleFocusMode: () => void
  markIntroSeen: () => void
  markMigrationDone: () => void
  setCmdPaletteOpen: (open: boolean) => void
  setQuickCaptureOpen: (open: boolean) => void
  setZeitPanelOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setPendingScrollMessageId: (id: string | null) => void
  setActiveCustomerTab: (tab: CustomerTab) => void
  setTasksTab: (tab: TasksTab) => void
  setDashboardView: (view: DashboardView) => void
  setSettingsTab: (tab: SettingsTab) => void
  toggleSidebar: () => void
  setSelectedLeverageLeadId: (id: string | null) => void
  setSelectedProjectId: (id: string | null) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      colorStyle: 'default',
      selectedCustomerId: null,
      appView: 'dashboard',
      focusMode: false,
      hasSeenIntro: false,
      migrationDone: false,
      cmdPaletteOpen: false,
      quickCaptureOpen: false,
      zeitPanelOpen: false,
      helpOpen: false,
      pendingScrollMessageId: null,
      activeCustomerTab: 'verlauf',
      tasksTab: 'list',
      dashboardView: 'workspace',
      settingsTab: 'workspace',
      sidebarCollapsed: false,
      selectedLeverageLeadId: null,
      selectedProjectId: null,

      setColorStyle: (style) =>
        set({ colorStyle: style }),

      toggleTheme: () =>
        set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setSelectedCustomer: (id) =>
        set({ selectedCustomerId: id, appView: 'clients' }),

      openCustomerAt: (id, tab = 'ueberblick') =>
        set({ selectedCustomerId: id, appView: 'clients', activeCustomerTab: mapLegacyCustomerTab(tab) }),

      setAppView: (view) =>
        set({ appView: view }),

      toggleFocusMode: () =>
        set(s => ({ focusMode: !s.focusMode })),

      markIntroSeen: () =>
        set({ hasSeenIntro: true }),

      markMigrationDone: () =>
        set({ migrationDone: true }),

      setCmdPaletteOpen: (open) =>
        set({ cmdPaletteOpen: open }),

      setQuickCaptureOpen: (open) =>
        set({ quickCaptureOpen: open }),

      setZeitPanelOpen: (open) =>
        set({ zeitPanelOpen: open }),

      setHelpOpen: (open) =>
        set({ helpOpen: open }),

      setPendingScrollMessageId: (id) =>
        set({ pendingScrollMessageId: id }),

      setActiveCustomerTab: (tab) =>
        set({ activeCustomerTab: mapLegacyCustomerTab(tab) }),

      setTasksTab: (tab) =>
        set({ tasksTab: tab }),

      setDashboardView: (view) =>
        set({ dashboardView: view }),

      setSettingsTab: (tab) =>
        set({ settingsTab: tab }),

      toggleSidebar: () =>
        set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSelectedLeverageLeadId: (id) =>
        set({ selectedLeverageLeadId: id }),

      setSelectedProjectId: (id) =>
        set({ selectedProjectId: id }),
    }),
    {
      name: 'focus-ui-v2',
      version: 2,
      // v0/v1 → v2: Es gibt keinen App-Modus mehr (LEVERAGE und der Private
      // Raum sind beide entfernt). Obsolete persistierte Felder wegräumen,
      // damit niemand in einem toten Modus hängen bleibt.
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown> | undefined
        if (state) {
          delete state.appMode
          delete state.privateView
        }
        return state as unknown as UiState
      },
      partialize: (s) => ({
        theme: s.theme,
        colorStyle: s.colorStyle,
        selectedCustomerId: s.selectedCustomerId,
        activeCustomerTab: s.activeCustomerTab,
        hasSeenIntro: s.hasSeenIntro,
        migrationDone: s.migrationDone,
        tasksTab: s.tasksTab,
        dashboardView: s.dashboardView,
        settingsTab: s.settingsTab,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
)
